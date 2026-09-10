import hashlib
import re
import secrets
from urllib.parse import urlsplit
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from pydantic import BaseModel, StrictInt
from sqlalchemy.orm import Session
from app.models.database import get_db
from app.models.club_rating import ClubRatingPublication, ClubRatingVote, ClubRatingVoter
from app.services.club_ratings.community import eligible

club_rating_router = APIRouter(prefix='/club-ratings', tags=['club-ratings'])
COOKIE = 'sw_rating_voter'


def publication(db):
    result = db.query(ClubRatingPublication).order_by(ClubRatingPublication.id.desc()).first()
    if result is None:
        raise HTTPException(503, 'Ratings are being prepared. Please try again shortly.')
    return result.board


def identity(request):
    value = request.cookies.get(COOKIE, '')
    return hashlib.sha256(value.encode()).hexdigest() if re.fullmatch('[a-f0-9]{64}', value) else None


@club_rating_router.get('')
def board(response: Response, db: Session = Depends(get_db)):
    data = dict(publication(db))
    data['overdue'] = datetime.utcnow() > datetime.fromisoformat(data['next_update'].rstrip('Z')) + timedelta(hours=6)
    response.headers['Cache-Control'] = 'public, max-age=60'
    return data


@club_rating_router.get('/votes/me')
def my_votes(request: Request, response: Response, db: Session = Depends(get_db)):
    scores = {t['id']: t['score'] for t in publication(db)['teams']}
    voter_id = identity(request)
    response.headers['Cache-Control'] = 'no-store'
    if voter_id is None:
        response.set_cookie(COOKIE, secrets.token_hex(32), max_age=365*86400,
                            httponly=True, secure=request.url.hostname not in ('localhost', '127.0.0.1', 'testserver'),
                            samesite='lax', path='/api/club-ratings')
        return {}
    votes = db.query(ClubRatingVote).filter(ClubRatingVote.voter_id == voter_id).all()
    now = datetime.utcnow()
    return {str(v.club_id):v.direction for v in votes if v.club_id in scores and eligible(v, scores[v.club_id], now)}


class VoteBody(BaseModel):
    direction: StrictInt


@club_rating_router.put('/{club_id}/vote')
def vote(club_id: int, body: VoteBody, request: Request, response: Response, db: Session = Depends(get_db)):
    # Cross-site form submissions cannot vote; only same-origin JSON requests.
    origin = request.headers.get('origin')
    local_preview = request.url.hostname in ('localhost','127.0.0.1') and urlsplit(origin or '').hostname in ('localhost','127.0.0.1')
    if origin and urlsplit(origin).netloc != request.url.netloc and not local_preview:
        raise HTTPException(403, 'Please vote from the SteamWatch page.')
    if request.headers.get('sec-fetch-site') == 'cross-site':
        raise HTTPException(403, 'Please vote from the SteamWatch page.')
    voter_id = identity(request)
    if voter_id is None:
        raise HTTPException(400, 'Refresh the page and allow its voting cookie to save your vote.')
    if body.direction not in (-1, 0, 1):
        raise HTTPException(422, 'Direction must be -1, 0 or 1.')
    team = next((t for t in publication(db)['teams'] if t['id'] == club_id), None)
    if team is None:
        raise HTTPException(404, 'Club not found.')
    # Upsert then lock a browser identity, including concurrent first votes.
    if db.bind.dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    db.execute(insert(ClubRatingVoter).values(id=voter_id).on_conflict_do_nothing(index_elements=['id']))
    db.query(ClubRatingVoter).filter_by(id=voter_id).with_for_update().one()
    existing = db.query(ClubRatingVote).filter_by(voter_id=voter_id, club_id=club_id).first()
    now = datetime.utcnow()
    response.headers['Cache-Control'] = 'no-store'
    if existing and existing.direction == body.direction and (body.direction == 0 or eligible(existing, team['score'], now)):
        db.commit()
        return {'club_id':club_id, 'direction':body.direction}
    if existing and now-existing.updated_at < timedelta(seconds=2):
        raise HTTPException(429, 'Please wait a moment before changing your vote.', headers={'Retry-After':'2'})
    recent = db.query(ClubRatingVote).filter(ClubRatingVote.voter_id == voter_id, ClubRatingVote.updated_at > now-timedelta(minutes=1)).count()
    if recent >= 20:
        raise HTTPException(429, 'Please wait a minute before voting on more clubs.', headers={'Retry-After':'60'})
    if existing is None:
        existing = ClubRatingVote(voter_id=voter_id, club_id=club_id)
        db.add(existing)
    existing.direction, existing.rating_at_vote, existing.updated_at = body.direction, team['score'], now
    db.commit()
    return {'club_id':club_id, 'direction':body.direction}
