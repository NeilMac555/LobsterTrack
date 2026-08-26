from fastapi import APIRouter, Depends, HTTPException, Query, Header, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text
from datetime import datetime, timedelta
from typing import Optional

from app.models import get_db, Match, OddsSnapshot, SteamMove, EmailSubscriber, TotalsSnapshot, SpreadsSnapshot, ClosingLine, SyndicateAlert, XGData, HistoricalMatch, LeagueConstants, PowerRating, PowerRatingHistory, SquadMarketValue
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
    TeamPLResponse,
    TeamPLRow,
    TeamPLSide,
    TeamPLViewStats,
    LeagueConstantsItem,
    LeagueConstantsResponse,
    PowerRatingItem,
    PowerRatingsResponse,
    PowerRatingHistoryPoint,
    PowerRatingHistoryResponse,
)

# Simple admin password
ADMIN_PASSWORD = "SoccerMatics33"

router = APIRouter()
settings = get_settings()

# ---------------------------------------------------------------------------
# Tiny in-process TTL cache for the two heaviest homepage endpoints
# (/matches, /biggest-movers). Their window-function scans over the
# 1M+-row snapshot tables cost seconds, but the underlying data only
# changes when the odds fetcher runs (~every 15 min) — so a 60s cache
# is invisible staleness-wise and makes every load after the first
# instant. Single-replica, single-process deployment, so a module dict
# is all the cache infrastructure this needs. The LATERAL-join query
# rewrite (the proper fix — verified 2x+ faster with identical results
# against production data, 2026-08-15) is tracked in TODO.md.
# ---------------------------------------------------------------------------
_RESPONSE_CACHE: dict[str, tuple[float, object]] = {}
_RESPONSE_CACHE_TTL_SECONDS = 60.0


def _cache_get(key: str):
    import time as _time
    entry = _RESPONSE_CACHE.get(key)
    if entry is None:
        return None
    stored_at, value = entry
    if _time.monotonic() - stored_at > _RESPONSE_CACHE_TTL_SECONDS:
        _RESPONSE_CACHE.pop(key, None)
        return None
    return value


def _cache_put(key: str, value) -> None:
    import time as _time
    # Unbounded growth guard: the key space here is tiny (a handful of
    # league filters x 2 endpoints), but cap it anyway so a crafted
    # query-param flood can't balloon memory.
    if len(_RESPONSE_CACHE) > 200:
        _RESPONSE_CACHE.clear()
    _RESPONSE_CACHE[key] = (_time.monotonic(), value)


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


@router.get("/league-constants", response_model=LeagueConstantsResponse)
async def get_league_constants(db: Session = Depends(get_db)):
    """
    Live-computed avgGoalsPerTeam/homeAwayRatio per league (see
    app/services/league_constants_refresher.py, refreshed weekly Mondays
    10:00 UTC). Only returns leagues with a successfully computed row —
    the Match Predictor page falls back to its own hardcoded default for
    any league missing from this list (or if this request fails outright).
    """
    rows = db.query(LeagueConstants).all()
    return LeagueConstantsResponse(
        constants=[LeagueConstantsItem.model_validate(r) for r in rows]
    )


@router.get("/power-rankings", response_model=PowerRatingsResponse)
async def get_power_rankings(db: Session = Depends(get_db)):
    """
    Cross-league team power ratings (see
    app/services/power_ranking_fitter.py, refreshed weekly Mondays
    10:30 UTC). Unlike league_constants, ratings here are on ONE shared
    scale across every league — that's the entire point of this fit,
    bridged via UEFA competition fixtures.
    """
    rows = db.query(PowerRating).order_by(PowerRating.rating.desc()).all()
    computed_at = rows[0].computed_at if rows else None

    squad_values = {
        sv.team: sv.market_value_eur
        for sv in db.query(SquadMarketValue).filter(SquadMarketValue.team.isnot(None)).all()
    }
    items = []
    for r in rows:
        item = PowerRatingItem.model_validate(r)
        item.squad_value_eur = squad_values.get(r.team)
        items.append(item)

    return PowerRatingsResponse(
        ratings=items,
        computed_at=computed_at,
    )


@router.get("/power-rankings/{team}/history", response_model=PowerRatingHistoryResponse)
async def get_power_ranking_history(team: str, db: Session = Depends(get_db)):
    """Weekly rating history for one team, for the trend chart."""
    current = db.query(PowerRating).filter(PowerRating.team == team).first()
    if not current:
        raise HTTPException(status_code=404, detail="Team not found in power rankings")

    rows = (
        db.query(PowerRatingHistory)
        .filter(PowerRatingHistory.team == team)
        .order_by(PowerRatingHistory.computed_at.asc())
        .all()
    )
    return PowerRatingHistoryResponse(
        team=team,
        league=current.league,
        history=[PowerRatingHistoryPoint.model_validate(r) for r in rows],
    )


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
    cache_key = f"matches:{league}:{upcoming_only}:{limit}:{offset}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

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

    # Batch query: Get latest odds for all matches using window function.
    # Filter to pre-game only — current odds shouldn't drift into in-play
    # territory because Steam Results / Drifters / sparklines / movement
    # math all assume pre-game-only inputs.
    latest_subq = (
        db.query(
            OddsSnapshot.match_id,
            OddsSnapshot.home_odds,
            OddsSnapshot.draw_odds,
            OddsSnapshot.away_odds,
            OddsSnapshot.bookmaker,
            func.row_number().over(
                partition_by=OddsSnapshot.match_id,
                order_by=OddsSnapshot.fetched_at.desc()
            ).label('rn')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
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
            'away': row.away_odds,
            'bookmaker': row.bookmaker,
        }
        for row in latest_odds_query
    }

    # Batch query: Get opening odds (first snapshot) for all matches.
    # Pre-game only — opening price by definition.
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
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
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

    # Batch query: Get odds count for all matches. Pre-game only so the
    # 'N snapshots' badge on each card reflects how rich the pre-match
    # tracking history is (not contaminated by a handful of in-play rows).
    odds_counts_query = (
        db.query(
            OddsSnapshot.match_id,
            func.count(OddsSnapshot.id).label('count')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
        .group_by(OddsSnapshot.match_id)
        .all()
    )
    odds_count_map = {row.match_id: row.count for row in odds_counts_query}

    # Batch query: get the most recent N home_odds for each match to power
    # inline sparklines on match cards. We keep this modest (N=12) to cap
    # payload size — a dozen points is enough to show a trend.
    # Pre-game only — Home Trend is a pre-match concept; an in-play snapshot
    # mixed into the line would distort the visual.
    SPARK_POINTS = 12
    spark_subq = (
        db.query(
            OddsSnapshot.match_id,
            OddsSnapshot.home_odds,
            OddsSnapshot.fetched_at,
            func.row_number().over(
                partition_by=OddsSnapshot.match_id,
                order_by=OddsSnapshot.fetched_at.desc()
            ).label('rn')
        )
        .filter(OddsSnapshot.match_id.in_(match_ids))
        .filter(OddsSnapshot.home_odds.isnot(None))
        .filter(OddsSnapshot.home_odds > 0)
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
        .subquery()
    )
    spark_rows = (
        db.query(spark_subq)
        .filter(spark_subq.c.rn <= SPARK_POINTS)
        .order_by(spark_subq.c.match_id, spark_subq.c.fetched_at.asc())
        .all()
    )
    # Group into a per-match list of home implied probabilities (0-100).
    # Rising line = home being backed, falling = home drifting. Consistent
    # with the green/red movement convention elsewhere on the site.
    spark_map: dict[str, list[float]] = {}
    for row in spark_rows:
        spark_map.setdefault(row.match_id, []).append(
            round((1.0 / row.home_odds) * 100, 2)
        )

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
            odds_count=odds_count_map.get(match.id, 0),
            home_prob_spark=spark_map.get(match.id) or None,
            current_odds_bookmaker=latest.get('bookmaker'),
        ))

    _cache_put(cache_key, result)
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
        odds_history=odds_history,
        current_odds_bookmaker=snapshots[-1].bookmaker if snapshots else None,
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

    # Oldest and newest data. Append 'Z' so JS parses these as UTC
    # instead of local time — that's what was causing the public homepage
    # stat strip to show 'LAST FETCH: 1 hour ago' for UK/IE users when
    # fetches were actually running every 2–15 minutes.
    oldest_snapshot = db.query(func.min(OddsSnapshot.fetched_at)).scalar()
    newest_snapshot = db.query(func.max(OddsSnapshot.fetched_at)).scalar()

    return {
        "total_matches": total_matches,
        "upcoming_matches": upcoming_matches,
        "total_odds_snapshots": total_snapshots,
        "oldest_data": oldest_snapshot.isoformat() + "Z" if oldest_snapshot else None,
        "newest_data": newest_snapshot.isoformat() + "Z" if newest_snapshot else None,
        "tracked_leagues": list(settings.leagues.keys())
    }


