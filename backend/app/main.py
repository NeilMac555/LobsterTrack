import os
import asyncio
import structlog
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
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


def _run_startup_migrations_sync():
    """
    All the idempotent ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT
    EXISTS steps, plus the club-finance snapshot load. Deliberately a
    PLAIN SYNC function, invoked via asyncio.to_thread — the 2026-08-15
    outage's second lesson (the first is on `lifespan`): wrapping this
    in `async def` and create_task still ran every blocking DB call ON
    the event loop, so when an ALTER queued on a lock, the new
    container couldn't even answer its healthcheck. In a real thread,
    a stuck migration can never stall request serving.

    Every ALTER/CREATE INDEX runs with a 5s lock_timeout — third
    lesson: Postgres needs ACCESS EXCLUSIVE to even evaluate
    "IF NOT EXISTS", it queues indefinitely by default, and every NEW
    query on that table then queues BEHIND the waiting ALTER. That's
    the mechanism that took the whole site down: leaked
    idle-in-transaction sessions from the still-routing old container
    held read locks on odds_snapshots, each deploy attempt's ALTER
    queued behind them, and the moment it queued, every ordinary
    SELECT on odds_snapshots site-wide queued behind IT. With a
    lock_timeout the ALTER aborts cleanly instead (these are no-op
    safety nets for months-old schema; skipping one on a busy boot is
    harmless — it'll succeed on a future quiet boot).
    """
    def _locked_step(name: str, statements: list[str]):
        try:
            with engine.begin() as conn:
                conn.execute(text("SET LOCAL lock_timeout = '5s'"))
                for s in statements:
                    conn.execute(text(s))
        except Exception as e:
            logger.warning(f"{name} migration step failed (non-fatal)", error=str(e))

    _locked_step("in_play", [
        "ALTER TABLE odds_snapshots ADD COLUMN IF NOT EXISTS in_play BOOLEAN NOT NULL DEFAULT FALSE",
    ])
    _locked_step("early_goal_minute", [
        "ALTER TABLE matches ADD COLUMN IF NOT EXISTS early_goal_minute INTEGER",
    ])
    _locked_step("polymarket_event_slug", [
        "ALTER TABLE matches ADD COLUMN IF NOT EXISTS polymarket_event_slug VARCHAR(128)",
        "CREATE INDEX IF NOT EXISTS idx_matches_pm_slug ON matches (polymarket_event_slug)",
    ])
    _locked_step("polymarket_indexes", [
        "CREATE INDEX IF NOT EXISTS idx_pm_match_time ON polymarket_snapshots (match_id, fetched_at)",
        "CREATE INDEX IF NOT EXISTS idx_pm_match_inplay ON polymarket_snapshots (match_id, in_play)",
    ])
    _locked_step("posted_tweets_indexes", [
        "CREATE INDEX IF NOT EXISTS idx_posted_match_type ON posted_tweets (match_id, tweet_type)",
        "CREATE INDEX IF NOT EXISTS idx_posted_day_type ON posted_tweets (day_key, tweet_type)",
    ])

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
    asyncio.create_task(asyncio.to_thread(_run_startup_migrations_sync))

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
from app.api.manager_ratings import manager_ratings_router
app.include_router(manager_ratings_router, prefix="/api")

from app.api.form_lab import router as form_lab_router
app.include_router(form_lab_router, prefix="/api")

# Serve static frontend files in production
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")


def safe_static_path(directory, relative):
    root = Path(directory).resolve()
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root):
        raise HTTPException(status_code=404, detail="Not found")
    return candidate


if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    import json as _json
    from fastapi.responses import HTMLResponse

    def _routes_manifest() -> dict:
        """Built copy of frontend/src/routes.json (the single source of truth
        for site routes; the frontend build fails if App.tsx disagrees)."""
        try:
            with open(os.path.join(static_dir, "routes.json"), encoding="utf-8") as f:
                return _json.load(f)
        except (FileNotFoundError, ValueError):
            return {"public": [], "dynamic": [], "internal": [], "redirects": [], "static_only": []}

    def _not_found_response():
        page = os.path.join(static_dir, "404.html")
        if os.path.exists(page):
            with open(page, encoding="utf-8") as f:
                return HTMLResponse(f.read(), status_code=404)
        return HTMLResponse("<h1>Not found</h1>", status_code=404)

    from fastapi.responses import Response as _Response
    from app.services import sitemap as _sitemap

    def _xml(body: str | None):
        if body is None:
            return _not_found_response()
        return _Response(content=body, media_type="application/xml",
                         headers={"Cache-Control": "public, max-age=900"})

    def _with_db(fn):
        from app.models.database import SessionLocal
        db = SessionLocal()
        try:
            return fn(db)
        finally:
            db.close()

    # Dynamic sitemaps (services/sitemap.py). Registered before the catch-all
    # so they win; there is no static sitemap.xml any more.
    @app.get("/sitemap.xml")
    async def sitemap_index():
        return _xml(_with_db(_sitemap.sitemap_index))

    @app.get("/sitemap-pages.xml")
    async def sitemap_pages():
        return _xml(_sitemap.sitemap_pages())

    @app.get("/sitemap-matches.xml")
    async def sitemap_matches():
        return _xml(_with_db(lambda db: _sitemap.sitemap_matches(db)))

    @app.get("/sitemap-matches-{part}.xml")
    async def sitemap_matches_part(part: int):
        return _xml(_with_db(lambda db: _sitemap.sitemap_matches(db, part)))

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve the frontend for all non-API routes (2026-09-29 rewrite).

        Priority:
          1. exact static file (robots.txt, sitemap.xml, images...)
          2. build-time prerendered page: <path>/index.html (homepage,
             blog index, posts, static pages, static-only pages)
          3. /match/<id>: server-rendered from the DB (services/match_page)
          4. internal + legacy-redirect routes: bare app shell (noindex)
          5. anything else: real HTTP 404 with the noindex 404 page
        """
        path = full_path.strip("/")
        if path:
            static_file = safe_static_path(static_dir, path)
            if os.path.isfile(static_file):
                return FileResponse(static_file)
        prerendered = safe_static_path(static_dir, str(Path(path) / "index.html")) if path else Path(static_dir) / "index.html"
        if os.path.isfile(prerendered):
            return FileResponse(prerendered)

        if path.startswith("match/") and path.count("/") == 1:
            from app.models.database import SessionLocal
            from app.services.match_page import render_match_page
            db = SessionLocal()
            try:
                html, status = render_match_page(db, path.split("/", 1)[1])
            finally:
                db.close()
            return HTMLResponse(html, status_code=status)

        manifest = _routes_manifest()
        if path in manifest.get("internal", []) or path in manifest.get("redirects", []):
            shell = os.path.join(static_dir, "app.html")
            if os.path.exists(shell):
                return FileResponse(shell)
            return FileResponse(os.path.join(static_dir, "index.html"))

        return _not_found_response()
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
