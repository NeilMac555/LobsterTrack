"""
Weekly refresh of rolling-xG data from Understat.

Understat moved their data off the HTML page in 2025 — the league pages
are now JS shells that XHR /getLeagueData/<slug>/<season> to hydrate.
We hit that same JSON endpoint server-side and upsert the result into
our xg_data table.

Identical logic to scripts/scrape_understat.py but in-process (no
intermediate CSV, no HTTP round-trip to our own admin endpoint) so
the scheduler can run it autonomously.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import urllib.error
import urllib.request
from datetime import date as date_type
from datetime import datetime
from typing import Any

import structlog

from app.models import XGData
from app.models.database import SessionLocal

logger = structlog.get_logger()

# Understat slug -> our sport_key. Kept in sync with the public scraper so
# CSV uploads and the cron produce identical rows.
LEAGUES: dict[str, str] = {
    "EPL":        "soccer_epl",
    "La_liga":    "soccer_spain_la_liga",
    "Bundesliga": "soccer_germany_bundesliga",
    "Serie_A":    "soccer_italy_serie_a",
    "Ligue_1":    "soccer_france_ligue_one",
}

# Understat uses the season-start year in URLs (2025 = 2025/26 season).
# In a real switchover (e.g. Aug 2026) this will need bumping to '2026' —
# SITE_SEASON below derives automatically from this, so nothing else
# needs to change.
SEASON = "2025"


def _site_season_code(understat_season: str) -> str:
    """'2025' (Understat's season-start year) -> '2526' (site's season code)."""
    start_yy = understat_season[-2:]
    end_yy = str(int(understat_season) + 1)[-2:]
    return f"{start_yy}{end_yy}"


SITE_SEASON = _site_season_code(SEASON)

# Occasional name mismatches between Understat and our site's dropdown.
# Empty by default — add entries if a team ever goes missing from the chart.
NAME_MAP: dict[str, str] = {}


def _fetch_league_json(slug: str) -> dict[str, Any]:
    """Blocking fetch of the Understat JSON API for a single league."""
    url = f"https://understat.com/getLeagueData/{slug}/{SEASON}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"https://understat.com/league/{slug}/{SEASON}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        # Understat's CDN sometimes gzips responses — urllib doesn't decompress
        # for us, so we do it manually based on the Content-Encoding header
        # OR the gzip magic bytes.
        encoding = (resp.headers.get("Content-Encoding") or "").lower()
        if encoding == "gzip" or raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8"))


def _build_rows(slug: str, sport_key: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten the Understat per-league payload into xg_data rows."""
    teams = payload.get("teams") or {}
    rows: list[dict[str, Any]] = []

    for _team_id, team_info in teams.items():
        raw_name = team_info.get("title") or ""
        team_name = NAME_MAP.get(raw_name, raw_name)
        history = team_info.get("history") or []
        # Understat returns history in date order, but sort again for safety.
        history.sort(key=lambda m: (m.get("date") or ""))

        match_number = 0
        for match in history:
            date_str = (match.get("date") or "")[:10]  # YYYY-MM-DD
            if not date_str:
                continue
            npxg_for = match.get("npxG", match.get("xG", 0)) or 0
            npxg_against = match.get("npxGA", match.get("xGA", 0)) or 0

            try:
                match_date = date_type.fromisoformat(date_str)
            except ValueError:
                logger.warning(
                    "Skipping row with unparseable date",
                    slug=slug,
                    team=team_name,
                    date=date_str,
                )
                continue

            match_number += 1
            rows.append({
                "league": sport_key,
                "team_name": team_name,
                "season": SITE_SEASON,
                "match_number": match_number,
                "npxg_for": float(npxg_for),
                "npxg_against": float(npxg_against),
                "match_date": match_date,
            })

    return rows


class XGRefresher:
    """Runs the Understat scrape + upsert. Tracks last-run health state."""

    def __init__(self) -> None:
        self.last_run_at: datetime | None = None
        self.last_run_summary: dict[str, Any] | None = None
        self.last_error: str | None = None

    async def refresh(self) -> dict[str, Any]:
        """
        Scrape Understat for every configured league and replace xg_data
        rows for those leagues. Network + JSON parsing happen in a worker
        thread so we don't block the asyncio loop.
        """
        started = datetime.utcnow()
        summary: dict[str, Any] = {
            "started_at": started.isoformat() + "Z",
            "leagues": {},
            "total_rows_inserted": 0,
            "errors": [],
        }

        # Scrape all leagues concurrently in the default thread pool. Each
        # fetch is a few hundred KB of JSON so this is fast and cheap.
        loop = asyncio.get_event_loop()
        tasks = {
            slug: loop.run_in_executor(None, _fetch_league_json, slug)
            for slug in LEAGUES
        }
        payloads: dict[str, dict[str, Any]] = {}
        for slug, task in tasks.items():
            try:
                payloads[slug] = await task
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                msg = f"Failed to fetch {slug}: {e}"
                logger.error("xG refresh fetch failed", slug=slug, error=str(e))
                summary["errors"].append(msg)

        if not payloads:
            summary["finished_at"] = datetime.utcnow().isoformat() + "Z"
            self.last_run_at = datetime.utcnow()
            self.last_run_summary = summary
            self.last_error = "All league fetches failed"
            return summary

        db = SessionLocal()
        try:
            for slug, payload in payloads.items():
                sport_key = LEAGUES[slug]
                try:
                    rows = _build_rows(slug, sport_key, payload)
                    if not rows:
                        summary["leagues"][sport_key] = {"rows": 0, "teams": 0, "note": "empty payload"}
                        continue

                    team_count = len({r["team_name"] for r in rows})

                    # Wipe this league+season's existing rows then bulk
                    # insert fresh. Scoped to SITE_SEASON so a run never
                    # touches a prior season's data — same approach as
                    # /api/admin/upload-xg.
                    db.query(XGData).filter(
                        XGData.league == sport_key, XGData.season == SITE_SEASON
                    ).delete()
                    db.bulk_insert_mappings(XGData, rows)
                    db.commit()

                    summary["leagues"][sport_key] = {
                        "rows": len(rows),
                        "teams": team_count,
                    }
                    summary["total_rows_inserted"] += len(rows)
                    logger.info(
                        "xG refresh: league updated",
                        league=sport_key,
                        rows=len(rows),
                        teams=team_count,
                    )
                except Exception as e:
                    db.rollback()
                    msg = f"Failed to upsert {slug}: {e}"
                    logger.error("xG refresh upsert failed", slug=slug, error=str(e))
                    summary["errors"].append(msg)
        finally:
            db.close()

        summary["finished_at"] = datetime.utcnow().isoformat() + "Z"
        summary["duration_seconds"] = (datetime.utcnow() - started).total_seconds()
        self.last_run_at = datetime.utcnow()
        self.last_run_summary = summary
        self.last_error = summary["errors"][0] if summary["errors"] else None

        logger.info(
            "xG refresh complete",
            total_rows=summary["total_rows_inserted"],
            leagues_ok=len(summary["leagues"]),
            errors=len(summary["errors"]),
        )
        return summary


# Singleton — imported by the scheduler and the admin routes.
xg_refresher = XGRefresher()