@router.get("/in-play-jumps")
async def get_in_play_jumps(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(
        None,
        description="Optional sport_key filter (e.g. soccer_fifa_world_cup).",
    ),
    days: int = Query(7, ge=1, le=60, description="Look back this many days."),
    inplay_anchor_min: int = Query(
        5,
        ge=1,
        le=15,
        description="Use the first Polymarket in-play snapshot at or after T+N min as the in-play anchor.",
    ),
    max_anchor_min: int = Query(
        10,
        ge=5,
        le=240,
        description="Skip matches where the Polymarket anchor is later than T+N min. Default 10 "
                    "gives a strict T+5 to T+10 capture window — anchors later than that get "
                    "contaminated by in-game state (goals, red cards) and stop being the "
                    "kickoff-correction signal we want.",
    ),
    min_delta_pp: float = Query(
        3.0,
        ge=0,
        le=50,
        description="Minimum absolute pp gap between Pinnacle close and Polymarket in-play.",
    ),
    include_early_goals: bool = Query(
        False,
        description="When false (default), drops matches with an early goal — the price reaction "
                    "is to public info, not the manipulation→correction pattern we want.",
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """
    THE SteamWatch in-play signal: for each finished WC match, compares
    Pinnacle's CLOSING line (the price sharps may have manipulated in
    the final thin-liquidity minutes pre-KO) against Polymarket's first
    in-play snapshot at T+`inplay_anchor_min` minutes (the corrected
    price once real money starts flowing post-KO).

    A big gap = sharps pushed Pinnacle's close off-true to set up a
    soft-book arbitrage, then corrected on Polymarket the moment trading
    opened. The 1X2 outcome (or Over 2.5) with the biggest absolute gap
    is the headline.

    Per outcome:
        gap_pp = (polymarket_yes - pinnacle_implied) * 100
    Positive = Polymarket priced higher than Pinnacle closed (sharps on
    that side). Negative = Polymarket lower (sharps against that side).
    """
    from app.models import PolymarketSnapshot

    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    # Narrow query: only matches that have already kicked off in the last N days.
    # (Don't widen to future-scheduled matches — that piles up unnecessary
    # per-match queries and was a suspected contributor to last night's
    # Postgres pressure.)
    matches_q = (
        db.query(Match)
        .filter(Match.commence_time >= cutoff)
        .filter(Match.commence_time <= now)
    )
    if league:
        matches_q = matches_q.filter(Match.sport_key == league)
    if not include_early_goals:
        matches_q = matches_q.filter(Match.early_goal_minute.is_(None))
    matches = matches_q.all()

    def implied(decimal_odds):
        return (1.0 / decimal_odds) if decimal_odds and decimal_odds > 0 else None

    matches_seen = 0
    matches_with_close = 0
    matches_with_inplay = 0
    results = []

    for match in matches:
        matches_seen += 1

        close_1x2 = (
            db.query(ClosingLine)
            .filter(ClosingLine.match_id == match.id)
            .filter(ClosingLine.market_type == "1x2")
            .first()
        )
        if not close_1x2 or close_1x2.close_home is None:
            continue
        matches_with_close += 1

        # In-Play Jumps is 1X2-only: Pinnacle quotes quarter lines for
        # totals (2.25/2.75) which Polymarket doesn't trade, so the
        # totals comparison silently misled on a meaningful fraction of
        # matches. 1X2 is the only market where both books have an
        # identical outcome structure, so we keep this signal pure.

        # Polymarket in-play anchor: first in_play=True snapshot at or
        # after T+inplay_anchor_min. If the first one is later than
        # max_anchor_min, signal is contaminated (in-game state, not
        # kickoff correction) — skip.
        anchor_ts = match.commence_time + timedelta(minutes=inplay_anchor_min)
        pm_anchor = (
            db.query(PolymarketSnapshot)
            .filter(PolymarketSnapshot.match_id == match.id)
            .filter(PolymarketSnapshot.in_play == True)  # noqa: E712
            .filter(PolymarketSnapshot.fetched_at >= anchor_ts)
            .order_by(PolymarketSnapshot.fetched_at.asc(), PolymarketSnapshot.id.asc())
            .first()
        )
        if not pm_anchor or pm_anchor.home_win_yes is None:
            continue
        anchor_age_min = (pm_anchor.fetched_at - match.commence_time).total_seconds() / 60
        if anchor_age_min > max_anchor_min:
            continue
        matches_with_inplay += 1

        # Pinnacle close implied probs (raw, with margin — same noise floor on both sides).
        pin_home = implied(close_1x2.close_home)
        pin_draw = implied(close_1x2.close_draw)
        pin_away = implied(close_1x2.close_away)

        # Polymarket YES already IS the implied prob on 0..1 scale.
        pm_home = pm_anchor.home_win_yes
        pm_draw = pm_anchor.draw_yes
        pm_away = pm_anchor.away_win_yes

        def gap_pp(pm, pin):
            if pm is None or pin is None:
                return None
            return round((pm - pin) * 100, 2)

        gaps = {
            "home": gap_pp(pm_home, pin_home),
            "draw": gap_pp(pm_draw, pin_draw),
            "away": gap_pp(pm_away, pin_away),
        }
        candidates = [(k, v) for k, v in gaps.items() if v is not None]
        if not candidates:
            continue
        biggest_outcome, biggest_gap = max(candidates, key=lambda kv: abs(kv[1]))
        if abs(biggest_gap) < min_delta_pp:
            continue

        results.append({
            "match_id": match.id,
            "home_team": match.home_team,
            "away_team": match.away_team,
            "sport_key": match.sport_key,
            "league_name": match.league_name,
            "commence_time": match.commence_time.isoformat() + "Z",
            "polymarket_event_slug": match.polymarket_event_slug,
            "anchor_minutes_in": round(anchor_age_min, 1),
            "early_goal_minute": match.early_goal_minute,
            "biggest_outcome": biggest_outcome,
            "biggest_gap_pp": biggest_gap,
            "pinnacle_close": {
                "home_odds": close_1x2.close_home,
                "draw_odds": close_1x2.close_draw,
                "away_odds": close_1x2.close_away,
                "home_implied": round(pin_home, 4) if pin_home else None,
                "draw_implied": round(pin_draw, 4) if pin_draw else None,
                "away_implied": round(pin_away, 4) if pin_away else None,
            },
            "polymarket_inplay": {
                "fetched_at": pm_anchor.fetched_at.isoformat() + "Z",
                "home_yes": pm_home,
                "draw_yes": pm_draw,
                "away_yes": pm_away,
                "event_volume_24h": pm_anchor.event_volume_24h,
            },
            "gaps_pp": gaps,
        })

    results.sort(key=lambda r: abs(r["biggest_gap_pp"]), reverse=True)

    return {
        "league": league,
        "days_back": days,
        "inplay_anchor_min": inplay_anchor_min,
        "max_anchor_min": max_anchor_min,
        "min_delta_pp": min_delta_pp,
        "matches_seen": matches_seen,
        "matches_with_close": matches_with_close,
        "matches_with_inplay": matches_with_inplay,
        "matches_with_jumps": len(results),
        "jumps": results[:limit],
    }


@router.get("/late-steam")
async def get_late_steam(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(
        None, description="Optional sport_key filter."
    ),
    days: int = Query(7, ge=1, le=60, description="Look back this many days."),
    window_minutes: int = Query(
        30,
        ge=5,
        le=180,
        description="Late-money window. Compares snapshot at T-window vs last pre-KO snapshot.",
    ),
    min_delta_pp: float = Query(
        1.5,
        ge=0,
        le=20,
        description="Minimum implied-prob shift in pp on either side of either market.",
    ),
    upcoming: bool = Query(
        False,
        description="When true, returns IN-PROGRESS late moves on matches "
                    "that haven't kicked off yet (T-window already in the past) "
                    "instead of finished matches.",
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """
    Sharp-money signal: how Pinnacle's Asian Handicap and Totals lines
    moved in the final `window_minutes` before kick-off. Pinnacle's
    closing Asian line is the universally-accepted true line in soccer,
    so anything that moves it in the last half-hour is sharp action.

    For each market we report both the LINE move (e.g. AH -2.5 → -2.75,
    Totals 3.5 → 3.25) and the PRICE move on each side (implied-prob
    delta in pp). A line move is a stronger signal than a price-only
    move — Pinnacle won't shift the line itself without a lot of
    one-sided sharp money behind it.
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    matches_q = db.query(Match)
    if upcoming:
        # Match must not have kicked off yet, AND T-window must already
        # be in the past so we have a 'window-start' snapshot to compare.
        matches_q = matches_q.filter(Match.commence_time > now)
        matches_q = matches_q.filter(
            Match.commence_time <= now + timedelta(minutes=window_minutes)
        )
    else:
        matches_q = matches_q.filter(Match.commence_time >= cutoff)
        matches_q = matches_q.filter(Match.commence_time <= now)
    if league:
        matches_q = matches_q.filter(Match.sport_key == league)
    matches = matches_q.all()

    def implied(o):
        return (1.0 / o) * 100 if o and o > 0 else None

    def pp_delta(closing_odds, early_odds):
        c = implied(closing_odds)
        e = implied(early_odds)
        if c is None or e is None:
            return None
        return c - e

    matches_seen = 0
    matches_with_ah = 0
    matches_with_totals = 0
    results = []

    for match in matches:
        matches_seen += 1
        window_start = match.commence_time - timedelta(minutes=window_minutes)

        # Asian Handicap window snapshots
        ah_early = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == match.id)
            .filter(SpreadsSnapshot.fetched_at >= window_start)
            .filter(SpreadsSnapshot.fetched_at < match.commence_time)
            .order_by(SpreadsSnapshot.fetched_at.asc(), SpreadsSnapshot.id.asc())
            .first()
        )
        ah_close = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == match.id)
            .filter(SpreadsSnapshot.fetched_at < match.commence_time)
            .order_by(SpreadsSnapshot.fetched_at.desc(), SpreadsSnapshot.id.desc())
            .first()
        )

        # Totals window snapshots
        to_early = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.fetched_at >= window_start)
            .filter(TotalsSnapshot.fetched_at < match.commence_time)
            .order_by(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
            .first()
        )
        to_close = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.fetched_at < match.commence_time)
            .order_by(TotalsSnapshot.fetched_at.desc(), TotalsSnapshot.id.desc())
            .first()
        )

        ah_block = None
        if ah_early and ah_close and ah_early.id != ah_close.id:
            home_pp = pp_delta(ah_close.home_odds, ah_early.home_odds)
            away_pp = pp_delta(ah_close.away_odds, ah_early.away_odds)
            line_move = None
            if ah_early.line is not None and ah_close.line is not None:
                line_move = round(ah_close.line - ah_early.line, 2)
            ah_block = {
                "early_line": ah_early.line,
                "early_home_odds": ah_early.home_odds,
                "early_away_odds": ah_early.away_odds,
                "close_line": ah_close.line,
                "close_home_odds": ah_close.home_odds,
                "close_away_odds": ah_close.away_odds,
                "line_move": line_move,
                "home_pp": round(home_pp, 2) if home_pp is not None else None,
                "away_pp": round(away_pp, 2) if away_pp is not None else None,
                "minutes_covered": round(
                    (ah_close.fetched_at - ah_early.fetched_at).total_seconds() / 60, 1
                ),
            }
            matches_with_ah += 1

        to_block = None
        if to_early and to_close and to_early.id != to_close.id:
            over_pp = pp_delta(to_close.over_odds, to_early.over_odds)
            under_pp = pp_delta(to_close.under_odds, to_early.under_odds)
            line_move = None
            if to_early.line is not None and to_close.line is not None:
                line_move = round(to_close.line - to_early.line, 2)
            to_block = {
                "early_line": to_early.line,
                "early_over_odds": to_early.over_odds,
                "early_under_odds": to_early.under_odds,
                "close_line": to_close.line,
                "close_over_odds": to_close.over_odds,
                "close_under_odds": to_close.under_odds,
                "line_move": line_move,
                "over_pp": round(over_pp, 2) if over_pp is not None else None,
                "under_pp": round(under_pp, 2) if under_pp is not None else None,
                "minutes_covered": round(
                    (to_close.fetched_at - to_early.fetched_at).total_seconds() / 60, 1
                ),
            }
            matches_with_totals += 1

        # Biggest single-side price move across both markets — the headline number.
        candidates = []
        if ah_block:
            if ah_block["home_pp"] is not None:
                candidates.append(("ah_home", ah_block["home_pp"]))
            if ah_block["away_pp"] is not None:
                candidates.append(("ah_away", ah_block["away_pp"]))
        if to_block:
            if to_block["over_pp"] is not None:
                candidates.append(("totals_over", to_block["over_pp"]))
            if to_block["under_pp"] is not None:
                candidates.append(("totals_under", to_block["under_pp"]))
        if not candidates:
            continue

        biggest_side, biggest_pp = max(candidates, key=lambda kv: abs(kv[1]))
        if abs(biggest_pp) < min_delta_pp:
            continue

        # Bonus flag: did either LINE itself move? Stronger signal than
        # a price-only move because Pinnacle reshapes the line only
        # when one side gets hammered.
        line_moved = bool(
            (ah_block and ah_block["line_move"] and abs(ah_block["line_move"]) >= 0.25)
            or (to_block and to_block["line_move"] and abs(to_block["line_move"]) >= 0.25)
        )

        results.append({
            "match_id": match.id,
            "home_team": match.home_team,
            "away_team": match.away_team,
            "sport_key": match.sport_key,
            "league_name": match.league_name,
            "commence_time": match.commence_time.isoformat() + "Z",
            "biggest_side": biggest_side,
            "biggest_pp": round(biggest_pp, 2),
            "line_moved": line_moved,
            "asian_handicap": ah_block,
            "totals": to_block,
        })

    results.sort(key=lambda r: abs(r["biggest_pp"]), reverse=True)

    return {
        "league": league,
        "days_back": days,
        "window_minutes": window_minutes,
        "min_delta_pp": min_delta_pp,
        "upcoming": upcoming,
        "matches_seen": matches_seen,
        "matches_with_ah": matches_with_ah,
        "matches_with_totals": matches_with_totals,
        "matches_with_steam": len(results),
        "moves": results[:limit],
    }


@router.get("/biggest-movers", response_model=list[BiggestMover])
async def get_biggest_movers(
    db: Session = Depends(get_db),
    limit: int = Query(4, le=50, description="Number of movers to return"),
    sport_key: Optional[str] = Query(None, description="Optional league filter — e.g. soccer_fifa_world_cup")
):
    """
    Get matches with the biggest odds movements across all markets (1X2, Totals, Asian Handicap)
    over the trailing 48 hours. Returns one move per match (the biggest across all markets).
    """
    cache_key = f"biggest-movers:{limit}:{sport_key}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    now = datetime.utcnow()
    cutoff_48h = now - timedelta(hours=48)

    # Get upcoming matches, optionally filtered to a single league.
    matches_q = db.query(Match).filter(Match.commence_time > now)
    if sport_key:
        matches_q = matches_q.filter(Match.sport_key == sport_key)
    matches = matches_q.all()

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
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
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
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
        .subquery()
    )
    opening_1x2 = {row.match_id: row for row in db.query(opening_1x2_subq).filter(opening_1x2_subq.c.rn == 1).all()}

    # Baseline for the "48 hours" window: the most recent snapshot at or
    # before the cutoff (i.e. closest available reading to 48h ago). Matches
    # tracked for less than 48h have no row here at all, so they fall back
    # to their true opening snapshot below — otherwise a match added
    # yesterday would show zero movement instead of what little it's moved
    # since we started watching it.
    baseline_1x2_subq = (
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
        .filter(OddsSnapshot.in_play == False)  # noqa: E712
        .filter(OddsSnapshot.fetched_at <= cutoff_48h)
        .subquery()
    )
    baseline_1x2_at_cutoff = {
        row.match_id: row for row in db.query(baseline_1x2_subq).filter(baseline_1x2_subq.c.rn == 1).all()
    }
    baseline_1x2 = {**opening_1x2, **baseline_1x2_at_cutoff}

    # === TOTALS MARKET ===
    # With alternate_totals we store many lines per fetch, so partition by
    # (match_id, line) to get latest/opening per line. The "opening" line
    # is determined by whichever line appears in the very first fetch.
    latest_totals_subq = (
        db.query(
            TotalsSnapshot.match_id,
            TotalsSnapshot.line,
            TotalsSnapshot.over_odds,
            TotalsSnapshot.under_odds,
            func.row_number().over(
                partition_by=(TotalsSnapshot.match_id, TotalsSnapshot.line),
                order_by=TotalsSnapshot.fetched_at.desc()
            ).label('rn')
        )
        .filter(TotalsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    latest_totals_by_line = db.query(latest_totals_subq).filter(latest_totals_subq.c.rn == 1).all()
    latest_totals_map = {(row.match_id, row.line): row for row in latest_totals_by_line}

    opening_totals_subq = (
        db.query(
            TotalsSnapshot.match_id,
            TotalsSnapshot.line,
            TotalsSnapshot.over_odds,
            TotalsSnapshot.under_odds,
            func.row_number().over(
                partition_by=TotalsSnapshot.match_id,
                # id tiebreak so the first-inserted (main) line wins when
                # multiple alternate lines share the same fetched_at.
                order_by=(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
            ).label('rn')
        )
        .filter(TotalsSnapshot.match_id.in_(match_ids))
        .subquery()
    )
    opening_totals = {row.match_id: row for row in db.query(opening_totals_subq).filter(opening_totals_subq.c.rn == 1).all()}

    # Same 48h-cutoff/fallback-to-opening pattern as the 1X2 market above.
    baseline_totals_subq = (
        db.query(
            TotalsSnapshot.match_id,
            TotalsSnapshot.line,
            TotalsSnapshot.over_odds,
            TotalsSnapshot.under_odds,
            func.row_number().over(
                partition_by=TotalsSnapshot.match_id,
                order_by=(TotalsSnapshot.fetched_at.desc(), TotalsSnapshot.id.asc())
            ).label('rn')
        )
        .filter(TotalsSnapshot.match_id.in_(match_ids))
        .filter(TotalsSnapshot.fetched_at <= cutoff_48h)
        .subquery()
    )
    baseline_totals_at_cutoff = {
        row.match_id: row for row in db.query(baseline_totals_subq).filter(baseline_totals_subq.c.rn == 1).all()
    }
    baseline_totals = {**opening_totals, **baseline_totals_at_cutoff}

    # latest_totals lookup: grab the latest snapshot AT the baseline line
    latest_totals = {
        match_id: latest_totals_map.get((match_id, baseline_t.line))
        for match_id, baseline_t in baseline_totals.items()
    }

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
        opening = baseline_1x2.get(match_id)
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
        opening_t = baseline_totals.get(match_id)
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

    # Sparkline: implied-probability trend for the specific outcome that
    # made each match a "biggest mover". top_movers is already capped at
    # `limit` (default 4), so one small query per mover here is cheap —
    # far simpler than trying to batch this across mixed 1x2/totals
    # outcome columns, and the result set is tiny.
    SPARK_POINTS = 12
    for m in top_movers:
        match_id = m['match'].id
        series: list[float] = []
        if m['market'] == '1x2':
            odds_col = {
                'home': OddsSnapshot.home_odds,
                'draw': OddsSnapshot.draw_odds,
                'away': OddsSnapshot.away_odds,
            }.get(m['outcome'])
            if odds_col is not None:
                rows = (
                    db.query(odds_col)
                    .filter(OddsSnapshot.match_id == match_id)
                    .filter(odds_col.isnot(None))
                    .filter(odds_col > 0)
                    .filter(OddsSnapshot.in_play == False)  # noqa: E712
                    .order_by(OddsSnapshot.fetched_at.desc())
                    .limit(SPARK_POINTS)
                    .all()
                )
                series = [round((1.0 / r[0]) * 100, 2) for r in reversed(rows)]
        elif m['market'] == 'totals':
            odds_col = TotalsSnapshot.over_odds if m['outcome'] == 'over' else TotalsSnapshot.under_odds
            rows = (
                db.query(odds_col)
                .filter(TotalsSnapshot.match_id == match_id)
                .filter(odds_col.isnot(None))
                .filter(odds_col > 0)
                .order_by(TotalsSnapshot.fetched_at.desc())
                .limit(SPARK_POINTS)
                .all()
            )
            series = [round((1.0 / r[0]) * 100, 2) for r in reversed(rows)]
        m['sparkline'] = series if len(series) >= 2 else None

    response = [
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
            direction=m['direction'],
            sparkline=m.get('sparkline'),
        )
        for m in top_movers
    ]
    _cache_put(cache_key, response)
    return response


@router.get("/syndicate-moves", response_model=list[SyndicateMove])
async def get_syndicate_moves(
    db: Session = Depends(get_db),
    limit: int = Query(4, le=20, description="Number of moves to return")
):
    """
    Get late sharp money moves for the homepage's Syndicate Moves
    section. Window and threshold are IMPORTED from syndicate_alerter
    (2026-08-22 fix: this endpoint had its own hardcoded 3-hour window,
    which silently diverged from the Telegram alerter when the alert
    window was widened on 2026-08-14 — the site section and the alerts
    were answering different questions. Single source of truth now.)
    - Match kicks off within SYNDICATE_ALERT_WINDOW_MINUTES
    - SYNDICATE_THRESHOLD_PROB_POINTS+ implied probability shift within
      that window
    - Only SHORTENING odds (being backed)

    Uses implied probability movement instead of raw odds percentage change
    to avoid false positives on longshots.
    """
    from app.services.syndicate_alerter import (
        SYNDICATE_ALERT_WINDOW_MINUTES,
        SYNDICATE_THRESHOLD_PROB_POINTS,
    )
    PROB_THRESHOLD = SYNDICATE_THRESHOLD_PROB_POINTS

    def _prob(odds: float) -> float:
        return (1.0 / odds) * 100

    now = datetime.utcnow()
    window_end = now + timedelta(minutes=SYNDICATE_ALERT_WINDOW_MINUTES)

    matches = (
        db.query(Match)
        .filter(Match.commence_time > now)
        .filter(Match.commence_time <= window_end)
        .all()
    )

    if not matches:
        return []

    syndicate_moves = []

    for match in matches:
        window_start = match.commence_time - timedelta(minutes=SYNDICATE_ALERT_WINDOW_MINUTES)
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
        # Pin to opening line so we compare like-for-like across the window,
        # even when the market's main line has shifted since we stored many
        # alternate lines per fetch.
        opening_totals = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .order_by(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
            .first()
        )
        opening_totals_line = opening_totals.line if opening_totals else None

        baseline_totals = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.line == opening_totals_line)
            .filter(TotalsSnapshot.fetched_at >= window_start)
            .order_by(TotalsSnapshot.fetched_at.asc())
            .first()
        ) if opening_totals_line is not None else None

        latest_totals = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.line == opening_totals_line)
            .order_by(TotalsSnapshot.fetched_at.desc())
            .first()
        ) if opening_totals_line is not None else None

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


# Steam/Drifter results season scoping + rankings threshold, per Neil
# 2026-08-22 at the 26/27 season switchover: both tables reset to THIS
# season's moves only (a team's steam record from last season says
# little about a reshaped squad), and a team needs a minimum number of
# finished moves before it earns a rankings row — one or two results
# is coin-flip territory presented with the same visual authority as a
# real sample.
MIN_MOVES_FOR_TEAM_RANKING = 3


def _season_start(now: Optional[datetime] = None) -> datetime:
    """Current football season's start (July 1), matching the forecast
    engine's July rollover convention (_current_season_code)."""
    now = now or datetime.utcnow()
    start_year = now.year if now.month >= 7 else now.year - 1
    return datetime(start_year, 7, 1)


def _season_label(now: Optional[datetime] = None) -> str:
    start = _season_start(now)
    return f"{start.year}/{(start.year + 1) % 100:02d}"


@router.get("/steam-results", response_model=SteamResultsResponse)
async def get_steam_results(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(None, description="Filter by sport_key"),
    limit: int = Query(200, le=10000, description="Number of moves to return"),
    days: Optional[int] = Query(None, description="Only include moves from the last N days")
):
    """
    Public endpoint: completed steam move results with team rankings.
    Only shows odds that SHORTENED (sharp money backing) — no draws, no drifters.
    Deduplicates by match: each match counts only once per team (using the biggest move).
    Scoped to the CURRENT season (July 1 rollover) since 2026-08-22, and
    team rankings require MIN_MOVES_FOR_TEAM_RANKING finished moves.
    """
    # Base query — completed results, odds shortened (positive movement per
    # odds_fetcher.py's SteamMove.movement_percent convention: positive =
    # implied prob went UP = odds shortened = backed), no draws.
    # 2026-07-08: was filtering < 0, which is actually DRIFTS — inverted
    # relative to /drifters below, which had the same bug in reverse.
    base_query = (
        db.query(SteamMove)
        .filter(SteamMove.result_updated == True)
        .filter(SteamMove.outcome != 'draw')
        .filter(SteamMove.movement_percent > 0)  # Only shortened odds
        .filter(SteamMove.match_commence_time >= _season_start())
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

    # Sort by profit/loss descending. Rankings rows require a minimum
    # sample (see MIN_MOVES_FOR_TEAM_RANKING) — teams below it still
    # count toward the aggregate stats and appear in the moves list,
    # they just don't get a rankings row yet.
    ranked_teams = sorted(
        (t for t in team_stats.values() if t['total'] >= MIN_MOVES_FOR_TEAM_RANKING),
        key=lambda x: x['profit_loss'], reverse=True,
    )
    teams_below_min = sum(1 for t in team_stats.values() if t['total'] < MIN_MOVES_FOR_TEAM_RANKING)

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
        season_label=_season_label(),
        min_moves_for_rankings=MIN_MOVES_FOR_TEAM_RANKING,
        teams_below_min=teams_below_min,
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


@router.get("/drifter-results", response_model=SteamResultsResponse)
async def get_drifter_results(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(None, description="Filter by sport_key"),
    limit: int = Query(200, le=500, description="Number of moves to return"),
    days: Optional[int] = Query(None, description="Only include moves from the last N days"),
):
    """
    The inverse of /steam-results — completed matches where 1X2 odds
    DRIFTED (rose, money leaving) by 3+ percentage points in the last
    3 hours pre-kickoff. Useful for spotting teams the market
    consistently fades pre-KO.

    Same response shape as /steam-results so the frontend can reuse
    its types. P/L here represents 'what would happen if you blindly
    backed the drifting team' — negative P/L confirms the market
    was right to fade them.
    """
    # 2026-07-08: was filtering > 0, which is actually SHORTENED/backed
    # odds per odds_fetcher.py's movement_percent convention — the exact
    # inverse bug as /steam-results above. Drifting = negative movement.
    base_query = (
        db.query(SteamMove)
        .filter(SteamMove.result_updated == True)
        .filter(SteamMove.outcome != 'draw')
        .filter(SteamMove.movement_percent < 0)  # Only drifting (lengthening) odds
        .filter(SteamMove.match_commence_time >= _season_start())  # current season only, per Neil 2026-08-22
    )
    if league:
        base_query = base_query.filter(SteamMove.sport_key == league)
    if days:
        cutoff = datetime.utcnow() - timedelta(days=days)
        base_query = base_query.filter(SteamMove.match_commence_time >= cutoff)

    all_moves = base_query.order_by(desc(SteamMove.match_commence_time)).all()

    # Same dedup logic as steam — keep the biggest (absolute) move per
    # (team, match) so a single match counts once per team.
    best_per_match: dict[tuple[str, str], SteamMove] = {}
    for m in all_moves:
        key = (m.team_name, m.match_id)
        if key not in best_per_match or abs(m.movement_percent) > abs(best_per_match[key].movement_percent):
            best_per_match[key] = m
    deduped_moves = sorted(best_per_match.values(), key=lambda x: x.match_commence_time, reverse=True)

    def _result(m):
        if m.won:
            return 'win'
        if m.home_score is not None and m.away_score is not None and m.home_score == m.away_score:
            return 'draw'
        return 'loss'

    total_wins = sum(1 for m in deduped_moves if _result(m) == 'win')
    total_draws = sum(1 for m in deduped_moves if _result(m) == 'draw')
    total_losses = sum(1 for m in deduped_moves if _result(m) == 'loss')
    total_moves = total_wins + total_draws + total_losses
    win_rate = (total_wins / total_moves * 100) if total_moves > 0 else None

    avg_movement = (
        sum(abs(m.movement_percent) for m in deduped_moves) / len(deduped_moves)
        if deduped_moves else None
    )

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

    # For drifters, sort by P/L ASCENDING (worst first) — these are the
    # teams the market is most right to fade. Frontend can re-sort however.
    # Same minimum-sample gate as /steam-results.
    ranked_teams = sorted(
        (t for t in team_stats.values() if t['total'] >= MIN_MOVES_FOR_TEAM_RANKING),
        key=lambda x: x['profit_loss'],
    )
    teams_below_min = sum(1 for t in team_stats.values() if t['total'] < MIN_MOVES_FOR_TEAM_RANKING)

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

    limited_moves = deduped_moves[:limit]

    return SteamResultsResponse(
        total_moves=total_moves,
        total_wins=total_wins,
        total_draws=total_draws,
        total_losses=total_losses,
        win_rate=round(win_rate, 1) if win_rate else None,
        avg_movement_percent=round(avg_movement, 1) if avg_movement else None,
        season_label=_season_label(),
        min_moves_for_rankings=MIN_MOVES_FOR_TEAM_RANKING,
        teams_below_min=teams_below_min,
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
                away_score=m.away_score,
            )
            for m in limited_moves
        ],
        team_rankings=team_rankings,
    )


# Hard-coded 'top sides' per league. Each list MUST use the canonical
# team names that the importer stores (i.e. The Odds API spellings —
# 'Manchester United' not 'Man Utd'). Extend the dict as we define
# top groups for other leagues.
TOP_TEAMS_BY_LEAGUE: dict[str, list[str]] = {
    "soccer_epl": [
        "Arsenal",
        "Chelsea",
        "Liverpool",
        "Manchester City",
        "Manchester United",
        "Aston Villa",
    ],
    # La Liga is dominated historically by the same three sides every
    # year — Top 3 reflects that rather than copy-pasting Top 6.
    "soccer_spain_la_liga": [
        "Atlético Madrid",
        "Barcelona",
        "Real Madrid",
    ],
    # Serie A — Top 4 captures the historical Big Four (Inter, Juve,
    # Milan, Napoli) who've taken the last decade of scudetti between
    # them. Roma / Atalanta / Lazio sit one tier below.
    "soccer_italy_serie_a": [
        "AC Milan",
        "Inter Milan",
        "Juventus",
        "Napoli",
    ],
    # Bundesliga — Top 4: Bayern + Dortmund (perennial), Leverkusen
    # (24's title winners), RB Leipzig (Champions League regular).
    "soccer_germany_bundesliga": [
        "Bayer Leverkusen",
        "Bayern Munich",
        "Borussia Dortmund",
        "RB Leipzig",
    ],
    # Ligue 1 — Top 6: PSG plus the established European-spot regulars
    # (Marseille, Monaco, Lille/LOSC, Lyon, Lens). Wide enough that
    # non-Top-6 teams get a healthy sample of matches against the elite.
    "soccer_france_ligue_one": [
        "AS Monaco",
        "Lille",
        "Lyon",
        "Marseille",
        "Paris Saint Germain",
        "RC Lens",
    ],
}


@router.get("/team-pnl", response_model=TeamPLResponse)
async def get_team_pnl(
    db: Session = Depends(get_db),
    league: str = Query("soccer_epl", description="League sport_key. Currently only 'soccer_epl' is supported."),
    seasons: Optional[str] = Query(
        None,
        description="Comma-separated season codes (e.g. '2425,2526') to include. "
                    "Default: every season currently in the historical_matches table.",
    ),
    stake: float = Query(50.0, ge=0.01, le=100000.0, description="Flat stake per match in £."),
    opponents: Optional[str] = Query(
        None,
        description="Restrict to matches against a defined opponent set. "
                    "Currently supported: 'top' (the league's hardcoded top sides).",
    ),
):
    """
    Per-team 1X2 profit/loss at Pinnacle closing prices, season-by-season
    plus an 'all seasons' aggregate row per team.

    A 'win' means the team won the match outright (no push possible on
    1X2). P/L per win = stake × (price - 1). P/L per loss = -stake.

    Rows where `price_source = 'missing'` are dropped from the staked
    side but still counted in matches/wins so 'matches played' lines up
    with reality. The frontend can show this discrepancy via the
    rows_close / rows_open_fallback / rows_missing_price counters.
    """
    # Whitelist of supported leagues — add new ones here as we extend
    # both the importer and the team_name_normalizer maps.
    SUPPORTED_LEAGUES = {
        "soccer_epl",
        "soccer_italy_serie_a",
        "soccer_spain_la_liga",
        "soccer_germany_bundesliga",
        "soccer_france_ligue_one",
    }
    if league not in SUPPORTED_LEAGUES:
        raise HTTPException(
            status_code=400,
            detail=f"League '{league}' not yet supported. Supported: {sorted(SUPPORTED_LEAGUES)}",
        )

    # ── Filter the historical_matches table down to the requested view.
    q = db.query(HistoricalMatch).filter(HistoricalMatch.league == league)
    if seasons:
        season_list = [s.strip() for s in seasons.split(",") if s.strip()]
        q = q.filter(HistoricalMatch.season.in_(season_list))

    rows = q.all()

    if not rows:
        return TeamPLResponse(
            league=league,
            seasons_loaded=[],
            stake=stake,
            rows_close=0,
            rows_open_fallback=0,
            rows_missing_price=0,
            rows=[],
            top_teams=None,
            opponents_filter=None,
        )

    seasons_loaded = sorted({r.season for r in rows})
    rows_close = sum(1 for r in rows if r.price_source == "close")
    rows_open_fallback = sum(1 for r in rows if r.price_source == "open_fallback")
    rows_missing_price = sum(1 for r in rows if r.price_source == "missing")

    # ── Build the per-(team, season, side, view) accumulators.
    # side ∈ {'back', 'fade'}; view ∈ {'home', 'away'}.
    # 'overall' is derived by summing home + away at the end.
    #
    # Each match (H vs A) contributes to FOUR team-side buckets:
    #   • H.back.home  — back H to win at PSCH; wins on FTR=H
    #   • A.back.away  — back A to win at PSCA; wins on FTR=A
    #   • H.fade.home  — Double Chance "Draw or Away"; wins on FTR != H
    #   • A.fade.away  — Double Chance "Home or Draw"; wins on FTR != A
    #
    # The fade price is the no-margin combination of Pinnacle's two
    # individual prices, which mirrors what a sportsbook would quote
    # for the matching Double Chance market (and is structurally
    # equivalent to a +0.5 Asian Handicap on the opposing team).
    Bucket = dict[str, float]
    def empty_bucket() -> Bucket:
        return {"matches": 0, "wins": 0, "staked": 0.0, "pl": 0.0}

    def empty_team_season() -> dict:
        return {
            "back": {"home": empty_bucket(), "away": empty_bucket()},
            "fade": {"home": empty_bucket(), "away": empty_bucket()},
        }

    # team -> season -> {back: {home, away}, fade: {home, away}}
    accum: dict[str, dict[str, dict]] = {}

    def get(team: str, season: str, side: str, view: str) -> Bucket:
        return accum.setdefault(team, {}).setdefault(season, empty_team_season())[side][view]

    def dc_price(p1: Optional[float], p2: Optional[float]) -> Optional[float]:
        """Combined Pinnacle Double Chance price — bet wins on either p1 or p2 outcome."""
        if p1 is None or p2 is None or p1 <= 0 or p2 <= 0:
            return None
        return 1.0 / (1.0 / p1 + 1.0 / p2)

    # Resolve the opponent-filter set. None = include everyone (current
    # behaviour). A populated set = only count a team's match if THAT
    # team's opponent is in the set. Note: this is per-team-perspective
    # — Liverpool vs Brighton with set={top six} only contributes to
    # Brighton's "vs Top 6" buckets, not Liverpool's (Brighton isn't top).
    top_set: Optional[set[str]] = None
    top_list: Optional[list[str]] = None
    if opponents == "top":
        configured = TOP_TEAMS_BY_LEAGUE.get(league)
        if configured:
            top_list = list(configured)
            top_set = set(configured)
        # If no top set defined for this league, fall through with no
        # filter — keeps the endpoint forgiving rather than 400-ing
        # out a perfectly valid query.

    for r in rows:
        # Decide whether to include this match from each team's POV.
        # If there's no filter, both sides are always included.
        include_home_side = top_set is None or r.away_team in top_set
        include_away_side = top_set is None or r.home_team in top_set
        if not include_home_side and not include_away_side:
            continue

        bh = get(r.home_team, r.season, "back", "home")  # H backed at home
        ba = get(r.away_team, r.season, "back", "away")  # A backed away
        fh = get(r.home_team, r.season, "fade", "home")  # H faded (DC: D or A)
        fa = get(r.away_team, r.season, "fade", "away")  # A faded (DC: H or D)

        if include_home_side:
            bh["matches"] += 1
            fh["matches"] += 1
        if include_away_side:
            ba["matches"] += 1
            fa["matches"] += 1

        # Wins.
        if r.ftr == "H":
            if include_home_side:
                bh["wins"] += 1   # backing H wins
            if include_away_side:
                fa["wins"] += 1   # fading A: H is part of "H or D"
        elif r.ftr == "A":
            if include_away_side:
                ba["wins"] += 1   # backing A wins
            if include_home_side:
                fh["wins"] += 1   # fading H: A is part of "D or A"
        elif r.ftr == "D":
            if include_home_side:
                fh["wins"] += 1   # fading H: D is part of "D or A"
            if include_away_side:
                fa["wins"] += 1   # fading A: D is part of "H or D"

        # Stake/PL only on priced rows.
        if r.price_source == "missing":
            continue

        # Back side — single-outcome 1X2 stakes.
        if include_home_side and r.psch is not None:
            bh["staked"] += stake
            if r.ftr == "H":
                bh["pl"] += stake * (r.psch - 1.0)
            else:
                bh["pl"] -= stake

        if include_away_side and r.psca is not None:
            ba["staked"] += stake
            if r.ftr == "A":
                ba["pl"] += stake * (r.psca - 1.0)
            else:
                ba["pl"] -= stake

        # Fade side — Double Chance. Need TWO Pinnacle prices apiece.
        if include_home_side:
            fh_price = dc_price(r.pscd, r.psca)  # "Draw or Away" — fading the home team
            if fh_price is not None:
                fh["staked"] += stake
                if r.ftr != "H":   # D or A — fade wins
                    fh["pl"] += stake * (fh_price - 1.0)
                else:
                    fh["pl"] -= stake

        if include_away_side:
            fa_price = dc_price(r.psch, r.pscd)  # "Home or Draw" — fading the away team
            if fa_price is not None:
                fa["staked"] += stake
                if r.ftr != "A":   # H or D — fade wins
                    fa["pl"] += stake * (fa_price - 1.0)
                else:
                    fa["pl"] -= stake

    # ── Materialise the response rows, with an 'all' aggregate per team.
    def view_stats(b: Bucket) -> TeamPLViewStats:
        roi = (b["pl"] / b["staked"] * 100.0) if b["staked"] > 0 else None
        return TeamPLViewStats(
            matches=int(b["matches"]),
            wins=int(b["wins"]),
            staked=round(b["staked"], 2),
            pl=round(b["pl"], 2),
            roi=round(roi, 2) if roi is not None else None,
        )

    def sum_buckets(*buckets: Bucket) -> Bucket:
        out = empty_bucket()
        for b in buckets:
            out["matches"] += b["matches"]
            out["wins"] += b["wins"]
            out["staked"] += b["staked"]
            out["pl"] += b["pl"]
        return out

    def side_from_views(home_b: Bucket, away_b: Bucket) -> TeamPLSide:
        return TeamPLSide(
            home=view_stats(home_b),
            away=view_stats(away_b),
            overall=view_stats(sum_buckets(home_b, away_b)),
        )

    response_rows: list[TeamPLRow] = []
    for team, by_season in accum.items():
        all_back_h = empty_bucket()
        all_back_a = empty_bucket()
        all_fade_h = empty_bucket()
        all_fade_a = empty_bucket()
        for season, sides in by_season.items():
            response_rows.append(TeamPLRow(
                team=team,
                season=season,
                back=side_from_views(sides["back"]["home"], sides["back"]["away"]),
                fade=side_from_views(sides["fade"]["home"], sides["fade"]["away"]),
            ))
            all_back_h = sum_buckets(all_back_h, sides["back"]["home"])
            all_back_a = sum_buckets(all_back_a, sides["back"]["away"])
            all_fade_h = sum_buckets(all_fade_h, sides["fade"]["home"])
            all_fade_a = sum_buckets(all_fade_a, sides["fade"]["away"])

        # 'all' aggregate — always emitted (even for single-season teams)
        # so the UI's default filter never hides anyone.
        response_rows.append(TeamPLRow(
            team=team,
            season="all",
            back=side_from_views(all_back_h, all_back_a),
            fade=side_from_views(all_fade_h, all_fade_a),
        ))

    # Stable order: team name asc, then 'all' first, then seasons asc.
    response_rows.sort(key=lambda r: (r.team, "" if r.season == "all" else r.season))

    return TeamPLResponse(
        league=league,
        seasons_loaded=seasons_loaded,
        stake=stake,
        rows_close=rows_close,
        rows_open_fallback=rows_open_fallback,
        rows_missing_price=rows_missing_price,
        rows=response_rows,
        top_teams=top_list,
        opponents_filter=("top" if top_set is not None else None),
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


@router.get("/admin/users")
async def get_admin_users(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """
    Return all SteamWatch user accounts with their subscription status.
    Useful for spotting historical free-tier signups that never paid
    (before free signup was locked down).
    """
    from app.models.user import User
    from app.models.subscription import Subscription

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    users = db.query(User).order_by(desc(User.created_at)).all()

    # Left-join style lookup: build a map of user_id -> subscription for speed
    sub_map = {s.user_id: s for s in db.query(Subscription).all()}

    rows = []
    for u in users:
        sub = sub_map.get(u.id)
        status = sub.status if sub else "never_paid"
        rows.append({
            "id": u.id,
            "email": u.email,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "stripe_customer_id": u.stripe_customer_id,
            "subscription_status": status,
            "current_period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
            "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
        })

    # Counts for the header
    never_paid = sum(1 for r in rows if r["subscription_status"] == "never_paid")
    active = sum(1 for r in rows if r["subscription_status"] == "active")
    canceled = sum(1 for r in rows if r["subscription_status"] == "canceled")
    past_due = sum(1 for r in rows if r["subscription_status"] == "past_due")
    other = len(rows) - never_paid - active - canceled - past_due

    return {
        "total": len(rows),
        "never_paid": never_paid,
        "active": active,
        "canceled": canceled,
        "past_due": past_due,
        "other": other,
        "users": rows,
    }


@router.get("/admin/polymarket-health")
async def get_polymarket_health(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """
    Polymarket fetcher health: last run, what got matched, recent
    unmatched events (so we can grow the team-alias map), latest snapshot
    per WC match, and current row count.
    """
    from app.services.polymarket_fetcher import polymarket_fetcher
    from app.models import PolymarketSnapshot

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    # Latest snapshot per match — small subquery so we get the freshest row.
    latest_rows = (
        db.query(
            PolymarketSnapshot.match_id,
            func.max(PolymarketSnapshot.fetched_at).label("latest_at"),
            func.count(PolymarketSnapshot.id).label("snap_count"),
        )
        .group_by(PolymarketSnapshot.match_id)
        .all()
    )
    matches_by_id = {
        m.id: m for m in db.query(Match).filter(
            Match.id.in_([r.match_id for r in latest_rows])
        ).all()
    } if latest_rows else {}

    per_match = []
    for r in latest_rows:
        m = matches_by_id.get(r.match_id)
        latest_snap = (
            db.query(PolymarketSnapshot)
            .filter(PolymarketSnapshot.match_id == r.match_id)
            .order_by(PolymarketSnapshot.fetched_at.desc())
            .first()
        )
        per_match.append({
            "match_id": r.match_id,
            "home_team": m.home_team if m else None,
            "away_team": m.away_team if m else None,
            "commence_time": m.commence_time.isoformat() + "Z" if m else None,
            "latest_snapshot_at": r.latest_at.isoformat() + "Z",
            "snapshots_stored": r.snap_count,
            "latest": latest_snap and {
                "home_win_yes": latest_snap.home_win_yes,
                "draw_yes": latest_snap.draw_yes,
                "away_win_yes": latest_snap.away_win_yes,
                "over_2_5_yes": latest_snap.over_2_5_yes,
                "under_2_5_yes": latest_snap.under_2_5_yes,
                "event_volume_24h": latest_snap.event_volume_24h,
                "in_play": latest_snap.in_play,
            },
        })
    # Sort: in-play first, then by KO time
    per_match.sort(key=lambda x: (
        not (x["latest"] and x["latest"].get("in_play")),
        x["commence_time"] or "",
    ))

    return {
        "last_run_at": polymarket_fetcher.last_run_at.isoformat() + "Z" if polymarket_fetcher.last_run_at else None,
        "last_events_seen": polymarket_fetcher.last_events_seen,
        "last_matches_matched": polymarket_fetcher.last_matches_matched,
        "last_snapshots_stored": polymarket_fetcher.last_snapshots_stored,
        "last_unmatched_events": polymarket_fetcher.last_unmatched_events,
        "last_error": polymarket_fetcher.last_error,
        "total_snapshots": db.query(func.count(PolymarketSnapshot.id)).scalar(),
        "matches_tracked": len(per_match),
        "per_match": per_match,
    }


@router.get("/admin/outrights-health")
async def get_outrights_health(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """
    Season-outright fetcher health: last run summary (including any
    Polymarket labels that didn't resolve to a canonical team — grow
    the alias map from these), plus the latest snapshot batch per
    league so the prices feeding the Forecast Engine are inspectable.
    """
    from app.services.outright_fetcher import outright_fetcher
    from app.models import OutrightSnapshot, OutrightCapture

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    per_league = []
    latest_per_league = (
        db.query(
            OutrightSnapshot.league,
            OutrightSnapshot.market,
            func.max(OutrightSnapshot.fetched_at).label("latest_at"),
        )
        .group_by(OutrightSnapshot.league, OutrightSnapshot.market)
        .all()
    )
    for r in latest_per_league:
        rows = (
            db.query(OutrightSnapshot)
            .filter(
                OutrightSnapshot.league == r.league,
                OutrightSnapshot.market == r.market,
                OutrightSnapshot.fetched_at == r.latest_at,
            )
            .order_by(OutrightSnapshot.yes_price.desc())
            .all()
        )
        per_league.append({
            "league": r.league,
            "market": r.market,
            "fetched_at": r.latest_at.isoformat() + "Z",
            "event_slug": rows[0].event_slug if rows else None,
            "capture_sha256": rows[0].capture_sha256 if rows else None,
            "teams": [
                {
                    "team": s.team_name,
                    "team_raw": s.team_name_raw,
                    "resolved": s.team_name is not None,
                    "yes": s.yes_price,
                    "bid": s.best_bid,
                    "ask": s.best_ask,
                    "volume_24h": s.volume_24h,
                }
                for s in rows
            ],
        })

    return {
        "last_run_at": outright_fetcher.last_run_at.isoformat() + "Z" if outright_fetcher.last_run_at else None,
        "last_summary": outright_fetcher.last_summary,
        "last_error": outright_fetcher.last_error,
        "total_snapshots": db.query(func.count(OutrightSnapshot.id)).scalar(),
        "total_captures": db.query(func.count(OutrightCapture.sha256)).scalar(),
        "per_league": per_league,
    }


@router.post("/admin/fetch-outrights")
async def admin_fetch_outrights(
    password: str = Query(..., description="Admin password"),
):
    """Trigger an immediate Polymarket outright fetch (normally hourly)."""
    from app.services.outright_fetcher import outright_fetcher

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return await outright_fetcher.fetch_and_store()


@router.post("/admin/load-club-finances")
async def admin_load_club_finances(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """Reload the committed club-finance snapshot (PL wage bills) into
    club_finances. Run after refreshing the snapshot for a new season."""
    from app.services.club_finance_importer import load_snapshot

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return load_snapshot(db)


@router.post("/admin/load-squad-values")
async def admin_load_squad_values(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """Reload the committed squad-market-value snapshot (Transfermarkt,
    manually transcribed — no API) into squad_market_values. Run after
    regenerating the snapshot with scripts/refresh_squad_values.py."""
    from app.services.squad_value_importer import load_snapshot

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return load_snapshot(db)


@router.post("/admin/repair-flipped-match")
async def admin_repair_flipped_match(
    match_id: str = Query(..., description="Match id whose home/away orientation is inverted vs The Odds API"),
    boundary: str = Query(..., description="ISO timestamp: snapshots BEFORE this are swapped; at/after are already in the corrected orientation"),
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """One-shot repair for a match whose home/away teams The Odds API
    corrected on the SAME event id after we'd stored history under the
    old orientation (first seen 2026-08-21: PSG v Rennes was really
    Rennes v PSG, so the site showed PSG at 5.27 'home'). Swaps the
    match row's team orientation, mirrors home/away odds on snapshots
    BEFORE the boundary (rows after it were extracted against the
    API's corrected orientation and are already right), and swaps +
    negates the handicap line on pre-boundary spreads. Totals have no
    team orientation and are untouched. Idempotent only in the sense
    that running it twice un-repairs — check before firing."""
    from datetime import datetime as _dt

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    try:
        boundary_ts = _dt.fromisoformat(boundary)
    except ValueError:
        raise HTTPException(status_code=400, detail="boundary must be an ISO timestamp")

    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    old_home, old_away = match.home_team, match.away_team
    match.home_team, match.away_team = old_away, old_home

    odds_swapped = db.execute(text(
        "UPDATE odds_snapshots SET home_odds = away_odds, away_odds = home_odds "
        "WHERE match_id = :m AND fetched_at < :t"
    ), {"m": match_id, "t": boundary_ts}).rowcount
    spreads_swapped = db.execute(text(
        "UPDATE spreads_snapshots SET home_odds = away_odds, away_odds = home_odds, line = -line "
        "WHERE match_id = :m AND fetched_at < :t"
    ), {"m": match_id, "t": boundary_ts}).rowcount
    db.commit()

    return {
        "match_id": match_id,
        "orientation": f"{old_home} v {old_away} -> {match.home_team} v {match.away_team}",
        "odds_snapshots_swapped": odds_swapped,
        "spreads_swapped_and_line_negated": spreads_swapped,
    }


@router.post("/admin/delete-empty-match")
async def admin_delete_empty_match(
    match_id: str = Query(..., description="Match id to delete — refused unless it has zero dependent rows"),
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """Delete an orphaned match row (e.g. a duplicate event id The Odds
    API briefly issued then withdrew). Refuses unless the row has zero
    snapshots/steam/alert/closing-line rows — this is for empty husks
    that pollute match listings, not a general delete."""
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    refs = {}
    for tbl in ("odds_snapshots", "totals_snapshots", "spreads_snapshots",
                "steam_moves", "syndicate_alerts", "closing_lines", "polymarket_snapshots"):
        refs[tbl] = db.execute(
            text(f"SELECT count(*) FROM {tbl} WHERE match_id = :m"), {"m": match_id}
        ).scalar()
    if any(refs.values()):
        raise HTTPException(status_code=409, detail=f"Match has dependent rows, refusing: {refs}")

    db.delete(match)
    db.commit()
    return {"deleted": match_id, "teams": f"{match.home_team} v {match.away_team}"}


@router.get("/admin/club-finances-health")
async def get_club_finances_health(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """Latest-season wage table currently loaded, so the numbers feeding
    the Forecast Engine's `wages` source are inspectable."""
    from app.models import ClubFinance

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    total = db.query(func.count(ClubFinance.id)).scalar()
    latest = (
        db.query(ClubFinance.season)
        .filter(ClubFinance.wage_total_m.isnot(None))
        .order_by(ClubFinance.season.desc())
        .limit(1)
        .scalar()
    )
    rows = (
        db.query(ClubFinance)
        .filter(ClubFinance.season == latest, ClubFinance.wage_total_m.isnot(None))
        .order_by(ClubFinance.wage_total_m.desc())
        .all()
        if latest is not None else []
    )
    return {
        "total_rows": total,
        "latest_season": latest,
        "latest_season_code": rows[0].season_code if rows else None,
        "source": rows[0].source if rows else None,
        "clubs": [
            {
                "team": r.team_name,
                "team_raw": r.team_name_raw,
                "wage_total_m": r.wage_total_m,
                "revenue_m": r.total_revenue_m,
                "net_spend_m": r.net_spend_m,
                "currency": r.currency,
            }
            for r in rows
        ],
    }


@router.get("/admin/alert-stats")
async def admin_alert_stats(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """
    Diagnostic: raw counts of what's in the syndicate_alerts table.
    Used to confirm we're querying the full history vs a recent slice,
    and to see the market-mix at a glance.
    """
    from app.models import SyndicateAlert, Match
    from sqlalchemy import func as sa_func, distinct

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    total = db.query(sa_func.count(SyndicateAlert.id)).scalar()
    earliest = db.query(sa_func.min(SyndicateAlert.alerted_at)).scalar()
    latest = db.query(sa_func.max(SyndicateAlert.alerted_at)).scalar()
    distinct_matches = db.query(sa_func.count(distinct(SyndicateAlert.match_id))).scalar()

    by_market = dict(
        db.query(SyndicateAlert.market, sa_func.count(SyndicateAlert.id))
        .group_by(SyndicateAlert.market)
        .all()
    )

    # Per-month breakdown so we can see if the volume dropped suddenly.
    by_month_raw = (
        db.query(
            sa_func.date_trunc('month', SyndicateAlert.alerted_at).label('month'),
            sa_func.count(SyndicateAlert.id).label('n'),
        )
        .group_by('month')
        .order_by('month')
        .all()
    )
    by_month = {str(row.month.date()): row.n for row in by_month_raw}

    # Per-league breakdown (joined to matches for sport_key)
    by_league = dict(
        db.query(Match.sport_key, sa_func.count(SyndicateAlert.id))
        .join(SyndicateAlert, SyndicateAlert.match_id == Match.id)
        .group_by(Match.sport_key)
        .all()
    )

    return {
        "total_alerts": total,
        "distinct_matches": distinct_matches,
        "earliest": earliest.isoformat() + "Z" if earliest else None,
        "latest": latest.isoformat() + "Z" if latest else None,
        "by_market": by_market,
        "by_month": by_month,
        "by_league": by_league,
    }


@router.get("/admin/alert-roi")
async def admin_alert_roi(
    password: str = Query(..., description="Admin password"),
    league: Optional[str] = Query(None, description="Filter by sport_key"),
    min_movement: float = Query(0.0, description="Minimum |movement_percent| pp"),
    db: Session = Depends(get_db),
):
    """
    Flat-stakes ROI on Telegram syndicate alerts.

    Every alert is treated as 1 unit staked at the odds we alerted at.
    Returns settled if the match has a recorded result (we get scores via
    the SteamMove result-update job which pulls from The Odds API /scores).
    For now only 1X2 market alerts are scored — totals + spreads alerts
    don't store the line so we can't settle them without a second pass.

    Slicing:
      - Overall
      - By league
      - By movement_percent bucket (the pp shift that fired the alert)
      - By odds-tier bucket (favourite vs coinflip vs dog)
    """
    from app.models import SyndicateAlert, SteamMove, Match, TotalsSnapshot, SpreadsSnapshot
    from sqlalchemy import func as sa_func

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    # Score subquery — any SteamMove row per match carries the home/away
    # score once the results job has updated it.
    score_subq = (
        db.query(
            SteamMove.match_id.label("match_id"),
            sa_func.max(SteamMove.home_score).label("home_score"),
            sa_func.max(SteamMove.away_score).label("away_score"),
        )
        .filter(SteamMove.result_updated == True)  # noqa: E712
        .group_by(SteamMove.match_id)
        .subquery()
    )

    # Pull EVERY alert — not just 1x2. We'll settle each according to its
    # market. drift_1x2 (yesterday's brief experiment) settles like 1x2.
    rows = (
        db.query(
            SyndicateAlert.id,
            SyndicateAlert.match_id,
            SyndicateAlert.market,
            SyndicateAlert.outcome,
            SyndicateAlert.movement_percent,
            SyndicateAlert.odds_at_alert,
            SyndicateAlert.alerted_at,
            Match.sport_key,
            Match.home_team,
            Match.away_team,
            Match.commence_time,
            score_subq.c.home_score,
            score_subq.c.away_score,
        )
        .join(Match, SyndicateAlert.match_id == Match.id)
        .outerjoin(score_subq, score_subq.c.match_id == SyndicateAlert.match_id)
        .all()
    )

    if league:
        rows = [r for r in rows if r.sport_key == league]
    if min_movement > 0:
        rows = [r for r in rows if abs(r.movement_percent or 0) >= min_movement]

    # For totals/spreads alerts we need the LINE at alert time. The alerter
    # pins comparisons to the OPENING line so the bet is on that line —
    # look up the earliest snapshot per match for both markets in one pass.
    match_ids = list({r.match_id for r in rows})
    totals_opening_line: dict[str, float] = {}
    if match_ids:
        seen_t = set()
        for row in (
            db.query(TotalsSnapshot.match_id, TotalsSnapshot.line)
            .filter(TotalsSnapshot.match_id.in_(match_ids))
            .order_by(TotalsSnapshot.match_id, TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
            .all()
        ):
            if row.match_id not in seen_t:
                seen_t.add(row.match_id)
                totals_opening_line[row.match_id] = row.line
    spreads_opening_line: dict[str, float] = {}
    if match_ids:
        seen_s = set()
        for row in (
            db.query(SpreadsSnapshot.match_id, SpreadsSnapshot.line)
            .filter(SpreadsSnapshot.match_id.in_(match_ids))
            .order_by(SpreadsSnapshot.match_id, SpreadsSnapshot.fetched_at.asc(), SpreadsSnapshot.id.asc())
            .all()
        ):
            if row.match_id not in seen_s:
                seen_s.add(row.match_id)
                spreads_opening_line[row.match_id] = row.line

    def settle(r) -> str:
        """Return 'won' / 'lost' / 'push' / 'pending' for one alert."""
        if r.home_score is None or r.away_score is None:
            return "pending"
        total = r.home_score + r.away_score
        if r.market in ("1x2", "drift_1x2"):
            if r.outcome == "home":
                return "won" if r.home_score > r.away_score else "lost"
            if r.outcome == "away":
                return "won" if r.away_score > r.home_score else "lost"
            if r.outcome == "draw":
                return "won" if r.home_score == r.away_score else "lost"
        elif r.market == "totals":
            line = totals_opening_line.get(r.match_id)
            if line is None:
                return "pending"
            if r.outcome == "over":
                if total > line: return "won"
                if total < line: return "lost"
                return "push"
            if r.outcome == "under":
                if total < line: return "won"
                if total > line: return "lost"
                return "push"
        elif r.market == "spreads":
            line = spreads_opening_line.get(r.match_id)
            if line is None:
                return "pending"
            # line stored from home perspective. home covers when
            # (home_score + line) > away_score. Handle both old format
            # (home_spread/away_spread from a pre-refactor era) and
            # current (home/away).
            if r.outcome in ("home", "home_spread"):
                margin = r.home_score + line - r.away_score
            elif r.outcome in ("away", "away_spread"):
                margin = r.away_score - line - r.home_score
            else:
                return "pending"
            if margin > 0: return "won"
            if margin < 0: return "lost"
            return "push"
        return "pending"

    def roi_block(records):
        """Aggregate ROI / hit-rate stats. Pushes return stake (0 P&L)."""
        won = lost = pushed = pending = 0
        staked = 0.0
        returns = 0.0
        for r in records:
            res = settle(r)
            if res == "pending":
                pending += 1
                continue
            staked += 1.0
            if res == "won":
                won += 1
                returns += r.odds_at_alert
            elif res == "push":
                pushed += 1
                returns += 1.0  # stake returned
            else:
                lost += 1
        decided = won + lost  # exclude pushes from hit-rate denominator
        settled = won + lost + pushed
        roi_pct = ((returns - staked) / staked * 100) if staked > 0 else None
        hit_rate_pct = (won / decided * 100) if decided > 0 else None
        return {
            "alerts_total": len(records),
            "settled": settled,
            "pending": pending,
            "won": won,
            "lost": lost,
            "pushed": pushed,
            "hit_rate_pct": round(hit_rate_pct, 2) if hit_rate_pct is not None else None,
            "staked_units": round(staked, 2),
            "returned_units": round(returns, 2),
            "profit_units": round(returns - staked, 2),
            "roi_pct": round(roi_pct, 2) if roi_pct is not None else None,
        }

    overall = roi_block(rows)

    # Per-league
    leagues: dict[str, list] = {}
    for r in rows:
        leagues.setdefault(r.sport_key or "(unknown)", []).append(r)
    by_league = {k: roi_block(v) for k, v in sorted(leagues.items())}

    # Per movement-percent bucket
    def mv_bucket(p):
        a = abs(p or 0)
        if a < 3: return "0-3pp"
        if a < 4: return "3-4pp"
        if a < 5: return "4-5pp"
        if a < 7: return "5-7pp"
        return "7+pp"
    mv_groups: dict[str, list] = {}
    for r in rows:
        mv_groups.setdefault(mv_bucket(r.movement_percent), []).append(r)
    by_movement = {k: roi_block(v) for k, v in sorted(mv_groups.items())}

    # Per odds-tier bucket
    def odds_bucket(o):
        if o is None: return "(unknown)"
        if o < 1.5: return "<1.50 (heavy fav)"
        if o < 2.0: return "1.50-2.00 (fav)"
        if o < 2.5: return "2.00-2.50 (coinflip)"
        if o < 4.0: return "2.50-4.00 (mid dog)"
        return "4.00+ (long dog)"
    odds_groups: dict[str, list] = {}
    for r in rows:
        odds_groups.setdefault(odds_bucket(r.odds_at_alert), []).append(r)
    by_odds = {k: roi_block(v) for k, v in sorted(odds_groups.items())}

    # By outcome side (any tilt toward backing home/draw/away?)
    side_groups: dict[str, list] = {}
    for r in rows:
        side_groups.setdefault(r.outcome or "(unknown)", []).append(r)
    by_outcome = {k: roi_block(v) for k, v in sorted(side_groups.items())}

    # By market — primary slice now we cover all four.
    market_groups: dict[str, list] = {}
    for r in rows:
        market_groups.setdefault(r.market or "(unknown)", []).append(r)
    by_market = {k: roi_block(v) for k, v in sorted(market_groups.items())}

    return {
        "filter": {"league": league, "min_movement_pp": min_movement},
        "note": (
            "Flat 1-unit stakes per alert at odds_at_alert. Settlement via SteamMove scores. "
            "Totals + spreads alerts settled against the OPENING line for that match "
            "(the alerter pins comparisons there). Pushes return the stake (0 P&L) and are excluded from hit-rate denominator."
        ),
        "overall": overall,
        "by_market": by_market,
        "by_league": by_league,
        "by_movement_pp": by_movement,
        "by_odds_tier": by_odds,
        "by_outcome_side": by_outcome,
    }


@router.get("/admin/twitter-verify")
async def admin_twitter_verify(
    password: str = Query(..., description="Admin password"),
):
    """
    Verify the Twitter OAuth 1.0a credentials work — calls the X API's
    `users/me` endpoint to confirm we can authenticate as
    @Steamwatchio. Safe to call repeatedly: does NOT post anything.

    Catches the common failure modes (missing env var, wrong key,
    Read-only app permission) and returns a clear diagnostic message.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    from app.services.twitter_poster import verify_credentials, credentials_fingerprint
    status = verify_credentials()
    return {
        "ok": status.ok,
        "detail": status.detail,
        "handle": status.handle,
        # On failure, surface the first 4 chars of each env var so Neil can
        # spot a paste mix-up (e.g. OAuth 2.0 Client ID accidentally pasted
        # into TWITTER_API_KEY). Never the full secret.
        "fingerprint": credentials_fingerprint(),
    }


@router.post("/admin/twitter-post")
async def admin_twitter_post(
    password: str = Query(..., description="Admin password"),
    text: str = Query(..., description="Tweet text — up to 280 chars"),
):
    """
    Post `text` to the authenticated X account (@Steamwatchio).
    Admin-only. The actual posting code lives in
    app.services.twitter_poster.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    from app.services.twitter_poster import post_tweet
    status = post_tweet(text)
    return {
        "ok": status.ok,
        "detail": status.detail,
        "tweet_id": status.tweet_id,
    }


@router.post("/admin/mark-early-goal")
async def admin_mark_early_goal(
    password: str = Query(..., description="Admin password"),
    match_id: str = Query(..., description="Match ID to mark"),
    minute: int = Query(5, ge=1, le=120, description="Goal minute"),
    db: Session = Depends(get_db),
):
    """
    Manually set Match.early_goal_minute so /in-play-jumps drops the row.
    Use when the automatic T+5 score check missed a match (e.g. scheduler
    was down at KO, or /scores hadn't published yet).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="match not found")
    previous = match.early_goal_minute
    match.early_goal_minute = minute
    db.commit()
    return {
        "ok": True,
        "match_id": match_id,
        "home_team": match.home_team,
        "away_team": match.away_team,
        "previous": previous,
        "now": minute,
    }


@router.post("/admin/recompute-closing-line")
async def admin_recompute_closing_line(
    password: str = Query(..., description="Admin password"),
    match_id: str = Query(..., description="Match ID"),
    market: str = Query("totals", description="1x2 | asian_handicap | totals | all"),
    db: Session = Depends(get_db),
):
    """
    Delete the existing ClosingLine row(s) for a match so the scheduler's
    next capture_closing_lines pass recomputes them from current snapshot
    history. Used to fix wrong closes captured by an old bug (e.g. the
    pre-fix totals-pin-to-opening-line that stored 2.5 when actual close
    was 2.25). Safe — only deletes the cached close, not the snapshot data.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="match not found")

    q = db.query(ClosingLine).filter(ClosingLine.match_id == match_id)
    if market != "all":
        q = q.filter(ClosingLine.market_type == market)

    rows = q.all()
    deleted = [{"market": r.market_type, "close_line": r.close_line, "captured_at": r.captured_at.isoformat() if r.captured_at else None} for r in rows]
    for r in rows:
        db.delete(r)

    # Must commit the deletes BEFORE running capture — the captor uses its
    # own SessionLocal() and otherwise still sees the about-to-be-deleted
    # rows, hits the 'existing' check, and skips recapture.
    db.commit()

    from app.services.closing_line_capturer import closing_line_capturer
    await closing_line_capturer.capture_closing_lines()
    db.expire_all()

    new_rows = (
        db.query(ClosingLine)
        .filter(ClosingLine.match_id == match_id)
        .all()
    )
    recaptured = [{"market": r.market_type, "close_line": r.close_line, "over": r.close_over_price, "under": r.close_under_price, "captured_at": r.captured_at.isoformat() if r.captured_at else None, "minutes_before_ko": r.minutes_before_kickoff} for r in new_rows]

    return {
        "ok": True,
        "match_id": match_id,
        "match": f"{match.home_team} vs {match.away_team}",
        "deleted": deleted,
        "recaptured": recaptured,
    }


@router.get("/admin/probe-odds-api")
async def admin_probe_odds_api(
    password: str = Query(..., description="Admin password"),
    sport_key: str = Query("soccer_fifa_world_cup"),
    markets: str = Query("alternate_totals", description="e.g. h2h, totals, spreads, alternate_totals"),
    bookmakers: str = Query("pinnacle", description="Comma-separated bookmaker keys, or empty string for The Odds API's default set (whichever books it has for this sport, unfiltered)"),
    regions: str = Query("eu", description="e.g. eu, uk, eu,uk"),
):
    """
    One-shot probe: hit The Odds API directly for a given sport_key +
    markets combo and report what comes back. Originally built to check
    whether our plan supports alternate_totals; generalized so we can
    also answer 'does The Odds API have any fixtures yet for a
    currently-quiet league' (e.g. Champions League between seasons) by
    probing with a valid market like h2h — a request with an invalid
    market errors before The Odds API even lists events, so that check
    needs a market our plan actually supports. `bookmakers`/`regions`
    are overridable (still default to our production values) so a
    "Pinnacle shows 0 here but has real prices on pinnacle.com" report
    can be root-caused — e.g. pass bookmakers= (empty) to see every
    bookmaker The Odds API actually has for this sport/market, which
    tells us whether the gap is Pinnacle-specific or the whole sport
    just isn't covered on our plan/region.

    Read-only. Costs ~1 API unit per call.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    from app.config import get_settings
    import httpx
    s = get_settings()
    url = f"{s.odds_api_base_url}/sports/{sport_key}/odds"
    params = {
        "apiKey": s.odds_api_key,
        "regions": regions,
        "markets": markets,
        "oddsFormat": "decimal",
    }
    if bookmakers:
        params["bookmakers"] = bookmakers
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
    events_count = 0
    event_titles = []
    lines_per_event = {}
    pinnacle_priced_count = 0
    bookmakers_seen: dict = {}
    try:
        data = resp.json() if resp.status_code == 200 else None
        if isinstance(data, list):
            events_count = len(data)
            for ev in data:
                pin = next(
                    (b for b in (ev.get('bookmakers') or []) if b.get('key') == 'pinnacle'),
                    None,
                )
                if pin and pin.get('markets'):
                    pinnacle_priced_count += 1
                for b in (ev.get('bookmakers') or []):
                    key = b.get('key')
                    if key:
                        bookmakers_seen[key] = bookmakers_seen.get(key, 0) + 1
            for ev in data[:10]:
                title = f"{ev.get('home_team')} v {ev.get('away_team')} ({ev.get('commence_time')})"
                event_titles.append(title)
                if markets == "alternate_totals":
                    pin = next(
                        (b for b in (ev.get('bookmakers') or []) if b.get('key') == 'pinnacle'),
                        None,
                    )
                    if pin:
                        m = next(
                            (mk for mk in (pin.get('markets') or []) if mk.get('key') == 'alternate_totals'),
                            None,
                        )
                        outs = (m or {}).get('outcomes') or []
                        lines = sorted({o.get('point') for o in outs if o.get('point') is not None})
                        lines_per_event[title] = lines
    except Exception:
        pass
    return {
        "status": resp.status_code,
        "quota_remaining": resp.headers.get("x-requests-remaining"),
        "quota_used": resp.headers.get("x-requests-used"),
        "events_returned": events_count,
        "pinnacle_priced_count": pinnacle_priced_count,
        "bookmakers_seen": bookmakers_seen,
        "event_titles_sample": event_titles,
        "lines_per_event_sample": lines_per_event,
        "response_preview": (resp.text[:600] if resp.status_code != 200 else None),
    }


@router.get("/admin/list-odds-api-sports")
async def admin_list_odds_api_sports(
    password: str = Query(..., description="Admin password"),
    filter_text: str = Query("soccer", description="Substring filter on sport_key/title, case-insensitive"),
):
    """
    List every sport_key The Odds API currently has active, filtered by
    substring. Use when a league's usual sport_key returns zero events
    and we need to check whether it's genuinely off-season or just
    listed under a different key (e.g. Champions League qualifying
    rounds sometimes sit under a separate key from the group-stage
    competition). This call is free — GET /sports doesn't cost quota.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    from app.config import get_settings
    import httpx
    s = get_settings()
    url = f"{s.odds_api_base_url}/sports"
    params = {"apiKey": s.odds_api_key}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
    matches = []
    try:
        data = resp.json() if resp.status_code == 200 else []
        needle = filter_text.lower()
        for sport in data:
            key = sport.get("key", "")
            title = sport.get("title", "")
            group = sport.get("group", "")
            haystack = f"{key} {title} {group}".lower()
            if needle in haystack:
                matches.append({
                    "key": key,
                    "title": title,
                    "group": group,
                    "active": sport.get("active"),
                })
    except Exception:
        pass
    return {
        "status": resp.status_code,
        "matches": matches,
        "response_preview": (resp.text[:600] if resp.status_code != 200 else None),
    }


@router.get("/admin/probe-event-odds-api")
async def admin_probe_event_odds_api(
    password: str = Query(..., description="Admin password"),
    sport_key: str = Query(..., description="e.g. soccer_epl"),
    event_id: str = Query(..., description="The Odds API event id — our Match.id values already ARE these"),
    markets: str = Query("player_goal_scorer_anytime", description="Comma-separated additional-market keys"),
    bookmakers: str = Query("", description="Comma-separated bookmaker keys, or empty for the default set"),
    regions: str = Query("eu,uk", description="e.g. eu, uk, eu,uk"),
):
    """
    Research-only probe against the PER-EVENT odds endpoint
    (/sports/{sport}/events/{eventId}/odds), which is what "additional
    markets" (player props, corners, cards, btts, etc.) actually live
    on — the bulk /sports/{sport}/odds endpoint 422s on these market
    keys even though they're real. Read-only, ~1 API unit per call.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    from app.config import get_settings
    import httpx
    s = get_settings()
    url = f"{s.odds_api_base_url}/sports/{sport_key}/events/{event_id}/odds"
    params = {
        "apiKey": s.odds_api_key,
        "regions": regions,
        "markets": markets,
        "oddsFormat": "decimal",
    }
    if bookmakers:
        params["bookmakers"] = bookmakers
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
    bookmakers_seen: dict = {}
    outcomes_sample = []
    try:
        data = resp.json() if resp.status_code == 200 else None
        if isinstance(data, dict):
            for b in (data.get("bookmakers") or []):
                key = b.get("key")
                if key:
                    bookmakers_seen[key] = bookmakers_seen.get(key, 0) + 1
                if len(outcomes_sample) < 10:
                    for m in (b.get("markets") or []):
                        for o in (m.get("outcomes") or [])[:5]:
                            outcomes_sample.append({"bookmaker": key, "market": m.get("key"), **o})
                            if len(outcomes_sample) >= 10:
                                break
    except Exception:
        pass
    return {
        "status": resp.status_code,
        "quota_remaining": resp.headers.get("x-requests-remaining"),
        "quota_used": resp.headers.get("x-requests-used"),
        "bookmakers_seen": bookmakers_seen,
        "outcomes_sample": outcomes_sample,
        "response_preview": (resp.text[:800] if resp.status_code != 200 else None),
    }


@router.get("/admin/fetcher-health")
async def get_fetcher_health(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """
    Scheduler + odds-fetcher health snapshot.

    Returns scheduler state, last tick timestamp, current per-league
    refresh intervals and staleness flags, the most recently seen
    Odds API quota headers, and the last 10 errors. Used to diagnose
    issues like 'LAST FETCH shows 1 hour ago' without trawling Railway logs.
    """
    from app.services.scheduler import odds_scheduler
    from sqlalchemy import func

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    health = odds_scheduler.get_health()

    # Enrich per-league info with the actual latest OddsSnapshot timestamp
    # from the database. This tells us whether fetches are landing real data.
    # We also recompute `is_stale` using the DB value — the scheduler's
    # in-memory `_last_fetch_by_league` map is empty after a restart even
    # though the DB has fresh data, which would otherwise show every
    # league as red post-deploy.
    try:
        now = datetime.utcnow()
        for sport_key, info in health["leagues"].items():
            latest_ts = (
                db.query(func.max(OddsSnapshot.fetched_at))
                .join(Match, Match.id == OddsSnapshot.match_id)
                .filter(Match.sport_key == sport_key)
                .scalar()
            )
            if latest_ts:
                seconds_since = int((now - latest_ts).total_seconds())
                info["latest_snapshot_at"] = latest_ts.isoformat() + "Z"
                info["seconds_since_latest_snapshot"] = seconds_since
                # Consider the league stale only if the DB's latest snapshot
                # is older than its current target interval (plus a 60s grace
                # window for tick scheduling jitter).
                interval_s = info["current_interval_minutes"] * 60 + 60
                info["is_stale"] = seconds_since > interval_s
            else:
                info["latest_snapshot_at"] = None
                info["seconds_since_latest_snapshot"] = None
                # No snapshot at all = genuinely stale.
                info["is_stale"] = True
    except Exception as e:
        logger.error("Failed to enrich fetcher health with DB snapshots", error=str(e))

    return health


@router.get("/admin/email-config")
async def admin_email_config(password: str = Query(..., description="Admin password")):
    """
    Report whether email is configured correctly. Never returns the actual
    API key — only whether it's set, its prefix, and the from/admin addresses.
    Use this first when 'nobody is getting emails' — catches RESEND_API_KEY
    not being in Railway env vars (the most common cause after a redeploy).
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    key = settings.resend_api_key or ""
    return {
        "resend_api_key_configured": bool(key),
        "resend_api_key_prefix": (key[:6] + "…" + key[-3:]) if len(key) >= 10 else None,
        "resend_api_key_length": len(key),
        "email_from": settings.email_from,
        "admin_notify_email": settings.admin_notify_email,
        "frontend_url": settings.frontend_url,
    }


@router.post("/admin/test-email")
async def admin_test_email(
    password: str = Query(..., description="Admin password"),
    to: str = Query(..., description="Recipient email"),
):
    """
    Send a diagnostic test email via Resend and return the exact response
    (status code, body). If this fails, the Pro welcome / magic-link emails
    fail too — they use the same plumbing.
    """
    import httpx

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")
    if not settings.resend_api_key:
        return {"ok": False, "error": "RESEND_API_KEY not configured on backend"}

    html = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <h2>SteamWatch email test</h2>
      <p>If you're reading this, the Resend pipeline is working.</p>
      <p style="color: #64748b; font-size: 12px;">Sent at {datetime.utcnow().isoformat()}Z to {to}.</p>
    </div>
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.email_from,
                "to": [to],
                "reply_to": settings.admin_notify_email,
                "subject": "SteamWatch — email pipeline test",
                "html": html,
            },
        )

    return {
        "ok": response.status_code == 200,
        "status": response.status_code,
        "resend_response": response.json() if response.content else None,
    }


@router.post("/admin/refresh-xg")
async def admin_refresh_xg(password: str = Query(..., description="Admin password")):
    """
    Manually trigger the weekly Understat xG refresh (useful on demand —
    the scheduled run happens every Monday 03:00 UTC).
    """
    from app.services.xg_refresher import xg_refresher

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    summary = await xg_refresher.refresh()
    return summary


@router.post("/admin/refresh-league-constants")
async def admin_refresh_league_constants(password: str = Query(..., description="Admin password")):
    """
    Manually trigger the weekly league constants recompute (useful on
    demand — the scheduled run happens every Monday 10:00 UTC).
    """
    from app.services.league_constants_refresher import league_constants_refresher

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    summary = await league_constants_refresher.refresh()
    return summary


@router.post("/admin/refresh-power-rankings")
async def admin_refresh_power_rankings(password: str = Query(..., description="Admin password")):
    """
    Manually trigger the weekly cross-league power ranking recompute
    (useful on demand — the scheduled run happens every Monday 10:30 UTC).
    """
    from app.services.power_ranking_fitter import power_ranking_fitter

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    summary = await power_ranking_fitter.refresh()
    return summary


@router.get("/admin/list-bookmakers")
async def admin_list_bookmakers(
    password: str = Query(..., description="Admin password"),
    league: str = Query("soccer_epl", description="Sport key to query"),
    db: Session = Depends(get_db),
):
    """
    Hit The Odds API for the next upcoming match in the given league with
    regions=eu,uk and report every bookmaker that currently returns h2h
    prices. Use this to verify which books power the 'Best price' line in
    syndicate alerts.
    """
    import httpx as _httpx

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    if not settings.odds_api_key:
        return {"error": "ODDS_API_KEY not configured"}

    # Pick the next match for that league from our DB to use as the eventId.
    next_match = (
        db.query(Match)
        .filter(Match.sport_key == league)
        .filter(Match.commence_time > datetime.utcnow())
        .order_by(Match.commence_time.asc())
        .first()
    )
    if not next_match:
        return {"error": f"No upcoming match for {league}"}

    url = f"{settings.odds_api_base_url}/sports/{league}/odds"
    params = {
        "apiKey": settings.odds_api_key,
        "regions": "eu,uk",
        "markets": "h2h",
        "eventIds": next_match.id,
        "oddsFormat": "decimal",
    }

    try:
        async with _httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            events = resp.json()
    except Exception as e:
        return {"error": f"Odds API call failed: {e}"}

    if not events:
        return {"error": "No event returned"}

    event = events[0]
    bookmakers = event.get("bookmakers") or []

    # Per-bookmaker prices for the home outcome (just for visibility)
    rows = []
    for bm in bookmakers:
        title = bm.get("title") or bm.get("key")
        last_update = bm.get("last_update")
        h2h = next((m for m in (bm.get("markets") or []) if m.get("key") == "h2h"), None)
        prices = {}
        if h2h:
            for o in (h2h.get("outcomes") or []):
                prices[o.get("name")] = o.get("price")
        rows.append({
            "title": title,
            "key": bm.get("key"),
            "last_update": last_update,
            "prices": prices,
        })

    return {
        "match": f"{next_match.home_team} vs {next_match.away_team}",
        "match_id": next_match.id,
        "league": league,
        "regions_requested": "eu,uk",
        "bookmaker_count": len(rows),
        "bookmakers": rows,
    }


@router.post("/admin/reconcile-stripe")
async def admin_reconcile_stripe(password: str = Query(..., description="Admin password")):
    """
    Manually run the Stripe reconciler (auto-runs every 10 min). Pulls
    every active Stripe subscription, creates missing users, activates
    missing local subscriptions, emails magic links + admin alerts.
    Useful right after noticing a customer isn't active.
    """
    from app.services.stripe_reconciler import stripe_reconciler

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    summary = await stripe_reconciler.reconcile()
    return summary


@router.post("/admin/import-football-data")
async def admin_import_football_data(
    password: str = Query(..., description="Admin password"),
    league: str = Query(
        "soccer_epl",
        description="Sport key — e.g. 'soccer_epl' or 'soccer_italy_serie_a'.",
    ),
    seasons: Optional[str] = Query(
        None,
        description="Comma-separated football-data.co.uk season codes (e.g. '2425,2526'). Default: last 5 seasons + current.",
    ),
):
    """
    Pull match results + Pinnacle closing prices from football-data.co.uk
    for the requested league and upsert into historical_matches. Re-run
    any time during the current season to refresh; older seasons are
    static. Supported leagues are listed in
    football_data_importer.LEAGUE_FILE_CODES.
    """
    from app.services.football_data_importer import import_seasons

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    season_list = None
    if seasons:
        season_list = [s.strip() for s in seasons.split(",") if s.strip()]

    summary = await import_seasons(league_key=league, seasons=season_list)
    return summary


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

    Returns ALL pre-kickoff snapshots in time order. The fetcher only stores
    Pinnacle's current main line (one row per fetch), so when the line
    shifts (e.g. 2.5 → 2.75) consecutive points carry different `line`
    values. The chart uses that to render a clear visual transition.
    """
    match = db.query(Match).filter(Match.id == match_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    snapshots = (
        db.query(TotalsSnapshot)
        .filter(TotalsSnapshot.match_id == match_id)
        .filter(TotalsSnapshot.fetched_at < match.commence_time)
        .order_by(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
        .all()
    )

    totals_history = [
        TotalsPoint(
            timestamp=s.fetched_at,
            line=s.line,
            over_odds=s.over_odds,
            under_odds=s.under_odds,
        )
        for s in snapshots
    ]

    return MatchTotalsResponse(
        match_id=match_id,
        totals_history=totals_history
    )


@router.get("/matches/{match_id}/spreads", response_model=MatchSpreadsResponse)
async def get_match_spreads(match_id: str, db: Session = Depends(get_db)):
    """
    Get spreads (Asian Handicap) history for a match.

    Returns ALL pre-kickoff snapshots in time order so the chart can show
    line shifts (e.g. -0.5 → -0.75) as visible transitions.
    """
    match = db.query(Match).filter(Match.id == match_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    snapshots = (
        db.query(SpreadsSnapshot)
        .filter(SpreadsSnapshot.match_id == match_id)
        .filter(SpreadsSnapshot.fetched_at < match.commence_time)
        .order_by(SpreadsSnapshot.fetched_at.asc(), SpreadsSnapshot.id.asc())
        .all()
    )

    spreads_history = [
        SpreadsPoint(
            timestamp=s.fetched_at,
            line=s.line,
            home_odds=s.home_odds,
            away_odds=s.away_odds,
        )
        for s in snapshots
    ]

    return MatchSpreadsResponse(
        match_id=match_id,
        spreads_history=spreads_history
    )


@router.get("/matches/{match_id}/polymarket")
async def get_match_polymarket(match_id: str, db: Session = Depends(get_db)):
    """
    Get Polymarket snapshot history for a match — both pre-KO and in-play.

    Returns the full per-fetch time series of 1X2 YES prices, O/U 2.5
    YES prices, and 24h volume. The in_play flag on each snapshot
    distinguishes pre-game from live points. Powers the per-match
    Polymarket chart on the match detail page.
    """
    from app.models import PolymarketSnapshot

    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    snapshots = (
        db.query(PolymarketSnapshot)
        .filter(PolymarketSnapshot.match_id == match_id)
        .order_by(PolymarketSnapshot.fetched_at.asc(), PolymarketSnapshot.id.asc())
        .all()
    )

    return {
        "match_id": match_id,
        "home_team": match.home_team,
        "away_team": match.away_team,
        "commence_time": match.commence_time.isoformat() + "Z",
        "polymarket_event_slug": match.polymarket_event_slug,
        "snapshots": [
            {
                "timestamp": s.fetched_at.isoformat() + "Z",
                "in_play": s.in_play,
                "home_win_yes": s.home_win_yes,
                "draw_yes": s.draw_yes,
                "away_win_yes": s.away_win_yes,
                "home_win_bid": s.home_win_bid,
                "home_win_ask": s.home_win_ask,
                "draw_bid": s.draw_bid,
                "draw_ask": s.draw_ask,
                "away_win_bid": s.away_win_bid,
                "away_win_ask": s.away_win_ask,
                "over_2_5_yes": s.over_2_5_yes,
                "under_2_5_yes": s.under_2_5_yes,
                "event_volume_24h": s.event_volume_24h,
            }
            for s in snapshots
        ],
    }


@router.get("/polymarket-jumps")
async def get_polymarket_jumps(
    db: Session = Depends(get_db),
    league: Optional[str] = Query(
        None, description="Optional sport_key filter."
    ),
    days: int = Query(7, ge=1, le=60, description="Look back this many days."),
    min_delta_pp: float = Query(
        2.0,
        ge=0,
        le=50,
        description="Minimum absolute implied-prob shift in pp on any 1X2 outcome.",
    ),
    live: bool = Query(
        False,
        description="When true, returns matches currently in-play (commence_time has passed) only.",
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """
    In-play Polymarket movement per match. The Polymarket counterpart to
    /late-steam — but where /late-steam tracks pre-KO Pinnacle Asian
    moves (the closest we can get to a sharp signal pre-game), this
    endpoint tracks actual IN-PLAY sharp money movement on Polymarket,
    the highest-liquidity in-play soccer market we have access to.

    Compares the KO snapshot (the first in_play=True snapshot or the
    final pre-KO snapshot, whichever comes first) against the latest
    in-play snapshot. Reports pp deltas on each 1X2 outcome and the O/U
    2.5 Over price.
    """
    from app.models import PolymarketSnapshot

    now = datetime.utcnow()
    cutoff = now - timedelta(days=days)

    matches_q = db.query(Match).filter(Match.commence_time >= cutoff)
    if live:
        matches_q = matches_q.filter(Match.commence_time <= now)
    if league:
        matches_q = matches_q.filter(Match.sport_key == league)
    matches = matches_q.all()

    def implied_delta(latest, anchor):
        if latest is None or anchor is None:
            return None
        # YES prices on Polymarket ARE the implied probability (0..1 scale).
        # We report in pp on a 0..100 scale to match the rest of the app.
        return round((latest - anchor) * 100, 2)

    matches_seen = 0
    matches_with_snaps = 0
    matches_with_inplay = 0
    results = []

    for match in matches:
        matches_seen += 1

        snaps = (
            db.query(PolymarketSnapshot)
            .filter(PolymarketSnapshot.match_id == match.id)
            .order_by(PolymarketSnapshot.fetched_at.asc(), PolymarketSnapshot.id.asc())
            .all()
        )
        if not snaps:
            continue
        matches_with_snaps += 1

        # Anchor = first in_play snapshot, or last pre-KO snapshot as a
        # fallback. This gives us the cleanest "what was the price as the
        # match was going live" reference point.
        in_play_snaps = [s for s in snaps if s.in_play]
        if not in_play_snaps:
            continue
        matches_with_inplay += 1

        anchor = in_play_snaps[0]
        latest = in_play_snaps[-1]
        # If the anchor IS the latest (only one in-play snapshot), skip —
        # there's no movement to report yet.
        if anchor.id == latest.id:
            continue

        d_home = implied_delta(latest.home_win_yes, anchor.home_win_yes)
        d_draw = implied_delta(latest.draw_yes, anchor.draw_yes)
        d_away = implied_delta(latest.away_win_yes, anchor.away_win_yes)
        d_over = implied_delta(latest.over_2_5_yes, anchor.over_2_5_yes)
        d_under = implied_delta(latest.under_2_5_yes, anchor.under_2_5_yes)

        candidates = []
        if d_home is not None: candidates.append(("home", d_home))
        if d_draw is not None: candidates.append(("draw", d_draw))
        if d_away is not None: candidates.append(("away", d_away))
        if not candidates:
            continue
        biggest_side, biggest_pp = max(candidates, key=lambda kv: abs(kv[1]))
        if abs(biggest_pp) < min_delta_pp:
            continue

        minutes_since_ko = round(
            (latest.fetched_at - match.commence_time).total_seconds() / 60, 1
        )

        results.append({
            "match_id": match.id,
            "home_team": match.home_team,
            "away_team": match.away_team,
            "sport_key": match.sport_key,
            "league_name": match.league_name,
            "commence_time": match.commence_time.isoformat() + "Z",
            "polymarket_event_slug": match.polymarket_event_slug,
            "minutes_since_ko": minutes_since_ko,
            "biggest_side": biggest_side,
            "biggest_pp": biggest_pp,
            "anchor": {
                "home_win_yes": anchor.home_win_yes,
                "draw_yes": anchor.draw_yes,
                "away_win_yes": anchor.away_win_yes,
                "over_2_5_yes": anchor.over_2_5_yes,
                "under_2_5_yes": anchor.under_2_5_yes,
                "fetched_at": anchor.fetched_at.isoformat() + "Z",
            },
            "latest": {
                "home_win_yes": latest.home_win_yes,
                "draw_yes": latest.draw_yes,
                "away_win_yes": latest.away_win_yes,
                "over_2_5_yes": latest.over_2_5_yes,
                "under_2_5_yes": latest.under_2_5_yes,
                "fetched_at": latest.fetched_at.isoformat() + "Z",
            },
            "deltas_pp": {
                "home": d_home,
                "draw": d_draw,
                "away": d_away,
                "over_2_5": d_over,
                "under_2_5": d_under,
            },
            "event_volume_24h": latest.event_volume_24h,
        })

    results.sort(key=lambda r: abs(r["biggest_pp"]), reverse=True)

    return {
        "league": league,
        "days_back": days,
        "min_delta_pp": min_delta_pp,
        "live": live,
        "matches_seen": matches_seen,
        "matches_with_snaps": matches_with_snaps,
        "matches_with_inplay": matches_with_inplay,
        "matches_with_jumps": len(results),
        "jumps": results[:limit],
    }


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


@router.get("/admin/tweet-diagnostics")
async def get_tweet_diagnostics(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db),
):
    """
    Diagnostic endpoint: recent posted_tweets rows, plus a per-match gate
    check for the closing_line / inplay_recap significance thresholds so
    we can tell 'nothing fired because nothing moved' apart from 'nothing
    fired because something is broken' without guessing.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")

    from datetime import timedelta
    from app.models import PostedTweet
    from app.services.tweet_generator import (
        _max_1x2_move_pp, _totals_significant, _spreads_significant,
        SIGNIFICANCE_THRESHOLD_PP, TotalsBlock, SpreadsBlock,
    )

    now = datetime.utcnow()
    seven_days_ago = now - timedelta(days=7)

    recent_tweets = (
        db.query(PostedTweet)
        .filter(PostedTweet.posted_at >= seven_days_ago)
        .order_by(desc(PostedTweet.posted_at))
        .limit(30)
        .all()
    )

    # Matches whose closing-line tweet window (KO-20 to KO-10) or in-play
    # recap window (KO+8 to KO+15) is currently active, or was active in
    # the last 24h — same windows tweet_check_job uses.
    lookback = now - timedelta(hours=24)
    lookahead = now + timedelta(hours=24)
    candidates = (
        db.query(Match)
        .filter(Match.commence_time >= lookback)
        .filter(Match.commence_time <= lookahead)
        .all()
    )

    gate_checks = []
    for m in candidates:
        window_start = m.commence_time - timedelta(hours=12)
        latest = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == m.id)
            .filter(OddsSnapshot.in_play == False)  # noqa: E712
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )
        opening = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == m.id)
            .filter(OddsSnapshot.in_play == False)  # noqa: E712
            .filter(OddsSnapshot.fetched_at >= window_start)
            .order_by(OddsSnapshot.fetched_at.asc())
            .first()
        )
        max_1x2 = _max_1x2_move_pp(opening, latest) if (opening and latest) else 0.0

        # _totals_block/_spreads_block pull the single latest-ever snapshot
        # with no upper time bound — correct for the live tweet job (which
        # only ever runs pre-kickoff, so 'latest' is naturally pre-KO at
        # call time) but WRONG here: calling this endpoint after a match
        # has finished can pull in-play/settled data that was never visible
        # during the actual pre-KO decision window, producing a
        # significance verdict that doesn't reflect what really happened.
        # Rebuild both blocks constrained to fetched_at < commence_time so
        # the check is historically accurate regardless of when we run it.
        totals_opening = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == m.id)
            .filter(TotalsSnapshot.fetched_at >= window_start)
            .filter(TotalsSnapshot.fetched_at < m.commence_time)
            .order_by(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
            .first()
        )
        totals_closing = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == m.id)
            .filter(TotalsSnapshot.fetched_at < m.commence_time)
            .order_by(TotalsSnapshot.fetched_at.desc(), TotalsSnapshot.id.desc())
            .first()
        )
        totals = TotalsBlock(
            open_line=totals_opening.line if totals_opening else None,
            open_over=totals_opening.over_odds if totals_opening else None,
            open_under=totals_opening.under_odds if totals_opening else None,
            close_line=totals_closing.line if totals_closing else None,
            close_over=totals_closing.over_odds if totals_closing else None,
            close_under=totals_closing.under_odds if totals_closing else None,
        ) if (totals_opening or totals_closing) else None

        spreads_opening = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == m.id)
            .filter(SpreadsSnapshot.fetched_at >= window_start)
            .filter(SpreadsSnapshot.fetched_at < m.commence_time)
            .order_by(SpreadsSnapshot.fetched_at.asc(), SpreadsSnapshot.id.asc())
            .first()
        )
        spreads_closing = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == m.id)
            .filter(SpreadsSnapshot.fetched_at < m.commence_time)
            .order_by(SpreadsSnapshot.fetched_at.desc(), SpreadsSnapshot.id.desc())
            .first()
        )
        spreads = SpreadsBlock(
            open_line=spreads_opening.line if spreads_opening else None,
            open_home=spreads_opening.home_odds if spreads_opening else None,
            open_away=spreads_opening.away_odds if spreads_opening else None,
            close_line=spreads_closing.line if spreads_closing else None,
            close_home=spreads_closing.home_odds if spreads_closing else None,
            close_away=spreads_closing.away_odds if spreads_closing else None,
        ) if (spreads_opening or spreads_closing) else None

        totals_sig = _totals_significant(totals)
        spreads_sig = _spreads_significant(spreads)
        # No closing_line tweet type anymore (removed 2026-07-08 — SteamWatch
        # is followed for big moves, not routine pre-KO snapshots). These
        # figures are kept as general move-size diagnostics — useful context
        # for understanding whether late_steam/Telegram should have fired —
        # not a verdict on a tweet gate that no longer exists.
        gate_checks.append({
            "match_id": m.id,
            "match": f"{m.home_team} vs {m.away_team}",
            "commence_time": m.commence_time.isoformat() + "Z",
            "max_1x2_move_pp": round(max_1x2, 2),
            "totals_significant": totals_sig,
            "spreads_significant": spreads_sig,
        })

    gate_checks.sort(key=lambda x: x["commence_time"])

    return {
        "now_utc": now.isoformat(),
        "significance_threshold_pp": SIGNIFICANCE_THRESHOLD_PP,
        "recent_tweets": [
            {
                "match_id": t.match_id,
                "tweet_type": t.tweet_type,
                "tweet_id": t.tweet_id,
                "posted_at": t.posted_at.isoformat(),
            }
            for t in recent_tweets
        ],
        "match_gate_checks": gate_checks,
    }


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

    from app.services.syndicate_alerter import (
        SYNDICATE_THRESHOLD_PROB_POINTS,
        SYNDICATE_ALERT_WINDOW_MINUTES,
        LEAGUE_OVERRIDES,
    )

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

    # Upcoming matches within the alert window (what the alerter actually
    # checks — this diagnostic doesn't apply per-league LEAGUE_OVERRIDES,
    # so it can differ slightly for an overridden league, but matches the
    # global default used by everything else).
    alert_window_end = now + timedelta(minutes=SYNDICATE_ALERT_WINDOW_MINUTES)
    upcoming_matches = (
        db.query(Match)
        .filter(Match.commence_time > now)
        .filter(Match.commence_time <= alert_window_end)
        .all()
    )

    # For each upcoming match, check biggest prob move within the alert window
    match_moves = []
    for match in upcoming_matches:
        window_start = match.commence_time - timedelta(minutes=SYNDICATE_ALERT_WINDOW_MINUTES)

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
                        "would_alert": prob_move >= SYNDICATE_THRESHOLD_PROB_POINTS
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
                        # Totals alerts are disabled (1X2 only, 2026-08-14) —
                        # shown for visibility, never actually fires.
                        "would_alert": False,
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
                        # Spreads alerts are disabled (1X2 only, 2026-08-14) —
                        # shown for visibility, never actually fires.
                        "would_alert": False,
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
        "threshold_pp_default": SYNDICATE_THRESHOLD_PROB_POINTS,
        "league_overrides": LEAGUE_OVERRIDES,
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

