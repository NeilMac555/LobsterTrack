from sqlalchemy import (
    JSON,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)

from .database import Base


class ResearchTrack(Base):
    __tablename__ = "research_tracks"
    id = Column(Integer, primary_key=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fingerprint = Column(String(64), nullable=False)
    question = Column(String(240), nullable=False)
    rules = Column(JSON, nullable=False)
    baseline = Column(JSON, nullable=False)
    created_at = Column(DateTime, nullable=False)
    forward_from = Column(Date, nullable=False)
    __table_args__ = (
        UniqueConstraint("user_id", "fingerprint", name="uq_research_user_rules"),
    )
