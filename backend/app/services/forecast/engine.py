"""
Forecast engine orchestrator.

run_forecast(db, question) drives the whole pipeline:

  parse -> collect evidence (source registry only) -> simulate -> compose

Every collector runs inside _stage(), which records a timeline entry
(source id, status, headline, elapsed ms) whether it succeeds, comes
back empty, or fails — the /forecast UI replays this timeline as the
research-swarm animation, so the animation IS the audit trail, not
decoration. A collector failure downgrades that source to status
'error' and the run continues; only parse failures and a missing team
list abort a forecast.

No source outside registry.py is consulted anywhere in this package —
notably there is no outright (title/top-4) market feed registered yet,
so league-level forecasts say so instead of quietly comparing against
nothing. Match-level questions DO get a market comparison (Pinnacle
de-vig + Polymarket where matched).
"""

import json
import time
from datetime import datetime, timedelta

import structlog
from sqlalchemy.orm import Session

from app.models import (
    HistoricalMatch,
    LeagueConstants,
    Match,
    OddsSnapshot,
    PolymarketSnapshot,
    SteamMove,
)
from .question_parser import LEAGUE_CONFIG, ParsedQuestion, parse
from .registry import ENGINE_VERSION
from .season_simulator import N_SIMS, match_probs, simulate_season
from .strength_model import fit_strengths

logger = structlog.get_logger()

# Fallback constants, mirroring scripts/model-params.ts LEAGUE_PARAMS —
# used only when the league_constants table has no row for the league
# (same fallback contract as the Match Predictor page).
_FALLBACK_CONSTANTS: dict[str, tuple[float, float]] = {
    "soccer_epl": (1.375, 1.25),
    "soccer_germany_bundesliga": (1.620, 1.22),
    "soccer_spain_la_liga": (1.345, 1.36),
    "soccer_italy_serie_a": (1.215, 1.15),
    "soccer_france_ligue_one": (1.415, 1.27),
}

_UPCOMING_HORIZON_DAYS = 60
_STEAM_LOOKBACK_DAYS = 14


def _current_season_code(now: datetime | None = None) -> str:
    """football-data style season code: Aug 2026 -> '2627'."""
    now = now or datetime.utcnow()
    start_year = now.year if now.month >= 7 else now.year - 1
    return f"{start_year % 100:02d}{(start_year + 1) % 100:02d}"


class _Run:
    """Mutable state for one forecast run: stages timeline + evidence."""

    def __init__(self):
        self.stages: list[dict] = []
        self.evidence: dict[str, dict] = {}
        self.warnings: list[str] = []

    def stage(self, source: str, fn):
        t0 = time.monotonic()
        try:
            card = fn()
        except ValueError as e:
            # Data-integrity errors (e.g. team-name normalization gaps)
            # are user-meaningful — surface the message in the stage log
            # instead of hiding it behind a generic label.
            logger.warning("forecast collector data error", source=source, error=str(e))
            self.stages.append({
                "source": source, "status": "error",
                "headline": str(e)[:200], "ms": _ms(t0),
            })
            return None
        except Exception as e:  # collector failure must not kill the run
            logger.warning("forecast collector failed", source=source, error=str(e))
            self.stages.append({
                "source": source, "status": "error",
                "headline": "Source unavailable", "ms": _ms(t0),
            })
            return None
        if card is None:
            self.stages.append({
                "source": source, "status": "empty",
                "headline": "No data for this question", "ms": _ms(t0),
            })
            return None
        self.evidence[source] = card
        self.stages.append({
            "source": source, "status": "done",
            "headline": card.get("headline", ""), "ms": _ms(t0),
        })
        return card


def _ms(t0: float) -> int:
    return int((time.monotonic() - t0) * 1000)


