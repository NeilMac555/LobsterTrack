from fastapi import APIRouter, Depends, HTTPException, Query, Header, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text
from datetime import datetime, timedelta
from typing import Optional

from app.models import get_db, Match, OddsSnapshot, SteamMove, EmailSubscriber, TotalsSnapshot, SpreadsSnapshot, ClosingLine, SyndicateAlert, XGData
from app.config import get_settings
from app.services.scheduler import odds_scheduler
from .schemas import (
    MatchSummary,
    MatchDetail,
    OddsPoint,
    LeagueSummary,
    FetchStatus,
    SpreadsPoint,
    MatchSpreadsResponse,
    HealthResponse,
    SteamMoveResponse,
    SteamMoveStats,
    BiggestMover,
    EmailSignupRequest,
    EmailSignupResponse,
    AdminEmailsResponse,
    EmailSubscriberInfo,
    TotalsPoint,
    MatchTotalsResponse,
    SyndicateMove,
    SteamResultsResponse,
    TeamSteamRanking,
    ClosingLineResponse,
    ClosingLinesListResponse,
    MatchClosingLines,
    MatchClosingLinesListResponse,
    XGDataPoint,
    XGDataResponse,
    XGTeamsResponse,
)

# Simple admin password
ADMIN_PASSWORD = "SoccerMatics33"

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
    Optimized to use batch queries instead of N+1 (was 343 queries, now 4).
    """
    query = db.query(Match)

    if league:
        query = query.filter(Match.sport_key == league)

    if upcoming_only:
        query = query.filter(Match.commence_time > datetime.utcnow())

    query = query.order_by(Match.commence_time.asc())

    matches = query.offset(offset).limit(limit).all()

    if not matches:
        return []

    match_ids = [m.id for m in matches]

    # Batch query: Get latest odds for all matches using window function
    latest_subq = (
        db.query(
            OddsSnapshot.match_id,
            OddsSnapshot.home_odds,
            OddsSnapshot.draw_odds,
            OddsSnapshot.away_odds,
            func.row_number().over(
                partition_by=OddsSnapshot.match_id,
                order_by=OddsSnapshot.fetched_at.desc()
            ).label('rn')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .subquery()
    )

    latest_odds_query = (
        db.query(latest_subq)
        .filter(latest_subq.c.rn == 1)
        .all()
    )
    latest_odds_map = {
        row.match_id: {
            'home': row.home_odds,
            'draw': row.draw_odds,
            'away': row.away_odds
        }
        for row in latest_odds_query
    }

    # Batch query: Get opening odds (first snapshot) for all matches
    opening_subq = (
        db.query(
            OddsSnapshot.match_id,
            OddsSnapshot.home_odds,
            OddsSnapshot.draw_odds,
            OddsSnapshot.away_odds,
            func.row_number().over(
                partition_by=OddsSnapshot.match_id,
                order_by=OddsSnapshot.fetched_at.asc()
            ).label('rn')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .subquery()
    )

    opening_odds_query = (
        db.query(opening_subq)
        .filter(opening_subq.c.rn == 1)
        .all()
    )
    opening_odds_map = {
        row.match_id: {
            'home': row.home_odds,
            'draw': row.draw_odds,
            'away': row.away_odds
        }
        for row in opening_odds_query
    }

    # Batch query: Get odds count for all matches
    odds_counts_query = (
        db.query(
            OddsSnapshot.match_id,
            func.count(OddsSnapshot.id).label('count')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .group_by(OddsSnapshot.match_id)
        .all()
    )
    odds_count_map = {row.match_id: row.count for row in odds_counts_query}

    result = []
    for match in matches:
        latest = latest_odds_map.get(match.id, {})
        opening = opening_odds_map.get(match.id, {})

        result.append(MatchSummary(
            id=match.id,
            home_team=match.home_team,
            away_team=match.away_team,
            league_name=match.league_name,
            sport_key=match.sport_key,
            commence_time=match.commence_time,
            current_home_odds=latest.get('home'),
            current_draw_odds=latest.get('draw'),
            current_away_odds=latest.get('away'),
            opening_home_odds=opening.get('home'),
            opening_draw_odds=opening.get('draw'),
            opening_away_odds=opening.get('away'),
            odds_count=odds_count_map.get(match.id, 0)
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

    # Get only pre-kickoff odds snapshots (exclude in-play odds)
    snapshots = (
        db.query(OddsSnapshot)
        .filter(OddsSnapshot.match_id == match_id)
        .filter(OddsSnapshot.fetched_at < match.commence_time)
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


@router.get("/biggest-movers", response_model=list[BiggestMover])
async def get_biggest_movers(
    db: Session = Depends(get_db),
    limit: int = Query(4, le=20, description="Number of movers to return")
):
    """
    Get matches with the biggest odds movements across all markets (1X2, Totals, Asian Handicap).
    Returns one move per match (the biggest across all markets).
    """
    now = datetime.utcnow()

    # Get upcoming matches
    matches = (
        db.query(Match)
        .filter(Match.commence_time > now)
        .all()
    )

    if not matches:
        return []

    match_ids = [m.id for m in matches]
    match_map = {m.id: m for m in matches}

    # === 1X2 MARKET ===
    latest_1x2_subq = (
        db.query(
            OddsSnapshot.match_id,
            OddsSnapshot.home_odds,
            OddsSnapshot.draw_odds,
            OddsSnapshot.away_odds,
            func.row_number().over(
                partition_by=OddsSnapshot.match_id,
                order_by=OddsSnapshot.fetched_at.desc()
            ).label('rn')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    latest_1x2 = {row.match_id: row for row in db.query(latest_1x2_subq).filter(latest_1x2_subq.c.rn == 1).all()}

    opening_1x2_subq = (
        db.query(
            OddsSnapshot.match_id,
            OddsSnapshot.home_odds,
            OddsSnapshot.draw_odds,
            OddsSnapshot.away_odds,
            func.row_number().over(
                partition_by=OddsSnapshot.match_id,
                order_by=OddsSnapshot.fetched_at.asc()
            ).label('rn')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    opening_1x2 = {row.match_id: row for row in db.query(opening_1x2_subq).filter(opening_1x2_subq.c.rn == 1).all()}

    # === TOTALS MARKET ===
    latest_totals_subq = (
        db.query(
            TotalsSnapshot.match_id,
            TotalsSnapshot.line,
            TotalsSnapshot.over_odds,
            TotalsSnapshot.under_odds,
            func.row_number().over(
                partition_by=TotalsSnapshot.match_id,
                order_by=TotalsSnapshot.fetched_at.desc()
            ).label('rn')
        )
        .filter(TotalsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    latest_totals = {row.match_id: row for row in db.query(latest_totals_subq).filter(latest_totals_subq.c.rn == 1).all()}

    opening_totals_subq = (
        db.query(
            TotalsSnapshot.match_id,
            TotalsSnapshot.line,
            TotalsSnapshot.over_odds,
            TotalsSnapshot.under_odds,
            func.row_number().over(
                partition_by=TotalsSnapshot.match_id,
                order_by=TotalsSnapshot.fetched_at.asc()
            ).label('rn')
        )
        .filter(TotalsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    opening_totals = {row.match_id: row for row in db.query(opening_totals_subq).filter(opening_totals_subq.c.rn == 1).all()}

    # === SPREADS (ASIAN HANDICAP) MARKET ===
    latest_spreads_subq = (
        db.query(
            SpreadsSnapshot.match_id,
            SpreadsSnapshot.line,
            SpreadsSnapshot.home_odds,
            SpreadsSnapshot.away_odds,
            func.row_number().over(
                partition_by=SpreadsSnapshot.match_id,
                order_by=SpreadsSnapshot.fetched_at.desc()
            ).label('rn')
        )
        .filter(SpreadsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    latest_spreads = {row.match_id: row for row in db.query(latest_spreads_subq).filter(latest_spreads_subq.c.rn == 1).all()}

    opening_spreads_subq = (
        db.query(
            SpreadsSnapshot.match_id,
            SpreadsSnapshot.line,
            SpreadsSnapshot.home_odds,
            SpreadsSnapshot.away_odds,
            func.row_number().over(
                partition_by=SpreadsSnapshot.match_id,
                order_by=SpreadsSnapshot.fetched_at.asc()
            ).label('rn')
        )
        .filter(SpreadsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    opening_spreads = {row.match_id: row for row in db.query(opening_spreads_subq).filter(opening_spreads_subq.c.rn == 1).all()}

    # Calculate movements for all outcomes across all markets
    # Only consider SHORTENING odds (being backed) — the side smart money is on
    movers = []
    for match_id, match in match_map.items():
        best_move = None
        best_pct = 0  # Track most-negative pct (most shortened)

        # 1X2 outcomes
        latest = latest_1x2.get(match_id)
        opening = opening_1x2.get(match_id)
        if latest and opening:
            outcomes = [
                ('home', match.home_team, opening.home_odds, latest.home_odds),
                ('draw', 'Draw', opening.draw_odds, latest.draw_odds),
                ('away', match.away_team, opening.away_odds, latest.away_odds),
            ]
            for outcome, name, open_odds, curr_odds in outcomes:
                if open_odds and curr_odds and open_odds > 0:
                    pct = ((curr_odds - open_odds) / open_odds) * 100
                    if pct < 0 and pct < best_pct:
                        best_pct = pct
                        best_move = {
                            'match': match,
                            'market': '1x2',
                            'outcome': outcome,
                            'outcome_name': name,
                            'opening_odds': open_odds,
                            'current_odds': curr_odds,
                            'movement_percent': pct,
                            'direction': 'down'
                        }

        # Totals outcomes
        latest_t = latest_totals.get(match_id)
        opening_t = opening_totals.get(match_id)
        if latest_t and opening_t:
            line = opening_t.line
            outcomes = [
                ('over', f'O {line}', opening_t.over_odds, latest_t.over_odds),
                ('under', f'U {line}', opening_t.under_odds, latest_t.under_odds),
            ]
            for outcome, name, open_odds, curr_odds in outcomes:
                if open_odds and curr_odds and open_odds > 0:
                    pct = ((curr_odds - open_odds) / open_odds) * 100
                    if pct < 0 and pct < best_pct:
                        best_pct = pct
                        best_move = {
                            'match': match,
                            'market': 'totals',
                            'outcome': outcome,
                            'outcome_name': name,
                            'opening_odds': open_odds,
                            'current_odds': curr_odds,
                            'movement_percent': pct,
                            'direction': 'down'
                        }

        # Spreads (Asian Handicap) outcomes — disabled for now (line changes cause noise)
        # latest_s = latest_spreads.get(match_id)
        # opening_s = opening_spreads.get(match_id)
        # if latest_s and opening_s:
        #     ...

        if best_move and abs(best_pct) > 0.1:
            movers.append(best_move)

    # Sort by absolute movement and take top N
    movers.sort(key=lambda x: abs(x['movement_percent']), reverse=True)
    top_movers = movers[:limit]

    return [
        BiggestMover(
            match_id=m['match'].id,
            home_team=m['match'].home_team,
            away_team=m['match'].away_team,
            sport_key=m['match'].sport_key,
            league_name=m['match'].league_name,
            commence_time=m['match'].commence_time,
            market=m['market'],
            outcome=m['outcome'],
            outcome_name=m['outcome_name'],
            opening_odds=m['opening_odds'],
            current_odds=m['current_odds'],
            movement_percent=m['movement_percent'],
            direction=m['direction']
        )
        for m in top_movers
    ]


@router.get("/syndicate-moves", response_model=list[SyndicateMove])
async def get_syndicate_moves(
    db: Session = Depends(get_db),
    limit: int = Query(4, le=20, description="Number of moves to return")
):
    """
    Get late sharp money moves across all markets (1X2, Totals, Asian Handicap).
    Criteria:
    - Match kicks off within 3 hours
    - 3+ implied probability percentage point shift WITHIN the 3-hour window
    - Only SHORTENING odds (being backed)

    Uses implied probability movement instead of raw odds percentage change
    to avoid false positives on longshots.
    """
    PROB_THRESHOLD = 3.0  # Minimum implied probability shift in percentage points

    def _prob(odds: float) -> float:
        return (1.0 / odds) * 100

    now = datetime.utcnow()
    three_hours_from_now = now + timedelta(hours=3)

    # Get matches kicking off within 3 hours
    matches = (
        db.query(Match)
        .filter(Match.commence_time > now)
        .filter(Match.commence_time <= three_hours_from_now)
        .all()
    )

    if not matches:
        return []

    syndicate_moves = []

    for match in matches:
        window_start = match.commence_time - timedelta(hours=3)
        time_to_ko = match.commence_time - now
        minutes_to_ko = int(time_to_ko.total_seconds() / 60)

        best_move = None
        best_prob_move = 0

        # === 1X2 MARKET ===
        baseline_1x2 = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .filter(OddsSnapshot.fetched_at >= window_start)
            .order_by(OddsSnapshot.fetched_at.asc())
            .first()
        )
        latest_1x2 = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )

        if baseline_1x2 and latest_1x2 and baseline_1x2.id != latest_1x2.id:
            outcomes = [
                ('home', match.home_team, baseline_1x2.home_odds, latest_1x2.home_odds),
                ('draw', 'Draw', baseline_1x2.draw_odds, latest_1x2.draw_odds),
                ('away', match.away_team, baseline_1x2.away_odds, latest_1x2.away_odds),
            ]
            for outcome, name, baseline_odds, curr_odds in outcomes:
                if baseline_odds and curr_odds and baseline_odds > 0 and curr_odds > 0:
                    # Positive = odds shortened (probability increased)
                    prob_move = _prob(curr_odds) - _prob(baseline_odds)
                    if prob_move >= PROB_THRESHOLD and prob_move > best_prob_move:
                        best_prob_move = prob_move
                        best_move = {
                            'match': match,
                            'market': '1x2',
                            'outcome': outcome,
                            'outcome_name': name,
                            'baseline_odds': baseline_odds,
                            'current_odds': curr_odds,
                            'movement_percent': -prob_move,  # Negative to indicate shortening (convention)
                            'direction': 'down',
                            'minutes_to_kickoff': minutes_to_ko,
                            'moved_at': latest_1x2.fetched_at
                        }

        # === TOTALS MARKET ===
        baseline_totals = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.fetched_at >= window_start)
            .order_by(TotalsSnapshot.fetched_at.asc())
            .first()
        )
        latest_totals = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .order_by(TotalsSnapshot.fetched_at.desc())
            .first()
        )

        if baseline_totals and latest_totals and baseline_totals.id != latest_totals.id and baseline_totals.line == latest_totals.line:
            line = baseline_totals.line
            outcomes = [
                ('over', f'O {line}', baseline_totals.over_odds, latest_totals.over_odds),
                ('under', f'U {line}', baseline_totals.under_odds, latest_totals.under_odds),
            ]
            for outcome, name, baseline_odds, curr_odds in outcomes:
                if baseline_odds and curr_odds and baseline_odds > 0 and curr_odds > 0:
                    prob_move = _prob(curr_odds) - _prob(baseline_odds)
                    if prob_move >= PROB_THRESHOLD and prob_move > best_prob_move:
                        best_prob_move = prob_move
                        best_move = {
                            'match': match,
                            'market': 'totals',
                            'outcome': outcome,
                            'outcome_name': name,
                            'baseline_odds': baseline_odds,
                            'current_odds': curr_odds,
                            'movement_percent': -prob_move,
                            'direction': 'down',
                            'minutes_to_kickoff': minutes_to_ko,
                            'moved_at': latest_totals.fetched_at
                        }

        # === SPREADS (ASIAN HANDICAP) MARKET === disabled for now (line changes cause noise)
        # baseline_spreads / latest_spreads check skipped

        if best_move:
            syndicate_moves.append(best_move)

    # Sort by implied prob movement (largest shift first) and take top N
    syndicate_moves.sort(key=lambda x: x['movement_percent'])
    top_moves = syndicate_moves[:limit]

    return [
        SyndicateMove(
            match_id=m['match'].id,
            home_team=m['match'].home_team,
            away_team=m['match'].away_team,
            sport_key=m['match'].sport_key,
            league_name=m['match'].league_name,
            commence_time=m['match'].commence_time,
            market=m['market'],
            outcome=m['outcome'],
            outcome_name=m['outcome_name'],
            opening_odds=m['baseline_odds'],  # This is the 3hr baseline, not opening
            current_odds=m['current_odds'],
            movement_percent=m['movement_percent'],  # Now implied prob change (negative = shortening)
            direction=m['direction'],
            minutes_to_kickoff=m['minutes_to_kickoff'],
            moved_at=m['moved_at']
        )
        for m in top_moves
    ]


@router.get("/steam-moves", response_model=SteamMoveStats)
async def get_steam_moves(db: Session = Depends(get_db)):
    """
    Get statistics and sample data about steam moves (late sharp money movements).
    """
    # Total counts
    total_moves = db.query(func.count(SteamMove.id)).scalar() or 0
    moves_with_results = (
        db.query(func.count(SteamMove.id))
        .filter(SteamMove.result_updated == True)
        .scalar() or 0
    )
    moves_pending_results = (
        db.query(func.count(SteamMove.id))
        .filter(SteamMove.result_updated == False)
        .scalar() or 0
    )

    # Win/loss stats
    total_wins = (
        db.query(func.count(SteamMove.id))
        .filter(SteamMove.result_updated == True, SteamMove.won == True)
        .scalar() or 0
    )
    total_losses = (
        db.query(func.count(SteamMove.id))
        .filter(SteamMove.result_updated == True, SteamMove.won == False)
        .scalar() or 0
    )

    # Calculate win rate
    win_rate = None
    if moves_with_results > 0:
        win_rate = (total_wins / moves_with_results) * 100

    # Average movement percent
    avg_movement = db.query(func.avg(SteamMove.movement_percent)).scalar()

    # Get sample moves (most recent 10)
    sample_moves = (
        db.query(SteamMove)
        .order_by(desc(SteamMove.detected_at))
        .limit(10)
        .all()
    )

    return SteamMoveStats(
        total_moves=total_moves,
        moves_with_results=moves_with_results,
        moves_pending_results=moves_pending_results,
        total_wins=total_wins,
        total_losses=total_losses,
        win_rate=win_rate,
        avg_movement_percent=avg_movement,
        sample_moves=[
            SteamMoveResponse(
                id=m.id,
                match_id=m.match_id,
                sport_key=m.sport_key,
                outcome=m.outcome,
                team_name=m.team_name,
                opening_odds=m.opening_odds,
                previous_odds=m.previous_odds,
                current_odds=m.current_odds,
                movement_percent=m.movement_percent,
                detected_at=m.detected_at,
                match_commence_time=m.match_commence_time,
                minutes_before_kickoff=m.minutes_before_kickoff,
                result_updated=m.result_updated,
                won=m.won,
                home_score=m.home_score,
                away_score=m.away_score
            )
            for m in sample_moves
        ]
    )


@router.get("/steam-results", response_model=SteamResultsResponse)
async def get_steam_results(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(None, description="Filter by sport_key"),
    limit: int = Query(200, le=500, description="Number of moves to return"),
    days: Optional[int] = Query(None, description="Only include moves from the last N days")
):
    """
    Public endpoint: completed steam move results with team rankings.
    Only shows odds that SHORTENED (sharp money backing) — no draws, no drifters.
    Deduplicates by match: each match counts only once per team (using the biggest move).
    """
    # Base query — completed results, odds shortened (negative movement), no draws
    base_query = (
        db.query(SteamMove)
        .filter(SteamMove.result_updated == True)
        .filter(SteamMove.outcome != 'draw')
        .filter(SteamMove.movement_percent < 0)  # Only shortened odds
    )
    if league:
        base_query = base_query.filter(SteamMove.sport_key == league)
    if days:
        cutoff = datetime.utcnow() - timedelta(days=days)
        base_query = base_query.filter(SteamMove.match_commence_time >= cutoff)

    all_moves = base_query.order_by(desc(SteamMove.match_commence_time)).all()

    # Deduplicate: keep only the biggest move per (team_name, match_id)
    # This ensures each match counts once per team
    best_per_match: dict[tuple[str, str], SteamMove] = {}
    for m in all_moves:
        key = (m.team_name, m.match_id)
        if key not in best_per_match or abs(m.movement_percent) > abs(best_per_match[key].movement_percent):
            best_per_match[key] = m

    deduped_moves = sorted(best_per_match.values(), key=lambda x: x.match_commence_time, reverse=True)

    # Helper: determine result (win/draw/loss) from a steam move
    # The `won` boolean is True only for outright wins; draws show as won=False
    # so we detect draws by checking if the scores are level
    def _result(m):
        if m.won:
            return 'win'
        if m.home_score is not None and m.away_score is not None and m.home_score == m.away_score:
            return 'draw'
        return 'loss'

    # Stats from deduplicated moves (one result per match per team)
    total_wins = sum(1 for m in deduped_moves if _result(m) == 'win')
    total_draws = sum(1 for m in deduped_moves if _result(m) == 'draw')
    total_losses = sum(1 for m in deduped_moves if _result(m) == 'loss')
    total_moves = total_wins + total_draws + total_losses
    win_rate = (total_wins / total_moves * 100) if total_moves > 0 else None

    avg_movement = (
        sum(abs(m.movement_percent) for m in deduped_moves) / len(deduped_moves)
        if deduped_moves else None
    )

    # === TEAM RANKINGS (from deduplicated moves) ===
    team_stats: dict[str, dict] = {}
    for m in deduped_moves:
        key = m.team_name
        if key not in team_stats:
            team_stats[key] = {
                'team_name': m.team_name,
                'sport_key': m.sport_key,
                'total': 0,
                'wins': 0,
                'draws': 0,
                'losses': 0,
                'movement_sum': 0.0,
                'profit_loss': 0.0,
            }
        team_stats[key]['total'] += 1
        team_stats[key]['movement_sum'] += abs(m.movement_percent)
        r = _result(m)
        if r == 'win':
            team_stats[key]['wins'] += 1
            team_stats[key]['profit_loss'] += (m.current_odds - 1)
        elif r == 'draw':
            team_stats[key]['draws'] += 1
            team_stats[key]['profit_loss'] -= 1
        else:
            team_stats[key]['losses'] += 1
            team_stats[key]['profit_loss'] -= 1

    # Sort by profit/loss descending
    ranked_teams = sorted(team_stats.values(), key=lambda x: x['profit_loss'], reverse=True)

    team_rankings = [
        TeamSteamRanking(
            team_name=t['team_name'],
            sport_key=t['sport_key'],
            total_moves=t['total'],
            wins=t['wins'],
            draws=t['draws'],
            losses=t['losses'],
            win_rate=round(t['wins'] / t['total'] * 100, 1) if t['total'] > 0 else None,
            avg_move_size=round(t['movement_sum'] / t['total'], 1) if t['total'] > 0 else None,
            profit_loss=round(t['profit_loss'], 2),
        )
        for t in ranked_teams
    ]

    # Return limited moves for the response
    limited_moves = deduped_moves[:limit]

    return SteamResultsResponse(
        total_moves=total_moves,
        total_wins=total_wins,
        total_draws=total_draws,
        total_losses=total_losses,
        win_rate=round(win_rate, 1) if win_rate else None,
        avg_movement_percent=round(avg_movement, 1) if avg_movement else None,
        moves=[
            SteamMoveResponse(
                id=m.id,
                match_id=m.match_id,
                sport_key=m.sport_key,
                outcome=m.outcome,
                team_name=m.team_name,
                opening_odds=m.opening_odds,
                previous_odds=m.previous_odds,
                current_odds=m.current_odds,
                movement_percent=m.movement_percent,
                detected_at=m.detected_at,
                match_commence_time=m.match_commence_time,
                minutes_before_kickoff=m.minutes_before_kickoff,
                result_updated=m.result_updated,
                won=m.won,
                home_score=m.home_score,
                away_score=m.away_score
            )
            for m in limited_moves
        ],
        team_rankings=team_rankings,
    )


@router.post("/subscribe", response_model=EmailSignupResponse)
async def subscribe_email(request: EmailSignupRequest, db: Session = Depends(get_db)):
    """
    Subscribe an email address to steam alerts.
    """
    # Check if email already exists
    existing = db.query(EmailSubscriber).filter(EmailSubscriber.email == request.email).first()

    if existing:
        return EmailSignupResponse(
            success=True,
            message="You're already on the list!"
        )

    # Add new subscriber
    subscriber = EmailSubscriber(email=request.email)
    db.add(subscriber)
    db.commit()

    return EmailSignupResponse(
        success=True,
        message="You're on the list!"
    )


@router.get("/admin/emails", response_model=AdminEmailsResponse)
async def get_admin_emails(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """
    Get all email subscribers (admin only).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    subscribers = (
        db.query(EmailSubscriber)
        .order_by(desc(EmailSubscriber.created_at))
        .all()
    )

    return AdminEmailsResponse(
        count=len(subscribers),
        subscribers=[
            EmailSubscriberInfo(
                id=s.id,
                email=s.email,
                created_at=s.created_at
            )
            for s in subscribers
        ]
    )


