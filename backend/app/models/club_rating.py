from datetime import datetime
from sqlalchemy import Column, Integer, Float, DateTime, JSON, ForeignKey, UniqueConstraint, CheckConstraint, String
from .database import Base


class ClubRatingPublication(Base):
    __tablename__ = 'club_rating_publications'
    id = Column(Integer, primary_key=True)
    period = Column(String(10), nullable=False, unique=True)
    published_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    board = Column(JSON, nullable=False)


class ClubRatingInputs(Base):
    __tablename__ = 'club_rating_inputs'
    id = Column(Integer, primary_key=True)
    snapshots = Column(JSON, nullable=False)
    checked_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    results = Column(JSON, nullable=False, default=dict)


class ClubRatingVoter(Base):
    __tablename__ = 'club_rating_voters'
    id = Column(String(64), primary_key=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class ClubRatingVote(Base):
    __tablename__ = 'club_rating_votes'
    __table_args__ = (
        UniqueConstraint('voter_id', 'club_id', name='uq_club_rating_browser_vote'),
        CheckConstraint('direction IN (-1, 0, 1)', name='ck_club_rating_direction'),
    )
    id = Column(Integer, primary_key=True)
    voter_id = Column(String(64), ForeignKey('club_rating_voters.id'), nullable=False, index=True)
    club_id = Column(Integer, nullable=False, index=True)
    direction = Column(Integer, nullable=False)
    rating_at_vote = Column(Float, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
