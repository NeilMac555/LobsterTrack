from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class TotalsSnapshot(Base):
    """
    Stores a snapshot of Pinnacle totals (over/under) odds at a specific point in time.
    Currently only tracking Ligue 1 as a test.
    """
    __tablename__ = "totals_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Foreign key to match
    match_id = Column(String(64), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)

    # The totals line (e.g., 2.5, 2.75, 3.0)
    line = Column(Float, nullable=False)

    # Over/Under odds
    over_odds = Column(Float, nullable=True)
    under_odds = Column(Float, nullable=True)

    # When these odds were fetched from the API
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # When The Odds API last updated these odds (from API response)
    last_update = Column(DateTime, nullable=True)

    # Relationship back to match
    match = relationship("Match")

    __table_args__ = (
        Index("idx_totals_match_fetched", "match_id", "fetched_at"),
    )

    def __repr__(self):
        return f"<TotalsSnapshot match={self.match_id} line={self.line} O:{self.over_odds} U:{self.under_odds}>"
