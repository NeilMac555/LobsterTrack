from sqlalchemy import Column, String, Float, DateTime, Integer, Date, UniqueConstraint, Index
from datetime import datetime
from .database import Base


class XGData(Base):
    """
    Stores per-team, per-match npxG (non-penalty expected goals) data.
    Uploaded weekly via CSV (or the Understat cron, see
    app/services/xg_refresher.py) for rolling xG analysis.

    `season` (added 2026-07-12 migration) makes match_number scoped per
    season instead of a global per-team sequence — before this, a new
    season's uploads collided with or silently wiped the prior season's
    rows (both the CSV endpoint and the cron did an unscoped
    `DELETE WHERE league = :league` before inserting). Every season's
    data now coexists; callers must filter by season explicitly.
    """
    __tablename__ = "xg_data"

    id = Column(Integer, primary_key=True, autoincrement=True)

    league = Column(String(64), nullable=False)          # sport_key e.g. "soccer_epl"
    team_name = Column(String(128), nullable=False)
    # Site's season code, e.g. '2526' for 2025/26. Required — every row
    # must belong to exactly one season.
    season = Column(String(4), nullable=False)
    match_number = Column(Integer, nullable=False)        # sequential game number within the season

    npxg_for = Column(Float, nullable=False)              # non-penalty xG created
    npxg_against = Column(Float, nullable=False)          # non-penalty xG conceded

    match_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("league", "team_name", "season", "match_number", name="uq_xg_team_season_match"),
        Index("idx_xg_league_team", "league", "team_name"),
        Index("idx_xg_league", "league"),
        Index("idx_xg_league_season", "league", "season"),
    )

    def __repr__(self):
        return f"<XGData {self.team_name} GW{self.match_number} npxG:{self.npxg_for:.2f}/{self.npxg_against:.2f}>"
