"""
Per-team attack/defence strength ratings fitted from historical_matches.

Fit is the classic alternating Poisson scaling: expected goals for the
home side of match m are

    mu * homeMult * atk[home] * def[away]

with (homeMult, awayMult) derived from the league's home/away ratio the
same way valorModel.ts Step 4 does (symmetric split, sums to 2, so the
expected match total is preserved). atk/def are updated to the weighted
ratio observed/expected until convergence, then normalised to mean 1.

Design decisions from external review (2026-08, rounds two and three):

- Match weights are EXPONENTIAL DAY-DECAY (half-life HALF_LIFE_DAYS,
  provisional — optimise out of sample with the backtest harness),
  replacing the season-bucket weights that gave last season equal
  weight to this one. Note the 4-season window cutoff is now largely
  decorative (season t-3 sits near 1/8 weight) — kept as a query
  bound, not a modelling choice.
- Ratings are SHRUNK toward 1.0 by effective (weighted) match count:
  1 + (x - 1) * n/(n + K_SHRINK). Unregularised ratio fits overfit
  low-sample teams; shrinkage also lands a team with no effective
  sample exactly on 1.0 and softens the promoted-prior cliff.
- PARAMETER UNCERTAINTY via the BAYESIAN (Dirichlet-weight) BOOTSTRAP:
  each draw multiplies the decay weights by i.i.d. Exp(1) noise
  (Rubin 1981) — no resampling, plays naturally with the decay
  weights, and sidesteps the resample-vs-retain-weights question the
  earlier uniform scheme fudged. The fit core is numpy-batched across
  (point fit + all draws), so every draw runs to the same convergence
  tolerance as the point fit — no warm-start truncation biasing draws
  toward the point estimate. Convergence of the worst row is reported.
- `as_of` filters the fit and the form window to matches strictly
  before that date. Live forecasts pass None; any future backtest MUST
  pass the forecast date, making look-ahead leakage structurally
  impossible rather than a discipline.
- Post-fit form blending re-normalises each row to mean 1 so league
  totals don't drift with aggregate form.
- League avg npxG is computed from the same xg_data being blended
  (fallback: the model-params.ts mirror).

Teams with no history in the window (promoted sides) get a documented
default (attack 0.85 / defence 1.15) and are flagged so the rationale
can say so.

KNOWN LIMITATION (queued): the npxG form window is schedule-blind —
opponent adjustment needs an xg_data<->historical_matches join (xg_data
has no opponent column); see TODO.
"""

from dataclasses import dataclass, field
from datetime import date

import numpy as np
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import HistoricalMatch, XGData

FORM_WEIGHT = 0.25          # mirrors CURRENT_ADVANCED_PARAMS.formWeight
PROMOTED_ATTACK = 0.85
PROMOTED_DEFENCE = 1.15
FIT_ITERATIONS = 40         # cap; tol break normally fires far earlier
CONVERGENCE_TOL = 1e-7
FORM_MATCHES = 6

