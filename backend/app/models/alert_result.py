from sqlalchemy import Column, String, Integer
from .database import Base


class AlertResult(Base):
    """Verified final scores for Telegram fixtures, independent of steam detection."""
    __tablename__ = "telegram_match_results"
    match_id = Column(String(64), primary_key=True)
    home_score = Column(Integer, nullable=False)
    away_score = Column(Integer, nullable=False)
