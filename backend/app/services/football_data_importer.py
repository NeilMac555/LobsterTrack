"""
Pull historical match results + Pinnacle closing prices from
football-data.co.uk and upsert into the historical_matches table.

Multi-league: each supported league maps to a football-data.co.uk
file code (E0 for EPL, I1 for Serie A, etc.). The CSV format is
identical across leagues; only the team-name canonical map differs.

Columns we care about:
  Date       — DD/MM/YYYY (older) or DD/MM/YY (newer); we parse both.
  HomeTeam   — football-data.co.uk's spelling (normalized per league)
  AwayTeam   — same
  FTHG, FTAG — full-time goals
  FTR        — H | D | A
  PSCH/PSCD/PSCA — Pinnacle CLOSING 1X2 prices  ← what ROI is calculated against
  PSH/PSD/PSA    — Pinnacle OPENING 1X2 prices  ← fallback when close is missing

If a row is missing both close and open we still write it (so match counts
stay accurate) but flag price_source='missing' — the P/L aggregation will
exclude such rows from staked-volume totals.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import Optional

import httpx
import structlog
from sqlalchemy.exc import IntegrityError

from app.models import HistoricalMatch
from app.models.database import SessionLocal
from app.services.team_name_normalizer import normalize_team_name

logger = structlog.get_logger()

# The Odds API sport_key → football-data.co.uk file code. To add a new
# league, add the mapping here AND add a normalizer dict in
# team_name_normalizer.NAME_MAP_BY_LEAGUE.
LEAGUE_FILE_CODES: dict[str, str] = {
    "soccer_epl":                "E0",
    "soccer_italy_serie_a":      "I1",
    "soccer_spain_la_liga":      "SP1",
    "soccer_germany_bundesliga": "D1",
    "soccer_france_ligue_one":   "F1",
}

FOOTBALL_DATA_URL = "https://www.football-data.co.uk/mmz4281/{season}/{code}.csv"

# Default seasons to pull on a fresh install: last 5 completed + current.
DEFAULT_SEASONS: list[str] = ["2122", "2223", "2324", "2425", "2526", "2627"]


def _parse_date(raw: str) -> Optional[date]:
    """football-data.co.uk uses DD/MM/YYYY (current) or DD/MM/YY (older)."""
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _parse_float(raw: str) -> Optional[float]:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_int(raw: str) -> Optional[int]:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    try:
        return int(s)
    except ValueError:
        return None


async def _fetch_csv(league_key: str, season: str) -> str:
    """Download the season CSV from football-data.co.uk, return as text."""
    code = LEAGUE_FILE_CODES[league_key]
    url = FOOTBALL_DATA_URL.format(season=season, code=code)
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        # The site serves these as windows-1252 in some seasons. Try utf-8
        # first, fall back to cp1252 for the older files where non-ASCII
        # glyphs appear in team names etc. utf-8-sig, not plain utf-8:
        # current-season files open with a BOM, which otherwise ends up
        # inside the first header name ('﻿Div') and silently breaks
        # the wrong-division guard's row.get("Div") lookup — observed
        # live at the 26/27 switchover. (utf-8-sig also decodes BOM-less
        # files identically to utf-8.)
        try:
            return resp.content.decode("utf-8-sig")
        except UnicodeDecodeError:
            return resp.content.decode("cp1252")


def _import_season_rows(league_key: str, season: str, csv_text: str) -> dict:
    """
    Parse a season CSV and upsert rows into historical_matches.

    Returns a summary dict for logging / admin response:
      {league, season, rows_seen, rows_written, rows_skipped, unmapped_teams[], errors[]}
    """
    expected_div = LEAGUE_FILE_CODES[league_key]

    db = SessionLocal()
    try:
        reader = csv.DictReader(io.StringIO(csv_text))

        rows_seen = 0
        rows_written = 0
        rows_skipped = 0
        rows_close = 0
        rows_open_fallback = 0
        rows_missing_price = 0
        rows_div_mismatch = 0
        wrong_divs: set[str] = set()
        unmapped_teams: set[str] = set()
        errors: list[str] = []

        for row in reader:
            rows_seen += 1

            # Some season files have trailing blank rows.
            if not (row.get("HomeTeam") or "").strip():
                rows_skipped += 1
                continue

            # Guard against football-data.co.uk serving the wrong
            # competition under a league's file code — observed for
            # real at the 26/27 switchover, when their fresh season
            # folder had National League (Div=EC) rows in E0.csv and
            # Portuguese Liga (Div=P1) rows in SP1.csv. Without this
            # check, any mislabeled team that happens to share a name
            # with a mapped one would be silently written into the
            # wrong league's P/L.
            div = (row.get("Div") or "").strip()
            if div and div != expected_div:
                rows_skipped += 1
                rows_div_mismatch += 1
                wrong_divs.add(div)
                continue

            match_date = _parse_date(row.get("Date", ""))
            home_raw = (row.get("HomeTeam") or "").strip()
            away_raw = (row.get("AwayTeam") or "").strip()

            home_team = normalize_team_name(home_raw, league_key)
            away_team = normalize_team_name(away_raw, league_key)

            if not match_date or not home_team or not away_team:
                rows_skipped += 1
                if home_raw and not home_team:
                    unmapped_teams.add(home_raw)
                if away_raw and not away_team:
                    unmapped_teams.add(away_raw)
                continue

            psch = _parse_float(row.get("PSCH", ""))
            pscd = _parse_float(row.get("PSCD", ""))
            psca = _parse_float(row.get("PSCA", ""))

            price_source = "close"
            if psch is None or pscd is None or psca is None:
                # Fall back to opening prices for older seasons that
                # didn't ship closing prices.
                psh = _parse_float(row.get("PSH", ""))
                psd = _parse_float(row.get("PSD", ""))
                psa = _parse_float(row.get("PSA", ""))
                if psh is not None and psd is not None and psa is not None:
                    psch, pscd, psca = psh, psd, psa
                    price_source = "open_fallback"
                    rows_open_fallback += 1
                else:
                    price_source = "missing"
                    rows_missing_price += 1
            else:
                rows_close += 1

            # Upsert by natural key (season, match_date, home, away).
            # Note: we don't include league in the key because the
            # (date, home, away) tuple is already unique across leagues
            # (no team plays in two top-flights at once) — but we DO
            # write the league column so queries can filter cleanly.
            existing = (
                db.query(HistoricalMatch)
                .filter(
                    HistoricalMatch.season == season,
                    HistoricalMatch.match_date == match_date,
                    HistoricalMatch.home_team == home_team,
                    HistoricalMatch.away_team == away_team,
                )
                .first()
            )

            if existing:
                existing.league = league_key
                existing.fthg = _parse_int(row.get("FTHG", ""))
                existing.ftag = _parse_int(row.get("FTAG", ""))
                existing.ftr = (row.get("FTR") or "").strip() or None
                # football-data dropped its Pinnacle columns in Jan 2026;
                # since then closing_line_backfill fills prices from our
                # own capture (price_source='steamwatch_close'). A CSV
                # row with no price must not overwrite that — results
                # still refresh above, the price stays ours.
                if price_source == "missing" and existing.price_source == "steamwatch_close":
                    pass
                else:
                    existing.psch = psch
                    existing.pscd = pscd
                    existing.psca = psca
                    existing.price_source = price_source
            else:
                db.add(
                    HistoricalMatch(
                        season=season,
                        league=league_key,
                        match_date=match_date,
                        home_team=home_team,
                        away_team=away_team,
                        fthg=_parse_int(row.get("FTHG", "")),
                        ftag=_parse_int(row.get("FTAG", "")),
                        ftr=(row.get("FTR") or "").strip() or None,
                        psch=psch,
                        pscd=pscd,
                        psca=psca,
                        price_source=price_source,
                    )
                )

            rows_written += 1

        try:
            db.commit()
        except IntegrityError as e:
            db.rollback()
            errors.append(f"IntegrityError on commit: {e!s}")
            logger.error("football_data_importer commit failed",
                         league=league_key, season=season, error=str(e))

        if rows_div_mismatch:
            msg = (
                f"{league_key} {season}: {rows_div_mismatch} rows carried "
                f"Div={sorted(wrong_divs)} instead of {expected_div} — "
                "football-data.co.uk is serving another competition's data "
                "under this file code; those rows were skipped."
            )
            errors.append(msg)
            logger.warning("football_data_importer wrong-division rows skipped",
                           league=league_key, season=season,
                           expected_div=expected_div, found=sorted(wrong_divs),
                           rows=rows_div_mismatch)

        summary = {
            "league": league_key,
            "season": season,
            "rows_seen": rows_seen,
            "rows_written": rows_written,
            "rows_skipped": rows_skipped,
            "rows_close": rows_close,
            "rows_open_fallback": rows_open_fallback,
            "rows_missing_price": rows_missing_price,
            "rows_div_mismatch": rows_div_mismatch,
            "unmapped_teams": sorted(unmapped_teams),
            "errors": errors,
        }
        if unmapped_teams:
            # Loud warning — every unmapped team produces silently-doubled
            # P/L rows, which is exactly the bug the normalizer is trying
            # to prevent.
            logger.warning(
                "football_data_importer: unmapped team names — add to "
                "team_name_normalizer.NAME_MAP_BY_LEAGUE",
                league=league_key,
                season=season,
                unmapped=sorted(unmapped_teams),
            )
        logger.info("football_data_importer season done", **{
            k: v for k, v in summary.items() if k != "unmapped_teams"
        })
        return summary

    finally:
        db.close()


async def import_seasons(
    league_key: str = "soccer_epl",
    seasons: Optional[list[str]] = None,
) -> dict:
    """
    Public entry point. Pull the requested seasons for a given league
    (default: EPL, last 5 historical + current) and upsert into
    historical_matches.
    """
    if league_key not in LEAGUE_FILE_CODES:
        return {
            "errors": [f"League '{league_key}' not configured. Add it to LEAGUE_FILE_CODES."],
            "seasons": [],
            "total_rows_written": 0,
            "total_unmapped_teams": [],
        }

    target = seasons or DEFAULT_SEASONS
    overall: dict = {"league": league_key, "seasons": [], "errors": []}
    for season in target:
        try:
            csv_text = await _fetch_csv(league_key, season)
        except Exception as e:
            err = f"{league_key} {season}: fetch failed — {e!s}"
            overall["errors"].append(err)
            logger.error("football_data_importer fetch failed",
                         league=league_key, season=season, error=str(e))
            continue

        try:
            summary = _import_season_rows(league_key, season, csv_text)
            overall["seasons"].append(summary)
        except Exception as e:
            err = f"{league_key} {season}: parse failed — {e!s}"
            overall["errors"].append(err)
            logger.error("football_data_importer parse failed",
                         league=league_key, season=season, error=str(e))

    overall["total_rows_written"] = sum(s["rows_written"] for s in overall["seasons"])
    overall["total_unmapped_teams"] = sorted(
        {t for s in overall["seasons"] for t in s["unmapped_teams"]}
    )
    return overall
