"""
Weekly refresh of avgGoalsPerTeam/homeAwayRatio per league, computed from
our own historical_matches data instead of the hand-tuned values
hardcoded in frontend/src/pages/MatchPredictorPage.tsx.

Rolling window = current season + last 3 completed seasons (up to 4
season-buckets), weighted by recency: the top 2 buckets (current +
most-recent-completed) both get 1.0, then 0.67, then 0.33. "Current
season" is just the most recent season code present for that league —
if it's already fully finished (no newer season started yet), the
window naturally collapses to 3 completed seasons all still getting
their normal weight; nothing special-cased.

  avgGoalsPerTeam = weighted total goals / (weighted matches * 2)
  homeAwayRatio   = weighted home goals / weighted away goals

Guard: if a league's weighted match count < MIN_WEIGHTED_MATCHES, skip
it entirely for this run (existing row, if any, is left untouched) and
flag it in the summary — the frontend falls back to its own hardcoded
default for that league when no live row exists (see
GET /league-constants and MatchPredictorPage.tsx).

Mirrors app/services/xg_refresher.py's structure (singleton with
last_run_at/last_run_summary/last_error, self-contained try/except so
one league's failure can't take down the others or the scheduler).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models import HistoricalMatch, LeagueConstants, LeagueConstantsHistory
from app.models.database import SessionLocal

logger = structlog.get_logger()

# The 5 leagues with real historical_matches coverage and a LEAGUE_PARAMS
# entry — kept in sync with scripts/model-params.ts's SUPPORTED_LEAGUES.
# CL/UEL are deliberately excluded (no historical_matches data for them).
SUPPORTED_LEAGUES: list[str] = [
    "soccer_epl",
    "soccer_germany_bundesliga",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
]

# Season-bucket weights by recency rank (0 = current season, 3 = oldest
# completed season in the window). See docs/calibration/steps23-diagnosis.md
# for the H2/H5-style precedent of season-weighted computations in this
# codebase.
WEIGHTS_BY_RANK: list[float] = [1.0, 1.0, 0.67, 0.33]

MIN_WEIGHTED_MATCHES = 380


def _compute_league(db, league: str) -> dict[str, Any] | None:
    """
    Returns the computed constants for one league, or None if the
    <380-weighted-match guard triggers (caller skips the upsert).
    """
    rows = (
        db.query(HistoricalMatch.season, HistoricalMatch.fthg, HistoricalMatch.ftag)
        .filter(HistoricalMatch.league == league, HistoricalMatch.ftr.isnot(None))
        .all()
    )

    # Season codes are consecutive 4-digit strings (e.g. '2526' > '2425') —
    # lexical sort = chronological sort, same trick as the backend's
    # existing _latest_xg_season() helper for xg_data.
    seasons_present = sorted({r.season for r in rows}, reverse=True)
    top_seasons = seasons_present[:4]
    weight_by_season = {s: WEIGHTS_BY_RANK[i] for i, s in enumerate(top_seasons)}

    weighted_goals = 0.0
    weighted_home_goals = 0.0
    weighted_away_goals = 0.0
    weighted_matches = 0.0

    for r in rows:
        w = weight_by_season.get(r.season)
        if w is None or r.fthg is None or r.ftag is None:
            continue
        weighted_goals += w * (r.fthg + r.ftag)
        weighted_home_goals += w * r.fthg
        weighted_away_goals += w * r.ftag
        weighted_matches += w

    if weighted_matches < MIN_WEIGHTED_MATCHES:
        logger.warning(
            "League constants refresh: guard triggered, skipping league",
            league=league,
            weighted_matches=round(weighted_matches, 1),
            threshold=MIN_WEIGHTED_MATCHES,
        )
        return None

    return {
        "league": league,
        "avg_goals_per_team": weighted_goals / (weighted_matches * 2),
        "home_away_ratio": weighted_home_goals / weighted_away_goals,
        "sample_matches": weighted_matches,
        "seasons_used": top_seasons,
    }


class LeagueConstantsRefresher:
    """Runs the weighted historical_matches computation + upsert. Tracks last-run health state."""

    def __init__(self) -> None:
        self.last_run_at: datetime | None = None
        self.last_run_summary: dict[str, Any] | None = None
        self.last_error: str | None = None

    async def refresh(self) -> dict[str, Any]:
        started = datetime.utcnow()
        summary: dict[str, Any] = {
            "started_at": started.isoformat() + "Z",
            "leagues": {},
            "flagged": [],
            "errors": [],
        }

        db = SessionLocal()
        try:
            for league in SUPPORTED_LEAGUES:
                try:
                    computed = _compute_league(db, league)
                    if computed is None:
                        summary["flagged"].append(league)
                        continue

                    now = datetime.utcnow()
                    stmt = pg_insert(LeagueConstants).values(
                        league=computed["league"],
                        avg_goals_per_team=computed["avg_goals_per_team"],
                        home_away_ratio=computed["home_away_ratio"],
                        sample_matches=computed["sample_matches"],
                        computed_at=now,
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["league"],
                        set_={
                            "avg_goals_per_team": stmt.excluded.avg_goals_per_team,
                            "home_away_ratio": stmt.excluded.home_away_ratio,
                            "sample_matches": stmt.excluded.sample_matches,
                            "computed_at": stmt.excluded.computed_at,
                        },
                    )
                    db.execute(stmt)

                    db.add(LeagueConstantsHistory(
                        league=computed["league"],
                        avg_goals_per_team=computed["avg_goals_per_team"],
                        home_away_ratio=computed["home_away_ratio"],
                        sample_matches=computed["sample_matches"],
                        computed_at=now,
                    ))
                    db.commit()

                    summary["leagues"][league] = {
                        "avg_goals_per_team": round(computed["avg_goals_per_team"], 4),
                        "home_away_ratio": round(computed["home_away_ratio"], 4),
                        "sample_matches": round(computed["sample_matches"], 1),
                        "seasons_used": computed["seasons_used"],
                    }
                    logger.info(
                        "League constants refresh: league updated",
                        league=league,
                        avg_goals_per_team=round(computed["avg_goals_per_team"], 4),
                        home_away_ratio=round(computed["home_away_ratio"], 4),
                        sample_matches=round(computed["sample_matches"], 1),
                    )
                except Exception as e:
                    db.rollback()
                    msg = f"Failed to compute/upsert {league}: {e}"
                    logger.error("League constants refresh failed for league", league=league, error=str(e))
                    summary["errors"].append(msg)
        finally:
            db.close()

        summary["finished_at"] = datetime.utcnow().isoformat() + "Z"
        summary["duration_seconds"] = (datetime.utcnow() - started).total_seconds()
        self.last_run_at = datetime.utcnow()
        self.last_run_summary = summary
        self.last_error = summary["errors"][0] if summary["errors"] else None

        logger.info(
            "League constants refresh complete",
            leagues_ok=len(summary["leagues"]),
            flagged=len(summary["flagged"]),
            errors=len(summary["errors"]),
        )
        return summary


# Singleton — imported by the scheduler and the admin routes.
league_constants_refresher = LeagueConstantsRefresher()
