from sqlalchemy import Column, String, BigInteger, DateTime
from datetime import datetime
from .database import Base


class SquadMarketValue(Base):
    """
    Squad market value, loaded from a committed snapshot
    (backend/app/data/transfermarkt_squad_values.json).

    Transfermarkt has no public API and their terms prohibit automated
    scraping (see transfermarkt_name_map.py), so this is entered by
    hand periodically from a table paste — reload via
    /admin/load-squad-values after refreshing the snapshot.

    Shown as its own column on the Power Rankings page AND blended into
    the rating itself as a fading prior (see power_ranking_fitter.py —
    SQUAD_VALUE_PRIOR_K, weighted lower than the ClubElo blend since
    this is a valuation metric rather than an observed-performance
    one). team is NULL for Transfermarkt clubs outside our tracked
    leagues (kept via team_raw), never guessed, and never enters the
    blend.
    """
    __tablename__ = "squad_market_values"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    team = Column(String(128), nullable=True, index=True)  # canonical; NULL = unmapped/untracked
    team_raw = Column(String(128), nullable=False)
    competition_label = Column(String(64), nullable=True)
    market_value_eur = Column(BigInteger, nullable=False)
    source = Column(String(256), nullable=False)
    captured_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<SquadMarketValue {self.team_raw} = €{self.market_value_eur:,}>"
