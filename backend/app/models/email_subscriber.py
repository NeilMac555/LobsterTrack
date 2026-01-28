from sqlalchemy import Column, String, DateTime, Integer
from datetime import datetime
from .database import Base


class EmailSubscriber(Base):
    """
    Stores email addresses for users interested in steam alerts.
    Simple signup - no verification required.
    """
    __tablename__ = "email_subscribers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<EmailSubscriber {self.email}>"
