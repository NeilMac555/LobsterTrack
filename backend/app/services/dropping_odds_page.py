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


@lru_cache(maxsize=1)
def _sharp_side_callout() -> str:
    # Generated from the React component during the frontend build.
    try:
        with open(os.path.join(_static_dir(), "data", "sharp-side-soccer.json"), encoding="utf-8") as f:
            return json.load(f)["dropping-odds"]
    except FileNotFoundError:
        return ""  # Local backend-only runs do not require the frontend build.


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
    """Same all-qualifying-move cohort as the Steam Results page."""
    from app.api.routes import _season_start, _season_label
    from app.services.market_move_results import market_move_report
    report = market_move_report(db, 1, _season_start(), _season_label(), limit=1)
    if not report['total_moves']:
        return "The season's record of qualifying steam moves is on Steam Results."
    return (f"So far in {_season_label()} SteamWatch has recorded {report['total_moves']} settled team steam moves: "
            f"{report['win_rate']:.1f}% won. Flat 1u at each selection's largest recorded qualifying move price "
            f"returned {report['roi_percent']:+.1f}%. This is a descriptive movement record, not Telegram alert performance.")


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
        f"{_sharp_side_callout()}"
        "<h2>Biggest drops in the last 48 hours</h2>"
        f"{_table(movers)}"
        "<p class=\"pr-meta\">From is the opening price, or the price 48 hours ago for matches listed earlier than that.</p>"
        "<p class=\"pr-meta\">Implied change is in percentage points, largest first; positive means the price shortened. Each match links to its full "
        "open-to-kickoff price history.</p>"
        f"<h2>Dropping odds by competition</h2><p>{league_nav_html(db)}</p>"
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


# ---------------------------------------------------------------------------
# League pages: /dropping-odds/<league-slug> (2026-11-27)
#
# The same table filtered to one competition, plus commentary whose every
# figure is calculated from this season's finished matches in that
# competition. /league/<slug> stays the fixtures-and-results archive; this
# page is the live list of movers. Each links to the other.
#
# The copy is built here once. The server page renders it and the React
# page reads the same content from GET /api/dropping-odds/league/<slug>,
# so there is a single source for the wording.
# ---------------------------------------------------------------------------
LEAGUE_FACTS_TTL_SECONDS = 12 * 3600
LEAGUE_MIN_MATCHES = 20
_league_cache: dict[str, tuple[float, object]] = {}

_FACTS_SQL = """
with m as (select id, commence_time ko from matches
           where sport_key = :k and commence_time >= :since and commence_time < :now),
o as (select distinct on (s.match_id) s.match_id, s.home_odds h, s.draw_odds d, s.away_odds a, s.fetched_at t
      from odds_snapshots s join m on m.id = s.match_id
      where s.bookmaker = 'pinnacle' and s.fetched_at < m.ko order by s.match_id, s.fetched_at asc),
c as (select distinct on (s.match_id) s.match_id, s.home_odds h, s.draw_odds d, s.away_odds a, s.fetched_at t
      from odds_snapshots s join m on m.id = s.match_id
      where s.bookmaker = 'pinnacle' and s.fetched_at < m.ko order by s.match_id, s.fetched_at desc),
d as (select distinct on (s.match_id) s.match_id, s.home_odds h, s.draw_odds d, s.away_odds a
      from odds_snapshots s join m on m.id = s.match_id
      where s.bookmaker = 'pinnacle' and s.fetched_at <= m.ko - interval '24 hours'
      order by s.match_id, s.fetched_at desc)
select m.ko, o.t, o.h, o.d, o.a, c.h, c.d, c.a, d.h, d.d, d.a
from m join o on o.match_id = m.id join c on c.match_id = m.id left join d on d.match_id = m.id
where c.t >= m.ko - interval '30 minutes'
"""


UPCOMING_WINDOW_DAYS = 60
RECENT_WINDOW_DAYS = 21
_page_leagues_cache: tuple[float, list[str]] | None = None


