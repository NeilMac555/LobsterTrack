"""
Server-rendered /goals-coming-soon page (2026-09-30).

Teams underperforming and overperforming their expected goals across
Europe's top five leagues over a rolling 12 months: a top ten each way,
then a section per league, then method, meaning and an FAQ. Rendered into
the shared prerender shell (dist/_shell.html) like /dropping-odds and the
match pages, so crawlers see every table without running JS.
GoalsComingSoonPage.tsx mounts over it and adds the 6-month toggle.

Data: services/xg_goals.table (Sportmonks, refreshed daily at 06:45 UTC).
Spec: docs/goals-coming-soon.md.
"""
from __future__ import annotations

import html
import json
import os
import time
from datetime import datetime, timezone
from functools import lru_cache

from sqlalchemy.orm import Session

from app.services.xg_goals import LEAGUE_LABEL, LEAGUE_ORDER, table

DOMAIN = "https://www.steamwatch.io"
PATH = "/goals-coming-soon"
CACHE_TTL_SECONDS = 600
TOP_N = 10
LEAGUE_N = 5

TITLE = "Teams Underperforming xG: Goals Coming Soon | SteamWatch"
DESCRIPTION = "Compare goals scored with Sportmonks total xG across Europe's top five leagues over the last six or twelve months. Updated daily."
assert len(TITLE) < 60 and len(DESCRIPTION) < 155

ANCHOR = {
    "soccer_epl": "premier-league",
    "soccer_spain_la_liga": "la-liga",
    "soccer_germany_bundesliga": "bundesliga",
    "soccer_italy_serie_a": "serie-a",
    "soccer_france_ligue_one": "ligue-1",
}

_cache: tuple[float, str] | None = None


def _static_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "static")


@lru_cache(maxsize=1)
def _shell() -> str:
    with open(os.path.join(_static_dir(), "_shell.html"), encoding="utf-8") as f:
        return f.read()


def _esc(v) -> str:
    return html.escape(str(v), quote=True)


def _d(iso: str | None) -> str:
    if not iso:
        return "—"
    dt = datetime.fromisoformat(iso)
    return f"{dt.day} {dt.strftime('%b %Y')}"


def _sgn(v: float, nd: int = 1) -> str:
    return f"{v:+.{nd}f}"


def _table(rows: list[dict], start: int = 1, league_col: bool = True) -> str:
    if not rows:
        return "<p class=\"pr-meta\">No club has enough matches in the window yet.</p>"
    head = "<th>#</th><th>Club</th>" + ("<th>League</th>" if league_col else "") + "<th>P</th><th>Goals</th><th>xG</th><th>Gap</th><th>Per match</th><th>Def gap</th>"
    body = "".join(
        f"<tr><td class=\"pr-num\">{start + i}</td><td>{_esc(r['team'])}</td>"
        + (f"<td>{_esc(r['league_name'])}</td>" if league_col else "")
        + f"<td class=\"pr-num\">{r['matches']}</td><td class=\"pr-num\">{r['goals']}</td><td class=\"pr-num\">{r['xg']:.1f}</td>"
        f"<td class=\"pr-num {'pr-up' if r['gap'] < 0 else 'pr-down'}\">{_sgn(r['gap'])}</td><td class=\"pr-num\">{_sgn(r['gap_per_match'], 2)}</td>"
        f"<td class=\"pr-num\">{_sgn(r['def_gap'])}</td></tr>"
        for i, r in enumerate(rows)
    )
    return f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"


def _sentence_top3(rows: list[dict], below: bool) -> str:
    parts = [f"{r['team']} ({_sgn(r['gap'])}, {r['league_name']})" for r in rows[:3]]
    if not parts:
        return ""
    word = "below" if below else "above"
    return f"Furthest {word} their xG: " + ", ".join(parts) + "."


