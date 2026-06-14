"""
Score fetcher — hits The Odds API's /sports/{sport}/scores endpoint
so we can detect early goals on in-play matches.

Used by the scheduler's T+5 one-shot to ask "has anybody scored in
the first 5 minutes of this match?" — if yes, we mark the Match
with early_goal_minute=5 and the /in-play-jumps view filters it out
by default (the price swing from an early goal is the market
reacting to obvious public info, not a sharp-money signal).

The /scores endpoint costs 1 unit per call regardless of region or
market, so this is cheap. We only call it once per match (at T+5).
"""

from __future__ import annotations

import structlog
from typing import Optional

import httpx

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


async def fetch_total_score(sport_key: str, match_id: str) -> Optional[int]:
    """
    Hit /sports/{sport_key}/scores and return the sum of home + away
    goals for the given match_id. Returns None on any error or if the
    match isn't present in the response (e.g. The Odds API hasn't yet
    started reporting scores for it).

    The scores endpoint returns a list of events; we find the one with
    matching id and add up the per-team scores. Scores arrive as
    strings in the API ("0", "1", etc.) so we coerce explicitly.
    """
    if not settings.odds_api_key:
        return None

    url = f"{settings.odds_api_base_url}/sports/{sport_key}/scores"
    params = {
        "apiKey": settings.odds_api_key,
        # daysFrom limits how far back we report completed matches.
        # 1 is enough — we only care about matches that just kicked off.
        "daysFrom": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            events = resp.json()
    except Exception as e:
        logger.warning("score_fetcher: API call failed",
                       sport_key=sport_key, error=str(e))
        return None

    if not isinstance(events, list):
        return None

    event = next((e for e in events if e.get("id") == match_id), None)
    if event is None:
        # Match hasn't been picked up by the scores endpoint yet —
        # treat as no info, not as no goal.
        return None

    scores = event.get("scores") or []
    if not scores:
        # Goalless, OR no score data published yet. Returning 0 is fine
        # because the caller compares > 0 to decide 'early goal'; we
        # accept the tiny false-negative risk on the very first
        # snapshot if scores haven't been published yet.
        return 0

    total = 0
    for s in scores:
        raw = s.get("score")
        if raw is None:
            continue
        try:
            total += int(str(raw).strip())
        except (TypeError, ValueError):
            continue
    return total
