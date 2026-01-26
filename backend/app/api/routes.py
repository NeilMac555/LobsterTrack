from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text
from datetime import datetime, timedelta
from typing import Optional

from app.models import get_db, Match, OddsSnapshot
from app.config import get_settings
from app.services.scheduler import odds_scheduler
from .schemas import (
    MatchSummary,
    MatchDetail,
    OddsPoint,
    LeagueSummary,
    FetchStatus,
    HealthResponse
)

router = APIRouter()
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for monitoring.
    """
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "unhealthy"

    scheduler_status = "running" if odds_scheduler._is_running else "stopped"

    return HealthResponse(
        status="ok" if db_status == "healthy" else "degraded",
        database=db_status,
        scheduler=scheduler_status,
        timestamp=datetime.utcnow()
    )


@router.get("/leagues", response_model=list[LeagueSummary])
async def get_leagues(db: Session = Depends(get_db)):
    """
    Get all tracked leagues with match counts.
    """
    now = datetime.utcnow()

    results = (
        db.query(
            Match.sport_key,
            Match.league_name,
            func.count(Match.id).label("match_count"),
            func.count(Match.id).filter(Match.commence_time > now).label("upcoming")
        )
        .group_by(Match.sport_key, Match.league_name)
        .all()
    )

    return [
        LeagueSummary(
            sport_key=r.sport_key,
            league_name=r.league_name,
            match_count=r.match_count,
            upcoming_matches=r.upcoming
        )
        for r in results
    ]


@router.get("/matches", response_model=list[MatchSummary])
async def get_matches(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(None, description="Filter by sport_key"),
    upcoming_only: bool = Query(True, description="Only show future matches"),
    limit: int = Query(50, le=200),
    offset: int = Query(0)
):
    """
    Get list of matches with current odds.
    """
    query = db.query(Match)

    if league:
        query = query.filter(Match.sport_key == league)

    if upcoming_only:
        query = query.filter(Match.commence_time > datetime.utcnow())

    query = query.order_by(Match.commence_time.asc())

    matches = query.offset(offset).limit(limit).all()

    result = []
    for match in matches:
        # Get latest odds
        latest_odds = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )

        odds_count = (
            db.query(func.count(OddsSnapshot.id))
            .filter(OddsSnapshot.match_id == match.id)
            .scalar()
        )

        result.append(MatchSummary(
            id=match.id,
            home_team=match.home_team,
            away_team=match.away_team,
            league_name=match.league_name,
            sport_key=match.sport_key,
            commence_time=match.commence_time,
            current_home_odds=latest_odds.home_odds if latest_odds else None,
            current_draw_odds=latest_odds.draw_odds if latest_odds else None,
            current_away_odds=latest_odds.away_odds if latest_odds else None,
            odds_count=odds_count
        ))

    return result


@router.get("/matches/{match_id}", response_model=MatchDetail)
async def get_match_detail(match_id: str, db: Session = Depends(get_db)):
    """
    Get detailed match info with full odds history.
    """
    match = db.query(Match).filter(Match.id == match_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Get all odds snapshots ordered by time
    snapshots = (
        db.query(OddsSnapshot)
        .filter(OddsSnapshot.match_id == match_id)
        .order_by(OddsSnapshot.fetched_at.asc())
        .all()
    )

    odds_history = [
        OddsPoint(
            timestamp=s.fetched_at,
            home_odds=s.home_odds,
            draw_odds=s.draw_odds,
            away_odds=s.away_odds
        )
        for s in snapshots
    ]

    return MatchDetail(
        id=match.id,
        home_team=match.home_team,
        away_team=match.away_team,
        league_name=match.league_name,
        sport_key=match.sport_key,
        commence_time=match.commence_time,
        created_at=match.created_at,
        odds_history=odds_history
    )


@router.post("/fetch", response_model=FetchStatus)
async def trigger_fetch():
    """
    Manually trigger an odds fetch.
    Useful for testing or immediate updates.
    """
    from app.services.odds_fetcher import odds_fetcher

    try:
        summary = await odds_fetcher.fetch_all_leagues()
        return FetchStatus(
            is_running=False,
            last_run=datetime.utcnow(),
            leagues_processed=summary["leagues_processed"],
            matches_found=summary["matches_found"],
            odds_stored=summary["odds_stored"],
            errors=summary["errors"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats(db: Session = Depends(get_db)):
    """
    Get overall statistics about tracked data.
    """
    total_matches = db.query(func.count(Match.id)).scalar()
    total_snapshots = db.query(func.count(OddsSnapshot.id)).scalar()
    upcoming_matches = (
        db.query(func.count(Match.id))
        .filter(Match.commence_time > datetime.utcnow())
        .scalar()
    )

    # Oldest and newest data
    oldest_snapshot = db.query(func.min(OddsSnapshot.fetched_at)).scalar()
    newest_snapshot = db.query(func.max(OddsSnapshot.fetched_at)).scalar()

    return {
        "total_matches": total_matches,
        "upcoming_matches": upcoming_matches,
        "total_odds_snapshots": total_snapshots,
        "oldest_data": oldest_snapshot,
        "newest_data": newest_snapshot,
        "tracked_leagues": list(settings.leagues.keys())
    }
