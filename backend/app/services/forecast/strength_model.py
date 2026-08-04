"""
Per-team attack/defence strength ratings fitted from historical_matches.

Fit is the classic alternating Poisson scaling: expected goals for the
home side of match m are

    mu * homeMult * atk[home] * def[away]

with (homeMult, awayMult) derived from the league's home/away ratio the
same way valorModel.ts Step 4 does (symmetric split, sums to 2, so the
expected match total is preserved). atk/def are updated to the weighted
ratio observed/expected until convergence, then normalised to mean 1.

Design decisions from external review (2026-08):

- Match weights are EXPONENTIAL DAY-DECAY (half-life HALF_LIFE_DAYS,
  provisional — optimise out of sample with the backtest harness),
  replacing the season-bucket weights inherited from
  league_constants_refresher. Buckets gave last season equal weight to
  this one; in February half the information was two transfer windows
  stale. The constants job keeps its own buckets — mu is a league
  scalar and far less decay-sensitive; the mean-1 normalisation here
  preserves mu's league-average meaning within the fit.
- Ratings are SHRUNK toward 1.0 by effective (weighted) match count:
  1 + (x - 1) * n/(n + K_SHRINK). Unregularised ratio fits overfit
  low-sample teams; shrinkage also rescues teams that drop out of a
  bootstrap resample (n=0 -> exactly 1.0) and softens the
  promoted-prior cliff.
- PARAMETER UNCERTAINTY: n_draws bootstrap refits (uniform resample of
  match rows keeping their decay weights, warm-started from the point
  fit) produce strength draws the season simulator samples per
  simulated season. The point fit treats MLE strengths as truth; the
  draws are what stop mid-table tail probabilities from being too
  tight.
- `as_of` filters the fit and the form window to matches strictly
  before that date. Live forecasts pass None; any future backtest MUST
  pass the forecast date, making look-ahead leakage structurally
  impossible rather than a discipline.
- Post-fit form blending re-normalises to mean 1 so league totals
  don't drift with aggregate form.
- League avg npxG is computed from the same xg_data being blended
  (fallback: the model-params.ts mirror) — a hardcoded mirror is a
  silent multiplicative bias on every form ratio when it drifts.

Teams with no history in the window (promoted sides) get a documented
default (attack 0.85 / defence 1.15) and are flagged so the rationale
can say so.

If recent npxG form exists in xg_data, each team's ratings get a last-6
form blend at FORM_WEIGHT (mirrors production formWeight in
scripts/model-params.ts). KNOWN LIMITATION (queued): the form window is
schedule-blind — six easy fixtures mark a team up. Opponent adjustment
needs an xg_data<->historical_matches join (xg_data has no opponent
column); see TODO.
"""

import random
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import HistoricalMatch, XGData

FORM_WEIGHT = 0.25          # mirrors CURRENT_ADVANCED_PARAMS.formWeight
PROMOTED_ATTACK = 0.85
PROMOTED_DEFENCE = 1.15
FIT_ITERATIONS = 25
CONVERGENCE_TOL = 1e-7      # early stop when max update falls below
FORM_MATCHES = 6

# Provisional — optimise out of sample before trusting (review item).
HALF_LIFE_DAYS = 365.0
# Shrinkage prior strength in weighted-match units. Provisional.
K_SHRINK = 15.0
# Bootstrap draws for parameter uncertainty; warm-started so few
# iterations are needed per refit.
N_DRAWS_DEFAULT = 100
BOOTSTRAP_ITERATIONS = 8

# Fallback mirror of scripts/model-params.ts LEAGUE_PARAMS avgXG — used
# only when xg_data has too few rows to compute the league average
# directly. Update alongside that file.
_FALLBACK_LEAGUE_AVG_XG: dict[str, float] = {
    "soccer_epl": 1.35,
    "soccer_germany_bundesliga": 1.45,
    "soccer_spain_la_liga": 1.25,
    "soccer_italy_serie_a": 1.26,
    "soccer_france_ligue_one": 1.27,
}
_MIN_ROWS_FOR_DATA_AVG_XG = 50


@dataclass
class TeamStrength:
    attack: float
    defence: float
    weighted_matches: float
    promoted_default: bool = False
    form_adjusted: bool = False
    last6_npxg_for: float | None = None
    last6_npxg_against: float | None = None


@dataclass
class StrengthFit:
    strengths: dict[str, TeamStrength]
    seasons_used: list[str]
    weighted_match_count: float
    defaulted_teams: list[str] = field(default_factory=list)
    form_teams: list[str] = field(default_factory=list)
    # max |update| in the final fit iteration — convergence diagnostic
    final_max_update: float = 0.0
    # bootstrap strength draws for the simulator (may be empty)
    draws: list[dict[str, TeamStrength]] = field(default_factory=list)