def run_forecast(db: Session, question: str) -> dict:
    t0 = time.monotonic()
    parsed = parse(question)

    if parsed.kind == "unsupported":
        return {
            "question": question, "kind": parsed.kind, "league": parsed.league,
            "status": "unsupported", "reason": parsed.reason,
            "suggestions": parsed.suggestions, "stages": [], "rationale": [],
            "evidence": {}, "result": None,
            "engine_version": ENGINE_VERSION, "duration_ms": _ms(t0),
        }

    run = _Run()
    cfg = LEAGUE_CONFIG[parsed.league]
    league = parsed.league

    # -- league constants ------------------------------------------------
    def collect_constants():
        row = db.query(LeagueConstants).filter(LeagueConstants.league == league).first()
        if row:
            return {
                "headline": f"avgGoalsPerTeam {row.avg_goals_per_team:.3f} · home/away {row.home_away_ratio:.2f}",
                "avg_goals_per_team": row.avg_goals_per_team,
                "home_away_ratio": row.home_away_ratio,
                "computed_at": row.computed_at.isoformat(), "fallback": False,
            }
        mu, ratio = _FALLBACK_CONSTANTS[league]
        return {
            "headline": f"avgGoalsPerTeam {mu:.3f} · home/away {ratio:.2f} (hardcoded fallback)",
            "avg_goals_per_team": mu, "home_away_ratio": ratio, "fallback": True,
        }

    constants = run.stage("league_constants", collect_constants)
    mu = constants["avg_goals_per_team"]
    ratio = constants["home_away_ratio"]

    # -- standings + current team list ----------------------------------
    season = _current_season_code()

    def collect_standings():
        rows = (
            db.query(HistoricalMatch)
            .filter(HistoricalMatch.league == league, HistoricalMatch.season == season)
            .filter(HistoricalMatch.fthg.isnot(None))
            .all()
        )
        played = [(r.home_team, r.away_team, r.fthg, r.ftag) for r in rows]
        hist_teams = {t for r in rows for t in (r.home_team, r.away_team)}

        horizon = datetime.utcnow() + timedelta(days=_UPCOMING_HORIZON_DAYS)
        upcoming = (
            db.query(Match.home_team, Match.away_team)
            .filter(Match.sport_key == league)
            .filter(Match.commence_time > datetime.utcnow(), Match.commence_time < horizon)
            .all()
        )
        feed_teams = {t for h, a in upcoming for t in (h, a)}
        teams = sorted(hist_teams | feed_teams)
        if not teams:
            return None
        return {
            "headline": f"{len(played)} played · {len(teams)} clubs · season {season}",
            "season": season, "teams": teams, "played": played,
            "played_count": len(played),
        }

    standings = run.stage("standings", collect_standings)
    if standings is None:
        return _abort(run, question, parsed, t0,
                      "No team list available for this league yet — the fixture "
                      "feed hasn't populated the new season.")
    teams = standings["teams"]

    # -- strength fit + xG form -----------------------------------------
    fit_holder = {}

    def collect_fit():
        fit = fit_strengths(db, league, teams, mu, ratio)
        fit_holder["fit"] = fit
        top = sorted(fit.strengths.items(), key=lambda kv: -kv[1].attack)[:3]
        headline = (
            f"{fit.weighted_match_count:.0f} weighted matches · seasons {'/'.join(fit.seasons_used) or '—'}"
            f" · {len(fit.draws)} bootstrap draws · conv {fit.final_max_update:.1e}"
        )
        if fit.defaulted_teams:
            headline += f" · {len(fit.defaulted_teams)} promoted defaults"
        return {
            "headline": headline,
            "seasons_used": fit.seasons_used,
            "weighted_match_count": fit.weighted_match_count,
            "defaulted_teams": fit.defaulted_teams,
            "top_attack": [
                {"team": t, "attack": round(s.attack, 3), "defence": round(s.defence, 3)}
                for t, s in top
            ],
        }

    fit_card = run.stage("strength_fit", collect_fit)
    if fit_card is None or "fit" not in fit_holder:
        return _abort(run, question, parsed, t0,
                      "Strength fit failed — not enough historical data.")
    fit = fit_holder["fit"]

    def collect_xg_form():
        if not fit.form_teams:
            return None
        formed = [
            (t, fit.strengths[t].last6_npxg_for, fit.strengths[t].last6_npxg_against)
            for t in fit.form_teams
        ]
        best = max(formed, key=lambda x: (x[1] or 0) - (x[2] or 0))
        return {
            "headline": f"npxG form blended for {len(formed)} clubs · hottest: {best[0]} ({best[1]:.2f} for / {best[2]:.2f} against)",
            "teams": [
                {"team": t, "last6_npxg_for": round(f, 2), "last6_npxg_against": round(a, 2)}
                for t, f, a in sorted(formed, key=lambda x: -((x[1] or 0) - (x[2] or 0)))
            ],
        }

    run.stage("xg_form", collect_xg_form)

    focus_teams = parsed.teams if parsed.teams else None

    # -- market context: Pinnacle / Polymarket / steam -------------------
    def collect_pinnacle():
        return _pinnacle_card(db, league, focus_teams)

    def collect_polymarket():
        return _polymarket_card(db, league, focus_teams)

    def collect_steam():
        return _steam_card(db, league, focus_teams)

    pinnacle = run.stage("pinnacle", collect_pinnacle)
    polymarket = run.stage("polymarket", collect_polymarket)
    steam = run.stage("steam", collect_steam)

    # -- the forecast itself --------------------------------------------
    if parsed.kind == "match":
        payload = _forecast_match(run, parsed, fit, mu, ratio, pinnacle, polymarket, steam)
    else:
        payload = _forecast_league(run, parsed, cfg, standings, fit, mu, ratio)
    if payload.get("error_reason"):
        return _abort(run, question, parsed, t0, payload["error_reason"])

    payload.update({
        "question": question, "kind": parsed.kind, "league": league,
        "league_name": cfg["name"], "status": "ok",
        "stages": run.stages, "evidence": run.evidence,
        "warnings": run.warnings,
        "engine_version": ENGINE_VERSION, "duration_ms": _ms(t0),
    })
    return payload


