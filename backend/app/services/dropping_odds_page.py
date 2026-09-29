"""
Server-rendered /dropping-odds page (2026-09-29).

"Dropping odds" is the usual UK/EU search phrase for what the homepage's
Biggest Movers section shows: the fixtures whose price has shortened most
over the last 48 hours. This page renders that data as a real HTML table
inside the shared prerender shell (dist/_shell.html), the same approach as
the match pages, so crawlers see current figures without running JS. The
React app then mounts DroppingOddsPage over the top.

Data: app.api.routes.compute_biggest_movers (one shortening move per
upcoming match, biggest across 1X2 and totals, against the price ~48h ago
or the opening price for newer listings). Cached in-process for
CACHE_TTL_SECONDS; the odds feed refreshes every 15 minutes.
"""
from __future__ import annotations

import html
import json
import os
import time
from datetime import datetime, timezone
from functools import lru_cache

from sqlalchemy.orm import Session

DOMAIN = "https://www.steamwatch.io"
PATH = "/dropping-odds"
CACHE_TTL_SECONDS = 300
LIMIT = 50

TITLE = "Dropping Odds Today: Football Odds Tracker | SteamWatch"
DESCRIPTION = "Football fixtures whose Pinnacle odds dropped most in the last 48 hours: opening price, current price and implied-probability change, every 15 minutes."

_cache: tuple[float, str] | None = None


def _static_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "static")


@lru_cache(maxsize=1)
def _shell() -> str:
    with open(os.path.join(_static_dir(), "_shell.html"), encoding="utf-8") as f:
        return f.read()


def _esc(v) -> str:
    return html.escape(str(v), quote=True)


def _imp(v: float | None) -> float | None:
    return (100.0 / v) if v else None


def _pp(open_: float | None, now: float | None) -> float | None:
    a, b = _imp(open_), _imp(now)
    return (b - a) if a is not None and b is not None else None


def _naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _kickoff(dt: datetime) -> str:
    d = _naive_utc(dt)
    return f"{d.strftime('%d %b').lstrip('0')} {d.strftime('%H:%M')} UTC"


MARKET_LABEL = {"1x2": "1X2", "totals": "Totals", "spreads": "Asian handicap"}


def steam_record_sentence(db: Session) -> str:
    """Live Steam Results record for the current season, the same numbers
    /api/steam-results reports: confirmed alerts with a result, 1 unit at
    the post-move (alert) price."""
    from app.api.routes import _season_start, _season_label
    from app.services.telegram_results import alert_moves
    try:
        moves = [m for m in alert_moves(db, since=_season_start()) if m.result_updated]
    except Exception:
        moves = []
    if not moves:
        return "The season's record of every logged steam move is on Steam Results."
    n = len(moves)
    wins = sum(1 for m in moves if m.won)
    profit = sum((m.current_odds - 1) if m.won else -1 for m in moves)
    roi = 100.0 * profit / n
    return (f"So far in {_season_label()} SteamWatch has logged {n} steam moves: {100.0 * wins / n:.1f}% won, and backing "
            f"every one with 1 unit at the post-move price returned {roi:+.1f}%.")


def intro_html(record: str) -> str:
    """The ~200-word intro. Kept in one place; DroppingOddsPage.tsx carries
    the same text for the client-rendered view. `record` is the live Steam
    Results sentence."""
    return (
        "<p class=\"pr-lead\">Dropping odds are prices that have shortened since they opened. The table below lists the "
        "upcoming fixtures whose Pinnacle price has dropped most over the last 48 hours, with the opening price, the "
        "current price and the change in implied probability.</p>"
        "<h2>How SteamWatch measures a drop</h2>"
        "<p>SteamWatch records Pinnacle's 1X2, Asian handicap and totals prices every 15 minutes, and more often close to "
        "kickoff. For each upcoming match it compares the current price with the price 48 hours earlier, or with the "
        "opening price for matches listed more recently, and shows the selection that shortened most across the 1X2 and "
        "totals markets. The change is given in implied-probability points: 100 divided by the price, now minus then. "
        "A move from 2.00 to 1.80 is a drop of 5.6 points.</p>"
        "<h2>Steamers and drifters</h2>"
        "<p>SteamWatch logs a drop of 3 percentage points or more before kickoff as a steamer and follows it to the result on "
        "<a href=\"/steam-results\">Steam Results</a>. "
        "The opposite move, a price that lengthens, is a drifter, and those are tracked on <a href=\"/drifters\">Drifters</a>. "
        f"{record}</p>"
        "<p>Background: <a href=\"/blog/what-are-steam-moves-in-football-betting\">what steam moves are</a>, "
        "<a href=\"/blog/what-is-a-drifter-in-football-betting\">what a drifter is</a> and "
        "<a href=\"/blog/how-to-read-closing-lines-in-football-betting\">how to read closing lines</a>.</p>"
    )


