from datetime import datetime

from sqlalchemy import Column, DateTime, String

from .database import Base


class EmailBroadcast(Base):
    """One row per address per campaign, written when the email is accepted
    by the mail provider, so re-running a campaign never emails anyone twice."""
    __tablename__ = "email_broadcasts"

    campaign = Column(String(64), primary_key=True)
    email = Column(String(255), primary_key=True)   # lower-cased
    sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class EmailUnsubscribe(Base):
    """Addresses that have opted out of marketing email. Checked on every
    marketing send. Account emails (login links, receipts) are not affected."""
    __tablename__ = "email_unsubscribes"

    email = Column(String(255), primary_key=True)   # lower-cased
    unsubscribed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
