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

IDENTIFICATION PRINCIPLE (added 2026-08-15, external quant review):
domestic-only data — AH lines, domestic outright markets, ClubElo,
squad value — mathematically CANNOT identify a league's overall level.
Adding a constant to every team in a league leaves every within-league
match probability, and therefore every domestic outright probability,
unchanged. Only data where teams from DIFFERENT leagues are compared —
European fixtures, European outright markets, UEFA's own coefficient —
can inform the per-league offset (Stage 2). Verified live against
production: correlation between log squad value and rating had reached
0.965 (0.98+ within some leagues), and the EPL's Stage 2 offset
(+0.210) was nearly 3x the spread of the other four leagues combined
(0.083) — a thin EPL sample (fewest weighted_matches of the five
leagues) getting the heaviest shrinkage toward a structurally
money-inflated prior (mean EPL squad value ~€689m vs ~€340m in Serie
A). The fix: ClubElo and squad value are now mean-centered within each
team's own league (_center_within_league) BEFORE their scale-fit and
blend, and blended into Stage 1's own output — mean-zero within league
by construction — strictly BEFORE the Stage 2 offset is added. Centered
signals can only reorder teams inside their own league; they are
structurally incapable of lifting a whole league, however money-
inflated that league's prior is.

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
ClubElo's rating scale is converted onto ours using our OWN
already-computed ratings as the calibration target, not an assumed
conversion formula. Deliberately NOT tuned to produce any particular
team ordering; if the blend doesn't move a team the way someone
expects, that's the honest answer, not a bug to "fix" by reweighting
until it agrees with a prior belief. (Scale-fitting mechanism rewritten
2026-08-15 — see the COMPRESSION BUGS section below.)

SQUAD VALUE BLEND (added 2026-08-15): a third fading prior, applied
after ClubElo, toward each team's squad market value (see
squad_value_importer.py — Transfermarkt has no API, so this is a
manually-entered snapshot covering a subset of tracked teams). There's
a well-documented correlation between squad spend/value and on-pitch
success in the football-analytics literature (the "money league"
wage-spend studies), so this is a legitimate independent signal, not
noise. But it's a VALUATION metric, not an observed-performance one
the way ClubElo or the AH lines themselves are — a team can carry a
big-money squad while underperforming — so it's given proportionally
less trust (SQUAD_VALUE_PRIOR_K < CLUBELO_PRIOR_K) and only applies to
teams we have a value on file for. Market value spans nearly three
orders of magnitude, so the scale conversion fits against ln(value),
not raw value — otherwise the handful of superclubs would dominate.
Same "not tuned toward a particular ordering" principle as the ClubElo
blend: this is fit from the data, not adjusted until any specific team
lands where someone expects. (Scale-fitting mechanism rewritten
2026-08-15 — see the COMPRESSION BUGS section below.)

UCL OUTRIGHT BLEND (added 2026-08-15): a fourth fading prior, applied
after squad value, toward each team's Champions League outright-winner
probability — Polymarket's live "UEFA Champions League: 2027 Champion"
market (see outright_fetcher.py; $7.8M+ real volume, verified before
building against it). The Odds API has no outright market for this
competition at all, so Polymarket is the only ToS-clean source, same
as the domestic-league outrights already used by the Forecast Engine.
Given a DECENT weight (UCL_WINNER_PRIOR_K, comparable to
CLUBELO_PRIOR_K) — unlike squad value, this is a genuine forward-
looking market price on the exact question of who's best positioned to
go all the way, already pricing in current form, squad depth and
fixture difficulty, so it earns more trust than a valuation metric.
Only 29 teams have a market at all, and only the ~20 from our 5
tracked domestic leagues resolve to one of our team names — everyone
else is untouched by this step. Probabilities are fit on the logit
scale, not raw probability — the standard transform for a heavily
skewed 0-1 signal (a few favourites near 0.15, a long tail near
0.001), avoiding compression at either end. Same principle as every
blend above: fit from the data, not tuned toward an outcome.

