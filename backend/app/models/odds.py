from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class OddsSnapshot(Base):
    """
    Stores a snapshot of Pinnacle odds at a specific point in time.
    Each row represents the 1x2 odds for a match at a given timestamp.
    """
    __tablename__ = "odds_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Foreign key to match
    match_id = Column(String(64), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)

    # Bookmaker (we're tracking Pinnacle)
    bookmaker = Column(String(64), nullable=False, default="pinnacle")

    # 1x2 odds (Home/Draw/Away)
    home_odds = Column(Float, nullable=True)
    draw_odds = Column(Float, nullable=True)
    away_odds = Column(Float, nullable=True)

    # When these odds were fetched from the API
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # When The Odds API last updated these odds (from API response)
    last_update = Column(DateTime, nullable=True)

    # Relationship back to match
    match = relationship("Match", back_populates="odds_snapshots")

    __table_args__ = (
        Index("idx_odds_match_fetched", "match_id", "fetched_at"),
        Index("idx_odds_bookmaker", "bookmaker"),
    )

    def __repr__(self):
        return f"<OddsSnapshot match={self.match_id} H:{self.home_odds} D:{self.draw_odds} A:{self.away_odds}>"
