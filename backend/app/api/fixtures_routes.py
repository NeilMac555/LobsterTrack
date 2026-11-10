"""/api/fixtures: data behind the league hubs and related-match links
(see services/fixtures.py). The React pages use these so the rendered DOM
carries the same links the server-rendered HTML does."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models import Match
from app.models.database import get_db
from app.services import fixtures as fx

fixtures_router = APIRouter(prefix="/fixtures", tags=["fixtures"])


@fixtures_router.get("/league/{slug}")
def get_league(slug: str, db: Session = Depends(get_db)):
    key = fx.SLUG_TO_KEY.get(slug)
    if not key:
        raise HTTPException(status_code=404, detail="Unknown league")
    return fx.league_fixtures(db, key)


@fixtures_router.get("/related/{match_id}")
def get_related(match_id: str, db: Session = Depends(get_db)):
    """Other matches in the same competition around the same date, plus the
    league hub. `redirect_to` is set when this id is a duplicate record."""
    m = db.query(Match).filter(Match.id == match_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Unknown match")
    return {
        "league_slug": fx.league_slug(m.sport_key),
        "league_name": fx.league_name(m.sport_key),
        "redirect_to": fx.ghost_map(db).get(match_id),
        "matches": fx.related_matches(db, m.id, m.sport_key, m.commence_time),
    }
