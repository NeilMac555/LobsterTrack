"""
Persisted forecast runs — the calibration ledger.

Every /forecast run is stored whole (full payload JSON: result,
rationale, evidence cards, stage timeline) so a forecast can be audited
later exactly as it was shown, and scored against reality once the
season resolves. Query-relevant fields are lifted into columns; the
payload blob is the source of truth for display.

Kept as a Text JSON blob rather than per-field columns deliberately:
the payload shape will evolve with the engine (engine_version tracks
which shape), and scoring runs read the blob anyway.
"""

from sqlalchemy import Column, DateTime, Index, Integer, String, Text
from datetime import datetime

from .database import Base


class Forecast(Base):
    __tablename__ = "forecasts"

    id = Column(Integer, primary_key=True, autoincrement=True)

    question = Column(String(512), nullable=False)
    # Parser intent: league_winner / top_n / relegation / team_outcome /
    # match / unsupported
    kind = Column(String(32), nullable=False, index=True)
    league = Column(String(64), nullable=True, index=True)
    # ok / unsupported / error
    status = Column(String(16), nullable=False, index=True)

    engine_version = Column(String(32), nullable=False)
    duration_ms = Column(Integer, nullable=False, default=0)

    # Full response payload as shown to the user (JSON).
    payload = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    __table_args__ = (
        Index("idx_forecast_league_created", "league", "created_at"),
    )

    def __repr__(self):
        return f"<Forecast #{self.id} [{self.kind}] {self.question[:60]!r}>"
