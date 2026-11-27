from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from .database import Base


class EmailBroadcast(Base):
    """One row per member per campaign, written when the email is accepted
    by the mail provider, so re-running a campaign never emails anyone twice."""
    __tablename__ = "email_broadcasts"

    campaign = Column(String(64), primary_key=True)
    user_id = Column(Integer, primary_key=True)
    sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)
