from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import get_settings

settings = get_settings()

# Configure engine based on database type
if settings.database_url.startswith("sqlite"):
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False}  # SQLite needs this for FastAPI
    )
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        # EMERGENCY 2026-08-15: pool_size=5/max_overflow=10 with NO
        # pool_timeout meant a handful of leaked idle-in-transaction
        # connections (real bug elsewhere, not fixed here — see
        # main.py's lifespan note for the incident this caused) could
        # silently exhaust the pool, and anything needing a NEW
        # connection (including /api/health's own db dependency) would
        # then hang forever waiting for one instead of failing fast.
        # Bumped pool_size/max_overflow for headroom and added an
        # explicit pool_timeout so exhaustion surfaces as a clear
        # error within 10s rather than an invisible indefinite hang.
        pool_timeout=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for FastAPI routes"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
