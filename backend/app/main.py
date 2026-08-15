import os
import asyncio
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse

from sqlalchemy import text

from app.config import get_settings
from app.models.database import Base, engine
from app.api import router
from app.services.scheduler import odds_scheduler

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()
settings = get_settings()


async def _initial_fetch():
    """Run the first odds fetch in the background after startup. Exceptions
    are swallowed so a single API hiccup never poisons app readiness."""
    try:
        await odds_scheduler.run_now()
    except Exception as e:
        logger.warning("initial odds fetch failed (non-fatal)", error=str(e))


async def _run_startup_migrations():
    """
    All the idempotent ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
    EXISTS steps, plus the club-finance snapshot load, run as a
    background task rather than inline in the lifespan — see the
    2026-08-15 note on `lifespan` for why. Every step here already had
    its own individual try/except (a broken migration shouldn't crash
    boot), so moving the whole block behind create_task changes nothing
    about failure handling, only about whether IT can block the
    healthcheck.
    """
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE odds_snapshots "
                "ADD COLUMN IF NOT EXISTS in_play BOOLEAN "
                "NOT NULL DEFAULT FALSE"
            ))
    except Exception as e:
        logger.warning("in_play migration step failed (non-fatal)", error=str(e))

    try:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE matches "
                "ADD COLUMN IF NOT EXISTS early_goal_minute INTEGER"
            ))
    except Exception as e:
        logger.warning("early_goal_minute migration failed (non-fatal)", error=str(e))

    try:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE matches "
                "ADD COLUMN IF NOT EXISTS polymarket_event_slug VARCHAR(128)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_matches_pm_slug "
                "ON matches (polymarket_event_slug)"
            ))
    except Exception as e:
        logger.warning("polymarket_event_slug migration failed (non-fatal)", error=str(e))

    try:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_pm_match_time "
                "ON polymarket_snapshots (match_id, fetched_at)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_pm_match_inplay "
                "ON polymarket_snapshots (match_id, in_play)"
            ))
    except Exception as e:
        logger.warning("polymarket index migration failed (non-fatal)", error=str(e))

    try:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_posted_match_type "
                "ON posted_tweets (match_id, tweet_type)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_posted_day_type "
                "ON posted_tweets (day_key, tweet_type)"
            ))
    except Exception as e:
        logger.warning("posted_tweets index migration failed (non-fatal)", error=str(e))

    try:
        from app.models.database import SessionLocal
        from app.services.club_finance_importer import load_snapshot
        _fin_db = SessionLocal()
        try:
            summary = load_snapshot(_fin_db)
            logger.info("club finances loaded", rows=summary["inserted"])
        finally:
            _fin_db.close()
    except Exception as e:
        logger.warning("club finance snapshot load failed (non-fatal)", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application startup and shutdown.
    """
    # Startup
    logger.info("Starting LobsterTrack API")

    # Create database tables
    logger.info("Creating database tables")
    Base.metadata.create_all(bind=engine)

    # NOTE 2026-08-15: the additive-migration block that used to run
    # synchronously here (ADD COLUMN IF NOT EXISTS on odds_snapshots/
    # matches, CREATE INDEX IF NOT EXISTS on polymarket_snapshots/
    # posted_tweets, the club-finance snapshot load) took the whole
    # site down for ~40 minutes: Postgres needs an ACCESS EXCLUSIVE
    # lock to even EVALUATE "IF NOT EXISTS" on an ALTER TABLE, even
    # when the column already exists and the statement is a true
    # no-op. A handful of leaked idle-in-transaction sessions
    # (unrelated app bug, holding only ordinary read locks on
    # odds_snapshots) were enough to queue that ALTER behind them
    # indefinitely — Postgres has no default lock_timeout, so every
    # deploy attempt hung at "Waiting for application startup" forever,
    # never reaching Railway's healthcheck, until the deploy was killed
    # after 5 minutes and the NEXT attempt hit the exact same queue.
    # Reverting the code that shipped alongside this incident did
    # nothing, because the code was never the variable — this migration
    # block was exactly as vulnerable to lock contention months ago as
    # it was today; today is just the day something happened to be
    # holding a lock at the wrong moment. This is the same failure
    # shape the in_play backfill caused in 2026-06-30 (see
    # _run_startup_migrations' docstring) — that fix removed the slow
    # backfill but left this ALTER on the blocking path, which is what
    # let this recur. Now runs as a background task, same
    # non-blocking pattern as _initial_fetch below: none of these
    # migrations are needed for the app to serve traffic (they're
    # idempotent safety nets for schema that's existed for a long
    # time), so none of them should be able to block boot ever again.
    asyncio.create_task(_run_startup_migrations())

    # Start the scheduler
    logger.info("Starting odds scheduler")
    odds_scheduler.start()

    # Kick off the initial fetch as a background task so it does NOT block
    # FastAPI lifespan startup. Previously we `await`ed this, which meant
    # any slow Odds-API response blocked the server from reporting ready
    # to Railway's healthcheck — leading to deploy failures when the
    # initial fetch took >5 minutes. The scheduler will run on its own
    # interval anyway, so this is just to warm the cache faster.
    logger.info("Scheduling initial odds fetch (non-blocking)")
    asyncio.create_task(_initial_fetch())

    yield

    # Shutdown
    logger.info("Shutting down LobsterTrack API")
    odds_scheduler.stop()


# Create FastAPI app
app = FastAPI(
    title="LobsterTrack",
    description="Soccer betting odds tracker - Pinnacle 1x2 markets",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 301 redirect trailing slashes to non-trailing (SEO canonical URLs)
@app.middleware("http")
async def redirect_trailing_slash(request: Request, call_next):
    path = request.url.path
    if len(path) > 1 and path.endswith("/"):
        # Preserve query string if present
        query = str(request.url.query)
        new_url = path.rstrip("/")
        if query:
            new_url = f"{new_url}?{query}"
        return RedirectResponse(url=new_url, status_code=301)
    return await call_next(request)

# Include API routes
app.include_router(router, prefix="/api")

# Serve static frontend files in production
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve frontend for all non-API routes.
        Priority: exact static file > pre-rendered page > SPA index.html."""
        if full_path:
            # Serve root-level static files (robots.txt, sitemap.xml, etc.)
            static_file = os.path.join(static_dir, full_path)
            if os.path.isfile(static_file):
                return FileResponse(static_file)
            # Check for pre-rendered page (e.g. /blog/slug -> blog/slug/index.html)
            prerendered = os.path.join(static_dir, full_path, "index.html")
            if os.path.exists(prerendered):
                return FileResponse(prerendered)
        index_path = os.path.join(static_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        return {"error": "Frontend not found"}
else:
    @app.get("/")
    async def root():
        """Root endpoint with API info"""
        return {
            "name": "LobsterTrack",
            "description": "Soccer odds tracking API",
            "docs": "/docs",
            "health": "/api/health"
        }
