from sqlalchemy import Column, String, DateTime, Integer, Boolean
from datetime import datetime
from .database import Base


class MagicLink(Base):
    __tablename__ = "magic_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f"<MagicLink email={self.email} used={self.used}>"
