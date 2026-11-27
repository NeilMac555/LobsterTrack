from datetime import datetime

from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer

from .database import Base


class TelegramMember(Base):
    """Which Telegram account a subscriber joined the alerts channel with.

    Its own table, not a column on users: create_all adds a new table
    without the ALTER TABLE lock that has blocked startup before.
    """
    __tablename__ = "telegram_members"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    telegram_user_id = Column(BigInteger, nullable=False, index=True)
    joined_at = Column(DateTime, nullable=False, default=datetime.utcnow)
