"""
Monte Carlo season simulator over the remaining fixture list.

Every remaining pairing gets an 11x11 Dixon-Coles scoreline matrix
(mirrors valorModel.ts Steps 4/6/7/10: symmetric home-advantage split,
Poisson marginals, rho correction on the 0-0/1-0/0-1/1-1 cells, then
cell-wise draw inflation + renormalise), and N_SIMS full seasons are
sampled from those distributions with numpy.

Remaining fixtures are derived structurally: a league season is a double
round robin, so remaining = every ordered (home, away) pairing minus the
ones already played this season. That sidesteps needing a fixture-date
feed entirely — WHO plays WHOM at home is fixed by the format; when is
irrelevant to a season simulation.

Tie-break inside a simulated season is points, then goal difference,
then goals scored. (La Liga's head-to-head tie-break is approximated by
GD — noted in the engine's caveats, not silently ignored.)
"""

from dataclasses import dataclass

import numpy as np

MAX_GOALS = 10
N_SIMS = 10_000

# Mirrors CURRENT_ADVANCED_PARAMS in scripts/model-params.ts — the
# production Dixon-Coles shape parameters. Update alongside that file.
RHO = -0.03
DRAW_INFLATION = 1.08


@dataclass
class SimResult:
    n_sims: int
    # per-team arrays, aligned with `teams` order
    teams: list[str]
    p_title: dict[str, float]
    p_top_n: dict[str, float]
    p_relegation: dict[str, float]
    mean_points: dict[str, float]
    current_points: dict[str, int]
    played: dict[str, int]
    remaining_fixture_count: int


def _scoreline_probs(lambda_home: float, lambda_away: float) -> np.ndarray:
    """Flattened (121,) probability vector over (home_goals, away_goals),
    Dixon-Coles corrected and draw-inflated, renormalised."""
    k = np.arange(MAX_GOALS + 1)
    log_fact = np.cumsum(np.concatenate(([0.0], np.log(np.arange(1, MAX_GOALS + 1)))))
    ph = np.exp(-lambda_home + k * np.log(max(lambda_home, 1e-9)) - log_fact)
    pa = np.exp(-lambda_away + k * np.log(max(lambda_away, 1e-9)) - log_fact)
    matrix = np.outer(ph, pa)

    matrix[0, 0] *= max(0.0, 1 - lambda_home * lambda_away * RHO)
    matrix[1, 0] *= max(0.0, 1 + lambda_away * RHO)
    matrix[0, 1] *= max(0.0, 1 + lambda_home * RHO)
    matrix[1, 1] *= max(0.0, 1 - RHO)

    diag = np.eye(MAX_GOALS + 1, dtype=bool)
    matrix[diag] *= DRAW_INFLATION
    return (matrix / matrix.sum()).ravel()


def match_probs(
    strengths: dict, home: str, away: str,
    avg_goals_per_team: float, home_away_ratio: float,
) -> tuple[float, float, float, float, float]:
    """(p_home, p_draw, p_away, lambda_home, lambda_away) for one fixture
    — used directly by the match-question flow."""
    lh, la = _lambdas(strengths, home, away, avg_goals_per_team, home_away_ratio)
    probs = _scoreline_probs(lh, la).reshape(MAX_GOALS + 1, MAX_GOALS + 1)
    p_home = float(np.tril(probs, -1).sum())   # home goals (rows) > away goals
    p_draw = float(np.trace(probs))
    p_away = float(np.triu(probs, 1).sum())
    return p_home, p_draw, p_away, lh, la


def _lambdas(strengths, home, away, avg_goals_per_team, home_away_ratio):
    r = home_away_ratio
    home_mult = (2 * r) / (1 + r)
    away_mult = 2 / (1 + r)
    sh, sa = strengths[home], strengths[away]
    lh = float(np.clip(sh.attack * sa.defence * avg_goals_per_team * home_mult, 0.05, 8))
    la = float(np.clip(sa.attack * sh.defence * avg_goals_per_team * away_mult, 0.05, 8))
    return lh, la


