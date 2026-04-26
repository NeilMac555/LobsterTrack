"""
Best-price lookup across all bookmakers for a single match.

When a syndicate alert fires (Pinnacle has just moved 3+pp on an
outcome), we want to tell users 'here's where you can still get
the OLD price'. The Odds API exposes per-bookmaker odds in the
same /sports/{sport}/odds endpoint we already use — we just have
to ask for multiple regions and skip the bookmakers filter.

This module is intentionally minimal: one async function, called
once per alert. Quota cost is roughly 2 units per call (eu + uk
regions × one market). Alerts are rare, so quota is negligible.
"""

from __future__ import annotations

import structlog
from typing import Literal, Optional

import httpx

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# Map our internal market name → The Odds API's market key.
_MARKET_KEY = {
    "1x2": "h2h",
    "totals": "totals",
    "spreads": "spreads",
}

# How an alert's outcome string maps onto the Odds API's outcome 'name'.
# The Odds API returns 'name' as the team name for h2h-home/away, the
# string 'Draw' for the draw, 'Over' / 'Under' for totals, and the team
# name for spreads (with the line in 'point').


def _matches_outcome(
    api_outcome: dict,
    market: str,
    our_outcome: str,           # 'home' / 'draw' / 'away' / 'over' / 'under' / 'home_spread' / 'away_spread'
    home_team: str,
    away_team: str,
    line: Optional[float] = None,
) -> bool:
    """Return True if this Odds-API outcome row corresponds to the alerted side."""
    api_name = (api_outcome.get("name") or "").strip()

    if market == "1x2":
        if our_outcome == "home":
            return api_name == home_team
        if our_outcome == "away":
            return api_name == away_team
        if our_outcome == "draw":
            return api_name.lower() == "draw"
        return False

    if market == "totals":
        # Totals also need the line to match — different bookmakers offer
        # different lines (2.5, 2.75 etc) and we should only compare like
        # for like.
        api_point = api_outcome.get("point")
        if line is not None and api_point is not None:
            try:
                if abs(float(api_point) - float(line)) > 0.01:
                    return False
            except (TypeError, ValueError):
                return False
        if our_outcome == "over":
            return api_name.lower() == "over"
        if our_outcome == "under":
            return api_name.lower() == "under"
        return False

    if market == "spreads":
        # Asian Handicap — match by team AND line.
        api_point = api_outcome.get("point")
        if line is not None and api_point is not None:
            try:
                # For away_spread the API line is negative of home, so flip
                # if we're checking the away side.
                expected = line if our_outcome == "home_spread" else -line
                if abs(float(api_point) - float(expected)) > 0.01:
                    return False
            except (TypeError, ValueError):
                return False
        team = home_team if our_outcome == "home_spread" else away_team
        return api_name == team

    return False


async def find_best_alternative_price(
    sport_key: str,
    event_id: str,
    market: Literal["1x2", "totals", "spreads"],
    outcome: str,
    home_team: str,
    away_team: str,
    line: Optional[float] = None,
    pinnacle_price: Optional[float] = None,
) -> Optional[dict]:
    """
    Hit The Odds API for a single match across multiple regions and find
    the highest available odds for the alerted outcome.

    Returns:
      { "price": 2.62, "bookmaker": "William Hill", "all": [{book, price}, ...] }
      or None if anything goes wrong / no alternative found.

    Always best-effort. Failure is logged but never raised — the alert
    must still go out without best-price info if this fails.
    """
    if not settings.odds_api_key:
        return None

    api_market = _MARKET_KEY.get(market)
    if not api_market:
        return None

    url = f"{settings.odds_api_base_url}/sports/{sport_key}/odds"
    params = {
        "apiKey": settings.odds_api_key,
        "regions": "eu,uk",       # cover Pinnacle EU + the major UK books
        "markets": api_market,
        "eventIds": event_id,
        "oddsFormat": "decimal",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            events = resp.json()
    except Exception as e:
        logger.warning("best_price_lookup: API call failed", error=str(e))
        return None

    if not events:
        return None

    event = events[0]
    bookmakers = event.get("bookmakers") or []

    candidates: list[tuple[float, str]] = []
    for bm in bookmakers:
        title = bm.get("title") or bm.get("key") or "?"
        for mkt in (bm.get("markets") or []):
            if mkt.get("key") != api_market:
                continue
            for o in (mkt.get("outcomes") or []):
                if not _matches_outcome(o, market, outcome, home_team, away_team, line):
                    continue
                price = o.get("price")
                if price is None:
                    continue
                try:
                    candidates.append((float(price), title))
                except (TypeError, ValueError):
                    continue

    if not candidates:
        return None

    # Sort high-to-low so [0] is the best price.
    candidates.sort(key=lambda t: t[0], reverse=True)
    best_price, best_book = candidates[0]

    # Skip if the best price isn't actually better than Pinnacle's current
    # price — telling users 'best price: 2.45 @ Pinnacle' when Pinnacle is
    # exactly what just moved adds no value.
    if pinnacle_price is not None and best_price <= float(pinnacle_price) + 1e-6:
        return None

    return {
        "price": best_price,
        "bookmaker": best_book,
        "all": [{"book": bk, "price": p} for p, bk in candidates],
    }
