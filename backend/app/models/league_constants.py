from sqlalchemy import Column, String, Float, Integer, DateTime, Index
from datetime import datetime

from .database import Base


class LeagueConstants(Base):
    """
    Current avgGoalsPerTeam/homeAwayRatio per league, computed from our
    own historical_matches data (see
    app/services/league_constants_refresher.py) instead of the hand-tuned
    values hardcoded in frontend/src/pages/MatchPredictorPage.tsx. One
    row per league — upserted on every refresh. Full history of past
    computations lives in LeagueConstantsHistory below.
    """
    __tablename__ = "league_constants"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # sport_key, e.g. "soccer_epl" — same scheme as historical_matches.league.
    league = Column(String(64), nullable=False, unique=True, index=True)

    avg_goals_per_team = Column(Float, nullable=False)
    home_away_ratio = Column(Float, nullable=False)

    # Weighted match count that produced this row (see refresher — season
    # weights are fractional, so this is a float, not a raw row count).
    sample_matches = Column(Float, nullable=False)

    computed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<LeagueConstants {self.league} avgGoalsPerTeam={self.avg_goals_per_team:.3f} homeAwayRatio={self.home_away_ratio:.3f}>"


class LeagueConstantsHistory(Base):
    """
    Append-only log of every successful league_constants computation, for
    auditability (was the live number ever wrong, and when did it change).
    Never updated or deleted — one row per (league, refresh run).
    """
    __tablename__ = "league_constants_history"

    id = Column(Integer, primary_key=True, autoincrement=True)

    league = Column(String(64), nullable=False, index=True)
    avg_goals_per_team = Column(Float, nullable=False)
    home_away_ratio = Column(Float, nullable=False)
    sample_matches = Column(Float, nullable=False)
    computed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_league_constants_history_league_computed", "league", "computed_at"),
    )

    def __repr__(self):
        return f"<LeagueConstantsHistory {self.league} @ {self.computed_at.isoformat()}>"
