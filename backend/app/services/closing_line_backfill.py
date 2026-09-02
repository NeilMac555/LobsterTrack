"""
Fill historical_matches Pinnacle prices from SteamWatch's own closing-line
capture.

Why this exists (2026-09-02): football-data.co.uk stopped publishing
Pinnacle columns in mid-January 2026 and its 2026/27 files don't carry
them at all, so every page built on historical_matches (Longshot Bias,
its per-team view, Team P/L) ran out of priced matches at 7-15 January.
Our own closing_line_capturer has recorded Pinnacle 1X2 closes for every
tracked match since February 2026 — the exact matches that were missing.

football-data still supplies RESULTS reliably (weekly import), so the
model is: football-data gives the match + result, we give the price.
This job joins our H2H close onto any historical row that has a result
but no price, matched on league + both team names + kickoff date within
a day (kickoffs are stored in UTC; football-data dates are local).

Rows filled this way carry price_source='steamwatch_close' so provenance
stays visible, and football_data_importer leaves those prices alone when
its CSV row has no Pinnacle columns (see the guard there).
"""
from datetime import timedelta

import structlog
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ClosingLine, Match
from app.models.closing_line import MarketType
from app.models.historical_match import HistoricalMatch

logger = structlog.get_logger()

PRICE_SOURCE = "steamwatch_close"

# Leagues with historical_matches coverage. Europe isn't in
# historical_matches at all (no public history to seed it), so it's out
# of scope here — that's a separate build.
HISTORY_LEAGUES = [
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
]


def fill_historical_prices(db: Session, leagues: list[str] | None = None) -> dict:
    """Fill psch/pscd/psca on result-bearing historical rows that lack a
    price, using our own H2H closing lines. Idempotent: rows already
    priced (from any source) are never touched. Returns per-league
    counts of candidates, filled, and still-missing."""
    leagues = leagues or HISTORY_LEAGUES
    summary: dict[str, dict] = {}

    for league in leagues:
        candidates = (
            db.query(HistoricalMatch)
            .filter(HistoricalMatch.league == league)
            .filter(HistoricalMatch.ftr.isnot(None))
            .filter(HistoricalMatch.psch.is_(None))
            .all()
        )
        if not candidates:
            summary[league] = {"candidates": 0, "filled": 0, "unmatched": 0}
            continue

        # One query for every H2H close in this league, keyed by
        # (home, away, kickoff date). Kickoffs are UTC; a Saturday 20:00
        # UK match is the same calendar day either way, but a late
        # continental kickoff can roll past midnight UTC, hence the
        # ±1 day tolerance at lookup time.
        closes = (
            db.query(
                Match.home_team, Match.away_team, func.date(Match.commence_time),
                ClosingLine.close_home, ClosingLine.close_draw, ClosingLine.close_away,
            )
            .join(Match, Match.id == ClosingLine.match_id)
            .filter(Match.sport_key == league)
            .filter(ClosingLine.market_type == MarketType.H2H)
            .filter(ClosingLine.close_home.isnot(None))
            .filter(ClosingLine.close_draw.isnot(None))
            .filter(ClosingLine.close_away.isnot(None))
            .all()
        )
        lookup: dict[tuple, tuple[float, float, float]] = {}
        for home, away, kick_date, ch, cd, ca in closes:
            lookup[(home, away, kick_date)] = (float(ch), float(cd), float(ca))

        filled = 0
        for row in candidates:
            hit = None
            for delta in (0, 1, -1):
                hit = lookup.get((row.home_team, row.away_team, row.match_date + timedelta(days=delta)))
                if hit:
                    break
            if not hit:
                continue
            row.psch, row.pscd, row.psca = hit
            row.price_source = PRICE_SOURCE
            filled += 1

        db.commit()
        summary[league] = {
            "candidates": len(candidates),
            "filled": filled,
            "unmatched": len(candidates) - filled,
        }
        logger.info("Historical price fill", league=league, **summary[league])

    return summary
