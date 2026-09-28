from sqlalchemy import Column, String, DateTime, JSON
from .database import Base


class EuropeanXG(Base):
    """Separate Sportmonks season snapshots; never mixed with Understat."""
    __tablename__ = 'european_xg_seasons'
    key = Column(String(100), primary_key=True)
    league = Column(String(64), nullable=False, index=True)
    season = Column(String(9), nullable=False)
    refreshed_at = Column(DateTime, nullable=False)
    fixtures = Column(JSON, nullable=False)
