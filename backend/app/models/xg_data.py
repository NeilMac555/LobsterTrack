from sqlalchemy import Column, String, Float, DateTime, Integer, Date, UniqueConstraint, Index
from datetime import datetime
from .database import Base


class XGData(Base):
    """
    Stores per-team, per-match npxG (non-penalty expected goals) data.
    Uploaded weekly via CSV for rolling xG analysis.
    """
    __tablename__ = "xg_data"

    id = Column(Integer, primary_key=True, autoincrement=True)

    league = Column(String(64), nullable=False)          # sport_key e.g. "soccer_epl"
    team_name = Column(String(128), nullable=False)
    match_number = Column(Integer, nullable=False)        # sequential game number in season

    npxg_for = Column(Float, nullable=False)              # non-penalty xG created
    npxg_against = Column(Float, nullable=False)          # non-penalty xG conceded

    match_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("league", "team_name", "match_number", name="uq_xg_team_match"),
        Index("idx_xg_league_team", "league", "team_name"),
        Index("idx_xg_league", "league"),
    )

    def __repr__(self):
        return f"<XGData {self.team_name} GW{self.match_number} npxG:{self.npxg_for:.2f}/{self.npxg_against:.2f}>"