def page_leagues(db: Session) -> list[str]:
    """sport_keys that get a league page: competitions whose prices are
    being refreshed (config.leagues) and that are in play, meaning a match
    in the last RECENT_WINDOW_DAYS days or the next UPCOMING_WINDOW_DAYS.
    The look-back keeps a page up between rounds, before the next fixtures
    are listed. A finished or paused competition gets no page: its table
    would stay empty."""
    global _page_leagues_cache
    if _page_leagues_cache and _page_leagues_cache[0] > time.time():
        return _page_leagues_cache[1]
    from datetime import timedelta
    from sqlalchemy import text
    from app.config import get_settings
    from app.services import fixtures as fx
    now = datetime.utcnow()
    rows = db.execute(text("select distinct sport_key from matches where commence_time > :start and commence_time < :end"),
                      {"start": now - timedelta(days=RECENT_WINDOW_DAYS), "end": now + timedelta(days=UPCOMING_WINDOW_DAYS)}).fetchall()
    in_play = {r[0] for r in rows} & set(get_settings().leagues)
    keys = [k for k in fx.active_leagues(db) if k in in_play]
    _page_leagues_cache = (time.time() + 3600, keys)
    return keys


def _median(values: list[float]) -> float:
    v = sorted(values)
    n = len(v)
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2


def facts_from_rows(rows) -> dict | None:
    """rows: (kickoff, first_price_time, open h/d/a, close h/d/a, T-24h h/d/a or None).
    Only matches with a Pinnacle price in the last 30 minutes before kickoff."""
    rows = [r for r in rows if all(r[i] and r[i] > 1 for i in range(2, 8))]
    n = len(rows)
    if n < LEAGUE_MIN_MATCHES:
        return None
    biggest, moved, late_known, late = [], 0, 0, 0
    for r in rows:
        change = [100 / r[5 + i] - 100 / r[2 + i] for i in range(3)]
        i = max(range(3), key=lambda j: change[j])
        biggest.append(change[i])
        if change[i] >= 3:
            moved += 1
            if r[8] and r[8 + i]:
                late_known += 1
                late += (100 / r[5 + i] - 100 / r[8 + i]) > change[i] / 2
    return {
        "matches": n,
        "lead_days": _median([(r[0] - r[1]).total_seconds() / 86400 for r in rows]),
        "margin_open": sum(100 * (1 / r[2] + 1 / r[3] + 1 / r[4]) - 100 for r in rows) / n,
        "margin_close": sum(100 * (1 / r[5] + 1 / r[6] + 1 / r[7]) - 100 for r in rows) / n,
        "median_biggest": _median(biggest),
        "moved": moved,
        "late_known": late_known,
        "late": late,
    }


def league_paragraphs(name: str, slug: str, facts: dict | None, record: dict | None, season: str) -> list[dict]:
    """[{heading, html}]. heading is None for the lead. html may hold links."""
    out = [{"heading": None, "html": (
        f"The table lists the upcoming {_esc(name)} fixtures whose Pinnacle price has shortened most over the last 48 hours, "
        "with the price it moved from, the current price and the change in implied probability.")}]
    if facts:
        n = facts["matches"]
        out.append({"heading": f"When {name} prices appear", "html": (
            f"In {season} SteamWatch has recorded its first Pinnacle price for a {_esc(name)} match a median of "
            f"{facts['lead_days']:.1f} days before kickoff. Across {n} finished matches the 1X2 margin averaged "
            f"{facts['margin_open']:.1f}% at that first price and {facts['margin_close']:.1f}% at kickoff. A drop measured "
            "from an early price therefore includes some of that margin coming out, as well as any change in the market's view.")})
        moved = facts["moved"]
        text_ = (f"In {moved} of those {n} matches ({100 * moved / n:.0f}%) one of the three outcomes shortened by 3 percentage "
                 f"points or more between the first price and kickoff. The median biggest shortening per match was "
                 f"{facts['median_biggest']:.1f} points.")
        if facts["late_known"] >= 10:
            known, late = facts["late_known"], facts["late"]
            scope = f"In {late} of those {moved}" if known == moved else f"In {late} of the {known} with a price on record 24 hours out"
            text_ += f" {scope} ({100 * late / known:.0f}%), more than half of the move came in the final 24 hours."
        out.append({"heading": f"How far {name} prices move", "html": text_})
    rec = ""
    if record and record.get("total_moves"):
        rec = (f"SteamWatch has {record['total_moves']} settled {_esc(name)} team steam moves in {season}: "
               f"{record['win_rate']:.1f}% won, and a flat 1u at each selection's largest recorded qualifying move price "
               f"returned {record['roi_percent']:+.1f}%. This is a descriptive movement record, not Telegram alert performance. ")
    out.append({"heading": f"{name} steam record", "html": (
        f"{rec}Every logged move is on <a href=\"/steam-results\">Steam Results</a>. Fixtures, results and closing prices "
        f"for the competition are on <a href=\"/league/{slug}\">{_esc(name)} odds movement</a>, and all competitions are on "
        "<a href=\"/dropping-odds\">Dropping Odds Today</a>.")})
    return out


