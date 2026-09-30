"""/api/xg-goals: goals vs expected goals per club (see services/xg_goals)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.services.xg_goals import club_gap, table, undershooting

xg_goals_router = APIRouter(prefix="/xg-goals", tags=["xg-goals"])


@xg_goals_router.get("/table")
def get_table(db: Session = Depends(get_db), months: int = Query(12, description="Rolling window: 12 or 6 months")):
    """Every club in the top five leagues with 8+ matches in the window:
    goals, xG, attack gap, conceded, xGA, defence gap. Sorted by attack
    gap, most negative first. Understat data, refreshed Mondays."""
    return table(db, months=months)


@xg_goals_router.get("/undershooting")
def get_undershooting(
    db: Session = Depends(get_db),
    months: int = Query(12, description="Rolling window: 12 or 6 months"),
    limit: int = Query(10, ge=1, le=50),
):
    """The `limit` clubs scoring furthest below their xG over the window."""
    return undershooting(db, months=months, limit=limit)


@xg_goals_router.get("/club")
def get_club(db: Session = Depends(get_db), league: str = Query(...), team: str = Query(...), months: int = Query(12)):
    """One club's window row, looked up by our (Odds API) team name.
    Returns {"row": null} when the club can't be matched with confidence."""
    return {"row": club_gap(db, league, team, months)}