def _latest_xg_season(db: Session, league: str) -> Optional[str]:
    """
    Most recent season present for a league (e.g. '2526'). Season codes
    are consecutive 4-digit strings (YYyy) so a plain string MAX() sorts
    correctly across any realistic range. Returns None if the league has
    no xG data at all.
    """
    return db.query(func.max(XGData.season)).filter(XGData.league == league).scalar()


@router.get("/xg-data/teams", response_model=XGTeamsResponse)
async def get_xg_teams(
    db: Session = Depends(get_db),
    league: str = Query(..., description="Sport key e.g. soccer_epl"),
    season: Optional[str] = Query(None, description="Season code e.g. '2526'. Default: most recent season for this league."),
):
    """Return distinct team names that have xG data for a league+season."""
    target_season = season or _latest_xg_season(db, league)
    if target_season is None:
        return XGTeamsResponse(teams=[])
    rows = (
        db.query(XGData.team_name)
        .filter(XGData.league == league, XGData.season == target_season)
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
    season: Optional[str] = Query(None, description="Season code e.g. '2526'. Default: most recent season for this league."),
):
    """Return all match-level npxG data for a team+season, ordered by match number."""
    target_season = season or _latest_xg_season(db, league)
    if target_season is None:
        return XGDataResponse(team_name=team, league=league, data=[])
    rows = (
        db.query(XGData)
        .filter(XGData.league == league, XGData.team_name == team, XGData.season == target_season)
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
    season: str = Query(..., description="Season code this CSV covers, e.g. '2526'. Required — scopes the replace so other seasons are never touched."),
    file: UploadFile = File(...),
):
    """
    Bulk upload xG data from CSV.
    CSV columns: league,team_name,match_number,npxg_for,npxg_against,match_date
    Replaces existing data for each (league, season) pair found in the
    CSV — scoped to `season` so uploading a new season never deletes a
    prior one (pre-2026-07-12 this deleted the whole league regardless
    of season, which is exactly the collision this parameter prevents).
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
            "season": season,
            "match_number": int(row["match_number"]),
            "npxg_for": float(row["npxg_for"]),
            "npxg_against": float(row["npxg_against"]),
            "match_date": date_type.fromisoformat(row["match_date"].strip()),
        })

    # Delete existing data for those (league, season) pairs, then insert fresh
    for league in leagues_seen:
        db.query(XGData).filter(XGData.league == league, XGData.season == season).delete()

    db.bulk_insert_mappings(XGData, rows)
    db.commit()

    return {"success": True, "rows_inserted": len(rows), "leagues_updated": list(leagues_seen), "season": season}


@router.get("/admin/users")
async def admin_list_users(
    password: str = Query(..., description="Admin password"),
    db: Session = Depends(get_db)
):
    """Admin: list all users with subscription status."""
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    from app.models.user import User
    from app.models.subscription import Subscription

    users = db.query(User).all()
    result = []
    for u in users:
        sub = db.query(Subscription).filter(Subscription.user_id == u.id).first()
        result.append({
            "id": u.id,
            "email": u.email,
            "stripe_customer_id": u.stripe_customer_id,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "subscription": {
                "status": sub.status,
                "stripe_subscription_id": sub.stripe_subscription_id,
                "current_period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
                "cancel_at_period_end": sub.cancel_at_period_end if sub else None,
            } if sub else None,
        })

    return {"users": result, "total": len(result)}


@router.post("/admin/fix-subscription")
async def admin_fix_subscription(
    password: str = Query(..., description="Admin password"),
    email: str = Query(..., description="User email to fix"),
    db: Session = Depends(get_db)
):
    """Admin: manually activate a user's subscription by looking up their Stripe customer."""
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    from app.models.user import User
    from app.models.subscription import Subscription

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User {email} not found")

    try:
        import stripe as stripe_lib
        settings_local = get_settings()
        stripe_lib.api_key = settings_local.stripe_secret_key

        # If user has no stripe_customer_id, search Stripe by email
        if not user.stripe_customer_id:
            customers = stripe_lib.Customer.list(email=email, limit=1)
            if customers.data:
                user.stripe_customer_id = customers.data[0].id
                db.commit()
            else:
                raise HTTPException(status_code=404, detail=f"No Stripe customer found for {email}")

        # Look up active subscriptions for this customer
        subs = stripe_lib.Subscription.list(customer=user.stripe_customer_id, status="active", limit=1)
        if not subs.data:
            subs = stripe_lib.Subscription.list(customer=user.stripe_customer_id, limit=1)

        if not subs.data:
            raise HTTPException(status_code=404, detail=f"No Stripe subscription found for {email}")

        stripe_sub = subs.data[0]

        # Create or update local subscription record
        sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
        if not sub:
            sub = Subscription(user_id=user.id)
            db.add(sub)

        sub.stripe_subscription_id = stripe_sub.id
        sub.status = stripe_sub.status
        sub.current_period_end = datetime.utcfromtimestamp(stripe_sub.current_period_end) if stripe_sub.current_period_end else None
        sub.cancel_at_period_end = stripe_sub.cancel_at_period_end
        db.commit()

        return {
            "fixed": True,
            "email": email,
            "subscription_status": sub.status,
            "stripe_subscription_id": sub.stripe_subscription_id,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        # Fallback: just force-activate if Stripe lookup fails
        sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
        if not sub:
            sub = Subscription(user_id=user.id)
            db.add(sub)
        sub.status = "active"
        db.commit()
        return {
            "fixed": True,
            "email": email,
            "subscription_status": "active",
            "note": f"Force-activated (Stripe lookup failed: {str(e)})",
        }


@router.post("/admin/force-activate")
@router.get("/admin/force-activate")
async def admin_force_activate(
    password: str = Query(..., description="Admin password"),
    email: str = Query(..., description="User email to activate"),
    db: Session = Depends(get_db)
):
    """Admin: force-activate a subscription. Creates the user and sends a
    magic link automatically if they don't have an account yet (e.g. they
    paid via a Stripe Payment Link without signing up on the site first).
    Accepts GET too so you can paste the URL in a browser.
    """
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid admin password")

    import secrets
    from datetime import datetime, timedelta
    from app.models.user import User
    from app.models.subscription import Subscription
    from app.models.magic_link import MagicLink
    from app.services.email_sender import email_sender
    from app.config import get_settings as _gs

    email = email.lower().strip()
    settings = _gs()
    created_user = False

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)
        created_user = True

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    if not sub:
        sub = Subscription(user_id=user.id)
        db.add(sub)

    sub.status = "active"
    # Force-activate is an admin grant. Clear any stale Stripe subscription
    # link so the reconciler correctly identifies this as a manual comp
    # (it skips users with NULL stripe_subscription_id). If they later
    # subscribe through Stripe legitimately, the webhook will repopulate this.
    sub.stripe_subscription_id = None
    db.commit()

    # If we just created them, send a magic sign-in link so they can log in.
    magic_link_sent = False
    if created_user:
        try:
            token = secrets.token_urlsafe(32)
            link = MagicLink(
                email=email,
                token=token,
                expires_at=datetime.utcnow() + timedelta(minutes=settings.magic_link_expiry_minutes),
            )
            db.add(link)
            db.commit()
            magic_link_sent = await email_sender.send_magic_link(email, token)
        except Exception:
            pass

    return {
        "activated": True,
        "email": email,
        "user_id": user.id,
        "user_created": created_user,
        "magic_link_sent": magic_link_sent,
    }


