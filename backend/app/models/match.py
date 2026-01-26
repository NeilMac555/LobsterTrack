from sqlalchemy import Column, String, DateTime, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Match(Base):
    """
    Represents a soccer match.
    Stores static match information that doesn't change with odds updates.
    """
    __tablename__ = "matches"

    # The Odds API event ID - used as primary key for consistency
    id = Column(String(64), primary_key=True)

    # League/Sport key from The Odds API (e.g., "soccer_epl")
    sport_key = Column(String(64), nullable=False, index=True)

    # Human readable league name
    league_name = Column(String(128), nullable=False)

    # Teams
    home_team = Column(String(128), nullable=False)
    away_team = Column(String(128), nullable=False)

    # Match scheduled time
    commence_time = Column(DateTime, nullable=False, index=True)

    # Tracking timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationship to odds snapshots
    odds_snapshots = relationship("OddsSnapshot", back_populates="match", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_match_sport_commence", "sport_key", "commence_time"),
    )

    def __repr__(self):
        return f"<Match {self.home_team} vs {self.away_team} ({self.league_name})>"