def _abort(run: _Run, question: str, parsed: ParsedQuestion, t0: float, reason: str) -> dict:
    return {
        "question": question, "kind": parsed.kind, "league": parsed.league,
        "status": "error", "reason": reason, "stages": run.stages,
        "rationale": [], "evidence": run.evidence, "result": None,
        "warnings": run.warnings,
        "engine_version": ENGINE_VERSION, "duration_ms": _ms(t0),
    }


# ---------------------------------------------------------------------------
# League-scope forecast (winner / top-N / relegation / team outcome)
# ---------------------------------------------------------------------------

def _forecast_league(run, parsed, cfg, standings, fit, mu, ratio) -> dict:
    # HARD-FAIL on team-count mismatch: 20 means 20. A 21st club named
    # apostrophe-differently isn't a curiosity — it adds two phantom
    # fixtures per real club and shifts every positional probability in
    # the league; too few clubs breaks the round-robin the same way.
    # (Match-level forecasts don't pass through here and are unaffected.)
    teams = standings["teams"]
    expected = cfg["teams"]
    if len(teams) != expected:
        return {"error_reason": (
            f"Team index has {len(teams)} clubs; the {cfg['name']} has "
            f"{expected}. Refusing to simulate a corrupted universe — too "
            "many means a name-normalization phantom (the same club under "
            "two spellings), too few means the fixture feed hasn't "
            f"populated the season. Index: {', '.join(teams)}"
        )}

    def collect_sim():
        sim = simulate_season(
            teams=standings["teams"],
            played_results=standings["played"],
            strengths=fit.strengths,
            avg_goals_per_team=mu,
            home_away_ratio=ratio,
            top_n=cfg["top_n"],
            relegation_spots=cfg["relegation_spots"],
            strength_draws=fit.draws or None,
        )
        run._sim = sim
        return {
            "headline": (
                f"{sim.n_sims:,} seasons · {sim.remaining_fixture_count} remaining fixtures"
                f" · {len(fit.draws)} strength draws"
            ),
            "n_sims": sim.n_sims,
            "remaining_fixtures": sim.remaining_fixture_count,
        }

    sim_card = run.stage("monte_carlo", collect_sim)
    if sim_card is None:
        # The stage log carries the specific message (a name-mismatch
        # ValueError hard-fails the sim by design — see season_simulator).
        return {"error_reason": (
            "Season simulation refused to run — most likely a team-name "
            "normalization gap between the results data and the fixture "
            "feed. See the stage log for the offending names."
        )}
    sim = run._sim

    if parsed.kind == "relegation" or (parsed.kind == "team_outcome" and parsed.outcome == "relegation"):
        dist, label = sim.p_relegation, "relegated"
    elif parsed.kind == "top_n" or (parsed.kind == "team_outcome" and parsed.outcome == "top_n"):
        dist, label = sim.p_top_n, f"top {cfg['top_n']}"
    else:
        dist, label = sim.p_title, "champions"

    entries = [
        {
            "team": t, "probability": round(p, 4),
            "current_points": sim.current_points[t],
            "played": sim.played[t],
            "mean_points": round(sim.mean_points[t], 1),
        }
        for t, p in sorted(dist.items(), key=lambda kv: -kv[1])
    ]

    result: dict = {
        "type": "distribution", "outcome_label": label, "entries": entries,
        "meta": {
            "n_sims": sim.n_sims, "remaining_fixtures": sim.remaining_fixture_count,
            "season": standings["season"],
        },
    }
    if parsed.kind == "team_outcome":
        team = parsed.teams[0]
        result["type"] = "binary"
        result["binary"] = {
            "team": team, "outcome_label": label,
            "probability": round(dist.get(team, 0.0), 4),
        }

    rationale = _league_rationale(parsed, cfg, standings, fit, sim, dist, label, run)
    return {"result": result, "rationale": rationale}