# =============================================================================
# FORECAST ENGINE (/forecast) — controlled-source season/match forecasts.
# See app/services/forecast/ for the engine; registry.py is the contract
# for what a forecast may consult.
# =============================================================================

@router.get("/forecast/registry")
async def get_forecast_registry():
    """
    The forecast engine's source registry — every source a forecast can
    draw on, and nothing else. The /forecast page renders exactly these
    nodes in its research-swarm view.
    """
    from app.services.forecast import SOURCES, ENGINE_VERSION
    return {"engine_version": ENGINE_VERSION, "sources": SOURCES}


@router.get("/forecast/recent")
async def get_recent_forecasts(
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db),
):
    """Most recent successful forecast runs (the public ledger)."""
    import json as _json
    from app.models import Forecast

    rows = (
        db.query(Forecast)
        .filter(Forecast.status == "ok")
        .order_by(desc(Forecast.created_at))
        .limit(limit)
        .all()
    )
    return {
        "forecasts": [
            {
                "id": r.id,
                "question": r.question,
                "kind": r.kind,
                "league": r.league,
                "created_at": r.created_at.isoformat(),
                "payload": _json.loads(r.payload),
            }
            for r in rows
        ]
    }


@router.get("/forecast/{forecast_id}")
async def get_forecast(forecast_id: int, db: Session = Depends(get_db)):
    import json as _json
    from app.models import Forecast

    row = db.query(Forecast).filter(Forecast.id == forecast_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Forecast not found")
    payload = _json.loads(row.payload)
    payload["id"] = row.id
    payload["created_at"] = row.created_at.isoformat()
    return payload


@router.post("/forecast")
def create_forecast(
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Run the forecast engine on a natural-language question. Deliberately
    a sync `def` route: the Monte Carlo is CPU-bound, so FastAPI runs it
    on the threadpool instead of blocking the event loop.

    Every run — including unsupported/error outcomes — is persisted to
    the forecasts ledger for auditability.
    """
    from app.models import Forecast
    from app.services.forecast import run_forecast
    from app.services.forecast.engine import serialize_payload

    question = (body.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="question is required")
    if len(question) > 300:
        raise HTTPException(status_code=422, detail="question too long (300 chars max)")

    try:
        payload = run_forecast(db, question)
    except Exception as e:
        import structlog as _structlog
        _structlog.get_logger().error("forecast run failed", question=question, error=str(e))
        raise HTTPException(status_code=500, detail="Forecast engine error")

    row = Forecast(
        question=question,
        kind=payload["kind"],
        league=payload.get("league"),
        status=payload["status"],
        engine_version=payload["engine_version"],
        duration_ms=payload.get("duration_ms", 0),
        payload=serialize_payload(payload),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    payload["id"] = row.id
    payload["created_at"] = row.created_at.isoformat()
    return payload
