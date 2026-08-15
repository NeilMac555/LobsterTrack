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

ClubElo BLEND (added 2026-08-15): after the two-stage fit above, every
team's rating is blended toward a ClubElo-derived prior
(api.clubelo.com — a genuine free, no-key CSV API; verified live before
building against it), weighted so the blend FADES OUT as our own
weighted_matches grows — the same shrinkage-toward-a-prior shape as
K_SHRINK/PROMOTED_ATTACK elsewhere in this codebase, not a permanent
50/50 average. ClubElo is a results-based Elo system (not market-
derived), so this is a genuinely independent stabilising signal while
our own sample is thin, not a duplicate of what Stage 1/2 already do.
ClubElo's rating scale is converted onto ours via an OLS fit against
our OWN already-computed ratings for the overlapping team set (not an
assumed conversion formula) — see _fit_clubelo_scale. Deliberately NOT
tuned to produce any particular team ordering; if the blend doesn't
move a team the way someone expects, that's the honest answer, not a
bug to "fix" by reweighting until it agrees with a prior belief.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import httpx
import numpy as np
import structlog
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import ClosingLine, LeagueConstants, MarketType, PowerRating, PowerRatingHistory
from app.models.database import SessionLocal
from app.services.clubelo_name_map import to_clubelo_name

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

# ClubElo blend strength, in "effective weighted matches" units — a team
# with weighted_matches == CLUBELO_PRIOR_K gets roughly a 50/50 blend
# toward the ClubElo-derived prior; a team with far more matches barely
# moves; a brand-new team (0 matches, shouldn't happen here since it'd
# have no rating at all) would sit almost entirely on the prior.
# Provisional, same status as RIDGE_LAMBDA/HALF_LIFE_DAYS.
CLUBELO_PRIOR_K = 20.0

CLUBELO_API_BASE = "http://api.clubelo.com"


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


async def _fetch_clubelo_ratings() -> dict[str, float]:
    """
    Today's global Elo snapshot from ClubElo's free, no-key CSV API —
    one request, ~600 clubs worldwide. Returns clubelo_name -> elo.
    Network/parse failures return {} so the blend step degrades to
    "no prior available" rather than failing the whole fit — this is
    an enhancement layer, not a dependency the core fit needs.
    """
    today = date.today().isoformat()
    url = f"{CLUBELO_API_BASE}/{today}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
        resp.raise_for_status()
        ratings: dict[str, float] = {}
        lines = resp.text.strip().splitlines()
        header = lines[0].split(",")
        club_i, elo_i = header.index("Club"), header.index("Elo")
        for line in lines[1:]:
            parts = line.split(",")
            try:
                ratings[parts[club_i]] = float(parts[elo_i])
            except (ValueError, IndexError):
                continue
        return ratings
    except Exception as e:
        logger.warning("ClubElo fetch failed, proceeding without the blend", error=str(e))
        return {}


def _fit_clubelo_scale(
    our_ratings: dict[str, float], clubelo_by_team: dict[str, float],
) -> tuple[float, float]:
    """
    OLS fit of our_rating ~ a + b * clubelo_elo over whichever teams we
    have both for — puts ClubElo's ~1000-2100 Elo scale onto our
    goal-margin-ish scale using our OWN data as the calibration target,
    rather than assuming a fixed conversion formula. Falls back to
    (0.0, 0.0) — i.e. the blend contributes nothing — if fewer than 10
    teams overlap (too few points to trust a linear fit).
    """
    teams = [t for t in our_ratings if t in clubelo_by_team]
    if len(teams) < 10:
        logger.warning("ClubElo blend: too few overlapping teams to fit a scale", n=len(teams))
        return 0.0, 0.0

    x = np.array([clubelo_by_team[t] for t in teams])
    y = np.array([our_ratings[t] for t in teams])
    b, a = np.polyfit(x, y, 1)
    return float(a), float(b)


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

            # ClubElo blend — fades out as weighted_matches grows (see
            # module docstring). Failure anywhere in here (network, too
            # few overlapping teams) just leaves ratings as the
            # Stage 1 + Stage 2 fit alone; never blocks the core result.
            clubelo_ratings = await _fetch_clubelo_ratings()
            clubelo_by_team = {
                row["team"]: clubelo_ratings[to_clubelo_name(row["team"])]
                for row in all_rows
                if to_clubelo_name(row["team"]) in clubelo_ratings
            }
            scale_a, scale_b = _fit_clubelo_scale(
                {row["team"]: row["rating"] for row in all_rows}, clubelo_by_team
            )
            blended_count = 0
            if clubelo_by_team and (scale_a, scale_b) != (0.0, 0.0):
                for row in all_rows:
                    elo = clubelo_by_team.get(row["team"])
                    if elo is None:
                        continue
                    scaled_clubelo = scale_a + scale_b * elo
                    blend_weight = CLUBELO_PRIOR_K / (CLUBELO_PRIOR_K + row["weighted_matches"])
                    row["rating"] = (1 - blend_weight) * row["rating"] + blend_weight * scaled_clubelo
                    blended_count += 1

            summary["clubelo_teams_matched"] = len(clubelo_by_team)
            summary["clubelo_teams_blended"] = blended_count
            summary["clubelo_scale"] = {"a": round(scale_a, 4), "b": round(scale_b, 6)}

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