def _league_rationale(parsed, cfg, standings, fit, sim, dist, label, run) -> list[dict]:
    paras: list[dict] = []
    ranked = sorted(dist.items(), key=lambda kv: -kv[1])
    top3 = [(t, p) for t, p in ranked[:3]]
    name = cfg["name"]

    if parsed.kind == "team_outcome":
        team = parsed.teams[0]
        p = dist.get(team, 0.0)
        paras.append({
            "text": (
                f"Across {sim.n_sims:,} simulated {name} seasons, {team} finish "
                f"{label} in {p:.1%} of runs "
                f"(current: {sim.current_points[team]} pts from {sim.played[team]} played, "
                f"mean final total {sim.mean_points[team]:.1f} pts)."
            ),
            "sources": ["monte_carlo", "standings"],
        })
    else:
        listed = ", ".join(f"{t} {p:.1%}" for t, p in top3)
        paras.append({
            "text": (
                f"Across {sim.n_sims:,} simulated {name} seasons the most likely "
                f"{label}: {listed}. Every remaining fixture "
                f"({sim.remaining_fixture_count}) was simulated from Dixon-Coles "
                "scoreline distributions — this is a model probability, not a "
                "repackaged bookmaker price."
            ),
            "sources": ["monte_carlo", "strength_fit"],
        })

    strong = fit_top_line(fit)
    if strong:
        paras.append({"text": strong, "sources": ["strength_fit", "xg_form"]})

    if standings["played_count"] == 0:
        paras.append({
            "text": (
                f"No {name} matches have been played this season yet, so the "
                "forecast leans entirely on the 4-season strength fit "
                f"({'/'.join(fit.seasons_used)}, recency-weighted) rather than a "
                "current table."
            ),
            "sources": ["standings", "strength_fit"],
        })

    if fit.defaulted_teams:
        paras.append({
            "text": (
                f"Promoted clubs with no top-flight history in the window "
                f"({', '.join(fit.defaulted_teams)}) carry a documented default "
                "rating (attack 0.85 / defence 1.15) until real matches accrue."
            ),
            "sources": ["strength_fit"],
        })

    paras.append({
        "text": (
            "No outright (title/top-4) market source is registered in the "
            "engine yet, so there is deliberately no market comparison here — "
            "match-level questions get one from Pinnacle/Polymarket."
        ),
        "sources": [],
    })

    if label == "relegated" and cfg["relegation_spots"] == 2:
        paras.append({
            "text": (
                f"The {name} sends 2 clubs straight down; 16th place enters a "
                "relegation playoff that this forecast counts as survival."
            ),
            "sources": [],
        })
    return paras


