from sqlalchemy import Column, String, Integer, Float, DateTime, Index
from datetime import datetime
from .database import Base

# INTEGER on sqlite (no BigInteger autoincrement there), BIGSERIAL on PG.
from sqlalchemy import BigInteger
_BigAutoPK = BigInteger().with_variant(Integer, "sqlite")


class ClubFinance(Base):
    """
    Club-season financial figures — wage bill, revenue, net spend — loaded
    from a committed snapshot (backend/app/data/valuball_epl_finances.json).

    Premier League only: the underlying figures are club-level total staff
    costs from audited annual accounts (Companies House filings, surfaced
    via valuball.co), which exist for English clubs and lag the current
    campaign by ~1 season. team_name is the SteamWatch canonical name;
    it is NULL for historical clubs outside the normalizer (kept in
    team_name_raw), never guessed.

    Amounts are GBP millions. This is a snapshot table, not a live feed —
    reload it from the committed JSON via /admin/load-club-finances when
    the snapshot is refreshed for a new season.
    """
    __tablename__ = "club_finances"

    id = Column(_BigAutoPK, primary_key=True, autoincrement=True)
    league = Column(String(64), nullable=False, index=True)   # sport_key
    team_name = Column(String(128), nullable=True, index=True)  # canonical; NULL = unmapped
    team_name_raw = Column(String(128), nullable=False)
    season = Column(Integer, nullable=False)                  # valuball year, e.g. 2025 = FY24/25
    season_code = Column(String(8), nullable=False, index=True)  # football-data style, '2425'

    currency = Column(String(8), nullable=False, default="GBP")
    wage_total_m = Column(Float, nullable=True)      # total staff wage bill, £m
    total_revenue_m = Column(Float, nullable=True)
    net_spend_m = Column(Float, nullable=True)

    source = Column(String(256), nullable=False)
    captured_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_clubfin_league_season", "league", "season_code"),
        Index("idx_clubfin_team_season", "team_name", "season_code"),
    )

    def __repr__(self):
        return f"<ClubFinance {self.team_name_raw} {self.season_code} wage={self.wage_total_m}>"
