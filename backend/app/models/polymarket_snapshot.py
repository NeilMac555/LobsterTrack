from sqlalchemy import Column, String, DateTime, Float, Boolean, BigInteger, ForeignKey, Index
from datetime import datetime
from .database import Base


class PolymarketSnapshot(Base):
    """
    A point-in-time snapshot of Polymarket prices for a soccer match.
    Stores the 1X2 trio (home/draw/away YES prices) and the most-traded
    Totals line (Over/Under 2.5) along with bid/ask depth and 24h volume
    for liquidity context. One row per fetch per match.

    Why we store both YES price and bid/ask: the YES price is the implied
    probability (e.g. 0.42 = 42%), useful for the headline chart and
    movement calculations. The bid/ask is the actual tradeable price and
    a tight spread signals deep, sharp liquidity — Polymarket WC match
    markets typically run ~1c spread.
    """
    __tablename__ = "polymarket_snapshots"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    match_id = Column(String(64), ForeignKey("matches.id"), nullable=False, index=True)
    polymarket_event_slug = Column(String(128), nullable=False, index=True)
    fetched_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # True when fetched_at > match.commence_time. Lets consumers filter
    # cleanly to "what did Polymarket do during the match" without doing
    # a join on the matches table every time.
    in_play = Column(Boolean, default=False, nullable=False, index=True)

    # 1X2 — YES side prices (each in 0..1 cent format, e.g. 0.42 = 42%).
    home_win_yes = Column(Float, nullable=True)
    draw_yes = Column(Float, nullable=True)
    away_win_yes = Column(Float, nullable=True)

    # Best bid/ask per outcome, for spread/liquidity reads.
    home_win_bid = Column(Float, nullable=True)
    home_win_ask = Column(Float, nullable=True)
    draw_bid = Column(Float, nullable=True)
    draw_ask = Column(Float, nullable=True)
    away_win_bid = Column(Float, nullable=True)
    away_win_ask = Column(Float, nullable=True)

    # Totals — over/under 2.5 goals (highest-liquidity Totals line on
    # Polymarket WC events, typically ~$2M+/24h).
    over_2_5_yes = Column(Float, nullable=True)
    under_2_5_yes = Column(Float, nullable=True)
    over_2_5_bid = Column(Float, nullable=True)
    over_2_5_ask = Column(Float, nullable=True)

    # 24h trading volume — used as a "is this market liquid right now"
    # signal. We store both the headline 1X2 home market (the biggest
    # by volume) and a roll-up across all 3 1X2 markets.
    home_win_volume_24h = Column(Float, nullable=True)
    event_volume_24h = Column(Float, nullable=True)

    __table_args__ = (
        Index("idx_pm_match_time", "match_id", "fetched_at"),
        Index("idx_pm_match_inplay", "match_id", "in_play"),
    )

    def __repr__(self):
        return f"<PolymarketSnapshot match={self.match_id} at={self.fetched_at}>"
