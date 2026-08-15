"""
Cross-league team power ratings, fitted from Pinnacle Asian Handicap
CLOSING lines (app/models/closing_line.py, market_type=ASIAN_HANDICAP) —
an in-house replica of PitchRank.fyi's own documented methodology, whose
entire pipeline turns out to be built from the exact two sources this
codebase already ingests (Pinnacle via The Odds API + football-data.co.uk).
Their own FAQ: "we use betting lines for Champions League and Europa
League to calibrate ratings between leagues."

Unlike strength_model.py's per-league Poisson fit (each league normalised
to mean 1.0 INDEPENDENTLY — a 1.2 in the EPL isn't comparable to a 1.2 in
Ligue 1), this produces ONE shared scale across every league it covers.
That cross-league comparability is the entire point of this module, and
is what TODO.md's long-standing "CL/UEL restoration: needs Elo-based
cross-league strengths" blocker has been waiting on.

Two-stage fit, mirroring PitchRank's own described approach:

  Stage 1 (within-league): for each domestic league independently, treat
  every closing AH line as a noisy observation of the neutral-ground
  goal-margin gap between the two teams, and solve a ridge-regularised
  weighted least-squares system for the rating that best explains all of
  them at once. This is a paired-comparison regression (Colley/Massey-
  style), not PitchRank's own sequential online update — a closed-form
  batched solve fits this codebase's existing numerical style
  (strength_model.py) better than an order-dependent heuristic, and
  ridge shrinkage plays the same role as strength_model.py's K_SHRINK:
  a team with a thin sample gets pulled toward the average rather than
  an overconfident extreme.

  Stage 2 (cross-league bridge): every UEFA competition (Champions
  League / Europa League / Conference League) closing AH line between
  two teams from DIFFERENT leagues is a bridge observation. The
  residual between what that line implies and what Stage 1's
  within-league ratings alone would predict is explained by a
  per-league offset — solved the same way, one small weighted
  least-squares system across however many league pairs the season's
  European fixtures happened to connect.

DATA REALITY (verified 2026-08-15 against production): this dataset only
spans since Feb 2026, when ClosingLine started capturing Asian Handicap
rows — nowhere near PitchRank's own 2012-present depth. Ratings will be
noisier early on and firm up as more matchdays get captured automatically
by the existing closing_line_capturer.py job. No new data collection
required to run this — see TODO.md for the full readout.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import ClosingLine, LeagueConstants, MarketType, PowerRating, PowerRatingHistory
from app.models.database import SessionLocal

logger = structlog.get_logger()

DOMESTIC_LEAGUES: list[str] = [
    "soccer_epl",
    "soccer_germany_bundesliga",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
]

# UEFA club competitions used purely as cross-league bridge observations —
# every team in these already gets a Stage 1 rating via its domestic
# league, so these aren't fit independently, just used to connect the
# domestic blocks. Qualifying rounds excluded: too new to have accrued
# closing-line history yet, and matches teams outside the 5 tracked
# domestic leagues more often, which Stage 2 can't bridge anyway (see
# _fit_cross_league_offsets' skip-if-unrated-team behaviour).
BRIDGE_LEAGUES: list[str] = [
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
    "soccer_uefa_europa_conference_league",
]

# Same day-decay half-life as strength_model.py, for consistency — this
# dataset is young (started Feb 2026) so decay barely bites yet; carries
# forward unchanged as more seasons accumulate.
HALF_LIFE_DAYS = 365.0

# Ridge shrinkage strength, in the same "effective weighted matches"
# spirit as strength_model.py's K_SHRINK — deliberately reused at the
# same value for interpretability, not independently tuned (provisional,
# like every other constant in this fit family; no backtest harness for
# this specific model yet).
RIDGE_LAMBDA = 15.0

# Fallback home-advantage-in-goals for leagues with no LeagueConstants
# row (UEFA competitions are deliberately excluded from that table — see
# league_constants_refresher.py). Average of the 5 domestic leagues'
# fitted home advantage as of the 2026-08-15 build, used only when a
# league-specific figure isn't available.
_DEFAULT_HOME_ADV_GOALS = 0.30


def _home_advantage_goals(db: Session, league: str, cache: dict[str, float]) -> float:
    """
    Home advantage in goals for a league, derived from LeagueConstants
    the same way strength_model.py splits avgGoalsPerTeam into home/away
    (home_mult - away_mult) * mu. Falls back to the cross-league average
    default for leagues with no LeagueConstants row (UEFA competitions,
    or a domestic league that hasn't cleared the refresher's minimum-
    sample guard yet).
    """
    if league in cache:
        return cache[league]

    row = db.query(LeagueConstants).filter(LeagueConstants.league == league).first()
    if row is None:
        return _DEFAULT_HOME_ADV_GOALS

    r = row.home_away_ratio
    mu = row.avg_goals_per_team
    home_mult = (2 * r) / (1 + r)
    away_mult = 2 / (1 + r)
    value = mu * (home_mult - away_mult)
    cache[league] = value
    return value


def _implied_neutral_gap(close_line: float, home_adv_goals: float) -> float:
    """
    Convert a Pinnacle AH closing line into the implied neutral-ground
    goal margin (home minus away). close_line sign convention (matches
    spreads_snapshot.py): negative = home gives goals = home favoured.
    So the raw home-favoured margin is -close_line; subtracting the
    league's home advantage isolates the pure talent gap, matching
    PitchRank's own framing ("expected goal difference... on neutral
    ground").
    """
    return -close_line - home_adv_goals


def _decay_weight(kickoff_time: datetime, now: datetime) -> float:
    age_days = max(0, (now - kickoff_time).days)
    return 0.5 ** (age_days / HALF_LIFE_DAYS)


def _load_closing_ah_rows(db: Session, leagues: list[str]) -> list[ClosingLine]:
    return (
        db.query(ClosingLine)
        .filter(ClosingLine.market_type == MarketType.ASIAN_HANDICAP)
        .filter(ClosingLine.league.in_(leagues))
        .filter(ClosingLine.close_line.isnot(None))
        .filter(ClosingLine.close_home_price.isnot(None))
        .filter(ClosingLine.close_away_price.isnot(None))
        .order_by(ClosingLine.kickoff_time.asc())
        .all()
    )


def _fit_within_league(
    db: Session, league: str, now: datetime, home_adv_cache: dict[str, float],
) -> dict[str, tuple[float, float]]:
    """
    Ridge-regularised weighted least squares over one league's closing AH
    lines. Returns team -> (rating, weighted_matches). Ratings are
    mean-zero within this league (pinv's minimum-norm solution on a
    rank-deficient design matrix naturally centres them — the same
    "only relative differences are meaningful" property PitchRank
    describes, just solved in closed form instead of anchored at an
    arbitrary 1.0 origin).
    """
    rows = _load_closing_ah_rows(db, [league])
    if not rows:
        return {}

    home_adv = _home_advantage_goals(db, league, home_adv_cache)

    teams = sorted({r.home_team for r in rows} | {r.away_team for r in rows})
    t_index = {t: i for i, t in enumerate(teams)}
    n_teams = len(teams)
    n_matches = len(rows)

    X = np.zeros((n_matches, n_teams))
    y = np.zeros(n_matches)
    w = np.zeros(n_matches)

    for i, r in enumerate(rows):
        X[i, t_index[r.home_team]] = 1.0
        X[i, t_index[r.away_team]] = -1.0
        y[i] = _implied_neutral_gap(r.close_line, home_adv)
        w[i] = _decay_weight(r.kickoff_time, now)

    sqrt_w = np.sqrt(w)
    Xw = X * sqrt_w[:, None]
    yw = y * sqrt_w

    # Ridge WLS normal equations: (X'WX + λI) r = X'Wy. Small system
    # (n_teams is at most a few dozen per league), direct solve is exact
    # and fast — no iterative convergence loop needed here.
    A = Xw.T @ Xw + RIDGE_LAMBDA * np.eye(n_teams)
    b = Xw.T @ yw
    ratings = np.linalg.solve(A, b)

    weighted_counts = np.zeros(n_teams)
    np.add.at(weighted_counts, [t_index[r.home_team] for r in rows], w)
    np.add.at(weighted_counts, [t_index[r.away_team] for r in rows], w)

    return {
        t: (float(ratings[t_index[t]]), float(weighted_counts[t_index[t]]))
        for t in teams
    }


def _fit_cross_league_offsets(
    db: Session,
    now: datetime,
    within_league: dict[str, dict[str, tuple[float, float]]],
    home_adv_cache: dict[str, float],
) -> dict[str, float]:
    """
    Solve for a per-league offset that best reconciles every UEFA
    competition closing AH line against Stage 1's within-league ratings.
    Bridge matches involving a team with no Stage 1 rating (its domestic
    league isn't one of the 5 tracked, or it never cleared a closing-line
    sample) are skipped — nothing to bridge for those.
    """
    team_league: dict[str, str] = {}
    team_rating: dict[str, float] = {}
    for league, teams in within_league.items():
        for team, (rating, _) in teams.items():
            team_league[team] = league
            team_rating[team] = rating

    rows = _load_closing_ah_rows(db, BRIDGE_LEAGUES)
    bridge_rows = []
    for r in rows:
        lh, la = team_league.get(r.home_team), team_league.get(r.away_team)
        if lh is None or la is None or lh == la:
            continue  # unrated team, or a same-league European tie — no bridge info
        bridge_rows.append((r, lh, la))

    if not bridge_rows:
        logger.warning("Power ranking fit: no usable cross-league bridge fixtures found")
        return {league: 0.0 for league in DOMESTIC_LEAGUES}

    leagues = DOMESTIC_LEAGUES
    l_index = {lg: i for i, lg in enumerate(leagues)}
    n_leagues = len(leagues)
    n_rows = len(bridge_rows)

    Z = np.zeros((n_rows, n_leagues))
    resid = np.zeros(n_rows)
    w = np.zeros(n_rows)

    for i, (r, lh, la) in enumerate(bridge_rows):
        home_adv = _home_advantage_goals(db, r.league, home_adv_cache)
        implied_gap = _implied_neutral_gap(r.close_line, home_adv)
        within_league_gap = team_rating[r.home_team] - team_rating[r.away_team]
        Z[i, l_index[lh]] = 1.0
        Z[i, l_index[la]] = -1.0
        resid[i] = implied_gap - within_league_gap
        w[i] = _decay_weight(r.kickoff_time, now)

    sqrt_w = np.sqrt(w)
    Zw = Z * sqrt_w[:, None]
    residw = resid * sqrt_w

    # Light ridge here too (bridge sample is much thinner than within-
    # league) so a league with few/no European ties this window doesn't
    # get an unconstrained, wildly-extrapolated offset.
    A = Zw.T @ Zw + RIDGE_LAMBDA * np.eye(n_leagues)
    b = Zw.T @ residw
    offsets = np.linalg.solve(A, b)

    return {lg: float(offsets[l_index[lg]]) for lg in leagues}


class PowerRankingFitter:
    """Runs the two-stage fit + upsert. Tracks last-run health state, same
    shape as LeagueConstantsRefresher for a consistent admin-diagnostics
    story across the codebase's refresh jobs."""

    def __init__(self) -> None:
        self.last_run_at: datetime | None = None
        self.last_run_summary: dict[str, Any] | None = None
        self.last_error: str | None = None

    async def refresh(self) -> dict[str, Any]:
        started = datetime.utcnow()
        now = started
        summary: dict[str, Any] = {
            "started_at": started.isoformat() + "Z",
            "leagues": {},
            "teams_rated": 0,
            "bridge_fixtures_used": 0,
            "errors": [],
        }

        db = SessionLocal()
        try:
            home_adv_cache: dict[str, float] = {}

            within_league: dict[str, dict[str, tuple[float, float]]] = {}
            for league in DOMESTIC_LEAGUES:
                try:
                    fit = _fit_within_league(db, league, now, home_adv_cache)
                    within_league[league] = fit
                    summary["leagues"][league] = {"teams": len(fit)}
                except Exception as e:
                    logger.error("Power ranking fit failed for league", league=league, error=str(e))
                    summary["errors"].append(f"{league}: {e}")
                    within_league[league] = {}

            offsets = _fit_cross_league_offsets(db, now, within_league, home_adv_cache)
            summary["league_offsets"] = {lg: round(v, 4) for lg, v in offsets.items()}
            summary["bridge_fixtures_used"] = len(
                _load_closing_ah_rows(db, BRIDGE_LEAGUES)
            )

            all_rows = []
            for league, teams in within_league.items():
                offset = offsets.get(league, 0.0)
                for team, (rating, weighted_matches) in teams.items():
                    all_rows.append({
                        "team": team,
                        "league": league,
                        "rating": rating + offset,
                        "weighted_matches": weighted_matches,
                    })

            for row in all_rows:
                stmt = pg_insert(PowerRating).values(
                    team=row["team"],
                    league=row["league"],
                    rating=row["rating"],
                    weighted_matches=row["weighted_matches"],
                    computed_at=now,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["team"],
                    set_={
                        "league": stmt.excluded.league,
                        "rating": stmt.excluded.rating,
                        "weighted_matches": stmt.excluded.weighted_matches,
                        "computed_at": stmt.excluded.computed_at,
                    },
                )
                db.execute(stmt)
                db.add(PowerRatingHistory(
                    team=row["team"],
                    league=row["league"],
                    rating=row["rating"],
                    weighted_matches=row["weighted_matches"],
                    computed_at=now,
                ))

            db.commit()
            summary["teams_rated"] = len(all_rows)
        except Exception as e:
            db.rollback()
            logger.error("Power ranking fit failed", error=str(e))
            summary["errors"].append(str(e))
        finally:
            db.close()

        summary["finished_at"] = datetime.utcnow().isoformat() + "Z"
        summary["duration_seconds"] = (datetime.utcnow() - started).total_seconds()
        self.last_run_at = datetime.utcnow()
        self.last_run_summary = summary
        self.last_error = summary["errors"][0] if summary["errors"] else None

        logger.info(
            "Power ranking fit complete",
            teams_rated=summary["teams_rated"],
            bridge_fixtures_used=summary["bridge_fixtures_used"],
            errors=len(summary["errors"]),
        )
        return summary


# Singleton — imported by the scheduler and the admin routes.
power_ranking_fitter = PowerRankingFitter()
