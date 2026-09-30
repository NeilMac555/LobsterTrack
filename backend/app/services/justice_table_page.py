"""
Server-rendered /justice-table page (2026-10-01).

Each of Europe's top five league tables rebuilt on expected points (xPts):
the "table of justice" from Christoph Biermann's Football Hackers. One
table per league for the current season, sorted on expected points with
the real position alongside, plus method, meaning and an FAQ. Rendered
into the shared prerender shell like /goals-coming-soon; JusticeTablePage.tsx
mounts over it and adds the season toggle.

Data: services/xg_goals.justice / justice_summary (Understat, Mondays).
"""
from __future__ import annotations

import html
import json
import os
import time
from datetime import datetime, timezone
from functools import lru_cache

from sqlalchemy.orm import Session

from app.services.xg_goals import LEAGUE_LABEL, LEAGUE_ORDER, justice

DOMAIN = "https://www.steamwatch.io"
PATH = "/justice-table"
CACHE_TTL_SECONDS = 600

TITLE = "Expected Points Table (xPts): Justice Table | SteamWatch"
DESCRIPTION = "Every top-five-league table rebuilt on expected points over the last 12 months: each club's rank on xPts against its rank on results, updated weekly."
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


def _table(rows: list[dict]) -> str:
    if not rows:
        return "<p class=\"pr-meta\">No matches in this season yet.</p>"
    body = "".join(
        f"<tr><td class=\"pr-num\">{r['xpos']}</td><td>{_esc(r['team'])}</td><td class=\"pr-num\">{r['pos']}</td>"
        f"<td class=\"pr-num\">{r['matches']}</td><td class=\"pr-num\">{r['won']}</td><td class=\"pr-num\">{r['drawn']}</td><td class=\"pr-num\">{r['lost']}</td>"
        f"<td class=\"pr-num\">{r['goals']}</td><td class=\"pr-num\">{r['conceded']}</td><td class=\"pr-num\">{r['points']}</td>"
        f"<td class=\"pr-num\">{r['xpts']:.1f}</td><td class=\"pr-num {'pr-down' if r['gap'] > 0 else 'pr-up' if r['gap'] < 0 else ''}\">{_sgn(r['gap'])}</td></tr>"
        for r in rows
    )
    return ("<table><thead><tr><th>xPos</th><th>Club</th><th>Pos</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th>"
            f"<th>Pts</th><th>xPts</th><th>Gap</th></tr></thead><tbody>{body}</tbody></table>")


def _played(rows: list[dict]) -> str:
    lo, hi = min(r["matches"] for r in rows), max(r["matches"] for r in rows)
    return str(lo) if lo == hi else f"{lo} to {hi}"


def _names(rows: list[dict], league: bool = True) -> str:
    return ", ".join(f"{r['team']} ({_sgn(r['gap'])}{', ' + r['league_name'] if league else ''})" for r in rows)


def method_html(summ: dict, prev_label: str) -> str:
    """Kept in step with JusticeTablePage.tsx (the previous-season figures
    are computed live and read the same way there)."""
    prev = ""
    if summ.get("clubs"):
        prev = (f" In {prev_label}, the average club finished {summ['mean_abs_places']:.1f} places from its expected-points position, "
                f"{summ['within_two']} of {summ['clubs']} finished within two places of it, and the largest points gap was "
                f"{summ['max_gap_club']} at {_sgn(summ['max_gap'])}.")
    return (
        "<h2 id=\"method\">How it is measured</h2>"
        "<p>Expected points come from Understat, which turns the xG of both sides in a match into win, draw and loss "
        "probabilities and scores them 3, 1 and 0. A match a side would win 60% of the time and draw 20% of the time is worth "
        "2.0 expected points. Summed over the season they give the points a club's chances, and its opponents' chances, "
        "deserved. The window is a rolling 12 months of league matches, or 6 on the toggle, so it spans the end of last season "
        "and the start of this one; a club needs 8 matches in the window and a place in the division this season to appear. "
        "Each table is sorted on expected points, the justice order. Pos is the club's rank on real points over the same window, "
        "not its league position. Gap is points minus expected points. Data covers the Premier League, La Liga, Bundesliga, "
        "Serie A and Ligue 1 and refreshes every Monday; expected points count penalties, as xG does.</p>"
        "<h2 id=\"meaning\">What the table means</h2>"
        "<p>The name comes from the clubs in Christoph Biermann's Football Hackers, Midtjylland and Brentford among them, "
        "which judged themselves on expected points because the real table lies for long stretches. It still does." + prev +
        " Read a large positive gap as results running ahead of the play, and a large negative one as the reverse. Whether "
        "the market has priced that in is a separate question; the closing prices for every match are in Closing Lines.</p>"
    )


def faq(over: list[dict], under: list[dict], asof: str) -> list[tuple[str, str]]:
    return [
        ("What is a justice table?",
         "A league table sorted on expected points instead of points. It shows where each club would sit if its results "
         "matched the quality of the chances it created and allowed, with its real position alongside."),
        ("What are expected points (xPts)?",
         "The points a club was likely to take from a match given the xG of both sides: the win, draw and loss probabilities "
         "scored 3, 1 and 0 and added up. Over a season they show what the play was worth, separate from what the results delivered."),
        ("Which teams are overachieving their expected points right now?",
         f"As of matches to {asof}, the clubs furthest above their expected points over the last 12 months across the top five "
         f"leagues are {_names(over)}. Their results have run ahead of their play."),
        ("Which teams are underachieving their expected points?",
         f"As of matches to {asof}, the clubs furthest below their expected points over the last 12 months are {_names(under)}. "
         "Their play has been worth more than their results."),
        ("Why a rolling 12 months rather than the league table?",
         "Five or six matches into a season the gaps are mostly noise. Twelve months of league matches, about 34 to 38 per club, "
         "is enough for expected points to mean something, and the window moves on every week. A 6-month view is on the toggle."),
        ("How often is the justice table updated?",
         "Every Monday at 03:30 UTC from Understat, covering the current and previous season so the 12-month window is always complete."),
    ]


