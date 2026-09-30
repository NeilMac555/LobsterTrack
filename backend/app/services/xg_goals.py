"""
Goals vs expected goals per club (2026-09-30).

Feeds /goals-coming-soon (the clubs in Europe's top five leagues scoring
furthest below and above their xG over a rolling window), the per-league
sections on that page, and the one-line xG note on match pages.

Data: Understat's league JSON (understat_feed.fetch_league), per-team
`history` items, which carry goals scored/conceded and xG/xGA/npxG/npxGA
for every played league match. Stored in xg_team_results, one row per
club per match, upserted on (league, team_name, match_date). The weekly
job refreshes the current season and the previous one, so a 12-month
window is always fully covered.

Nothing here touches xg_data or the rolling-xG refresher.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import time
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy import Integer, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.xg_team_result import XGTeamResult

# understat_feed.py lives in backend/ (the app's working directory in the
# container); make it importable when this module is used from elsewhere.
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

# Understat slug -> our sport_key
SLUGS = {
    "EPL": "soccer_epl",
    "La_liga": "soccer_spain_la_liga",
    "Bundesliga": "soccer_germany_bundesliga",
    "Serie_A": "soccer_italy_serie_a",
    "Ligue_1": "soccer_france_ligue_one",
}
LEAGUE_LABEL = {
    "soccer_epl": "Premier League",
    "soccer_spain_la_liga": "La Liga",
    "soccer_germany_bundesliga": "Bundesliga",
    "soccer_italy_serie_a": "Serie A",
    "soccer_france_ligue_one": "Ligue 1",
}
LEAGUE_ORDER = list(LEAGUE_LABEL)
MIN_MATCHES = 8
WINDOWS = {12: 365, 6: 182}

# Odds API (our Match table) names that don't normalise to Understat's.
ALIASES = {
    "1. fc koln": "FC Cologne",
    "1. fc köln": "FC Cologne",
    "borussia monchengladbach": "Borussia M.Gladbach",
    "fsv mainz 05": "Mainz 05",
    "rb leipzig": "RasenBallsport Leipzig",
    "ca osasuna": "Osasuna",
    "real racing club de santander": "Racing Santander",
    "inter milan": "Inter",
    "athletic bilbao": "Athletic Club",
    "as roma": "Roma",
    "parma": "Parma Calcio 1913",
    "brighton and hove albion": "Brighton",
    "tottenham hotspur": "Tottenham",
    "west ham united": "West Ham",
    "wolverhampton wanderers": "Wolverhampton Wanderers",
    "paris saint-germain": "Paris Saint Germain",
}


def season_year(now: Optional[datetime] = None) -> int:
    """Understat season year (2026 = 2026/27), July rollover."""
    now = now or datetime.utcnow()
    return now.year if now.month >= 7 else now.year - 1


def site_season(year: int) -> str:
    return f"{year % 100:02d}{(year + 1) % 100:02d}"


def season_label(code: str) -> str:
    """'2627' -> '2026/27'."""
    return f"20{code[:2]}/{code[2:]}"


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(fc|ac|as|ss|us|uc|ssc|cf|sc|afc|cd|rcd|ud|sd|rc|ogc|fk|tsg|vfl|vfb|bsc|sv|calcio|1913|1899|04|05|09|de|club)\b", " ", s)
    return re.sub(r"[^a-z]+", " ", s).strip()


# ------------------------------------------------------------------ ingest

def parse_team_results(payload: dict[str, Any], sport_key: str, year: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for team in (payload.get("teams") or {}).values():
        name = team.get("title") or ""
        for item in team.get("history") or []:
            d = (item.get("date") or "")[:10]
            if not name or not d:
                continue
            try:
                rows.append({
                    "league": sport_key,
                    "team_name": name,
                    "season": site_season(year),
                    "match_date": date.fromisoformat(d),
                    "home": item.get("h_a") == "h",
                    "goals_for": int(item["scored"]),
                    "goals_against": int(item["missed"]),
                    "xg_for": float(item["xG"]),
                    "xg_against": float(item["xGA"]),
                    "npxg_for": float(item["npxG"]),
                    "npxg_against": float(item["npxGA"]),
                    "points": int(item["pts"]) if item.get("pts") is not None else None,
                    "xpts": float(item["xpts"]) if item.get("xpts") is not None else None,
                })
            except (KeyError, TypeError, ValueError):
                continue  # a malformed item is skipped, never guessed
    return rows


def upsert(db: Session, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    stmt = pg_insert(XGTeamResult).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_xg_team_result",
        set_={c: getattr(stmt.excluded, c) for c in ("season", "home", "goals_for", "goals_against", "xg_for", "xg_against", "npxg_for", "npxg_against", "points", "xpts")}
        | {"updated_at": datetime.utcnow()},
    )
    db.execute(stmt)
    db.commit()
    return len(rows)


def refresh(db: Session, years: Optional[list[int]] = None) -> dict[str, Any]:
    """Blocking: fetch + upsert every league for the given seasons
    (default current and previous). One league failing never blocks the rest."""
    from understat_feed import fetch_league  # backend/understat_feed.py

    y = season_year()
    years = years or [y - 1, y]
    summary: dict[str, Any] = {"rows": 0, "errors": []}
    for slug, sport_key in SLUGS.items():
        for year in years:
            try:
                payload = fetch_league(slug, year)
                summary["rows"] += upsert(db, parse_team_results(payload, sport_key, year))
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                summary["errors"].append(f"{slug} {year}: {exc}")
    _cache.clear()
    return summary


async def refresh_async() -> dict[str, Any]:
    from app.models.database import SessionLocal

    def _run():
        db = SessionLocal()
        try:
            return refresh(db)
        finally:
            db.close()
    return await asyncio.get_event_loop().run_in_executor(None, _run)


# ------------------------------------------------------------------ queries

_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL_SECONDS = 600


def _cached(key: str, build):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = build()
    _cache[key] = (now + CACHE_TTL_SECONDS, value)
    return value


def table(db: Session, months: int = 12, min_matches: int = MIN_MATCHES) -> dict[str, Any]:
    """Every club in the division this season with `min_matches`+ league
    matches in the window: goals, xG, gap (goals minus xG), and the same
    for defence (conceded minus xGA). Sorted by attack gap, most negative
    first, so rows[:n] are the underperformers and rows[-n:] reversed are
    the overperformers."""
    months = months if months in WINDOWS else 12
    days = WINDOWS[months]

    def build():
        since = date.today() - timedelta(days=days)
        current = site_season(season_year())
        # Only clubs in the division this season: a relegated side's window
        # would otherwise be filled by last season's matches.
        in_division = (
            db.query(XGTeamResult.league, XGTeamResult.team_name)
            .filter(XGTeamResult.season == current)
            .distinct()
            .subquery()
        )
        q = (
            db.query(
                XGTeamResult.league,
                XGTeamResult.team_name,
                func.count(XGTeamResult.id).label("matches"),
                func.sum(XGTeamResult.goals_for).label("goals"),
                func.sum(XGTeamResult.xg_for).label("xg"),
                func.sum(XGTeamResult.goals_against).label("conceded"),
                func.sum(XGTeamResult.xg_against).label("xga"),
                func.max(XGTeamResult.match_date).label("last_match"),
            )
            .join(in_division, (in_division.c.league == XGTeamResult.league) & (in_division.c.team_name == XGTeamResult.team_name))
            .filter(XGTeamResult.match_date >= since)
            .group_by(XGTeamResult.league, XGTeamResult.team_name)
            .having(func.count(XGTeamResult.id) >= min_matches)
        )
        rows = []
        for r in q.all():
            n = int(r.matches)
            gap = float(r.goals) - float(r.xg)
            dgap = float(r.conceded) - float(r.xga)
            rows.append({
                "league": r.league,
                "league_name": LEAGUE_LABEL.get(r.league, r.league),
                "team": r.team_name,
                "matches": n,
                "goals": int(r.goals),
                "xg": round(float(r.xg), 1),
                "gap": round(gap, 1),
                "gap_per_match": round(gap / n, 2),
                "conceded": int(r.conceded),
                "xga": round(float(r.xga), 1),
                "def_gap": round(dgap, 1),
                "def_gap_per_match": round(dgap / n, 2),
                "last_match": r.last_match.isoformat(),
            })
        rows.sort(key=lambda x: (x["gap"], x["team"]))
        latest = db.query(func.max(XGTeamResult.match_date)).scalar()
        refreshed = db.query(func.max(XGTeamResult.updated_at)).scalar()
        return {
            "months": months,
            "window_days": days,
            "since": since.isoformat(),
            "latest_match": latest.isoformat() if latest else None,
            "refreshed_at": refreshed.isoformat() if refreshed else None,
            "min_matches": min_matches,
            "clubs_in_window": len(rows),
            "rows": rows,
        }
    return _cached(f"table:{months}:{min_matches}", build)


def undershooting(db: Session, months: int = 12, limit: int = 10, min_matches: int = MIN_MATCHES) -> dict[str, Any]:
    """Kept for the first version of the API: the `limit` clubs furthest below xG."""
    t = table(db, months, min_matches)
    return {**{k: v for k, v in t.items() if k != "rows"}, "rows": t["rows"][:limit]}


def club_gap(db: Session, league: str, team: str, months: int = 12) -> Optional[dict[str, Any]]:
    """The window row for one club named the way our Match table names it
    (Odds API), or None when it can't be matched with confidence."""
    t = table(db, months)
    rows = [r for r in t["rows"] if r["league"] == league]
    if not rows:
        return None
    by_norm = {_norm(r["team"]): r for r in rows}
    key = _norm(team)
    alias = ALIASES.get(unicodedata.normalize("NFKD", team).encode("ascii", "ignore").decode().lower().strip())
    if alias and _norm(alias) in by_norm:
        return by_norm[_norm(alias)]
    if key in by_norm:
        return by_norm[key]
    first = key.split()[0] if key else ""
    hits = [r for k, r in by_norm.items() if k.split()[0] == first] if first else []
    return hits[0] if len(hits) == 1 else None