@router.get("/admin/totals-test")
async def get_totals_test(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """
    Get totals snapshots for verification (admin only).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    # Get count
    total_count = db.query(func.count(TotalsSnapshot.id)).scalar() or 0

    # Get recent snapshots with match info
    recent = (
        db.query(TotalsSnapshot, Match)
        .join(Match, TotalsSnapshot.match_id == Match.id)
        .order_by(desc(TotalsSnapshot.fetched_at))
        .limit(10)
        .all()
    )

    return {
        "total_count": total_count,
        "recent_snapshots": [
            {
                "id": snapshot.id,
                "match": f"{match.home_team} vs {match.away_team}",
                "line": snapshot.line,
                "over_odds": snapshot.over_odds,
                "under_odds": snapshot.under_odds,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot.fetched_at else None
            }
            for snapshot, match in recent
        ]
    }


@router.get("/matches/{match_id}/totals", response_model=MatchTotalsResponse)
async def get_match_totals(match_id: str, db: Session = Depends(get_db)):
    """
    Get totals (over/under) history for a match.
    Only available for Ligue 1 matches.
    """
    match = db.query(Match).filter(Match.id == match_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Get only pre-kickoff totals snapshots (exclude in-play odds)
    snapshots = (
        db.query(TotalsSnapshot)
        .filter(TotalsSnapshot.match_id == match_id)
        .filter(TotalsSnapshot.fetched_at < match.commence_time)
        .order_by(TotalsSnapshot.fetched_at.asc())
        .all()
    )

    # Lock onto the opening totals line — ignore snapshots where
    # the bookmaker has shifted to a different line (e.g. 2.5 → 3.0)
    opening_line = snapshots[0].line if snapshots else None

    totals_history = [
        TotalsPoint(
            timestamp=s.fetched_at,
            line=s.line,
            over_odds=s.over_odds,
            under_odds=s.under_odds
        )
        for s in snapshots
        if s.line == opening_line
    ]

    return MatchTotalsResponse(
        match_id=match_id,
        totals_history=totals_history
    )


@router.get("/matches/{match_id}/spreads", response_model=MatchSpreadsResponse)
async def get_match_spreads(match_id: str, db: Session = Depends(get_db)):
    """
    Get spreads (Asian Handicap) history for a match.
    """
    match = db.query(Match).filter(Match.id == match_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Get only pre-kickoff spreads snapshots (exclude in-play odds)
    snapshots = (
        db.query(SpreadsSnapshot)
        .filter(SpreadsSnapshot.match_id == match_id)
        .filter(SpreadsSnapshot.fetched_at < match.commence_time)
        .order_by(SpreadsSnapshot.fetched_at.asc())
        .all()
    )

    # Lock onto the opening handicap line — ignore snapshots where
    # the bookmaker has shifted to a different line (e.g. 0.5 → 0.75)
    opening_line = snapshots[0].line if snapshots else None

    spreads_history = [
        SpreadsPoint(
            timestamp=s.fetched_at,
            line=s.line,
            home_odds=s.home_odds,
            away_odds=s.away_odds
        )
        for s in snapshots
        if s.line == opening_line
    ]

    return MatchSpreadsResponse(
        match_id=match_id,
        spreads_history=spreads_history
    )


@router.get("/closing-lines", response_model=ClosingLinesListResponse)
async def get_closing_lines(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(None, description="Filter by sport_key (e.g. soccer_epl)"),
    market_type: Optional[str] = Query(None, description="Filter by market: 1x2, asian_handicap, totals"),
    team: Optional[str] = Query(None, description="Filter by team name (partial match)"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """
    Query closing lines (last pre-kickoff odds) by league, date range, team, or market type.
    """
    query = db.query(ClosingLine)

    if league:
        query = query.filter(ClosingLine.league == league)

    if market_type:
        query = query.filter(ClosingLine.market_type == market_type)

    if team:
        team_filter = f"%{team}%"
        query = query.filter(
            (ClosingLine.home_team.ilike(team_filter)) |
            (ClosingLine.away_team.ilike(team_filter))
        )

    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(ClosingLine.kickoff_time >= dt_from)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_from format. Use YYYY-MM-DD.")

    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.filter(ClosingLine.kickoff_time < dt_to)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_to format. Use YYYY-MM-DD.")

    total = query.count()

    closing_lines = (
        query
        .order_by(desc(ClosingLine.kickoff_time))
        .offset(offset)
        .limit(limit)
        .all()
    )

    return ClosingLinesListResponse(
        total=total,
        closing_lines=[
            ClosingLineResponse(
                id=cl.id,
                match_id=cl.match_id,
                league=cl.league,
                home_team=cl.home_team,
                away_team=cl.away_team,
                kickoff_time=cl.kickoff_time,
                market_type=cl.market_type.value if hasattr(cl.market_type, 'value') else cl.market_type,
                close_home=cl.close_home,
                close_draw=cl.close_draw,
                close_away=cl.close_away,
                close_line=cl.close_line,
                close_home_price=cl.close_home_price,
                close_away_price=cl.close_away_price,
                close_over_price=cl.close_over_price,
                close_under_price=cl.close_under_price,
                captured_at=cl.captured_at,
                minutes_before_kickoff=cl.minutes_before_kickoff,
            )
            for cl in closing_lines
        ]
    )


@router.get("/closing-lines/grouped", response_model=MatchClosingLinesListResponse)
async def get_closing_lines_grouped(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(None, description="Filter by sport_key (e.g. soccer_uefa_champs_league)"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """
    Get closing lines grouped by match. Each match includes all available markets
    (1x2, asian_handicap, totals) in a single object for accordion display.
    """
    query = db.query(ClosingLine)

    if league:
        query = query.filter(ClosingLine.league == league)

    # Get all closing lines ordered by kickoff
    all_lines = (
        query
        .order_by(desc(ClosingLine.kickoff_time))
        .all()
    )

    # Group by match_id
    matches_map: dict[str, dict] = {}
    for cl in all_lines:
        if cl.match_id not in matches_map:
            matches_map[cl.match_id] = {
                "match_id": cl.match_id,
                "home_team": cl.home_team,
                "away_team": cl.away_team,
                "league": cl.league,
                "kickoff_time": cl.kickoff_time,
                "h2h": None,
                "asian_handicap": None,
                "totals": None,
            }

        market = cl.market_type.value if hasattr(cl.market_type, 'value') else cl.market_type
        cl_response = ClosingLineResponse(
            id=cl.id,
            match_id=cl.match_id,
            league=cl.league,
            home_team=cl.home_team,
            away_team=cl.away_team,
            kickoff_time=cl.kickoff_time,
            market_type=market,
            close_home=cl.close_home,
            close_draw=cl.close_draw,
            close_away=cl.close_away,
            close_line=cl.close_line,
            close_home_price=cl.close_home_price,
            close_away_price=cl.close_away_price,
            close_over_price=cl.close_over_price,
            close_under_price=cl.close_under_price,
            captured_at=cl.captured_at,
            minutes_before_kickoff=cl.minutes_before_kickoff,
        )

        if market == "1x2":
            matches_map[cl.match_id]["h2h"] = cl_response
        elif market == "asian_handicap":
            matches_map[cl.match_id]["asian_handicap"] = cl_response
        elif market == "totals":
            matches_map[cl.match_id]["totals"] = cl_response

    # Sort by kickoff descending, apply pagination
    sorted_matches = sorted(matches_map.values(), key=lambda m: m["kickoff_time"], reverse=True)
    total = len(sorted_matches)
    paginated = sorted_matches[offset:offset + limit]

    return MatchClosingLinesListResponse(
        total=total,
        matches=[MatchClosingLines(**m) for m in paginated],
    )


@router.get("/admin/steam-breakdown")
async def get_steam_breakdown(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """
    Get steam moves breakdown by league (admin only).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    # Total count
    total_count = db.query(func.count(SteamMove.id)).scalar() or 0

    # Count manually by league
    leagues_data = {}
    all_moves = db.query(SteamMove).all()

    for move in all_moves:
        league = move.sport_key
        if league not in leagues_data:
            leagues_data[league] = {"total": 0, "wins": 0, "losses": 0, "pending": 0}

        leagues_data[league]["total"] += 1
        if move.result_updated:
            if move.won:
                leagues_data[league]["wins"] += 1
            else:
                leagues_data[league]["losses"] += 1
        else:
            leagues_data[league]["pending"] += 1

    # Calculate win rates
    league_stats = []
    for league, data in leagues_data.items():
        completed = data["wins"] + data["losses"]
        win_rate = (data["wins"] / completed * 100) if completed > 0 else None
        league_stats.append({
            "league": league,
            "total": data["total"],
            "wins": data["wins"],
            "losses": data["losses"],
            "pending": data["pending"],
            "win_rate": round(win_rate, 1) if win_rate else None
        })

    # Sort by total descending
    league_stats.sort(key=lambda x: x["total"], reverse=True)

    return {
        "total_count": total_count,
        "by_league": league_stats
    }


@router.get("/admin/spreads-test")
async def get_spreads_test(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """
    Get spreads (Asian Handicap) snapshots for verification (admin only).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    # Get count
    total_count = db.query(func.count(SpreadsSnapshot.id)).scalar() or 0

    # Get recent snapshots with match info
    recent = (
        db.query(SpreadsSnapshot, Match)
        .join(Match, SpreadsSnapshot.match_id == Match.id)
        .order_by(desc(SpreadsSnapshot.fetched_at))
        .limit(10)
        .all()
    )

    return {
        "total_count": total_count,
        "recent_snapshots": [
            {
                "id": snapshot.id,
                "match": f"{match.home_team} vs {match.away_team}",
                "league": match.sport_key,
                "line": snapshot.line,
                "home_odds": snapshot.home_odds,
                "away_odds": snapshot.away_odds,
                "fetched_at": snapshot.fetched_at.isoformat() if snapshot.fetched_at else None
            }
            for snapshot, match in recent
        ]
    }


@router.get("/admin/telegram-test")
async def test_telegram(
    password: str = Query(..., description="Admin password")
):
    """
    Test Telegram bot connection (admin only).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    from app.services.telegram_notifier import telegram_notifier

    result = await telegram_notifier.test_connection()
    return result


@router.post("/admin/telegram-test-alert")
async def send_test_telegram_alert(
    password: str = Query(..., description="Admin password")
):
    """
    Send a test Telegram alert (admin only).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    from app.services.telegram_notifier import telegram_notifier

    success = await telegram_notifier.send_syndicate_alert(
        home_team="Test Home",
        away_team="Test Away",
        outcome_name="Test Home",
        outcome_type="H",
        current_odds=2.05,
        prob_change=6.5,
        minutes_to_kickoff=120,
        market="1x2"
    )

    return {"success": success}


@router.get("/admin/test-sub-notification")
async def test_subscription_notification(
    password: str = Query(..., description="Admin password"),
):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    from app.services.telegram_notifier import telegram_notifier

    success = await telegram_notifier._send_message(
        "💰 NEW PRO SUBSCRIBER\n\ntest@example.com\n\nSteamWatch Pro is growing 🚀"
    )

    return {"success": success}


@router.get("/admin/alert-diagnostics")
async def get_alert_diagnostics(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """
    Diagnostic endpoint: show recent syndicate alerts and upcoming match move data.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    from datetime import timedelta
    now = datetime.utcnow()

    # Recent syndicate alerts (last 7 days)
    seven_days_ago = now - timedelta(days=7)
    recent_alerts = (
        db.query(SyndicateAlert)
        .filter(SyndicateAlert.alerted_at >= seven_days_ago)
        .order_by(desc(SyndicateAlert.alerted_at))
        .limit(20)
        .all()
    )

    # Upcoming matches within 3 hours (what the alerter checks)
    three_hours = now + timedelta(hours=3)
    upcoming_matches = (
        db.query(Match)
        .filter(Match.commence_time > now)
        .filter(Match.commence_time <= three_hours)
        .all()
    )

    # For each upcoming match, check biggest prob move in last 3h
    match_moves = []
    for match in upcoming_matches:
        window_start = match.commence_time - timedelta(hours=3)

        baseline = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .filter(OddsSnapshot.fetched_at >= window_start)
            .order_by(OddsSnapshot.fetched_at.asc())
            .first()
        )
        latest = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )

        # 1X2 moves
        moves_1x2 = {}
        if baseline and latest and baseline.id != latest.id:
            for outcome, b_odds, c_odds in [
                ('home', baseline.home_odds, latest.home_odds),
                ('draw', baseline.draw_odds, latest.draw_odds),
                ('away', baseline.away_odds, latest.away_odds),
            ]:
                if b_odds and c_odds and b_odds > 0 and c_odds > 0:
                    prob_move = (1/c_odds)*100 - (1/b_odds)*100
                    moves_1x2[outcome] = {
                        "baseline_odds": round(b_odds, 3),
                        "current_odds": round(c_odds, 3),
                        "prob_move_pp": round(prob_move, 2),
                        "would_alert": prob_move >= 3.0
                    }

        # Totals moves
        moves_totals = {}
        totals_base = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.fetched_at >= window_start)
            .order_by(TotalsSnapshot.fetched_at.asc())
            .first()
        )
        totals_latest = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .order_by(TotalsSnapshot.fetched_at.desc())
            .first()
        )
        if totals_base and totals_latest and totals_base.id != totals_latest.id:
            line_same = totals_base.line == totals_latest.line
            for outcome, b_odds, c_odds in [
                (f'O {totals_base.line}', totals_base.over_odds, totals_latest.over_odds),
                (f'U {totals_base.line}', totals_base.under_odds, totals_latest.under_odds),
            ]:
                if b_odds and c_odds and b_odds > 0 and c_odds > 0:
                    prob_move = (1/c_odds)*100 - (1/b_odds)*100
                    moves_totals[outcome] = {
                        "baseline_odds": round(b_odds, 3),
                        "current_odds": round(c_odds, 3),
                        "prob_move_pp": round(prob_move, 2),
                        "line_changed": not line_same,
                        "would_alert": prob_move >= 3.0 and line_same
                    }

        # Spreads / Asian Handicap moves
        moves_spreads = {}
        spreads_base = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == match.id)
            .filter(SpreadsSnapshot.fetched_at >= window_start)
            .order_by(SpreadsSnapshot.fetched_at.asc())
            .first()
        )
        spreads_latest = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == match.id)
            .order_by(SpreadsSnapshot.fetched_at.desc())
            .first()
        )
        if spreads_base and spreads_latest and spreads_base.id != spreads_latest.id:
            line_same = spreads_base.line == spreads_latest.line
            sp_line = spreads_base.line
            for outcome, b_odds, c_odds in [
                (f'AH {sp_line:+g} ({match.home_team})', spreads_base.home_odds, spreads_latest.home_odds),
                (f'AH {-sp_line if sp_line else 0:+g} ({match.away_team})', spreads_base.away_odds, spreads_latest.away_odds),
            ]:
                if b_odds and c_odds and b_odds > 0 and c_odds > 0:
                    prob_move = (1/c_odds)*100 - (1/b_odds)*100
                    moves_spreads[outcome] = {
                        "baseline_odds": round(b_odds, 3),
                        "current_odds": round(c_odds, 3),
                        "prob_move_pp": round(prob_move, 2),
                        "line_changed": not line_same,
                        "would_alert": prob_move >= 3.0 and line_same
                    }

        time_to_ko = match.commence_time - now
        match_moves.append({
            "match": f"{match.home_team} vs {match.away_team}",
            "kickoff": match.commence_time.isoformat(),
            "minutes_to_ko": int(time_to_ko.total_seconds() / 60),
            "1x2": moves_1x2,
            "totals": moves_totals,
            "spreads": moves_spreads,
        })

    return {
        "recent_alerts": [
            {
                "match_id": a.match_id,
                "market": a.market,
                "outcome": a.outcome,
                "movement_pp": a.movement_percent,
                "odds": a.odds_at_alert,
                "alerted_at": a.alerted_at.isoformat()
            }
            for a in recent_alerts
        ],
        "upcoming_matches_checked": len(upcoming_matches),
        "match_prob_moves": match_moves,
        "threshold_pp": 3.0,
        "now_utc": now.isoformat()
    }


