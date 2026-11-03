"""
Goals vs expected goals per club (2026-09-30).

Feeds /goals-coming-soon (the clubs in Europe's top five leagues scoring
furthest below and above their xG over a rolling window), the per-league
sections on that page, and the one-line xG note on match pages.

Goals Coming Soon and the match notes use the daily Sportmonks domestic
fixture snapshots. The Justice Table still uses expected points from
the weekly Understat archive in xg_team_results.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import time
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta
from math import fsum
from typing import Any, NamedTuple, Optional

from sqlalchemy import Integer, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.form_lab import FormLabSeason
from app.models.xg_team_result import XGTeamResult
from app.services.form_lab import numeric

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

# Odds API match names that differ from Sportmonks participant names.
ALIASES = {
    "lille": "LOSC Lille",
    "lyon": "Olympique Lyonnais",
    "marseille": "Olympique Marseille",
    "alaves": "Deportivo Alavés",
    "deportivo la coruna": "Deportivo A Coruña",
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


def season_year(now: Optional[date] = None) -> int:
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


class _ClubMatch(NamedTuple):
    day: str
    goals: int
    conceded: int
    xg: float
    xga: float


def _league_gap_rows(current, previous, since, through, min_matches):
    """Use stable Sportmonks participant IDs and the current season's club names."""
    matches = defaultdict(list)
    fixtures = {f['id']: f for season in (previous, current) if season is not None
                for f in season.data['fixtures']}
    for fixture in fixtures.values():
        day = fixture['date'][:10]
        if not since <= day <= through:
            continue
        home_xg = numeric(fixture.get('home_xg'))
        away_xg = numeric(fixture.get('away_xg'))
        if home_xg is None or away_xg is None:
            continue
        home_goals, away_goals = fixture['hg'], fixture['ag']
        matches[fixture['home_id']].append(_ClubMatch(day, home_goals, away_goals, home_xg, away_xg))
        matches[fixture['away_id']].append(_ClubMatch(day, away_goals, home_goals, away_xg, home_xg))

    for team_id, name in current.data['teams'].items():
        games = matches.get(int(team_id), [])
        n = len(games)
        if n < min_matches:
            continue
        goals = sum(g.goals for g in games)
        conceded = sum(g.conceded for g in games)
        xg = fsum(g.xg for g in games)
        xga = fsum(g.xga for g in games)
        gap, def_gap = goals - xg, conceded - xga
        yield {
            'league': current.league, 'league_name': LEAGUE_LABEL[current.league],
            'team': name, 'matches': n, 'goals': goals, 'xg': round(xg, 1),
            'gap': round(gap, 1), 'gap_per_match': round(gap / n, 2),
            'conceded': conceded, 'xga': round(xga, 1), 'def_gap': round(def_gap, 1),
            'def_gap_per_match': round(def_gap / n, 2), 'last_match': max(g.day for g in games),
        }


def table(db: Session, months: int = 12, min_matches: int = MIN_MATCHES) -> dict[str, Any]:
    """Goals and total xG from the same completed Sportmonks league fixtures."""
    months = months if months in WINDOWS else 12
    today = datetime.utcnow().date()

    def build():
        since = (today - timedelta(days=WINDOWS[months])).isoformat()
        year = season_year(today)
        current, previous = f'{year}/{year + 1}', f'{year - 1}/{year}'
        seasons = db.query(FormLabSeason).filter(
            FormLabSeason.league.in_(LEAGUE_ORDER), FormLabSeason.season.in_((previous, current)),
        ).all()
        by_key = {(s.league, s.season): s for s in seasons}
        rows, refreshed = [], []
        for league in LEAGUE_ORDER:
            latest = by_key.get((league, current))
            if latest is None:
                continue
            refreshed.append(latest.updated_at)
            rows.extend(_league_gap_rows(latest, by_key.get((league, previous)), since,
                                        today.isoformat(), min_matches))
        rows.sort(key=lambda r: (r['gap'], r['team']))
        return {
            'source': 'Sportmonks', 'metric': 'xG', 'months': months, 'window_days': WINDOWS[months],
            'since': since, 'latest_match': max((r['last_match'] for r in rows), default=None),
            'refreshed_at': min(refreshed).isoformat() + 'Z' if refreshed else None,
            'min_matches': min_matches, 'clubs_in_window': len(rows), 'rows': rows,
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
