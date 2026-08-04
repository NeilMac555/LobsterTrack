"""
Per-team attack/defence strength ratings fitted from historical_matches.

Same 4-season recency-weighted window and WEIGHTS_BY_RANK as
league_constants_refresher (the two must stay consistent — a strength of
1.0 here means "league average against the same window the constants
were computed on").

Fit is the classic alternating Poisson scaling: expected goals for the
home side of match m are

    mu * homeMult * atk[home] * def[away]

with (homeMult, awayMult) derived from the league's home/away ratio the
same way valorModel.ts Step 4 does (symmetric split, sums to 2, so the
expected match total is preserved). atk/def are updated to the weighted
ratio observed/expected until convergence, then normalised to mean 1.

Teams with no history in the window (promoted sides) get a documented
default (attack 0.85 / defence 1.15 — a typical promoted team's first
season) and are flagged so the rationale can say so.

If recent npxG form exists in xg_data, each team's ratings get a last-6
form blend at FORM_WEIGHT (mirrors production formWeight in
scripts/model-params.ts) — goals tell you what happened, npxG tells you
what keeps happening.
"""

from dataclasses import dataclass, field

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import HistoricalMatch, XGData
from app.services.league_constants_refresher import WEIGHTS_BY_RANK

FORM_WEIGHT = 0.25          # mirrors CURRENT_ADVANCED_PARAMS.formWeight
PROMOTED_ATTACK = 0.85
PROMOTED_DEFENCE = 1.15
FIT_ITERATIONS = 25
FORM_MATCHES = 6

# Mirror of scripts/model-params.ts LEAGUE_PARAMS avgXG — used only to
# convert npxG form into a strength ratio. Update alongside that file.
LEAGUE_AVG_XG: dict[str, float] = {
    "soccer_epl": 1.35,
    "soccer_germany_bundesliga": 1.45,
    "soccer_spain_la_liga": 1.25,
    "soccer_italy_serie_a": 1.26,
    "soccer_france_ligue_one": 1.27,
}


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


def fit_strengths(
    db: Session,
    league: str,
    teams: list[str],
    avg_goals_per_team: float,
    home_away_ratio: float,
) -> StrengthFit:
    rows = (
        db.query(
            HistoricalMatch.season,
            HistoricalMatch.home_team,
            HistoricalMatch.away_team,
            HistoricalMatch.fthg,
            HistoricalMatch.ftag,
        )
        .filter(HistoricalMatch.league == league)
        .filter(HistoricalMatch.fthg.isnot(None))
        .all()
    )

    seasons_present = sorted({r.season for r in rows}, reverse=True)
    top_seasons = seasons_present[:4]
    weight_by_season = {s: WEIGHTS_BY_RANK[i] for i, s in enumerate(top_seasons)}

    matches = [
        (weight_by_season[r.season], r.home_team, r.away_team, r.fthg, r.ftag)
        for r in rows
        if r.season in weight_by_season
    ]

    r = home_away_ratio
    home_mult = (2 * r) / (1 + r)
    away_mult = 2 / (1 + r)
    mu = avg_goals_per_team

    # Fit over every team present in the window, not just the current
    # 18/20 — a relegated opponent's matches still inform the fit.
    all_teams = sorted({t for m in matches for t in (m[1], m[2])})
    atk = {t: 1.0 for t in all_teams}
    dfn = {t: 1.0 for t in all_teams}

    for _ in range(FIT_ITERATIONS):
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
        for t in all_teams:
            atk[t] *= gf[t] / exp_gf[t]
            dfn[t] *= ga[t] / exp_ga[t]
        # Renormalise to mean 1 so mu keeps its league-average meaning.
        n = len(all_teams)
        atk_mean = sum(atk.values()) / n
        dfn_mean = sum(dfn.values()) / n
        for t in all_teams:
            atk[t] /= atk_mean
            dfn[t] /= dfn_mean

    weighted_count = {t: 0.0 for t in all_teams}
    for w, home, away, _, _ in matches:
        weighted_count[home] += w
        weighted_count[away] += w

    form_data = _last6_form(db, league)
    avg_xg = LEAGUE_AVG_XG.get(league)

    strengths: dict[str, TeamStrength] = {}
    defaulted, form_teams = [], []
    for team in teams:
        if team in atk and weighted_count[team] > 0:
            s = TeamStrength(
                attack=atk[team], defence=dfn[team],
                weighted_matches=weighted_count[team],
            )
        else:
            s = TeamStrength(
                attack=PROMOTED_ATTACK, defence=PROMOTED_DEFENCE,
                weighted_matches=0.0, promoted_default=True,
            )
            defaulted.append(team)

        form = form_data.get(team)
        if form and avg_xg and not s.promoted_default:
            npxg_for, npxg_against = form
            s.last6_npxg_for = npxg_for
            s.last6_npxg_against = npxg_against
            s.attack = (1 - FORM_WEIGHT) * s.attack + FORM_WEIGHT * (npxg_for / avg_xg)
            s.defence = (1 - FORM_WEIGHT) * s.defence + FORM_WEIGHT * (npxg_against / avg_xg)
            s.form_adjusted = True
            form_teams.append(team)
        strengths[team] = s

    return StrengthFit(
        strengths=strengths,
        seasons_used=top_seasons,
        weighted_match_count=sum(w for w, *_ in matches),
        defaulted_teams=defaulted,
        form_teams=form_teams,
    )


def _last6_form(db: Session, league: str) -> dict[str, tuple[float, float]]:
    """team -> (avg npxG for, avg npxG against) over the last FORM_MATCHES
    rows of the most recent season present in xg_data for this league."""
    latest_season = (
        db.query(func.max(XGData.season)).filter(XGData.league == league).scalar()
    )
    if not latest_season:
        return {}
    rows = (
        db.query(XGData.team_name, XGData.match_number, XGData.npxg_for, XGData.npxg_against)
        .filter(XGData.league == league, XGData.season == latest_season)
        .order_by(XGData.team_name, XGData.match_number.desc())
        .all()
    )
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