def simulate_season(
    teams: list[str],
    played_results: list[tuple[str, str, int, int]],  # (home, away, fthg, ftag)
    strengths: dict,
    avg_goals_per_team: float,
    home_away_ratio: float,
    top_n: int,
    relegation_spots: int,
    n_sims: int = N_SIMS,
    seed: int | None = None,
) -> SimResult:
    idx = {t: i for i, t in enumerate(teams)}
    n = len(teams)

    # Current table from played results.
    points = np.zeros(n, dtype=np.int64)
    gd = np.zeros(n, dtype=np.int64)
    gf = np.zeros(n, dtype=np.int64)
    played = np.zeros(n, dtype=np.int64)
    played_pairs: set[tuple[int, int]] = set()
    for home, away, fthg, ftag in played_results:
        if home not in idx or away not in idx:
            continue  # opponent relegated/renamed — engine reports coverage separately
        hi, ai = idx[home], idx[away]
        played_pairs.add((hi, ai))
        played[hi] += 1
        played[ai] += 1
        gf[hi] += fthg
        gf[ai] += ftag
        gd[hi] += fthg - ftag
        gd[ai] += ftag - fthg
        if fthg > ftag:
            points[hi] += 3
        elif fthg < ftag:
            points[ai] += 3
        else:
            points[hi] += 1
            points[ai] += 1

    remaining = [
        (hi, ai) for hi in range(n) for ai in range(n)
        if hi != ai and (hi, ai) not in played_pairs
    ]

    rng = np.random.default_rng(seed)
    goals = np.arange((MAX_GOALS + 1) ** 2)
    hg_of = goals // (MAX_GOALS + 1)
    ag_of = goals % (MAX_GOALS + 1)

    sim_points = np.tile(points, (n_sims, 1)).astype(np.int64)
    sim_gd = np.tile(gd, (n_sims, 1)).astype(np.int64)
    sim_gf = np.tile(gf, (n_sims, 1)).astype(np.int64)

    for hi, ai in remaining:
        probs = _scoreline_probs(
            *_lambdas(strengths, teams[hi], teams[ai], avg_goals_per_team, home_away_ratio)
        )
        outcomes = rng.choice(goals, size=n_sims, p=probs)
        hg, ag = hg_of[outcomes], ag_of[outcomes]
        home_win = hg > ag
        draw = hg == ag
        sim_points[:, hi] += 3 * home_win + draw
        sim_points[:, ai] += 3 * (ag > hg) + draw
        sim_gd[:, hi] += hg - ag
        sim_gd[:, ai] += ag - hg
        sim_gf[:, hi] += hg
        sim_gf[:, ai] += ag

    # Rank by (points, gd, gf) via a single composite key. Bounds: points
    # <= 3*38 < 2**7 headroom with gd/gf each well under 2**9 offsets.
    composite = (
        sim_points.astype(np.int64) * 1_000_000
        + (sim_gd + 500) * 1_000
        + (sim_gf + 500)
    )
    # argsort descending; position 0 = champion
    order = np.argsort(-composite, axis=1, kind="stable")
    positions = np.empty_like(order)
    rows = np.arange(n_sims)[:, None]
    positions[rows, order] = np.arange(n)[None, :]

    p_title = (positions == 0).mean(axis=0)
    p_top_n = (positions < top_n).mean(axis=0)
    p_releg = (positions >= n - relegation_spots).mean(axis=0)
    mean_pts = sim_points.mean(axis=0)

    return SimResult(
        n_sims=n_sims,
        teams=teams,
        p_title={t: float(p_title[idx[t]]) for t in teams},
        p_top_n={t: float(p_top_n[idx[t]]) for t in teams},
        p_relegation={t: float(p_releg[idx[t]]) for t in teams},
        mean_points={t: float(mean_pts[idx[t]]) for t in teams},
        current_points={t: int(points[idx[t]]) for t in teams},
        played={t: int(played[idx[t]]) for t in teams},
        remaining_fixture_count=len(remaining),
    )
