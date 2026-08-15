from sqlalchemy import Column, String, Float, Integer, DateTime, Index
from datetime import datetime

from .database import Base


class PowerRating(Base):
    """
    Current cross-league team strength rating, computed from Pinnacle
    Asian Handicap closing lines (see
    app/services/power_ranking_fitter.py) rather than goals — a
    PitchRank-style transitive fit over betting lines, bridged across
    leagues via UEFA competition fixtures. One row per team — upserted
    on every refresh. Full history of past computations lives in
    PowerRatingHistory below.

    Unlike LeagueConstants/strength_model.py's per-league fits (each
    normalised to mean 1.0 WITHIN its own league, not comparable across
    leagues), a PowerRating is on one shared scale across every league
    this covers — that's the entire point of this table.
    """
    __tablename__ = "power_ratings"

    id = Column(Integer, primary_key=True, autoincrement=True)

    team = Column(String(128), nullable=False, unique=True, index=True)

    # sport_key of the team's home domestic league, e.g. "soccer_epl".
    # A team is assigned to whichever league it played the most
    # ClosingLine-covered matches in during the fit window.
    league = Column(String(64), nullable=False, index=True)

    rating = Column(Float, nullable=False)

    # Weighted match count backing this rating (day-decayed, see
    # fitter's HALF_LIFE_DAYS) — low values mean a thin, unsettled
    # sample, surfaced in the UI so early-season/newly-promoted teams
    # aren't presented with false confidence.
    weighted_matches = Column(Float, nullable=False)

    computed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<PowerRating {self.team} ({self.league}) rating={self.rating:.3f}>"


class PowerRatingHistory(Base):
    """
    Weekly snapshot of every team's rating, for the frontend's
    ratings-over-time comparison chart (mirrors LeagueConstantsHistory's
    append-only audit-log pattern). One row per (team, refresh run).
    """
    __tablename__ = "power_rating_history"

    id = Column(Integer, primary_key=True, autoincrement=True)

    team = Column(String(128), nullable=False, index=True)
    league = Column(String(64), nullable=False, index=True)
    rating = Column(Float, nullable=False)
    weighted_matches = Column(Float, nullable=False)
    computed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_power_rating_history_team_computed", "team", "computed_at"),
    )

    def __repr__(self):
        return f"<PowerRatingHistory {self.team} @ {self.computed_at.isoformat()}>"
