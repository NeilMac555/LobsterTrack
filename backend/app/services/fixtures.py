"""
Shared fixture helpers for the crawlable link structure (2026-11-10 SEO audit).

  LEAGUES            sport_key <-> URL slug + display name for /league/<slug>
  ghost_map(db)      duplicate fixture records -> the surviving record
  league_fixtures    upcoming + finished matches for one league hub
  upcoming_fixtures  upcoming matches across leagues (homepage raw-HTML list)
  related_matches    other matches in the same league around the same date

Ghost fixtures: when a kickoff is moved, The Odds API sometimes issues a new
event id and the old record is left behind with stale (or no) prices. Both
records then render the same "Home vs Away" page. A record is a ghost when
another record has the same league, home and away within 4 days; the survivor
is the one with the most recent odds snapshot (ties: the later kickoff).
Ghosts are 301-redirected to the survivor and left out of sitemaps and lists.
Nothing is deleted.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# sport_key -> (slug, display name, in footer/league bar)
LEAGUES: dict[str, tuple[str, str, bool]] = {
    "soccer_epl": ("premier-league", "Premier League", True),
    "soccer_efl_champ": ("championship", "EFL Championship", True),
    "soccer_spain_la_liga": ("la-liga", "La Liga", True),
    "soccer_germany_bundesliga": ("bundesliga", "Bundesliga", True),
    "soccer_france_ligue_one": ("ligue-1", "Ligue 1", True),
    "soccer_italy_serie_a": ("serie-a", "Serie A", True),
    "soccer_uefa_champs_league": ("champions-league", "Champions League", True),
    "soccer_uefa_europa_league": ("europa-league", "Europa League", True),
    "soccer_uefa_europa_conference_league": ("conference-league", "Conference League", True),
    "soccer_uefa_champs_league_qualification": ("champions-league-qualifying", "Champions League Qualifying", False),
    "soccer_uefa_nations_league": ("nations-league", "UEFA Nations League", True),
    "soccer_fifa_world_cup": ("world-cup", "FIFA World Cup", False),
}
SLUG_TO_KEY = {v[0]: k for k, v in LEAGUES.items()}
GHOST_WINDOW_DAYS = 4
CACHE_TTL_SECONDS = 600

_cache: dict[str, tuple[float, Any]] = {}


def _cached(key: str, build, ttl: int = CACHE_TTL_SECONDS):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = build()
    _cache[key] = (now + ttl, value)
    return value


def league_slug(sport_key: str) -> Optional[str]:
    v = LEAGUES.get(sport_key)
    return v[0] if v else None


def league_name(sport_key: str) -> str:
    v = LEAGUES.get(sport_key)
    return v[1] if v else sport_key


def season_start(now: Optional[datetime] = None) -> datetime:
    now = now or datetime.utcnow()
    return datetime(now.year if now.month >= 7 else now.year - 1, 7, 1)


# ------------------------------------------------------------------ ghosts

def ghost_map(db: Session) -> dict[str, str]:
    """{ghost match id: surviving match id} for this season's fixtures."""
    def build():
        rows = db.execute(text("""
            select m.id, m.sport_key, m.home_team, m.away_team, m.commence_time,
                   (select max(fetched_at) from odds_snapshots s where s.match_id = m.id) as last_snap
            from matches m
            where m.commence_time >= :since
              and exists (select 1 from matches o where o.sport_key = m.sport_key and o.home_team = m.home_team
                          and o.away_team = m.away_team and o.id <> m.id
                          and abs(extract(epoch from (o.commence_time - m.commence_time))) < :win)
            order by m.sport_key, m.home_team, m.away_team, m.commence_time
        """), {"since": season_start() - timedelta(days=30), "win": GHOST_WINDOW_DAYS * 86400}).fetchall()
        groups: list[list] = []
        for r in rows:
            g = groups[-1] if groups else None
            if g and g[-1].sport_key == r.sport_key and g[-1].home_team == r.home_team and g[-1].away_team == r.away_team \
                    and (r.commence_time - g[-1].commence_time) < timedelta(days=GHOST_WINDOW_DAYS):
                g.append(r)
            else:
                groups.append([r])
        out: dict[str, str] = {}
        for g in groups:
            if len(g) < 2:
                continue
            survivor = max(g, key=lambda r: (r.last_snap or datetime.min, r.commence_time))
            for r in g:
                if r.id != survivor.id:
                    out[r.id] = survivor.id
        return out
    return _cached("ghosts", build)