UEFA COUNTRY COEFFICIENT BLEND (added 2026-08-15): unlike the four
blends above, which nudge TEAM ratings, this one nudges Stage 2's
per-LEAGUE offsets — the part of the whole fit with by far the
thinnest sample (a few dozen UEFA fixtures split across 5 leagues,
vs. dozens of AH-line matches per team within a league). UEFA
publishes an official "association coefficient" per country — an
aggregate 5-season European-competition scoring record, used by UEFA
itself to allocate access lists — which is exactly the same
cross-league-strength question Stage 2 is trying to answer from a
much smaller sample. Hardcoded (UEFA_COUNTRY_COEFFICIENTS) rather than
fetched: the two scrapeable mirrors were both ruled out (kassiesa.net's
robots.txt explicitly disallows bots; uefa.com blocks automated
fetches outright) and the values are static enough within a season to
refresh by hand occasionally, sourced from Wikipedia's "UEFA country
coefficient" article (CC-BY-SA, robots.txt-permitted). Scale conversion
(_uefa_coefficient_prior_offsets) matches mean and standard deviation
rather than fitting OLS — with only 5 leagues, a 2-parameter
least-squares fit would overfit to noise. Same fading-prior shape as
every other blend, weighted by each league's own bridge-fixture sample
size (LEAGUE_COEFF_PRIOR_K), not tuned toward a particular ordering.