def league_content(db: Session, slug: str) -> dict | None:
    """Title, description and commentary for one league page, or None if the
    slug is not a competition with matches this season."""
    from sqlalchemy import text
    from app.api.routes import _season_label, _season_start
    from app.services import fixtures as fx
    from app.services.market_move_results import market_move_report

    sport_key = fx.SLUG_TO_KEY.get(slug)
    if not sport_key or sport_key not in page_leagues(db):
        return None
    hit = _league_cache.get(slug)
    if hit and hit[0] > time.time():
        return hit[1]
    name = fx.LEAGUES[sport_key][1]
    rows = db.execute(text(_FACTS_SQL), {"k": sport_key, "since": _season_start(), "now": datetime.utcnow()}).fetchall()
    facts = facts_from_rows(rows)
    try:
        record = market_move_report(db, 1, _season_start(), _season_label(), league=sport_key, limit=1)
    except Exception:
        record = None
    content = {
        "slug": slug,
        "sport_key": sport_key,
        "name": name,
        "h1": f"{name} Dropping Odds",
        "title": f"{name} Dropping Odds Today | SteamWatch",
        "description": (f"{name} fixtures whose Pinnacle odds dropped most in the last 48 hours, plus when prices open, "
                        "how far they move and the competition's steam record this season."),
        "paragraphs": league_paragraphs(name, slug, facts, record, _season_label()),
    }
    _league_cache[slug] = (time.time() + LEAGUE_FACTS_TTL_SECONDS, content)
    return content


def league_nav_html(db: Session, current: str | None = None) -> str:
    from app.services import fixtures as fx
    return " · ".join(
        f"<a href=\"/dropping-odds/{fx.LEAGUES[k][0]}\">{_esc(fx.LEAGUES[k][1])}</a>"
        for k in page_leagues(db) if fx.LEAGUES[k][0] != current
    )


_league_page_cache: dict[str, tuple[float, str]] = {}


def render_dropping_odds_league_page(db: Session, slug: str) -> str | None:
    hit = _league_page_cache.get(slug)
    if hit and hit[0] > time.time():
        return hit[1]
    content = league_content(db, slug)
    if not content:
        return None
    from app.api.routes import compute_biggest_movers

    movers = compute_biggest_movers(db, LIMIT, content["sport_key"], with_sparkline=False)
    movers = sorted(movers, key=lambda m: (_pp(m.opening_odds, m.current_odds) or 0.0), reverse=True)
    now = datetime.utcnow().replace(tzinfo=timezone.utc)
    stamp = now.strftime("%H:%M UTC, %d %b %Y").replace(" 0", " ")
    url = f"{DOMAIN}{PATH}/{slug}"
    title, description = content["title"], content["description"]
    head = "\n    ".join([
        f"<title data-prerender=\"1\">{_esc(title)}</title>",
        f"<meta name=\"description\" content=\"{_esc(description)}\" data-prerender=\"1\" />",
        f"<link rel=\"canonical\" href=\"{url}\" data-prerender=\"1\" />",
        "<meta property=\"og:type\" content=\"website\" data-prerender=\"1\" />",
        f"<meta property=\"og:title\" content=\"{_esc(title)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:description\" content=\"{_esc(description)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:url\" content=\"{url}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:title\" content=\"{_esc(title)}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:description\" content=\"{_esc(description)}\" data-prerender=\"1\" />",
    ])
    lead, rest = content["paragraphs"][0], content["paragraphs"][1:]
    body = (
        f"<h1>{_esc(content['h1'])}</h1>"
        f"<p class=\"pr-meta\">{len(movers)} fixtures with a shortening price · rebuilt {stamp} · Pinnacle prices via The Odds API</p>"
        f"<p class=\"pr-lead\">{lead['html']}</p>"
        f"<h2>Biggest {_esc(content['name'])} drops in the last 48 hours</h2>"
        f"{_table(movers)}"
        "<p class=\"pr-meta\">From is the opening price, or the price 48 hours ago for matches listed earlier than that. "
        "Implied change is in percentage points, largest first; positive means the price shortened.</p>"
        + "".join(f"<h2>{_esc(p['heading'])}</h2><p>{p['html']}</p>" for p in rest)
        + f"<h2>Dropping odds by competition</h2><p>{league_nav_html(db, slug)}</p>"
    )
    out = _shell().replace("<!--PRERENDER:HEAD-->", head, 1).replace("<!--PRERENDER:CONTENT-->", body, 1)
    _league_page_cache[slug] = (time.time() + CACHE_TTL_SECONDS, out)
    return out
