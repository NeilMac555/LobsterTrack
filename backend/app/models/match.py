from sqlalchemy import Column, String, DateTime, Index, Integer
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

    # Minute at which an early goal was detected. NULL = no early goal
    # (either no goal happened, or we haven't checked yet). 5 = a goal
    # was scored before our T+5 score check. The /in-play-jumps view
    # filters these matches out by default because price swings driven
    # by an early goal aren't sharp-money signals — the market is just
    # reacting to obvious public information.
    early_goal_minute = Column(Integer, nullable=True, index=True)

    # Polymarket event slug once we've successfully associated this
    # match with its Polymarket counterpart (e.g. fifwc-bel-egy-2026-06-15).
    # NULL = either not yet matched, or no Polymarket market exists for it.
    # Lets the fetcher skip the fuzzy team-name match on subsequent polls.
    polymarket_event_slug = Column(String(128), nullable=True, index=True)

    # Relationship to odds snapshots
    odds_snapshots = relationship("OddsSnapshot", back_populates="match", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_match_sport_commence", "sport_key", "commence_time"),
    )

    def __repr__(self):
        return f"<Match {self.home_team} vs {self.away_team} ({self.league_name})>"
