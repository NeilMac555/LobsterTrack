"""Recoverable originals kept separately from the active market history."""
from datetime import datetime
from sqlalchemy import Column, DateTime, JSON, String
from .database import Base


class OddsQualityArchive(Base):
    __tablename__ = 'odds_quality_archive'
    id = Column(String(64), primary_key=True)
    source_table = Column(String(40), nullable=False, index=True)
    source_id = Column(String(192), nullable=False)
    match_id = Column(String(64), index=True)
    policy = Column(String(64), nullable=False)
    reason = Column(String(80), nullable=False)
    payload = Column(JSON, nullable=False)
    archived_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class OddsQualityRepair(Base):
    __tablename__ = 'odds_quality_repairs'
    policy = Column(String(64), primary_key=True)
    completed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    summary = Column(JSON, nullable=False)