# ------------------------------------------------------------------ lists

def _rows(db: Session, where: str, params: dict, order: str, limit: int) -> list[dict]:
    """Matches with at least one odds snapshot, with the closing 1X2 price
    (finished) from closing_lines. Ghosts removed."""
    ghosts = ghost_map(db)
    rows = db.execute(text(f"""
        select m.id, m.sport_key, m.home_team, m.away_team, m.commence_time,
               c.close_home, c.close_draw, c.close_away
        from matches m
        left join closing_lines c on c.match_id = m.id and c.market_type = 'H2H'
        where {where}
          and exists (select 1 from odds_snapshots s where s.match_id = m.id)
        order by {order} limit :lim
    """), {**params, "lim": limit}).fetchall()
    out, seen = [], set()
    for r in rows:
        if r.id in ghosts or r.id in seen:
            continue
        seen.add(r.id)
        out.append({"id": r.id, "sport_key": r.sport_key, "home_team": r.home_team, "away_team": r.away_team,
                    "commence_time": r.commence_time.isoformat(), "close_home": r.close_home,
                    "close_draw": r.close_draw, "close_away": r.close_away})
    return out


def league_fixtures(db: Session, sport_key: str) -> dict[str, Any]:
    def build():
        now = datetime.utcnow()
        upcoming = _rows(db, "m.sport_key = :k and m.commence_time > :now", {"k": sport_key, "now": now},
                         "m.commence_time asc", 80)
        finished = _rows(db, "m.sport_key = :k and m.commence_time <= :now and m.commence_time >= :since",
                         {"k": sport_key, "now": now, "since": season_start(now)}, "m.commence_time desc", 600)
        return {"sport_key": sport_key, "slug": league_slug(sport_key), "name": league_name(sport_key),
                "upcoming": upcoming, "finished": finished}
    return _cached(f"league:{sport_key}", build)


def upcoming_fixtures(db: Session, limit: int = 250) -> list[dict]:
    return _cached(f"upcoming:{limit}", lambda: _rows(
        db, "m.commence_time > :now and m.commence_time < :until",
        {"now": datetime.utcnow(), "until": datetime.utcnow() + timedelta(days=30)}, "m.commence_time asc", limit), ttl=300)


def related_matches(db: Session, match_id: str, sport_key: str, commence_time: datetime, limit: int = 12) -> list[dict]:
    """Other matches in the same competition within 4 days either side,
    nearest kickoff first."""
    def build():
        rows = _rows(db, "m.sport_key = :k and m.id <> :id and m.commence_time between :a and :b",
                     {"k": sport_key, "id": match_id, "a": commence_time - timedelta(days=4),
                      "b": commence_time + timedelta(days=4)}, "m.commence_time asc", 60)
        rows.sort(key=lambda r: abs((datetime.fromisoformat(r["commence_time"]) - commence_time).total_seconds()))
        return sorted(rows[:limit], key=lambda r: r["commence_time"])
    return _cached(f"related:{match_id}", build)


def active_leagues(db: Session) -> list[str]:
    """sport_keys that have at least one match with odds this season."""
    def build():
        rows = db.execute(text("""select distinct m.sport_key from matches m where m.commence_time >= :since
            and exists (select 1 from odds_snapshots s where s.match_id = m.id)"""), {"since": season_start()}).fetchall()
        return [k for k in LEAGUES if k in {r[0] for r in rows}]
    return _cached("active_leagues", build, ttl=3600)