def fit_strengths(
    db: Session,
    league: str,
    teams: list[str],
    avg_goals_per_team: float,
    home_away_ratio: float,
    as_of: date | None = None,
    n_draws: int = N_DRAWS_DEFAULT,
    seed: int | None = None,
) -> StrengthFit:
    today = as_of or date.today()

    q = (
        db.query(
            HistoricalMatch.season,
            HistoricalMatch.match_date,
            HistoricalMatch.home_team,
            HistoricalMatch.away_team,
            HistoricalMatch.fthg,
            HistoricalMatch.ftag,
        )
        .filter(HistoricalMatch.league == league)
        .filter(HistoricalMatch.fthg.isnot(None))
    )
    if as_of is not None:
        q = q.filter(HistoricalMatch.match_date < as_of)
    rows = q.all()

    seasons_used = sorted({r.season for r in rows}, reverse=True)[:4]

    # (weight, home, away, fthg, ftag) with exponential day-decay.
    matches = []
    for r in rows:
        age_days = max(0, (today - r.match_date).days)
        w = 0.5 ** (age_days / HALF_LIFE_DAYS)
        if w > 1e-4:  # >4 half-lives contributes nothing but fit time
            matches.append((w, r.home_team, r.away_team, r.fthg, r.ftag))

    r_ha = home_away_ratio
    home_mult = (2 * r_ha) / (1 + r_ha)
    away_mult = 2 / (1 + r_ha)
    mu = avg_goals_per_team

    # Fit over every team present in the window, not just the current
    # 18/20 — a relegated opponent's matches still inform the fit.
    all_teams = sorted({t for m in matches for t in (m[1], m[2])})

    atk, dfn, final_max_update = _fit_core(
        matches, all_teams, mu, home_mult, away_mult,
        iterations=FIT_ITERATIONS,
    )

    weighted_count = {t: 0.0 for t in all_teams}
    for w, home, away, _, _ in matches:
        weighted_count[home] += w
        weighted_count[away] += w

    _shrink(atk, dfn, weighted_count)

    form_data = _last6_form(db, league, as_of)
    avg_xg = _league_avg_xg(db, league)

    strengths = _package(
        teams, atk, dfn, weighted_count, form_data, avg_xg,
    )

    # Bootstrap draws: uniform resample of match rows (keeping decay
    # weights), warm-started from the point fit. Same shrink/blend/
    # renormalise path as the point estimate so draws are exchangeable
    # with it.
    rng = random.Random(seed)
    draws: list[dict[str, TeamStrength]] = []
    n_m = len(matches)
    for _ in range(max(0, n_draws) if n_m > 0 else 0):
        sample = [matches[rng.randrange(n_m)] for _ in range(n_m)]
        b_atk, b_dfn, _ = _fit_core(
            sample, all_teams, mu, home_mult, away_mult,
            iterations=BOOTSTRAP_ITERATIONS,
            warm_atk=atk, warm_dfn=dfn,
        )
        b_count = {t: 0.0 for t in all_teams}
        for w, home, away, _, _ in sample:
            b_count[home] += w
            b_count[away] += w
        _shrink(b_atk, b_dfn, b_count)
        draws.append(_package(
            teams, b_atk, b_dfn, b_count, form_data, avg_xg,
        ))

    return StrengthFit(
        strengths=strengths,
        seasons_used=seasons_used,
        weighted_match_count=sum(w for w, *_ in matches),
        defaulted_teams=[t for t in teams if strengths[t].promoted_default],
        form_teams=[t for t in teams if strengths[t].form_adjusted],
        final_max_update=final_max_update,
        draws=draws,
    )


def _fit_core(
    matches, all_teams, mu, home_mult, away_mult,
    iterations: int,
    warm_atk: dict | None = None,
    warm_dfn: dict | None = None,
) -> tuple[dict, dict, float]:
    atk = dict(warm_atk) if warm_atk else {t: 1.0 for t in all_teams}
    dfn = dict(warm_dfn) if warm_dfn else {t: 1.0 for t in all_teams}
    n = len(all_teams)
    max_update = 0.0
    for _ in range(iterations):
        gf = {t: 0.0 for t in all_teams}
        exp_gf = {t: 1e-9 for t in all_teams}
        ga = {t: 0.0 for t in all_teams}
        exp_ga = {t: 1e-9 for t in all_teams}
        for w, home, away, fthg, ftag in matches:
            exp_home = mu * home_mult * atk[home] * dfn[away]
            exp_away = mu * away_mult * atk[away] * dfn[home]
            gf[home] += w * fthg
            gf[away] += w * ftag
            exp_gf[home] += w * exp_home
            exp_gf[away] += w * exp_away
            ga[home] += w * ftag
            ga[away] += w * fthg
            exp_ga[home] += w * exp_away
            exp_ga[away] += w * exp_home
        max_update = 0.0
        for t in all_teams:
            new_a = atk[t] * (gf[t] / exp_gf[t])
            new_d = dfn[t] * (ga[t] / exp_ga[t])
            max_update = max(max_update, abs(new_a - atk[t]), abs(new_d - dfn[t]))
            atk[t], dfn[t] = new_a, new_d
        # Renormalise to mean 1 so mu keeps its league-average meaning.
        atk_mean = sum(atk.values()) / n
        dfn_mean = sum(dfn.values()) / n
        for t in all_teams:
            atk[t] /= atk_mean
            dfn[t] /= dfn_mean
        if max_update < CONVERGENCE_TOL:
            break
    return atk, dfn, max_update