COMPRESSION BUGS (fixed 2026-08-15, external quant review — verified
both against production data AND against a from-scratch synthetic
reproduction, prove_compression.py, before any code changed):

  Bug 1 — WITHIN_LEAGUE_RIDGE_LAMBDA was 15.0 against a Stage 1 design-
  matrix diagonal of only ~9.8 (the EPL's own weighted-match count).
  Ridge shrinkage toward zero scales roughly as n/(n+λ) — at n≈9.8,
  λ=15 recovers only ~34% of a team's true rating spread, verified
  by fitting a synthetic 20-team league with KNOWN strengths and
  PERFECT noiseless AH lines back through the exact production code
  path: not noise, not mis-ordering, systematic flattening before any
  prior even runs. Explains why the EPL — the tracked league with the
  FEWEST weighted matches — showed the most compressed rating spread.
  Fixed by splitting the single shared RIDGE_LAMBDA into
  WITHIN_LEAGUE_RIDGE_LAMBDA=2.0 (Stage 1 only) and
  CROSS_LEAGUE_RIDGE_LAMBDA=15.0 (Stage 2, unchanged — that usage
  wasn't part of this diagnosis). Still a stopgap: the properly-
  estimated value is λ = σ²_line_noise / σ²_team_strength from a real
  backtest harness, not a hand-picked constant.

  Bug 2 — every prior (ClubElo, squad value, UCL outright) used to be
  put on our scale via np.polyfit(prior, our_ratings, 1), then blended
  toward the FITTED VALUES of that regression. The fitted values of an
  OLS regression have variance r² · Var(y) — strictly ≤ Var(y) — so
  this construction can only ever compress a rating's spread, at ANY
  blend weight, for ANY prior. It is arithmetically incapable of
  telling the model it's too flat, which is exactly the shape of the
  failure this review found (every league's favourites under-rated
  versus Pinnacle/Polymarket outright pricing, by a similar relative
  amount, sign never flipping). It's also most of the mechanism behind
  the high correlation between ratings and Transfermarkt squad value:
  three regressions in a row, each one projecting the ratings further
  onto its own prior's axis. Fixed with _scale_prior_to_target: a pure
  z-score rescale (center and standardize the prior, then re-expand to
  a target mean/SD) instead of a regression against our own — possibly
  already too flat — ratings. The target itself is still an interim
  stand-in (read from the current ratings' own spread just before each
  blend runs, so priors can no longer compress further, but aren't yet
  told to be WIDER either) — the properly-estimated target comes from
  inverting each league's outright market (back out the strength
  spread whose simulated season reproduces the market's title
  probabilities), which needs a season simulator this codebase doesn't
  have yet. That's the next piece of this work, not done here.

  Bug 3 (partial — domestic wiring not yet done) — outright_fetcher.py
  already polls FIVE domestic league-winner books hourly alongside the
  UCL one (EPL, La Liga, Serie A, Bundesliga, Ligue 1 — all in
  outright_snapshots with excellent book-sum quality, e.g. La Liga at
  1.009), but _fetch_ucl_outright_probs only ever reads the UCL market.
  Wiring the domestic five in (and inverting them for Bug 2's proper
  target_sd) is flagged but not implemented in this pass — needs the
  same season-simulator dependency as Bug 2's real fix, plus a guard
  against reading a since-resolved market as if it were still live
  (a negRisk event can report `active` after settling).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

import httpx
import numpy as np
import structlog
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import ClosingLine, LeagueConstants, MarketType, OutrightSnapshot, PowerRating, PowerRatingHistory, SquadMarketValue
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

# Ridge shrinkage strength for Stage 1 (within-league, _fit_within_league).
# Was 15.0, reused from strength_model.py's K_SHRINK "for interpretability" —
# but K_SHRINK's 15 was calibrated against a different model with a
# different sample size, and the EPL's own weighted-match diagonal here
# is only ~9.8. Fixed 2026-08-15 (external quant review, verified with
# prove_compression.py against a synthetic league of KNOWN strengths and
# PERFECT noiseless AH lines): at λ=15 with ~9.8 matches/team, a flawless
# signal comes back at ~34% of its true spread — not noisy, not
# mis-ordered, systematically flattened before any prior is even applied.
# 2.0 recovers ~76% of true spread at the same sample size (verified via
# the same script). Still provisional — the PROPER fix is
# λ = σ²_line_noise / σ²_team_strength, estimated from data via a real
# backtest harness, not chosen by hand; this is a stopgap, not the final
# answer. Left renamed (was shared with Stage 2's cross-league offset
# fit) because that usage wasn't part of this diagnosis or this
# script's reproduction — CROSS_LEAGUE_RIDGE_LAMBDA below is unchanged.
WITHIN_LEAGUE_RIDGE_LAMBDA = 2.0

# Ridge shrinkage for Stage 2 (cross-league bridge offsets). Was the
# same constant as Stage 1 (RIDGE_LAMBDA=15.0) before the 2026-08-15
# split above — kept at its original value since the bridge-fixture
# diagnosis above was specific to Stage 1's much larger per-team
# diagonal; this one hasn't been separately verified against a
# synthetic reproduction and shouldn't be changed on the strength of
# that unrelated finding.
CROSS_LEAGUE_RIDGE_LAMBDA = 15.0

# Fallback home-advantage-in-goals for leagues with no LeagueConstants
# row (UEFA competitions are deliberately excluded from that table — see
# league_constants_refresher.py). Average of the 5 domestic leagues'
# fitted home advantage as of the 2026-08-15 build, used only when a
# league-specific figure isn't available.
_DEFAULT_HOME_ADV_GOALS = 0.30

# Minimum overlapping teams before trusting a prior's own std()/mean()
# enough to rescale it onto our target (_scale_prior_to_target) — same
# conservative threshold the old OLS-based fits used, though a simple
# moment estimate needs less data than a 2-parameter regression did.
MIN_TEAMS_FOR_PRIOR_SCALE = 10

# ClubElo blend strength, in "effective weighted matches" units — a team
# with weighted_matches == CLUBELO_PRIOR_K gets roughly a 50/50 blend
# toward the ClubElo-derived prior; a team with far more matches barely
# moves; a brand-new team (0 matches, shouldn't happen here since it'd
# have no rating at all) would sit almost entirely on the prior.
# Provisional, same status as RIDGE_LAMBDA/HALF_LIFE_DAYS.
CLUBELO_PRIOR_K = 20.0

CLUBELO_API_BASE = "http://api.clubelo.com"

# Squad value blend strength — same shrinkage shape as CLUBELO_PRIOR_K,
# but deliberately lower: squad value is a valuation metric (what a
# squad cost), not an observed-performance one like ClubElo or the AH
# lines themselves, so it earns less trust at any given sample size.
# Trimmed 8.0 -> 6.0 on 2026-08-15 (user asked for slightly less
# weight on squad value) to lean it a little further away from the
# valuation signal.
SQUAD_VALUE_PRIOR_K = 6.0

# UCL outright blend strength — given a DECENT weight per explicit
# request, comparable to CLUBELO_PRIOR_K rather than SQUAD_VALUE_PRIOR_K:
# this is a genuine forward-looking market price (Polymarket, real
# money) on the specific question of who's best positioned to win the
# competition, not a valuation proxy, so it earns more trust than
# squad value at any given sample size.
UCL_WINNER_PRIOR_K = 20.0

_UEFA_CL_LEAGUE = "soccer_uefa_champs_league"
_UEFA_CL_WINNER_MARKET = "winner"

# UEFA's published association ("country") coefficient — aggregate
# 5-season European-competition performance per nation, used league-
# wide by UEFA itself to allocate CL/UEL access lists. Source: Wikipedia
# ("UEFA country coefficient"; CC-BY-SA, robots.txt-permitted) as of
# 2026-08-15 — the two more granular sources checked first were both
# ruled out: kassiesa.net's own community mirror explicitly disallows
# bots via robots.txt ("Disallow: /"), and uefa.com itself blocks
# automated fetches outright. Small and static enough (5 leagues) to
# hardcode and refresh by hand occasionally rather than build a fetcher
# for — see the module docstring for how this blend is used.
UEFA_COUNTRY_COEFFICIENTS: dict[str, float] = {
    "soccer_epl": 101.852,
    "soccer_italy_serie_a": 87.660,
    "soccer_spain_la_liga": 82.368,
    "soccer_germany_bundesliga": 80.116,
    "soccer_france_ligue_one": 67.796,
}

# League-coefficient blend strength, in "weighted bridge-fixture
# involvement" units (see _fit_cross_league_offsets's second return
# value) — the bridge sample is thin (a few dozen European fixtures
# split across 5 leagues most seasons), so this prior can matter even
# at a moderate K. Provisional, same status as every other *_PRIOR_K.
LEAGUE_COEFF_PRIOR_K = 10.0


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
    A = Xw.T @ Xw + WITHIN_LEAGUE_RIDGE_LAMBDA * np.eye(n_teams)
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
) -> tuple[dict[str, float], dict[str, float]]:
    """
    Solve for a per-league offset that best reconciles every UEFA
    competition closing AH line against Stage 1's within-league ratings.
    Bridge matches involving a team with no Stage 1 rating (its domestic
    league isn't one of the 5 tracked, or it never cleared a closing-line
    sample) are skipped — nothing to bridge for those.

    Returns (offsets, weighted_bridge_involvement) — the second dict is
    each league's total decay-weighted bridge-fixture involvement (used
    by the UEFA-coefficient blend below to fade its prior in/out per
    league, the same role weighted_matches plays for team-level blends).
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
        return {league: 0.0 for league in DOMESTIC_LEAGUES}, {league: 0.0 for league in DOMESTIC_LEAGUES}

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
    A = Zw.T @ Zw + CROSS_LEAGUE_RIDGE_LAMBDA * np.eye(n_leagues)
    b = Zw.T @ residw
    offsets = np.linalg.solve(A, b)

    bridge_weight = np.zeros(n_leagues)
    for i, (_, lh, la) in enumerate(bridge_rows):
        bridge_weight[l_index[lh]] += w[i]
        bridge_weight[l_index[la]] += w[i]

    return (
        {lg: float(offsets[l_index[lg]]) for lg in leagues},
        {lg: float(bridge_weight[l_index[lg]]) for lg in leagues},
    )


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


def _center_within_league(
    values: dict[str, float], team_league: dict[str, str],
) -> dict[str, float]:
    """
    Subtract each team's OWN league's mean from `values`, computing that
    mean only from the teams actually present in `values` (not the full
    98-team universe) — so a signal that only covers a subset of teams
    per league is still centered correctly on that subset.

    This is the fix for a real, verified bug (2026-08-15, external quant
    review): ClubElo and squad value both run structurally higher in the
    EPL than the other four leagues (mean squad value ~€689m vs ~€340m
    in Serie A), and blending either signal in WITHOUT centering doesn't
    just reorder teams within a league — it drags the whole league's
    ratings upward, contaminating Stage 2's job (the league-level
    offset) with domestic covariate data that mathematically cannot
    identify a league's level (adding a constant to every team in a
    league leaves every within-league match probability unchanged — see
    the module docstring's identification note). Centering first means
    these signals can only reorder teams inside their own league, never
    lift the league itself.
    """
    by_league: dict[str, list[float]] = {}
    for team, v in values.items():
        lg = team_league.get(team)
        if lg is not None:
            by_league.setdefault(lg, []).append(v)
    league_mean = {lg: sum(vv) / len(vv) for lg, vv in by_league.items()}
    return {
        team: v - league_mean[team_league[team]]
        for team, v in values.items()
        if team_league.get(team) in league_mean
    }


def _scale_prior_to_target(
    prior: np.ndarray, target_sd: float, target_mean: float = 0.0,
) -> np.ndarray:
    """
    Put a prior on our scale WITHOUT inheriting our own spread — fix for
    a second real, verified bug (2026-08-15, external quant review,
    reproduced empirically in prove_compression.py): the previous
    approach (np.polyfit(prior, our_ratings, 1), then blend toward the
    fitted values) can ONLY ever compress. The fitted values of an OLS
    regression have variance r² · Var(y), strictly ≤ Var(y) — so
    blending toward them can shrink a rating's spread but is
    ARITHMETICALLY INCAPABLE of ever telling the model it's too flat,
    at any blend weight, for any prior. Verified: with the market
    wanting ratings 2.4x wider, every blend weight from 0.5 to 0.9 left
    the spread at 99-100% of its original (unwidened) value.

    This does a pure z-score rescale instead: center and standardize
    the prior, then re-expand it to `target_sd` around `target_mean`.
    The prior's spread is now decided by `target_sd`, not by how well
    it happened to correlate with our own (possibly already-too-flat)
    ratings. Returns an array of exactly `target_mean` if the prior has
    ~zero spread itself (nothing to rescale from).
    """
    p = np.asarray(prior, dtype=float)
    sd = float(p.std())
    if sd < 1e-9:
        return np.full_like(p, target_mean)
    return target_mean + (p - p.mean()) / sd * target_sd


def _uefa_coefficient_prior_offsets(
    our_offsets: dict[str, float], coefficients: dict[str, float],
) -> dict[str, float]:
    """
    Rescale UEFA's published country coefficients onto our own Stage-2
    offset scale by matching mean and standard deviation, not an OLS
    fit — with only 5 domestic leagues, a 2-parameter least-squares fit
    would overfit to noise; matching the first two moments is the more
    stable way to align two small, fully-overlapping sets. Returns {}
    if fewer than 2 leagues overlap (can't compute a spread) or our own
    offsets have zero spread (nothing to scale onto).
    """
    leagues = [lg for lg in our_offsets if lg in coefficients]
    if len(leagues) < 2:
        return {}

    our_vals = np.array([our_offsets[lg] for lg in leagues])
    coeff_vals = np.array([coefficients[lg] for lg in leagues])

    our_std = float(our_vals.std())
    coeff_std = float(coeff_vals.std())
    if our_std == 0 or coeff_std == 0:
        return {}

    scale = our_std / coeff_std
    our_mean, coeff_mean = float(our_vals.mean()), float(coeff_vals.mean())
    return {lg: our_mean + (coefficients[lg] - coeff_mean) * scale for lg in leagues}


def _fetch_ucl_outright_probs(db: Session) -> dict[str, float]:
    """
    Latest Champions League outright-winner probabilities from
    OutrightSnapshot (Polymarket, see outright_fetcher.py) — normalised
    to sum to 1 across whichever teams have a live market, since
    Polymarket negRisk pricing isn't guaranteed to sum exactly to 1
    itself. Returns {} if no snapshot has been captured yet (the
    fetcher runs on its own schedule; this blend degrades gracefully,
    same as a ClubElo fetch failure).
    """
    latest = (
        db.query(func.max(OutrightSnapshot.fetched_at))
        .filter(OutrightSnapshot.league == _UEFA_CL_LEAGUE)
        .filter(OutrightSnapshot.market == _UEFA_CL_WINNER_MARKET)
        .scalar()
    )
    if latest is None:
        return {}

    rows = (
        db.query(OutrightSnapshot)
        .filter(OutrightSnapshot.league == _UEFA_CL_LEAGUE)
        .filter(OutrightSnapshot.market == _UEFA_CL_WINNER_MARKET)
        .filter(OutrightSnapshot.fetched_at == latest)
        .filter(OutrightSnapshot.team_name.isnot(None))
        .filter(OutrightSnapshot.yes_price.isnot(None))
        .filter(OutrightSnapshot.yes_price > 0)
        .all()
    )
    total = sum(r.yes_price for r in rows)
    if total <= 0:
        return {}
    return {r.team_name: r.yes_price / total for r in rows}


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

            offsets, league_bridge_weight = _fit_cross_league_offsets(db, now, within_league, home_adv_cache)
            summary["league_offsets_raw"] = {lg: round(v, 4) for lg, v in offsets.items()}
            summary["bridge_fixtures_used"] = len(
                _load_closing_ah_rows(db, BRIDGE_LEAGUES)
            )

            # UEFA country coefficient blend — a fading prior on Stage
            # 2's per-league offsets (see module docstring), targeting
            # the thinnest-sample part of the whole fit: a handful of
            # UEFA fixtures split across 5 leagues, vs. dozens of
            # AH-line matches per team within a league.
            coeff_prior = _uefa_coefficient_prior_offsets(offsets, UEFA_COUNTRY_COEFFICIENTS)
            league_coeff_blended = []
            if coeff_prior:
                for lg in offsets:
                    prior = coeff_prior.get(lg)
                    if prior is None:
                        continue
                    bw = league_bridge_weight.get(lg, 0.0)
                    blend_weight = LEAGUE_COEFF_PRIOR_K / (LEAGUE_COEFF_PRIOR_K + bw)
                    offsets[lg] = (1 - blend_weight) * offsets[lg] + blend_weight * prior
                    league_coeff_blended.append(lg)

            summary["league_offsets"] = {lg: round(v, 4) for lg, v in offsets.items()}
            summary["league_bridge_weight"] = {lg: round(v, 2) for lg, v in league_bridge_weight.items()}
            summary["league_coeff_blended"] = league_coeff_blended

            # NOTE: no offset added yet — all_rows carries pure Stage 1
            # ratings here (mean-zero within each league by construction
            # of the ridge WLS solve). The ClubElo and squad-value blends
            # below run on THIS, not on the final theta, and are
            # themselves centered within league — see _center_within_
            # league's docstring for why (verified bug, 2026-08-15
            # external quant review: blending either signal in
            # uncentered doesn't just reorder teams within a league, it
            # drags the whole league's ratings toward that signal's own
            # cross-league level, e.g. the EPL's money-inflated squad
            # values). The Stage 2 offset — the only thing allowed to
            # move a league's overall level, per the module docstring's
            # identification note — is added back in afterward.
            all_rows = []
            for league, teams in within_league.items():
                for team, (rating, weighted_matches) in teams.items():
                    all_rows.append({
                        "team": team,
                        "league": league,
                        "rating": rating,
                        "weighted_matches": weighted_matches,
                    })
            team_league = {row["team"]: row["league"] for row in all_rows}

            # ClubElo blend — fades out as weighted_matches grows (see
            # module docstring). Failure anywhere in here (network, too
            # few overlapping teams) just leaves ratings as the
            # Stage 1 fit alone; never blocks the core result.
            #
            # target_sd/target_mean are read from the CURRENT ratings
            # right before this blend runs — an interim stand-in for a
            # properly-estimated target (2026-08-15 external quant
            # review, part 3/5 of the fix: the real target should come
            # from inverting each league's outright market, i.e.
            # backing out the strength spread whose simulated season
            # reproduces the market's title probabilities — that needs
            # a season simulator this codebase doesn't have yet, so this
            # interim version just asks the prior not to compress what
            # Stage 1 already shows, rather than pretending to know the
            # "true" wider spread the market implies).
            current_arr = np.array([row["rating"] for row in all_rows])
            target_mean, target_sd = float(current_arr.mean()), float(current_arr.std())

            clubelo_ratings = await _fetch_clubelo_ratings()
            clubelo_by_team_raw = {
                row["team"]: clubelo_ratings[to_clubelo_name(row["team"])]
                for row in all_rows
                if to_clubelo_name(row["team"]) in clubelo_ratings
            }
            clubelo_by_team = _center_within_league(clubelo_by_team_raw, team_league)
            blended_count = 0
            if len(clubelo_by_team) >= MIN_TEAMS_FOR_PRIOR_SCALE:
                teams_with_elo = list(clubelo_by_team.keys())
                scaled_arr = _scale_prior_to_target(
                    np.array([clubelo_by_team[t] for t in teams_with_elo]), target_sd, target_mean,
                )
                scaled_clubelo_by_team = dict(zip(teams_with_elo, scaled_arr))
                for row in all_rows:
                    scaled_clubelo = scaled_clubelo_by_team.get(row["team"])
                    if scaled_clubelo is None:
                        continue
                    blend_weight = CLUBELO_PRIOR_K / (CLUBELO_PRIOR_K + row["weighted_matches"])
                    row["rating"] = (1 - blend_weight) * row["rating"] + blend_weight * float(scaled_clubelo)
                    blended_count += 1
            elif clubelo_by_team:
                logger.warning("ClubElo blend: too few overlapping teams to scale", n=len(clubelo_by_team))

            summary["clubelo_teams_matched"] = len(clubelo_by_team)
            summary["clubelo_teams_blended"] = blended_count
            summary["clubelo_target"] = {"mean": round(target_mean, 4), "sd": round(target_sd, 4)}

            # Squad value blend — a second fading prior, applied after
            # ClubElo, toward each team's squad market value (see
            # module docstring). Only covers the subset of teams with a
            # manually-entered value on file; everyone else is
            # untouched by this step. Target re-read fresh from the
            # current (post-ClubElo) ratings, same interim reasoning.
            current_arr = np.array([row["rating"] for row in all_rows])
            target_mean, target_sd = float(current_arr.mean()), float(current_arr.std())

            squad_values = {
                sv.team: sv.market_value_eur
                for sv in db.query(SquadMarketValue).filter(SquadMarketValue.team.isnot(None)).all()
            }
            log_squad_values_raw = {team: np.log(v) for team, v in squad_values.items()}
            log_squad_values = _center_within_league(log_squad_values_raw, team_league)
            sv_blended_count = 0
            if len(log_squad_values) >= MIN_TEAMS_FOR_PRIOR_SCALE:
                teams_with_sv = list(log_squad_values.keys())
                scaled_arr = _scale_prior_to_target(
                    np.array([log_squad_values[t] for t in teams_with_sv]), target_sd, target_mean,
                )
                scaled_sv_by_team = dict(zip(teams_with_sv, scaled_arr))
                for row in all_rows:
                    scaled_value = scaled_sv_by_team.get(row["team"])
                    if scaled_value is None:
                        continue
                    blend_weight = SQUAD_VALUE_PRIOR_K / (SQUAD_VALUE_PRIOR_K + row["weighted_matches"])
                    row["rating"] = (1 - blend_weight) * row["rating"] + blend_weight * float(scaled_value)
                    sv_blended_count += 1
            elif log_squad_values:
                logger.warning("Squad value blend: too few overlapping teams to scale", n=len(log_squad_values))

            summary["squad_value_teams_matched"] = len(squad_values)
            summary["squad_value_teams_blended"] = sv_blended_count
            summary["squad_value_target"] = {"mean": round(target_mean, 4), "sd": round(target_sd, 4)}

            # Add the Stage 2 offset now — the only step allowed to move
            # a league's overall level. Everything above this point only
            # ever reordered teams within their own league.
            for row in all_rows:
                row["rating"] += offsets.get(row["league"], 0.0)

            # UCL outright blend — a fourth fading prior, applied last,
            # toward each team's Champions League outright-winner
            # probability (see module docstring). Given a decent weight
            # (UCL_WINNER_PRIOR_K) since this is a genuine forward-
            # looking market price, not a valuation proxy. Only the
            # subset of teams with a live Polymarket price are touched.
            # Operates on the FULL post-offset rating (not centered
            # within league) — European market data is allowed to
            # inform both delta and the league level, unlike ClubElo/
            # squad value above (see the module docstring's
            # identification note). Target re-read fresh again, now
            # from the post-offset scale.
            current_arr = np.array([row["rating"] for row in all_rows])
            target_mean, target_sd = float(current_arr.mean()), float(current_arr.std())

            ucl_probs = _fetch_ucl_outright_probs(db)
            ucl_blended_count = 0
            if len(ucl_probs) >= MIN_TEAMS_FOR_PRIOR_SCALE:
                teams_with_ucl = list(ucl_probs.keys())
                logit_arr = np.array([np.log(ucl_probs[t] / (1 - ucl_probs[t])) for t in teams_with_ucl])
                scaled_arr = _scale_prior_to_target(logit_arr, target_sd, target_mean)
                scaled_ucl_by_team = dict(zip(teams_with_ucl, scaled_arr))
                for row in all_rows:
                    scaled_prob = scaled_ucl_by_team.get(row["team"])
                    if scaled_prob is None:
                        continue
                    blend_weight = UCL_WINNER_PRIOR_K / (UCL_WINNER_PRIOR_K + row["weighted_matches"])
                    row["rating"] = (1 - blend_weight) * row["rating"] + blend_weight * float(scaled_prob)
                    ucl_blended_count += 1
            elif ucl_probs:
                logger.warning("UCL outright blend: too few overlapping teams to scale", n=len(ucl_probs))

            summary["ucl_outright_teams_matched"] = len(ucl_probs)
            summary["ucl_outright_teams_blended"] = ucl_blended_count
            summary["ucl_outright_target"] = {"mean": round(target_mean, 4), "sd": round(target_sd, 4)}

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