def fit_top_line(fit) -> str | None:
    ranked = sorted(fit.strengths.items(), key=lambda kv: -(kv[1].attack - kv[1].defence))
    if not ranked:
        return None
    t, s = ranked[0]
    line = (
        f"Strongest current rating: {t} (attack {s.attack:.2f}, defence {s.defence:.2f} "
        "— 1.00 is league average)"
    )
    if s.form_adjusted:
        line += (
            f", including a last-6 npxG form blend ({s.last6_npxg_for:.2f} for / "
            f"{s.last6_npxg_against:.2f} against per game)"
        )
    return line + "."


# ---------------------------------------------------------------------------
# Match-scope forecast
# ---------------------------------------------------------------------------

def _forecast_match(run, parsed, fit, mu, ratio, pinnacle, polymarket, steam) -> dict:
    team_a, team_b = parsed.teams[0], parsed.teams[1]
    fixture = (pinnacle or {}).get("fixture")

    if fixture:
        home, away = fixture["home_team"], fixture["away_team"]
        venue_known = True
    else:
        home, away = team_a, team_b
        venue_known = False

    p_home, p_draw, p_away, lh, la = match_probs(fit.strengths, home, away, mu, ratio)

    result = {
        "type": "match",
        "match": {
            "home": home, "away": away, "venue_known": venue_known,
            "p_home": round(p_home, 4), "p_draw": round(p_draw, 4),
            "p_away": round(p_away, 4),
            "lambda_home": round(lh, 3), "lambda_away": round(la, 3),
            "commence_time": fixture["commence_time"] if fixture else None,
            "market": fixture.get("devig") if fixture else None,
            "polymarket": (polymarket or {}).get("prices"),
        },
    }

    paras: list[dict] = [{
        "text": (
            f"Model 1X2 for {home} v {away}: home {p_home:.1%}, draw {p_draw:.1%}, "
            f"away {p_away:.1%} (expected goals {lh:.2f}–{la:.2f})."
        ),
        "sources": ["strength_fit", "monte_carlo"],
    }]

    if fixture and fixture.get("devig"):
        d = fixture["devig"]
        edge = (p_home - d["home"]) * 100
        paras.append({
            "text": (
                f"Pinnacle currently implies home {d['home']:.1%} / draw {d['draw']:.1%} "
                f"/ away {d['away']:.1%} (de-vigged). Model vs market on the home "
                f"side: {edge:+.1f} percentage points."
            ),
            "sources": ["pinnacle"],
        })
    else:
        paras.append({
            "text": (
                "No upcoming fixture for this pairing is in the odds feed yet, so "
                "there's no market comparison — and the venue is assumed "
                f"({team_a} at home), which matters: swap it and the numbers flip."
            ) if not venue_known else "No current Pinnacle prices for this fixture.",
            "sources": ["pinnacle"],
        })

    if steam:
        paras.append({
            "text": f"Sharp-money context: {steam['headline']}.",
            "sources": ["steam"],
        })

    return {"result": result, "rationale": paras}


# ---------------------------------------------------------------------------
# Market-context collectors (shared)
# ---------------------------------------------------------------------------

