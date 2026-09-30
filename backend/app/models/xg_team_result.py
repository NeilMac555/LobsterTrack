"""
Per team-match goals and expected goals from Understat (2026-09-30).

One row per club per league match: goals scored and conceded alongside
total xG / xGA and non-penalty xG / xGA, for the top five leagues. Kept
separately from xg_data (which only carries non-penalty xG for the rolling
charts) so the "goals vs xG" pages have goals to compare against without
touching the rolling-xG pipeline. Filled and refreshed by
services/xg_goals.py (weekly, Monday 03:30 UTC, current + previous season).
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, Index, Integer, String, UniqueConstraint

from .database import Base


class XGTeamResult(Base):
    __tablename__ = "xg_team_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    league = Column(String(64), nullable=False)          # sport_key, e.g. soccer_epl
    team_name = Column(String(128), nullable=False)      # Understat title, e.g. "Parma Calcio 1913"
    season = Column(String(4), nullable=False)           # site code, e.g. "2627"
    match_date = Column(Date, nullable=False)
    home = Column(Boolean, nullable=False)
    goals_for = Column(Integer, nullable=False)
    goals_against = Column(Integer, nullable=False)
    xg_for = Column(Float, nullable=False)               # total xG incl. penalties
    xg_against = Column(Float, nullable=False)
    npxg_for = Column(Float, nullable=False)
    npxg_against = Column(Float, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("league", "team_name", "match_date", name="uq_xg_team_result"),
        Index("idx_xg_team_results_date", "match_date"),
        Index("idx_xg_team_results_league_season", "league", "season"),
    )
