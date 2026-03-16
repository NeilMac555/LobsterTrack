import os
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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

    # Start the scheduler
    logger.info("Starting odds scheduler")
    odds_scheduler.start()

    # Run initial fetch on startup
    logger.info("Running initial odds fetch")
    await odds_scheduler.run_now()

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
