from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class SpreadsSnapshot(Base):
    """
    Stores a snapshot of Pinnacle Asian Handicap (spreads) odds at a specific point in time.
    Tracks the handicap line and odds for home/away.
    """
    __tablename__ = "spreads_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Foreign key to match
    match_id = Column(String(64), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)

    # The handicap line (e.g., -0.5, -1.0, +0.5)
    # Positive = home team receives goals, Negative = home team gives goals
    line = Column(Float, nullable=False)

    # Home/Away odds at this handicap
    home_odds = Column(Float, nullable=True)
    away_odds = Column(Float, nullable=True)

    # When these odds were fetched from the API
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # When The Odds API last updated these odds (from API response)
    last_update = Column(DateTime, nullable=True)

    # Relationship back to match
    match = relationship("Match")

    __table_args__ = (
        Index("idx_spreads_match_fetched", "match_id", "fetched_at"),
    )

    def __repr__(self):
        return f"<SpreadsSnapshot match={self.match_id} line={self.line} H:{self.home_odds} A:{self.away_odds}>"
