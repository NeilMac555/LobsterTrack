"""Responsive, matched-sample league references for the manual match predictor.

Read-only: does not change the league_constants used by other forecast tools.
Each Understat home row describes one complete match, including both teams.
The previous season contributes at most 100 equivalent matches; current-season
matches then progressively replace that prior. This is a transparent smoothing
choice, not a fitted accuracy claim. Team-input references use current-season
goals/xG/penalty xG from the same sample as the requested team inputs; smoothing
those denominators as well would mistake a league-wide rise for team strength.
"""
from __future__ import annotations

from datetime import date, datetime
import math
import time

from app.models import LeagueConstants
from app.models.xg_team_result import XGTeamResult
from app.services.league_constants_refresher import SUPPORTED_LEAGUES

PRIOR_MATCHES = 100
MIN_MATCHES = 50
CACHE_SECONDS = 600
METHOD = "season-blend-v1"
_cache = {}


def season_code(year: int) -> str:
    return f"{year % 100:02d}{(year + 1) % 100:02d}"


def calculate_baseline(rows: list[dict], as_of: date) -> dict | None:
    """Pure calculation; as_of is exclusive to support historical evaluation."""
    year = as_of.year if as_of.month >= 7 else as_of.year - 1
    current, previous = season_code(year), season_code(year - 1)
    buckets = {current: [], previous: []}
    seen = set()
    for row in rows:
        season = row.get("season")
        if season not in buckets:
            continue
        try:
            played = date.fromisoformat(str(row["match_date"])[:10])
            if played >= as_of:
                continue
            # Season labels must agree with the actual match date.
            start = int("20" + season[:2])
            if not date(start, 7, 1) <= played < date(start + 1, 7, 1):
                continue
            gf, ga, xf, xa, nf, na = [float(row[k]) for k in (
                "goals_for", "goals_against", "xg_for", "xg_against",
                "npxg_for", "npxg_against")]
            if not all(math.isfinite(x) and x >= 0 for x in (gf, ga, xf, xa, nf, na)):
                continue
            if not gf.is_integer() or not ga.is_integer() or nf > xf + 1e-6 or na > xa + 1e-6:
                continue
            key = (season, played, row["team_name"])
            if key in seen:
                continue
            seen.add(key)
            buckets[season].append({"date": played, "goals": (gf + ga) / 2,
                                    "xg": (xf + xa) / 2,
                                    "penalty_xg": max(0, (xf + xa - nf - na) / 2)})
        except (KeyError, TypeError, ValueError, OverflowError):
            continue

    now_rows, prior_rows = buckets[current], buckets[previous]
    n, p = len(now_rows), len(prior_rows)
    if n + p < MIN_MATCHES:
        return None
    prior_mass = min(p, PRIOR_MATCHES)
    weight = n / (n + prior_mass)

    def blend(key):
        recent = sum(r[key] for r in now_rows) / n if n else 0
        prior = sum(r[key] for r in prior_rows) / p if p else 0
        return weight * recent + (1 - weight) * prior

    goals = blend("goals")
    reference_rows = now_rows or prior_rows
    reference_goals, xg, penalty = [sum(r[key] for r in reference_rows) / len(reference_rows)
                                   for key in ("goals", "xg", "penalty_xg")]
    if goals <= 0 or xg <= 0 or xg - penalty <= 0:
        return None
    used = now_rows + prior_rows
    return {
        "avg_goals_per_team": goals,
        "avg_goals_reference": reference_goals,
        "avg_xg": xg,
        "avg_penalty_xg": penalty,
        "sample_matches": n + p,
        "current_season": current,
        "previous_season": previous,
        "current_matches": n,
        "previous_matches": p,
        "current_weight": weight,
        "reference_season": current if n else previous,
        "reference_matches": len(reference_rows),
        "prior_equivalent_matches": prior_mass,
        "current_goals_per_match": 2 * sum(r["goals"] for r in now_rows) / n if n else None,
        "previous_goals_per_match": 2 * sum(r["goals"] for r in prior_rows) / p if p else None,
        "latest_match": max(r["date"] for r in used).isoformat(),
        "data_status": "current_season" if n else "previous_season_only",
        "source": "Understat",
        "method": METHOD,
    }


def get_baselines(db) -> dict:
    today = datetime.utcnow().date()
    cache_key = (str(db.get_bind().url), today)
    cached = _cache.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    year = today.year if today.month >= 7 else today.year - 1
    rows = db.query(XGTeamResult).filter(
        XGTeamResult.home.is_(True),
        XGTeamResult.season.in_([season_code(year), season_code(year - 1)]),
        XGTeamResult.match_date < today,
    ).all()
    by_league = {key: [] for key in SUPPORTED_LEAGUES}
    for row in rows:
        if row.league in by_league:
            by_league[row.league].append({key: getattr(row, key) for key in (
                "season", "match_date", "team_name", "goals_for", "goals_against",
                "xg_for", "xg_against", "npxg_for", "npxg_against")})
    home_ratios = {row.league: row for row in db.query(LeagueConstants).all()}
    baselines, unavailable = [], []
    for league, matches in by_league.items():
        result = calculate_baseline(matches, today)
        venue = home_ratios.get(league)
        if result is None or venue is None or not math.isfinite(venue.home_away_ratio) or venue.home_away_ratio <= 0:
            unavailable.append(league)
            continue
        baselines.append({**result, "league": league,
                          "home_away_ratio": venue.home_away_ratio,
                          "home_ratio_computed_at": venue.computed_at.isoformat(),
                          "computed_at": datetime.utcnow().isoformat() + "Z"})
    payload = {"baselines": baselines, "unavailable": unavailable}
    _cache.clear()
    _cache[cache_key] = (time.monotonic() + CACHE_SECONDS, payload)
    return payload
