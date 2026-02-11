from sqlalchemy import Column, String, DateTime, Integer, Float, Index
from datetime import datetime
from .database import Base


class SyndicateAlert(Base):
    """
    Tracks Syndicate Move alerts that have been sent to Telegram.
    Prevents duplicate alerts for the same match/outcome.
    """
    __tablename__ = "syndicate_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Match identification
    match_id = Column(String(64), nullable=False)

    # Market and outcome (e.g., '1x2-home', 'totals-over', 'spreads-home_spread')
    market = Column(String(20), nullable=False)
    outcome = Column(String(20), nullable=False)

    # Alert details for reference
    movement_percent = Column(Float, nullable=False)
    odds_at_alert = Column(Float, nullable=False)

    # When the alert was sent
    alerted_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        # Unique constraint: one alert per match per market per outcome
        Index("idx_syndicate_alert_unique", "match_id", "market", "outcome", unique=True),
    )

    def __repr__(self):
        return f"<SyndicateAlert match={self.match_id} {self.market}-{self.outcome}>"