def _table(movers) -> str:
    if not movers:
        return "<p class=\"pr-meta\">No price has dropped by more than a fraction of a point in the last 48 hours. The table fills as fixtures are listed and prices move.</p>"
    rows = []
    for m in movers:
        pp = _pp(m.opening_odds, m.current_odds)
        cls = "pr-down" if pp is not None and pp > 0.05 else ""
        rows.append(
            f"<tr><td class=\"pr-num\">{_esc(_kickoff(m.commence_time))}</td>"
            f"<td><a href=\"/match/{_esc(m.match_id)}\">{_esc(m.home_team)} v {_esc(m.away_team)}</a></td>"
            f"<td>{_esc(m.league_name)}</td>"
            f"<td>{_esc(m.outcome_name)} <span class=\"pr-meta\">({MARKET_LABEL.get(m.market, m.market)})</span></td>"
            f"<td class=\"pr-num\">{m.opening_odds:.2f}</td><td class=\"pr-num\">{m.current_odds:.2f}</td>"
            f"<td class=\"pr-num {cls}\">{pp:+.1f}pp</td></tr>" if pp is not None else ""
        )
    return (
        "<table><thead><tr><th>Kickoff</th><th>Match</th><th>Competition</th><th>Selection</th>"
        "<th>From</th><th>Now</th><th>Implied change</th></tr></thead>"
        f"<tbody>{''.join(rows)}</tbody></table>"
    )


def _render(db: Session) -> str:
    from app.api.routes import compute_biggest_movers  # local import: routes imports a lot

    movers = compute_biggest_movers(db, LIMIT, None, with_sparkline=False)
    # Largest implied-probability drop first (the homepage orders by percent).
    movers = sorted(movers, key=lambda m: (_pp(m.opening_odds, m.current_odds) or 0.0), reverse=True)
    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    stamp = now.strftime("%H:%M UTC, %d %b %Y").replace(" 0", " ")
    url = f"{DOMAIN}{PATH}"

    json_ld = {
        "@context": "https://schema.org",
        "@type": "Dataset",
        "name": "SteamWatch Dropping Odds: football fixtures whose Pinnacle price shortened most in the last 48 hours",
        "description": ("For every upcoming tracked match, the selection whose Pinnacle price shortened most over the "
                        "trailing 48 hours across the 1X2 and totals markets, with opening price, current price and "
                        "implied-probability change. Refreshed every 15 minutes."),
        "url": url,
        "isAccessibleForFree": True,
        "dateModified": now.isoformat().replace("+00:00", "Z"),
        "temporalCoverage": "P2D",
        "keywords": ["dropping odds", "football odds movement", "steam moves", "Pinnacle odds", "odds tracker"],
        "variableMeasured": ["opening decimal odds", "current decimal odds", "implied-probability change in percentage points"],
        "creator": {"@type": "Person", "name": "Neil Mac", "url": f"{DOMAIN}/about"},
        "publisher": {"@type": "Organization", "name": "SteamWatch", "url": DOMAIN},
    }
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
        f"<script type=\"application/ld+json\">{json.dumps(json_ld)}</script>",
    ]
    body = (
        "<h1>Dropping Odds Today</h1>"
        f"<p class=\"pr-meta\">{len(movers)} fixtures with a shortening price · rebuilt {stamp} · Pinnacle prices via The Odds API</p>"
        f"{intro_html(steam_record_sentence(db))}"
        "<h2>Biggest drops in the last 48 hours</h2>"
        f"{_table(movers)}"
        "<p class=\"pr-meta\">From is the opening price, or the price 48 hours ago for matches listed earlier than that.</p>"
        "<p class=\"pr-meta\">Implied change is in percentage points, largest first; positive means the price shortened. Each match links to its full "
        "open-to-kickoff price history.</p>"
        "<h2>More on SteamWatch</h2>"
        "<ul><li><a href=\"/\">Live odds and biggest movers by league</a></li>"
        "<li><a href=\"/steam-results\">Steam Results: how detected steam moves have performed</a></li>"
        "<li><a href=\"/drifters\">Drifters: prices that lengthened before kickoff</a></li>"
        "<li><a href=\"/closing-lines\">Closing Lines: the Pinnacle close for every finished match</a></li></ul>"
    )
    head = "\n    ".join(head_parts)
    return _shell().replace("<!--PRERENDER:HEAD-->", head, 1).replace("<!--PRERENDER:CONTENT-->", body, 1)


def render_dropping_odds_page(db: Session) -> str:
    global _cache
    now_ts = time.time()
    if _cache and _cache[0] > now_ts:
        return _cache[1]
    out = _render(db)
    _cache = (now_ts + CACHE_TTL_SECONDS, out)
    return out
