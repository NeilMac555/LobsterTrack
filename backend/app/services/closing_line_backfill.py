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

# Last-resort source for matches neither football-data's Pinnacle columns
# nor our own capture priced — in practice the ~200 matches across the
# five leagues between football-data's last Pinnacle price (mid-Jan 2026)
# and our capture starting on 12 Feb 2026. football-data kept publishing
# closing prices for other books throughout; Neil chose the Betfair
# Exchange close (BFECH/BFECD/BFECA) on 2026-09-02. NOTE: exchange prices
# are quoted before commission, so they run marginally better than
# Pinnacle's — these rows are slightly flattered, never understated.
# Tagged so provenance stays visible per row.
EXCHANGE_PRICE_SOURCE = "betfair_exchange_close"

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


async def fill_from_exchange_close(db: Session, leagues: list[str] | None = None) -> dict:
    """Second pass: for result-bearing rows STILL unpriced after
    fill_historical_prices, take the Betfair Exchange closing 1X2 price
    from the football-data.co.uk CSV for that league + season. Only
    seasons that actually have unpriced rows are fetched. Idempotent."""
    from app.services.football_data_importer import _fetch_csv, _parse_date, _parse_float
    from app.services.team_name_normalizer import normalize_team_name
    import csv
    import io

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

        filled = 0
        for season in sorted({r.season for r in candidates}):
            try:
                csv_text = await _fetch_csv(league, season)
            except Exception as e:  # one bad file mustn't kill the others
                logger.warning("Exchange fill: CSV fetch failed", league=league, season=season, error=str(e))
                continue
            lookup: dict[tuple, tuple[float, float, float]] = {}
            for row in csv.DictReader(io.StringIO(csv_text)):
                h = normalize_team_name((row.get("HomeTeam") or "").strip(), league)
                a = normalize_team_name((row.get("AwayTeam") or "").strip(), league)
                d = _parse_date(row.get("Date", ""))
                bh, bd, ba = (_parse_float(row.get(c, "")) for c in ("BFECH", "BFECD", "BFECA"))
                if h and a and d and bh and bd and ba and bh > 1 and bd > 1 and ba > 1:
                    lookup[(d, h, a)] = (bh, bd, ba)
            for r in candidates:
                if r.season != season or r.psch is not None:
                    continue
                hit = lookup.get((r.match_date, r.home_team, r.away_team))
                if not hit:
                    continue
                r.psch, r.pscd, r.psca = hit
                r.price_source = EXCHANGE_PRICE_SOURCE
                filled += 1
        db.commit()
        summary[league] = {
            "candidates": len(candidates),
            "filled": filled,
            "unmatched": len(candidates) - filled,
        }
        logger.info("Exchange close fill", league=league, **summary[league])

    return summary