# Provisional — optimise out of sample before trusting (review item).
HALF_LIFE_DAYS = 365.0
# Shrinkage prior strength in weighted-match units. Provisional.
K_SHRINK = 15.0
# Bayesian-bootstrap draws. Batched fit makes these cheap; raise once
# the harness has tuned the other constants if tail MC error warrants.
N_DRAWS_DEFAULT = 500

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
    # max |update| in the final iteration — point fit and the WORST
    # bootstrap draw respectively. Both should sit at/below tol.
    final_max_update: float = 0.0
    draws_final_max_update: float = 0.0
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
    rows = [r for r in q.all()]

    seasons_used = sorted({r.season for r in rows}, reverse=True)[:4]

    # Base weights: exponential day-decay; drop >4-half-life dust.
    kept = []
    for r in rows:
        age_days = max(0, (today - r.match_date).days)
        w = 0.5 ** (age_days / HALF_LIFE_DAYS)
        if w > 1e-4:
            kept.append((w, r.home_team, r.away_team, r.fthg, r.ftag))

    # Fit over every team present in the window, not just the current
    # 18/20 — a relegated opponent's matches still inform the fit.
    all_teams = sorted({t for m in kept for t in (m[1], m[2])})
    t_index = {t: i for i, t in enumerate(all_teams)}
    n_teams = len(all_teams)
    n_m = len(kept)

    form_data = _last6_form(db, league, as_of)
    avg_xg = _league_avg_xg(db, league)

    if n_m == 0 or n_teams == 0:
        strengths = _package_row(
            teams, {}, {}, {}, form_data, avg_xg,
        )
        return StrengthFit(
            strengths=strengths, seasons_used=seasons_used,
            weighted_match_count=0.0,
            defaulted_teams=[t for t in teams if strengths[t].promoted_default],
            form_teams=[t for t in teams if strengths[t].form_adjusted],
        )

    base_w = np.array([m[0] for m in kept])
    hi = np.array([t_index[m[1]] for m in kept], dtype=np.int64)
    ai = np.array([t_index[m[2]] for m in kept], dtype=np.int64)
    fthg = np.array([m[3] for m in kept], dtype=np.float64)
    ftag = np.array([m[4] for m in kept], dtype=np.float64)

    # Row 0 = point fit (base weights); rows 1..n_draws = Bayesian
    # bootstrap (base weights x Exp(1) noise). Batched, all rows run to
    # the same tolerance.
    rng = np.random.default_rng(seed)
    B = 1 + max(0, n_draws)
    w = np.tile(base_w, (B, 1))
    if B > 1:
        w[1:] *= rng.exponential(1.0, size=(B - 1, n_m))

    r_ha = home_away_ratio
    home_mult = (2 * r_ha) / (1 + r_ha)
    away_mult = 2 / (1 + r_ha)
    mu = avg_goals_per_team

    atk, dfn, final_updates = _fit_batched(
        w, hi, ai, fthg, ftag, n_teams, mu, home_mult, away_mult,
    )

    # Effective (weighted) counts per row -> shrinkage toward 1.0.
    counts = np.zeros((B, n_teams))
    np.add.at(counts, (slice(None), hi), w)
    np.add.at(counts, (slice(None), ai), w)
    g = counts / (counts + K_SHRINK)
    atk = 1.0 + (atk - 1.0) * g
    dfn = 1.0 + (dfn - 1.0) * g

    def row_maps(b: int) -> tuple[dict, dict, dict]:
        return (
            {t: float(atk[b, t_index[t]]) for t in all_teams},
            {t: float(dfn[b, t_index[t]]) for t in all_teams},
            {t: float(counts[b, t_index[t]]) for t in all_teams},
        )

    a0, d0, c0 = row_maps(0)
    strengths = _package_row(teams, a0, d0, c0, form_data, avg_xg)
    draws = []
    for b in range(1, B):
        ab, db_, cb = row_maps(b)
        draws.append(_package_row(teams, ab, db_, cb, form_data, avg_xg))

    return StrengthFit(
        strengths=strengths,
        seasons_used=seasons_used,
        weighted_match_count=float(base_w.sum()),
        defaulted_teams=[t for t in teams if strengths[t].promoted_default],
        form_teams=[t for t in teams if strengths[t].form_adjusted],
        final_max_update=float(final_updates[0]),
        draws_final_max_update=float(final_updates[1:].max()) if B > 1 else 0.0,
        draws=draws,
    )


def _fit_batched(
    w: np.ndarray, hi: np.ndarray, ai: np.ndarray,
    fthg: np.ndarray, ftag: np.ndarray,
    n_teams: int, mu: float, home_mult: float, away_mult: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Alternating Poisson scaling, batched over B weight vectors.
    Returns (atk (B,T), dfn (B,T), final_max_update (B,))."""
    B = w.shape[0]
    atk = np.ones((B, n_teams))
    dfn = np.ones((B, n_teams))
    w_fthg = w * fthg
    w_ftag = w * ftag

    gf = np.zeros((B, n_teams))
    np.add.at(gf, (slice(None), hi), w_fthg)
    np.add.at(gf, (slice(None), ai), w_ftag)
    ga = np.zeros((B, n_teams))
    np.add.at(ga, (slice(None), hi), w_ftag)
    np.add.at(ga, (slice(None), ai), w_fthg)

    updates = np.zeros(B)
    for _ in range(FIT_ITERATIONS):
        exp_home = (mu * home_mult) * atk[:, hi] * dfn[:, ai]
        exp_away = (mu * away_mult) * atk[:, ai] * dfn[:, hi]
        egf = np.full((B, n_teams), 1e-9)
        np.add.at(egf, (slice(None), hi), w * exp_home)
        np.add.at(egf, (slice(None), ai), w * exp_away)
        ega = np.full((B, n_teams), 1e-9)
        np.add.at(ega, (slice(None), hi), w * exp_away)
        np.add.at(ega, (slice(None), ai), w * exp_home)

        new_atk = atk * (gf / egf)
        new_dfn = dfn * (ga / ega)
        # Renormalise each row to mean 1 so mu keeps its meaning —
        # BEFORE measuring the update. The imposed mu means the raw
        # scaling step carries a persistent uniform scale factor that
        # the renorm removes; comparing across the renorm boundary
        # would report that factor as a phantom non-convergence.
        new_atk /= new_atk.mean(axis=1, keepdims=True)
        new_dfn /= new_dfn.mean(axis=1, keepdims=True)
        updates = np.maximum(
            np.abs(new_atk - atk).max(axis=1),
            np.abs(new_dfn - dfn).max(axis=1),
        )
        atk, dfn = new_atk, new_dfn
        if updates.max() < CONVERGENCE_TOL:
            break
    return atk, dfn, updates


def _package_row(
    teams, atk_map, dfn_map, count_map, form_data, avg_xg,
) -> dict[str, TeamStrength]:
    """Assemble per-team strengths for one weight row: promoted
    defaults, npxG form blend, then renormalise the returned set to
    mean 1 so aggregate form can't drift the league's expected
    totals."""
    strengths: dict[str, TeamStrength] = {}
    for team in teams:
        if count_map.get(team, 0.0) > 0:
            s = TeamStrength(
                attack=atk_map[team], defence=dfn_map[team],
                weighted_matches=count_map[team],
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
