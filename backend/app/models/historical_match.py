"""
Historical match results + Pinnacle closing prices, used by the Team P/L
tab to compute backward-looking ROI per team.

Data source is football-data.co.uk's per-season CSV (E0.csv for the EPL).
Phase 1 covers EPL 1X2 only; the AH and totals columns are present and
nullable so we can extend coverage without a migration when we layer
those markets on later.

A row here is a *finished* match. Live and upcoming matches stay in the
existing `matches` table — the two are deliberately not joined because
their lifecycles, refresh cadences, and trust models all differ.
"""

from sqlalchemy import Column, String, Float, Integer, Date, DateTime, Index, UniqueConstraint
from datetime import datetime

from .database import Base


class HistoricalMatch(Base):
    __tablename__ = "historical_matches"

    # Surrogate primary key — the football-data.co.uk CSV doesn't ship a
    # match id, and synthesising one from (date,home,away) is fragile if
    # two teams play twice in one calendar day (cup vs league overlap).
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Season is the football-data.co.uk style 4-digit code, e.g. '2122'
    # for 2021/22, '2526' for 2025/26. Stored as the natural sort key so
    # ORDER BY works without parsing.
    season = Column(String(4), nullable=False, index=True)

    # League key matches The Odds API sport_key for consistency with the
    # rest of the platform (e.g. 'soccer_epl'). Non-EPL leagues will be
    # added later — Phase 1 is EPL only.
    league = Column(String(32), nullable=False, index=True)

    match_date = Column(Date, nullable=False, index=True)

    # Canonical team names (already normalized by the importer using
    # team_name_normalizer.FOOTBALL_DATA_TO_CANONICAL).
    home_team = Column(String(128), nullable=False, index=True)
    away_team = Column(String(128), nullable=False, index=True)

    # Full-time score + result code: 'H' / 'D' / 'A'.
    fthg = Column(Integer, nullable=True)
    ftag = Column(Integer, nullable=True)
    ftr = Column(String(1), nullable=True)

    # Pinnacle 1X2 prices. PSCH/PSCD/PSCA are the closing line — what we
    # actually want for ROI. PSH/PSD/PSA (opening) are used as a fallback
    # for older rows that pre-date football-data.co.uk publishing closes.
    psch = Column(Float, nullable=True)
    pscd = Column(Float, nullable=True)
    psca = Column(Float, nullable=True)

    # 'close' if the row used PSCH/PSCD/PSCA, 'open_fallback' if we had
    # to fall back to PSH/PSD/PSA, 'missing' if neither was available.
    # Lets the UI flag rows where ROI isn't apples-to-apples.
    price_source = Column(String(16), nullable=False, default="close", index=True)

    # Phase 2 / 3 columns — present now so adding AH and totals later
    # doesn't need a migration. All nullable.
    ah_line = Column(Float, nullable=True)        # Pinnacle Asian Handicap line
    pahh = Column(Float, nullable=True)           # PAHHC closing — home AH price
    paha = Column(Float, nullable=True)           # PAHAC closing — away AH price
    p_over_25 = Column(Float, nullable=True)      # P>2.5 closing — over 2.5 goals
    p_under_25 = Column(Float, nullable=True)     # P<2.5 closing — under 2.5 goals

    imported_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        # A given (season, date, home, away) tuple uniquely identifies a
        # match for our purposes — the importer relies on this for upsert
        # semantics so re-running the import for the current season is safe.
        UniqueConstraint("season", "match_date", "home_team", "away_team",
                         name="uq_hist_season_date_teams"),
        # Most queries filter by league + season + team, so cover that path.
        Index("idx_hist_league_season", "league", "season"),
        Index("idx_hist_league_home", "league", "home_team"),
        Index("idx_hist_league_away", "league", "away_team"),
    )

    def __repr__(self):
        return (
            f"<HistoricalMatch {self.season} {self.match_date} "
            f"{self.home_team} {self.fthg}-{self.ftag} {self.away_team}>"
        )