def method_html() -> str:
    """Kept in step with GoalsComingSoonPage.tsx."""
    return (
        "<h2 id=\"method\">How it is measured</h2>"
        "<p>Sportmonks supplies the final scores and total xG, including penalties, for the Premier League, La Liga, Bundesliga, "
        "Serie A and Ligue 1. A club must be in its division this season and have at least eight league matches in the selected "
        "window with total xG for both teams. Gap is goals scored minus xG. Def gap is goals conceded minus xG against.</p>"
        "<h2 id=\"meaning\">What the gap means</h2>"
        "<p>A team with 18 goals from 21 xG has scored three fewer goals than the chances suggest. Compare the per-match "
        "gap as well as the total when two clubs have played different numbers of games.</p>"
    )


def faq(rows_below: list[dict], rows_above: list[dict], data: dict) -> list[tuple[str, str]]:
    asof = _d(data.get("latest_match"))
    top3 = ", ".join(f"{r['team']} ({_sgn(r['gap'])})" for r in rows_below[:3])
    hot3 = ", ".join(f"{r['team']} ({_sgn(r['gap'])})" for r in rows_above[:3])
    return [
        ("What does underperforming xG mean?",
         "A team is underperforming its expected goals when it has scored fewer goals than the xG value of the chances it "
         "created. On this page the gap is goals minus xG over the window, and a negative gap is underperformance."),
        ("Which teams are underperforming their xG right now?",
         f"As of matches to {asof}, the clubs furthest below their xG over the last 12 months in the top five leagues are {top3}. "
         "The full top ten and a breakdown by league are on this page."),
        ("Which teams are overperforming their xG?",
         f"As of matches to {asof}, the clubs furthest above their xG over the last 12 months are {hot3}. "
         "Goals usually fall back towards chances created, so these are the regression candidates in the other direction."),
        ("Do teams that underperform xG catch up?",
         "A team can keep scoring below its xG. The gap describes finishing over the selected matches and gives no "
         "timetable for when the next goal will come."),
        ("Does the gap include penalties?",
         "Yes. xG here is total xG including penalty xG, so it compares like with like against goals scored. "
         "Five- and ten-game total xG trends are on the Rolling xG page."),
        ("How often is this page updated?",
         "The Sportmonks refresh runs daily at 06:45 UTC. Completed league matches count once total xG is available for both teams."),
    ]


