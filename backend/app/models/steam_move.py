from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Index, Integer, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class SteamMove(Base):
    """
    Records significant odds movements (>5%) occurring within 2 hours of kickoff.
    This is "late steam" that often indicates sharp money or significant market changes.
    Results are tracked after match completion for analysis.
    """
    __tablename__ = "steam_moves"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Foreign key to match
    match_id = Column(String(64), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)

    # League info for easier querying
    sport_key = Column(String(64), nullable=False)

    # Which team/outcome moved: "home", "draw", or "away"
    outcome = Column(String(16), nullable=False)

    # The team name (for home/away) or "Draw"
    team_name = Column(String(128), nullable=False)

    # Odds movement details
    opening_odds = Column(Float, nullable=False)
    previous_odds = Column(Float, nullable=False)  # Odds before this move
    current_odds = Column(Float, nullable=False)   # Odds after this move
    movement_percent = Column(Float, nullable=False)  # Percentage change from opening

    # Timing
    detected_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    match_commence_time = Column(DateTime, nullable=False)
    minutes_before_kickoff = Column(Integer, nullable=False)  # How many minutes before kickoff

    # Result tracking (populated after match completes)
    result_updated = Column(Boolean, default=False, nullable=False)
    won = Column(Boolean, nullable=True)  # Did this outcome win?
    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)

    # Relationship back to match
    match = relationship("Match")

    __table_args__ = (
        Index("idx_steam_match_id", "match_id"),
        Index("idx_steam_sport_key", "sport_key"),
        Index("idx_steam_detected_at", "detected_at"),
        Index("idx_steam_outcome", "outcome"),
        Index("idx_steam_result_updated", "result_updated"),
    )

    def __repr__(self):
        return f"<SteamMove {self.team_name} {self.movement_percent:+.1f}% @ {self.minutes_before_kickoff}min>"
