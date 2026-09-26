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
    # Name the driver explicitly. SQLAlchemy 2.1 changed the default for a
    # bare "postgresql://" URL from psycopg2 to psycopg 3, which is not in
    # requirements; that surfaced as ModuleNotFoundError at boot on
    # 2026-09-26. Railway's DATABASE_URL is bare, so rewrite it here.
    _url = settings.database_url
    if _url.startswith("postgresql://"):
        _url = "postgresql+psycopg2://" + _url[len("postgresql://"):]
    elif _url.startswith("postgres://"):
        _url = "postgresql+psycopg2://" + _url[len("postgres://"):]
    engine = create_engine(
        _url,
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