@router.get("/admin/scheduler-status")
async def get_scheduler_status(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """
    Get current scheduler status showing refresh rates per league (admin only).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    from app.services.scheduler import odds_scheduler
    from datetime import timezone

    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    league_status = []

    for sport_key, league_name in settings.leagues.items():
        interval, ko_matches = odds_scheduler._get_league_refresh_info(sport_key)
        last_fetch = odds_scheduler._last_fetch_by_league.get(sport_key)

        # Find nearest match
        nearest = (
            db.query(Match)
            .filter(Match.sport_key == sport_key, Match.commence_time > now)
            .order_by(Match.commence_time.asc())
            .first()
        )

        nearest_ko = None
        minutes_to_ko = None
        if nearest:
            ct = nearest.commence_time
            if ct.tzinfo is None:
                ct = ct.replace(tzinfo=timezone.utc)
            minutes_to_ko = int((ct - now).total_seconds() / 60)
            nearest_ko = ct.isoformat()

        window = "default"
        if minutes_to_ko is not None:
            if minutes_to_ko <= 30:
                window = "closing (T-30 to T-0)"
            elif minutes_to_ko <= 120:
                window = "early (T-120 to T-30)"

        league_status.append({
            "sport_key": sport_key,
            "league_name": league_name,
            "refresh_interval_minutes": interval,
            "window": window,
            "nearest_ko": nearest_ko,
            "minutes_to_nearest_ko": minutes_to_ko,
            "last_fetch": last_fetch.isoformat() if last_fetch else None,
        })

    return {
        "scheduler_running": odds_scheduler._is_running,
        "tick_interval_minutes": 2,
        "scheduled_ko_jobs": len(odds_scheduler._scheduled_ko_jobs),
        "leagues": league_status
    }


# ============================================================
# Rolling xG Data
# ============================================================

@router.get("/xg-data/teams", response_model=XGTeamsResponse)
async def get_xg_teams(
    db: Session = Depends(get_db),
    league: str = Query(..., description="Sport key e.g. soccer_epl"),
):
    """Return distinct team names that have xG data for a league."""
    rows = (
        db.query(XGData.team_name)
        .filter(XGData.league == league)
        .distinct()
        .order_by(XGData.team_name)
        .all()
    )
    return XGTeamsResponse(teams=[r[0] for r in rows])


@router.get("/xg-data", response_model=XGDataResponse)
async def get_xg_data(
    db: Session = Depends(get_db),
    league: str = Query(..., description="Sport key e.g. soccer_epl"),
    team: str = Query(..., description="Team name"),
):
    """Return all match-level npxG data for a team, ordered by match number."""
    rows = (
        db.query(XGData)
        .filter(XGData.league == league, XGData.team_name == team)
        .order_by(XGData.match_number)
        .all()
    )
    return XGDataResponse(
        team_name=team,
        league=league,
        data=[XGDataPoint.model_validate(r) for r in rows],
    )


@router.post("/admin/upload-xg")
async def upload_xg_data(
    db: Session = Depends(get_db),
    password: str = Query(..., description="Admin password"),
    file: UploadFile = File(...),
):
    """
    Bulk upload xG data from CSV.
    CSV columns: league,team_name,match_number,npxg_for,npxg_against,match_date
    Replaces all existing data for each league found in the CSV.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    import csv
    import io
    from datetime import date as date_type

    content = await file.read()
    text = content.decode("utf-8-sig")  # handle BOM from Excel
    reader = csv.DictReader(io.StringIO(text))

    # Collect rows and track which leagues appear
    rows = []
    leagues_seen = set()
    for row in reader:
        league = row["league"].strip()
        leagues_seen.add(league)
        rows.append({
            "league": league,
            "team_name": row["team_name"].strip(),
            "match_number": int(row["match_number"]),
            "npxg_for": float(row["npxg_for"]),
            "npxg_against": float(row["npxg_against"]),
            "match_date": date_type.fromisoformat(row["match_date"].strip()),
        })

    # Delete existing data for those leagues, then insert fresh
    for league in leagues_seen:
        db.query(XGData).filter(XGData.league == league).delete()

    db.bulk_insert_mappings(XGData, rows)
    db.commit()

    return {"success": True, "rows_inserted": len(rows), "leagues_updated": list(leagues_seen)}