def _shrink(atk: dict, dfn: dict, weighted_count: dict) -> None:
    """Shrink toward 1.0 by effective sample: 1 + (x-1) * n/(n+K).
    A team with no sampled matches lands exactly on 1.0."""
    for t in atk:
        lam = weighted_count.get(t, 0.0)
        g = lam / (lam + K_SHRINK)
        atk[t] = 1.0 + (atk[t] - 1.0) * g
        dfn[t] = 1.0 + (dfn[t] - 1.0) * g


def _package(
    teams, atk, dfn, weighted_count, form_data, avg_xg,
) -> dict[str, TeamStrength]:
    """Assemble the returned per-team strengths: promoted defaults, npxG
    form blend, then renormalise the returned set to mean 1 so aggregate
    form can't drift the league's expected totals."""
    strengths: dict[str, TeamStrength] = {}
    for team in teams:
        if team in atk and weighted_count.get(team, 0.0) > 0:
            s = TeamStrength(
                attack=atk[team], defence=dfn[team],
                weighted_matches=weighted_count[team],
            )
        else:
            s = TeamStrength(
                attack=PROMOTED_ATTACK, defence=PROMOTED_DEFENCE,
                weighted_matches=0.0, promoted_default=True,
            )
        form = form_data.get(team)
        if form and avg_xg and not s.promoted_default:
            npxg_for, npxg_against = form
            s.last6_npxg_for = npxg_for
            s.last6_npxg_against = npxg_against
            s.attack = (1 - FORM_WEIGHT) * s.attack + FORM_WEIGHT * (npxg_for / avg_xg)
            s.defence = (1 - FORM_WEIGHT) * s.defence + FORM_WEIGHT * (npxg_against / avg_xg)
            s.form_adjusted = True
        strengths[team] = s

    n = len(strengths)
    if n:
        atk_mean = sum(s.attack for s in strengths.values()) / n
        dfn_mean = sum(s.defence for s in strengths.values()) / n
        if atk_mean > 0 and dfn_mean > 0:
            for s in strengths.values():
                s.attack /= atk_mean
                s.defence /= dfn_mean
    return strengths


def _league_avg_xg(db: Session, league: str) -> float | None:
    """League average npxG per team per game, computed from the same
    xg_data the form blend reads. Falls back to the model-params.ts
    mirror below _MIN_ROWS_FOR_DATA_AVG_XG rows."""
    latest_season = (
        db.query(func.max(XGData.season)).filter(XGData.league == league).scalar()
    )
    if latest_season:
        avg, count = (
            db.query(func.avg(XGData.npxg_for), func.count(XGData.id))
            .filter(XGData.league == league, XGData.season == latest_season)
            .first()
        )
        if avg is not None and count >= _MIN_ROWS_FOR_DATA_AVG_XG:
            return float(avg)
    return _FALLBACK_LEAGUE_AVG_XG.get(league)


def _last6_form(
    db: Session, league: str, as_of: date | None = None,
) -> dict[str, tuple[float, float]]:
    """team -> (avg npxG for, avg npxG against) over the last FORM_MATCHES
    rows of the most recent season present in xg_data for this league.
    KNOWN LIMITATION: schedule-blind (no opponent adjustment) — see TODO."""
    latest_season = (
        db.query(func.max(XGData.season)).filter(XGData.league == league).scalar()
    )
    if not latest_season:
        return {}
    q = (
        db.query(XGData.team_name, XGData.match_number, XGData.npxg_for, XGData.npxg_against)
        .filter(XGData.league == league, XGData.season == latest_season)
    )
    if as_of is not None:
        q = q.filter(XGData.match_date < as_of)
    rows = q.order_by(XGData.team_name, XGData.match_number.desc()).all()
    by_team: dict[str, list[tuple[float, float]]] = {}
    for team, _, npxg_for, npxg_against in rows:
        by_team.setdefault(team, [])
        if len(by_team[team]) < FORM_MATCHES:
            by_team[team].append((npxg_for, npxg_against))
    return {
        team: (
            sum(f for f, _ in vals) / len(vals),
            sum(a for _, a in vals) / len(vals),
        )
        for team, vals in by_team.items()
        if len(vals) >= 3  # need a real sample, not one early-season row
    }