def _pinnacle_card(db: Session, league: str, focus_teams: list[str] | None) -> dict | None:
    horizon = datetime.utcnow() + timedelta(days=_UPCOMING_HORIZON_DAYS)
    q = (
        db.query(Match)
        .filter(Match.sport_key == league)
        .filter(Match.commence_time > datetime.utcnow(), Match.commence_time < horizon)
        .order_by(Match.commence_time)
    )
    matches = q.all()
    if focus_teams:
        matches = [
            m for m in matches
            if m.home_team in focus_teams or m.away_team in focus_teams
        ]
    if not matches:
        return None

    fixtures = []
    for m in matches[:10]:
        snap = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == m.id, OddsSnapshot.in_play.is_(False))
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )
        fx = {
            "match_id": m.id, "home_team": m.home_team, "away_team": m.away_team,
            "commence_time": m.commence_time.isoformat(),
        }
        if snap and snap.home_odds and snap.draw_odds and snap.away_odds:
            inv = [1 / snap.home_odds, 1 / snap.draw_odds, 1 / snap.away_odds]
            s = sum(inv)
            fx["bookmaker"] = snap.bookmaker
            fx["devig"] = {
                "home": inv[0] / s, "draw": inv[1] / s, "away": inv[2] / s,
                "fetched_at": snap.fetched_at.isoformat(),
            }
        fixtures.append(fx)

    priced = [f for f in fixtures if "devig" in f]
    card = {
        "headline": f"{len(priced)} of {len(fixtures)} upcoming fixtures priced",
        "fixtures": fixtures,
    }
    # For match questions the first (soonest) fixture between the two
    # focus teams is THE fixture.
    if focus_teams and len(focus_teams) == 2:
        for f in fixtures:
            if {f["home_team"], f["away_team"]} == set(focus_teams):
                card["fixture"] = f
                break
    return card


def _polymarket_card(db: Session, league: str, focus_teams: list[str] | None) -> dict | None:
    horizon = datetime.utcnow() + timedelta(days=_UPCOMING_HORIZON_DAYS)
    rows = (
        db.query(PolymarketSnapshot, Match)
        .join(Match, PolymarketSnapshot.match_id == Match.id)
        .filter(Match.sport_key == league)
        .filter(Match.commence_time > datetime.utcnow(), Match.commence_time < horizon)
        .order_by(PolymarketSnapshot.fetched_at.desc())
        .limit(200)
        .all()
    )
    if focus_teams:
        rows = [
            (s, m) for s, m in rows
            if m.home_team in focus_teams or m.away_team in focus_teams
        ]
    if not rows:
        return None
    latest_by_match: dict[str, tuple] = {}
    for s, m in rows:
        latest_by_match.setdefault(m.id, (s, m))
    markets = [
        {
            "home_team": m.home_team, "away_team": m.away_team,
            "home_yes": s.home_win_yes, "draw_yes": s.draw_yes, "away_yes": s.away_win_yes,
            "volume_24h": s.event_volume_24h, "fetched_at": s.fetched_at.isoformat(),
        }
        for s, m in latest_by_match.values()
    ]
    card = {
        "headline": f"{len(markets)} matched Polymarket market(s)",
        "markets": markets,
    }
    if focus_teams and len(focus_teams) == 2 and markets:
        card["prices"] = markets[0]
    return card


def _steam_card(db: Session, league: str, focus_teams: list[str] | None) -> dict | None:
    since = datetime.utcnow() - timedelta(days=_STEAM_LOOKBACK_DAYS)
    q = (
        db.query(SteamMove)
        .filter(SteamMove.sport_key == league, SteamMove.detected_at > since)
        .order_by(SteamMove.detected_at.desc())
    )
    moves = q.limit(50).all()
    if focus_teams:
        moves = [m for m in moves if m.team_name in focus_teams]
    if not moves:
        return None
    top = moves[0]
    return {
        "headline": (
            f"{len(moves)} steam move(s) in {_STEAM_LOOKBACK_DAYS}d · biggest: "
            f"{top.team_name} {top.movement_percent:+.1f}% "
            f"({top.opening_odds:.2f} → {top.current_odds:.2f})"
        ),
        "moves": [
            {
                "team": m.team_name, "outcome": m.outcome,
                "movement_percent": m.movement_percent,
                "opening_odds": m.opening_odds, "current_odds": m.current_odds,
                "detected_at": m.detected_at.isoformat(),
            }
            for m in moves[:10]
        ],
    }


# ---------------------------------------------------------------------------
# Persistence helper (used by the API route)
# ---------------------------------------------------------------------------

def serialize_payload(payload: dict) -> str:
    return json.dumps(payload, default=str)