# ------------------------------------------------------------------ justice table

def justice(db: Session, months: int = 12) -> dict[str, Any]:
    """Per league: every club's points and expected points over the last
    `months` (12 or 6) of league matches, sorted on expected points (the
    justice order) with the rank on real points alongside. Only clubs in
    the division this season, 8+ matches in the window."""
    months = months if months in WINDOWS else 12
    days = WINDOWS[months]
    current = site_season(season_year())
    prev = site_season(season_year() - 1)

    def build():
        since = date.today() - timedelta(days=days)
        in_division = (
            db.query(XGTeamResult.league, XGTeamResult.team_name)
            .filter(XGTeamResult.season == current)
            .distinct()
            .subquery()
        )
        q = (
            db.query(
                XGTeamResult.league,
                XGTeamResult.team_name,
                func.count(XGTeamResult.id).label("matches"),
                func.sum(XGTeamResult.goals_for).label("goals"),
                func.sum(XGTeamResult.goals_against).label("conceded"),
                func.sum(XGTeamResult.points).label("points"),
                func.sum(XGTeamResult.xpts).label("xpts"),
                func.sum(func.cast(XGTeamResult.points == 3, Integer)).label("won"),
                func.sum(func.cast(XGTeamResult.points == 1, Integer)).label("drawn"),
                func.sum(func.cast(XGTeamResult.points == 0, Integer)).label("lost"),
                func.max(XGTeamResult.match_date).label("last_match"),
            )
            .join(in_division, (in_division.c.league == XGTeamResult.league) & (in_division.c.team_name == XGTeamResult.team_name))
            .filter(XGTeamResult.match_date >= since, XGTeamResult.xpts.isnot(None))
            .group_by(XGTeamResult.league, XGTeamResult.team_name)
            .having(func.count(XGTeamResult.id) >= MIN_MATCHES)
        )
        leagues: dict[str, list[dict]] = {}
        latest = None
        for r in q.all():
            latest = max(latest, r.last_match) if latest else r.last_match
            pts, xp = int(r.points or 0), float(r.xpts or 0.0)
            leagues.setdefault(r.league, []).append({
                "league": r.league, "league_name": LEAGUE_LABEL.get(r.league, r.league), "team": r.team_name,
                "matches": int(r.matches), "won": int(r.won or 0), "drawn": int(r.drawn or 0), "lost": int(r.lost or 0),
                "goals": int(r.goals), "conceded": int(r.conceded), "points": pts, "xpts": round(xp, 2),
                "gap": round(pts - xp, 1),
            })
        for lg, rows in leagues.items():
            # rank on real points over the window: points, goal difference, goals for
            for i, r in enumerate(sorted(rows, key=lambda x: (-x["points"], -(x["goals"] - x["conceded"]), -x["goals"], x["team"])), 1):
                r["pos"] = i
            rows.sort(key=lambda x: (-x["xpts"], x["team"]))
            for i, r in enumerate(rows, 1):
                r["xpos"] = i
                r["move"] = r["pos"] - r["xpos"]
        refreshed = db.query(func.max(XGTeamResult.updated_at)).scalar()
        return {
            "months": months, "window_days": days, "since": since.isoformat(),
            "min_matches": MIN_MATCHES,
            "latest_match": latest.isoformat() if latest else None,
            "refreshed_at": refreshed.isoformat() if refreshed else None,
            "leagues": leagues,
            "previous_label": season_label(prev),
            "previous_summary": justice_summary(db, prev),
        }
    return _cached(f"justice:{months}", build)


