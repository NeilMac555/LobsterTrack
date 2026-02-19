from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index, Integer, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
import enum


class MarketType(str, enum.Enum):
    H2H = "1x2"
    ASIAN_HANDICAP = "asian_handicap"
    TOTALS = "totals"


class ClosingLine(Base):
    """
    Stores the last pre-kickoff odds snapshot for a match (the "closing line").
    One row per match per market type. Captured automatically once kickoff passes.
    """
    __tablename__ = "closing_lines"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Foreign key to match
    match_id = Column(String(64), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)

    # Match context (denormalized for easy querying)
    league = Column(String(64), nullable=False)
    home_team = Column(String(128), nullable=False)
    away_team = Column(String(128), nullable=False)
    kickoff_time = Column(DateTime, nullable=False)

    # Market type
    market_type = Column(Enum(MarketType), nullable=False)

    # 1x2 fields
    close_home = Column(Float, nullable=True)
    close_draw = Column(Float, nullable=True)
    close_away = Column(Float, nullable=True)

    # Asian Handicap fields
    close_line = Column(Float, nullable=True)  # e.g. -0.5
    close_home_price = Column(Float, nullable=True)
    close_away_price = Column(Float, nullable=True)

    # Totals fields (reuses close_line for the line, e.g. 2.5)
    close_over_price = Column(Float, nullable=True)
    close_under_price = Column(Float, nullable=True)

    # When this closing line snapshot was originally fetched from the API
    captured_at = Column(DateTime, nullable=False)

    # How many minutes before kickoff this snapshot was taken
    minutes_before_kickoff = Column(Integer, nullable=False)

    # Relationship back to match
    match = relationship("Match")

    __table_args__ = (
        Index("idx_closing_match_market", "match_id", "market_type", unique=True),
        Index("idx_closing_league", "league"),
        Index("idx_closing_kickoff", "kickoff_time"),
        Index("idx_closing_market_type", "market_type"),
    )

    def __repr__(self):
        return f"<ClosingLine match={self.match_id} market={self.market_type} captured={self.captured_at}>"
