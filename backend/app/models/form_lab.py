from sqlalchemy import Column, String, DateTime, JSON
from .database import Base

class FormLabSeason(Base):
    __tablename__ = 'form_lab_seasons'
    key = Column(String(100), primary_key=True)
    league = Column(String(64), nullable=False, index=True)
    season = Column(String(9), nullable=False)
    updated_at = Column(DateTime, nullable=False)
    data = Column(JSON, nullable=False)