def _render(db: Session) -> str:
    data = table(db, months=12)
    rows = data["rows"]
    below = rows[:TOP_N]
    above = list(reversed(rows[-TOP_N:])) if len(rows) >= TOP_N else list(reversed(rows))
    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    url = f"{DOMAIN}{PATH}"
    qa = faq(below, above, data)

    json_ld = [
        {
            "@context": "https://schema.org",
            "@type": "Dataset",
            "name": "SteamWatch Goals Coming Soon: goals against expected goals for every club in Europe's top five leagues",
            "description": ("Goals scored and conceded against expected goals (xG and xGA) for every club in the Premier League, "
                            "La Liga, Bundesliga, Serie A and Ligue 1 over a rolling 12-month window, from Sportmonks match data, "
                            "refreshed daily. Identifies teams underperforming and overperforming their xG."),
            "url": url,
            "isAccessibleForFree": True,
            "dateModified": data.get("latest_match") or now.date().isoformat(),
            "temporalCoverage": f"{data['since']}/{data.get('latest_match') or now.date().isoformat()}",
            "spatialCoverage": "England, Spain, Germany, Italy, France",
            "keywords": ["teams underperforming xG", "teams overperforming xG", "expected goals", "goals vs xG", "xG regression", "football analytics"],
            "variableMeasured": ["goals scored", "expected goals", "goals minus xG", "goals minus xG per match", "goals conceded minus xGA"],
            "creator": {"@type": "Person", "name": "Neil Mac", "url": f"{DOMAIN}/about"},
            "publisher": {"@type": "Organization", "name": "SteamWatch", "url": DOMAIN},
        },
        {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa],
        },
    ]
    head_parts = [
        f"<title data-prerender=\"1\">{_esc(TITLE)}</title>",
        f"<meta name=\"description\" content=\"{_esc(DESCRIPTION)}\" data-prerender=\"1\" />",
        f"<link rel=\"canonical\" href=\"{url}\" data-prerender=\"1\" />",
        "<meta property=\"og:type\" content=\"website\" data-prerender=\"1\" />",
        f"<meta property=\"og:title\" content=\"{_esc(TITLE)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:description\" content=\"{_esc(DESCRIPTION)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:url\" content=\"{url}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:title\" content=\"{_esc(TITLE)}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:description\" content=\"{_esc(DESCRIPTION)}\" data-prerender=\"1\" />",
    ] + [f"<script type=\"application/ld+json\">{json.dumps(b)}</script>" for b in json_ld]

    league_sections = []
    for lg in LEAGUE_ORDER:
        lrows = [r for r in rows if r["league"] == lg]
        if not lrows:
            continue
        lb = lrows[:LEAGUE_N]
        la = list(reversed(lrows[-LEAGUE_N:]))
        name = LEAGUE_LABEL[lg]
        league_sections.append(
            f"<h2 id=\"{ANCHOR[lg]}\">{_esc(name)} teams underperforming and overperforming xG</h2>"
            f"<p class=\"pr-meta\">{len(lrows)} {_esc(name)} clubs with 8+ matches in the window. {_esc(_sentence_top3(lb, True))} {_esc(_sentence_top3(la, False))}</p>"
            f"<h3>Below xG</h3>{_table(lb, league_col=False)}"
            f"<h3>Above xG</h3>{_table(la, league_col=False)}"
        )

    faq_html = "".join(f"<h3>{_esc(q)}</h3><p>{_esc(a)}</p>" for q, a in qa)
    updated = (data.get("refreshed_at") or "")[:10] or None
    body = (
        "<h1>Goals Coming Soon</h1>"
        "<p class=\"pr-lead\">Teams underperforming their expected goals across Europe's top five leagues, and the teams running hot "
        "above theirs. Gap is goals scored minus xG over the last 12 months: the more negative, the more chances have gone "
        f"unrewarded. {_esc(_sentence_top3(below, True))}</p>"
        f"<p class=\"pr-meta\">Matches from {_d(data['since'])} to {_d(data.get('latest_match'))} · {data['clubs_in_window']} clubs with "
        f"{data['min_matches']}+ matches · {_esc(data['source'])} data · updated {_d(updated)}</p>"
        "<nav class=\"pr-meta\" aria-label=\"Sections\">Jump to: <a href=\"#underperforming\">Below xG</a> · <a href=\"#overperforming\">Above xG</a> · "
        + " · ".join(f"<a href=\"#{ANCHOR[lg]}\">{_esc(LEAGUE_LABEL[lg])}</a>" for lg in LEAGUE_ORDER) + " · <a href=\"#faq\">Questions</a></nav>"
        "<h2 id=\"underperforming\">Teams underperforming xG: furthest below, all five leagues</h2>"
        f"{_table(below)}"
        "<h2 id=\"overperforming\">Teams overperforming xG: furthest above, all five leagues</h2>"
        f"<p>{_esc(_sentence_top3(above, False))} The same logic applies in reverse: goals usually fall back towards the chances created.</p>"
        f"{_table(above)}"
        + "".join(league_sections)
        + method_html()
        + f"<h2 id=\"faq\">Questions</h2>{faq_html}"
        "<h2>More on SteamWatch</h2>"
        "<ul><li><a href=\"/justice-table\">The Justice Table: every league table rebuilt on expected points</a></li>"
        "<li><a href=\"/tools/rolling-xg\">Rolling xG: each club's last 5 and 10 matches, including penalties</a></li>"
        "<li><a href=\"/team-pnl\">Team P/L: what backing each club at closing prices returned</a></li>"
        "<li><a href=\"/tools/match-predictor\">Match Predictor: fair odds from xG form</a></li>"
        "<li><a href=\"/dropping-odds\">Dropping Odds: where the market is moving today</a></li></ul>"
    )
    head = "\n    ".join(head_parts)
    return _shell().replace("<!--PRERENDER:HEAD-->", head, 1).replace("<!--PRERENDER:CONTENT-->", body, 1)


def render_goals_coming_soon_page(db: Session) -> str:
    global _cache
    now_ts = time.time()
    if _cache and _cache[0] > now_ts:
        return _cache[1]
    out = _render(db)
    _cache = (now_ts + CACHE_TTL_SECONDS, out)
    return out