def _render(db: Session) -> str:
    data = justice(db, months=12)
    summ = data["previous_summary"]
    prev_label = data["previous_label"]
    all_rows = [r for lg in LEAGUE_ORDER for r in data["leagues"].get(lg, [])]
    over = sorted(all_rows, key=lambda r: -r["gap"])[:3]
    under = sorted(all_rows, key=lambda r: r["gap"])[:3]
    asof = _d(data.get("latest_match"))
    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    url = f"{DOMAIN}{PATH}"
    qa = faq(over, under, asof)

    json_ld = [
        {
            "@context": "https://schema.org",
            "@type": "Dataset",
            "name": "SteamWatch Justice Table: expected points (xPts) tables for Europe's top five leagues, rolling 12 months",
            "description": ("Points and expected points for every club in the Premier League, La Liga, Bundesliga, Serie A and "
                            "Ligue 1 over a rolling 12-month window, with each table sorted on expected points and the rank on "
                            "real points alongside. From Understat match data, refreshed weekly."),
            "url": url,
            "isAccessibleForFree": True,
            "dateModified": data.get("latest_match") or now.date().isoformat(),
            "temporalCoverage": f"{data['since']}/{data.get('latest_match') or now.date().isoformat()}",
            "spatialCoverage": "England, Spain, Germany, Italy, France",
            "keywords": ["expected points table", "xPts table", "justice table", "expected points", "xG league table", "football analytics"],
            "variableMeasured": ["points", "expected points", "points minus expected points", "position", "expected-points position"],
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

    sections = []
    for lg in LEAGUE_ORDER:
        rows = data["leagues"].get(lg, [])
        if not rows:
            continue
        name = LEAGUE_LABEL[lg]
        o = sorted(rows, key=lambda r: -r["gap"])[:3]
        u = sorted(rows, key=lambda r: r["gap"])[:3]
        sections.append(
            f"<h2 id=\"{ANCHOR[lg]}\">{_esc(name)} justice table, last 12 months</h2>"
            f"<p class=\"pr-meta\">{len(rows)} clubs, {_played(rows)} matches played. "
            f"Above their expected points: {_esc(_names(o, False))}. Below: {_esc(_names(u, False))}.</p>"
            f"{_table(rows)}"
        )

    faq_html = "".join(f"<h3>{_esc(q)}</h3><p>{_esc(a)}</p>" for q, a in qa)
    updated = (data.get("refreshed_at") or "")[:10] or None
    body = (
        "<h1>The Justice Table</h1>"
        "<p class=\"pr-lead\">Each of Europe's top five league tables rebuilt on expected points over the last 12 months. A club's "
        "expected points are what its chances, and its opponents' chances, were worth match by match; the table sorts on them, "
        "with the rank on real points alongside. Gap is points minus expected points: positive means results have been kinder "
        f"than the play. Biggest gaps: {_esc(_names(over))}. Furthest behind: {_esc(_names(under))}.</p>"
        f"<p class=\"pr-meta\">Matches from {_d(data['since'])} to {asof} · clubs with {data['min_matches']}+ matches · Understat data · updated {_d(updated)}</p>"
        "<nav class=\"pr-meta\" aria-label=\"Sections\">Jump to: "
        + " · ".join(f"<a href=\"#{ANCHOR[lg]}\">{_esc(LEAGUE_LABEL[lg])}</a>" for lg in LEAGUE_ORDER)
        + " · <a href=\"#method\">Method</a> · <a href=\"#faq\">Questions</a></nav>"
        + "".join(sections)
        + "<p class=\"pr-meta\">xPos is the rank on expected points over the window; Pos is the rank on real points over the same window. Gap is points minus expected points.</p>"
        + method_html(summ, prev_label)
        + f"<h2 id=\"faq\">Questions</h2>{faq_html}"
        "<h2>More on SteamWatch</h2>"
        "<ul><li><a href=\"/goals-coming-soon\">Goals Coming Soon: teams underperforming and overperforming their xG</a></li>"
        "<li><a href=\"/tools/rolling-xg\">Rolling xG: each club's last 5 and 10 matches</a></li>"
        "<li><a href=\"/closing-lines\">Closing Lines: the Pinnacle close for every finished match</a></li>"
        "<li><a href=\"/team-pnl\">Team P/L: what backing each club at closing prices returned</a></li></ul>"
    )
    head = "\n    ".join(head_parts)
    return _shell().replace("<!--PRERENDER:HEAD-->", head, 1).replace("<!--PRERENDER:CONTENT-->", body, 1)


def render_justice_table_page(db: Session) -> str:
    global _cache
    now_ts = time.time()
    if _cache and _cache[0] > now_ts:
        return _cache[1]
    out = _render(db)
    _cache = (now_ts + CACHE_TTL_SECONDS, out)
    return out
