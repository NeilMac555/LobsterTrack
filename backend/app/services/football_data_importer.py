"""
Pull historical match results + Pinnacle closing prices from
football-data.co.uk and upsert into the historical_matches table.

Phase 1 covers the EPL only ('soccer_epl' league key). The CSV format
hasn't changed in years; the columns we care about are:

  Date       — DD/MM/YYYY (older) or DD/MM/YY (newer); we parse both.
  HomeTeam   — football-data.co.uk's spelling (we normalize to canonical)
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

# football-data.co.uk season codes are two-digit-start + two-digit-end,
# concatenated (e.g. '2122' = 2021/22). The current season ('2526') is
# updated weekly through the year — others are static.
EPL_LEAGUE_KEY = "soccer_epl"
FOOTBALL_DATA_URL = "https://www.football-data.co.uk/mmz4281/{season}/E0.csv"

# Default seasons to pull on a fresh install: last 5 completed + current.
DEFAULT_SEASONS: list[str] = ["2122", "2223", "2324", "2425", "2526"]


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


async def _fetch_csv(season: str) -> str:
    """Download the season CSV from football-data.co.uk, return as text."""
    url = FOOTBALL_DATA_URL.format(season=season)
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        # The site serves these as windows-1252 in some seasons. Try utf-8
        # first, fall back to cp1252 for the older files where Tottenham
        # appears with a non-ASCII glyph in headers etc.
        try:
            return resp.content.decode("utf-8")
        except UnicodeDecodeError:
            return resp.content.decode("cp1252")


def _import_season_rows(season: str, csv_text: str) -> dict:
    """
    Parse a season CSV and upsert rows into historical_matches.

    Returns a summary dict for logging / admin response:
      {season, rows_seen, rows_written, rows_skipped, unmapped_teams[], errors[]}
    """
    db = SessionLocal()
    try:
        reader = csv.DictReader(io.StringIO(csv_text))

        rows_seen = 0
        rows_written = 0
        rows_skipped = 0
        rows_close = 0
        rows_open_fallback = 0
        rows_missing_price = 0
        unmapped_teams: set[str] = set()
        errors: list[str] = []

        for row in reader:
            rows_seen += 1

            # Some season files have trailing blank rows.
            if not (row.get("HomeTeam") or "").strip():
                rows_skipped += 1
                continue

            match_date = _parse_date(row.get("Date", ""))
            home_raw = (row.get("HomeTeam") or "").strip()
            away_raw = (row.get("AwayTeam") or "").strip()

            home_team = normalize_team_name(home_raw)
            away_team = normalize_team_name(away_raw)

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
                existing.fthg = _parse_int(row.get("FTHG", ""))
                existing.ftag = _parse_int(row.get("FTAG", ""))
                existing.ftr = (row.get("FTR") or "").strip() or None
                existing.psch = psch
                existing.pscd = pscd
                existing.psca = psca
                existing.price_source = price_source
            else:
                db.add(
                    HistoricalMatch(
                        season=season,
                        league=EPL_LEAGUE_KEY,
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
            logger.error("football_data_importer commit failed", season=season, error=str(e))

        summary = {
            "season": season,
            "rows_seen": rows_seen,
            "rows_written": rows_written,
            "rows_skipped": rows_skipped,
            "rows_close": rows_close,
            "rows_open_fallback": rows_open_fallback,
            "rows_missing_price": rows_missing_price,
            "unmapped_teams": sorted(unmapped_teams),
            "errors": errors,
        }
        if unmapped_teams:
            # Loud warning — every unmapped team produces silently-doubled
            # P/L rows, which is exactly the bug the normalizer is trying
            # to prevent.
            logger.warning(
                "football_data_importer: unmapped team names — add to "
                "team_name_normalizer.FOOTBALL_DATA_TO_CANONICAL",
                season=season,
                unmapped=sorted(unmapped_teams),
            )
        logger.info("football_data_importer season done", **{
            k: v for k, v in summary.items() if k != "unmapped_teams"
        })
        return summary

    finally:
        db.close()


async def import_seasons(seasons: Optional[list[str]] = None) -> dict:
    """
    Public entry point. Pull the requested seasons (default: 5 historical +
    current) and upsert into historical_matches.
    """
    target = seasons or DEFAULT_SEASONS
    overall: dict = {"seasons": [], "errors": []}
    for season in target:
        try:
            csv_text = await _fetch_csv(season)
        except Exception as e:
            err = f"{season}: fetch failed — {e!s}"
            overall["errors"].append(err)
            logger.error("football_data_importer fetch failed", season=season, error=str(e))
            continue

        try:
            summary = _import_season_rows(season, csv_text)
            overall["seasons"].append(summary)
        except Exception as e:
            err = f"{season}: parse failed — {e!s}"
            overall["errors"].append(err)
            logger.error("football_data_importer parse failed", season=season, error=str(e))

    overall["total_rows_written"] = sum(s["rows_written"] for s in overall["seasons"])
    overall["total_unmapped_teams"] = sorted(
        {t for s in overall["seasons"] for t in s["unmapped_teams"]}
    )
    return overall
