from sqlalchemy import Column, String, DateTime, Float, Integer, BigInteger, Text, Index
from datetime import datetime
from .database import Base

# BIGSERIAL on Postgres; plain INTEGER on sqlite, where a BigInteger
# primary key never autoincrements (the PolymarketSnapshot seed-script
# workaround exists because of exactly this).
_BigAutoPK = BigInteger().with_variant(Integer, "sqlite")


class OutrightSnapshot(Base):
    """
    A point-in-time price for ONE team in a Polymarket season-outright
    market (league winner today; top-4 / relegation when Polymarket
    lists them). One row per team per fetch — a whole-league fetch
    writes ~20 rows sharing the same fetched_at + capture_sha256, which
    is how consumers reassemble "the book as of T".

    team_name is the SteamWatch canonical name (The Odds API spelling)
    and is NULL when the Polymarket label couldn't be resolved — the
    raw label is always kept in team_name_raw, so an unmatched club is
    visible in diagnostics rather than silently corrupting a join
    against the model's team universe.

    yes_price is the last mid/market price (implied probability, e.g.
    0.355 = 35.5%). best_bid/best_ask are the actual tradeable prices —
    outright books are thinner than match books, so the spread matters
    for any executable-price accounting.
    """
    __tablename__ = "outright_snapshots"

    id = Column(_BigAutoPK, primary_key=True, autoincrement=True)
    league = Column(String(64), nullable=False, index=True)   # sport_key
    market = Column(String(32), nullable=False)               # 'winner' | 'top_4' | 'relegation'
    season = Column(String(8), nullable=False)                # '2627'
    event_slug = Column(String(160), nullable=False)
    fetched_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    team_name = Column(String(128), nullable=True, index=True)  # canonical; NULL = unresolved
    team_name_raw = Column(String(128), nullable=False)         # Polymarket's label, verbatim

    yes_price = Column(Float, nullable=True)
    best_bid = Column(Float, nullable=True)
    best_ask = Column(Float, nullable=True)
    last_trade_price = Column(Float, nullable=True)
    volume_24h = Column(Float, nullable=True)      # this team's market
    event_volume = Column(Float, nullable=True)    # whole event, lifetime
    event_liquidity = Column(Float, nullable=True)

    # sha256 of the canonicalized price payload this row came from —
    # joins to outright_captures for the content-addressed raw record.
    capture_sha256 = Column(String(64), nullable=False, index=True)

    __table_args__ = (
        Index("idx_outright_league_market_time", "league", "market", "fetched_at"),
    )

    def __repr__(self):
        return f"<OutrightSnapshot {self.league} {self.market} {self.team_name_raw} @{self.fetched_at}>"


class OutrightCapture(Base):
    """
    Content-addressed raw capture of an outright event's price-relevant
    payload (per the scoring spec: thin-venue P&L claims must be backed
    by published, hashable snapshots). One row per DISTINCT payload —
    a fetch that returns byte-identical prices to the previous one
    inserts nothing here, snapshots just reference the existing hash.

    payload is the canonicalized JSON actually hashed (sorted keys,
    trimmed to price-relevant fields), NOT the full Gamma response —
    descriptions and UI fields would bloat the table without adding
    anything auditable about the prices.
    """
    __tablename__ = "outright_captures"

    sha256 = Column(String(64), primary_key=True)
    league = Column(String(64), nullable=False, index=True)
    market = Column(String(32), nullable=False)
    event_slug = Column(String(160), nullable=False)
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    payload = Column(Text, nullable=False)

    def __repr__(self):
        return f"<OutrightCapture {self.sha256[:12]} {self.event_slug}>"