def justice_summary(db: Session, season: str) -> dict[str, Any]:
    """How far the real table ended from the expected-points table in a
    finished season: mean absolute place difference, share within two
    places, and the largest points gap. Used in the page copy."""
    def build():
        q = (
            db.query(XGTeamResult.league, XGTeamResult.team_name,
                     func.sum(XGTeamResult.points).label("points"), func.sum(XGTeamResult.xpts).label("xpts"),
                     func.sum(XGTeamResult.goals_for).label("goals"), func.sum(XGTeamResult.goals_against).label("conceded"),
                     func.count(XGTeamResult.id).label("matches"))
            .filter(XGTeamResult.season == season, XGTeamResult.xpts.isnot(None))
            .group_by(XGTeamResult.league, XGTeamResult.team_name)
        )
        by_league: dict[str, list] = {}
        for r in q.all():
            by_league.setdefault(r.league, []).append(r)
        diffs, gaps = [], []
        for rows in by_league.values():
            if len(rows) < 10 or max(x.matches for x in rows) < 30:
                continue  # not a completed season
            real = {x.team_name: i for i, x in enumerate(sorted(rows, key=lambda x: (-int(x.points or 0), -(x.goals - x.conceded), -x.goals)), 1)}
            xpos = {x.team_name: i for i, x in enumerate(sorted(rows, key=lambda x: -float(x.xpts or 0)), 1)}
            for x in rows:
                diffs.append(abs(real[x.team_name] - xpos[x.team_name]))
                gaps.append((int(x.points or 0) - float(x.xpts or 0), x.team_name))
        if not diffs:
            return {"clubs": 0}
        mg = max(gaps, key=lambda g: abs(g[0]))
        return {
            "season": season, "season_label": season_label(season), "clubs": len(diffs),
            "mean_abs_places": round(sum(diffs) / len(diffs), 2),
            "within_two": sum(1 for d in diffs if d <= 2),
            "max_gap": round(mg[0], 1), "max_gap_club": mg[1],
        }
    return _cached(f"justice_summary:{season}", build)
