"""
Server-rendered league hubs (/league/<slug>) and the homepage fixture list
(2026-11-10 SEO audit, issues 1 and 2).

Before this, match pages had no internal link in the raw HTML: the homepage
and closing-lines lists were built in JavaScript, and the league filter was a
/?league= parameter that canonicalised to the homepage. Each league now has
an indexable hub listing every upcoming and finished match of the season with
a plain <a href>, and the homepage gets the next 30 days's fixtures injected
into its prerendered HTML at request time.

LeaguePage.tsx is the client twin of the hub; keep copy in step.
"""
from __future__ import annotations

import html
import json
import os
import time
from datetime import datetime
from functools import lru_cache
from typing import Optional

from sqlalchemy.orm import Session

from app.services import fixtures as fx

DOMAIN = "https://www.steamwatch.io"
_cache: dict[str, tuple[float, str]] = {}
CACHE_TTL_SECONDS = 600
HOME_TTL_SECONDS = 300


def _static_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "static")


@lru_cache(maxsize=1)
def _shell() -> str:
    with open(os.path.join(_static_dir(), "_shell.html"), encoding="utf-8") as f:
        return f.read()


def _esc(v) -> str:
    return html.escape(str(v), quote=True)


def _when(iso: str) -> str:
    d = datetime.fromisoformat(iso)
    return f"{d.day} {d.strftime('%b %Y')} {d.strftime('%H:%M')}"


def _p(v: Optional[float]) -> str:
    return f"{v:.2f}" if v else "—"


def hub_title(name: str) -> str:
    t = f"{name} Odds Movement and Closing Prices | SteamWatch"
    return t if len(t) < 60 else f"{name} Odds Movement | SteamWatch"


def hub_description(name: str) -> str:
    return (f"Every {name} match this season with its Pinnacle price history: upcoming fixtures, "
            "closing 1X2 prices and open-to-kickoff odds movement.")


def league_links_html(db: Session, current: Optional[str] = None) -> str:
    return " · ".join(
        f"<a href=\"/league/{fx.LEAGUES[k][0]}\">{_esc(fx.LEAGUES[k][1])}</a>"
        for k in fx.active_leagues(db) if k != current)


def _render_hub(db: Session, sport_key: str) -> str:
    data = fx.league_fixtures(db, sport_key)
    name, slug = data["name"], data["slug"]
    url = f"{DOMAIN}/league/{slug}"
    title, desc = hub_title(name), hub_description(name)
    up, fin = data["upcoming"], data["finished"]

    up_rows = "".join(
        f"<tr><td class=\"pr-num\">{_when(m['commence_time'])}</td>"
        f"<td><a href=\"/match/{_esc(m['id'])}\">{_esc(m['home_team'])} vs {_esc(m['away_team'])}</a></td></tr>" for m in up)
    fin_rows = "".join(
        f"<tr><td class=\"pr-num\">{_when(m['commence_time'])}</td>"
        f"<td><a href=\"/match/{_esc(m['id'])}\">{_esc(m['home_team'])} vs {_esc(m['away_team'])}</a></td>"
        f"<td class=\"pr-num\">{_p(m['close_home'])}</td><td class=\"pr-num\">{_p(m['close_draw'])}</td><td class=\"pr-num\">{_p(m['close_away'])}</td></tr>"
        for m in fin)
    up_html = (f"<table><thead><tr><th>Kickoff (UTC)</th><th>Match</th></tr></thead><tbody>{up_rows}</tbody></table>"
               if up else f"<p class=\"pr-meta\">No {_esc(name)} fixtures are priced at the moment.</p>")
    fin_html = (f"<table><thead><tr><th>Kickoff (UTC)</th><th>Match</th><th>Home</th><th>Draw</th><th>Away</th></tr></thead><tbody>{fin_rows}</tbody></table>"
                if fin else "<p class=\"pr-meta\">No finished matches recorded yet this season.</p>")

    json_ld = [
        {"@context": "https://schema.org", "@type": "CollectionPage", "name": f"{name} odds movement", "url": url,
         "description": desc, "isPartOf": {"@type": "WebSite", "name": "SteamWatch", "url": DOMAIN}},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "SteamWatch", "item": f"{DOMAIN}/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": url}]},
    ]
    head = "\n    ".join([
        f"<title data-prerender=\"1\">{_esc(title)}</title>",
        f"<meta name=\"description\" content=\"{_esc(desc)}\" data-prerender=\"1\" />",
        f"<link rel=\"canonical\" href=\"{url}\" data-prerender=\"1\" />",
        "<meta property=\"og:type\" content=\"website\" data-prerender=\"1\" />",
        f"<meta property=\"og:title\" content=\"{_esc(title)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:description\" content=\"{_esc(desc)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:url\" content=\"{url}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:title\" content=\"{_esc(title)}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:description\" content=\"{_esc(desc)}\" data-prerender=\"1\" />",
    ] + [f"<script type=\"application/ld+json\">{json.dumps(b)}</script>" for b in json_ld])
    body = (
        f"<p class=\"pr-meta\"><a href=\"/\">SteamWatch</a> › {_esc(name)}</p>"
        f"<h1>{_esc(name)} odds movement</h1>"
        f"<p class=\"pr-lead\">Every {_esc(name)} match SteamWatch has tracked this season: {len(up)} upcoming and {len(fin)} finished. "
        "Each match links to its full Pinnacle price history for the 1X2, Asian handicap and totals markets, from the "
        "opening price to kickoff.</p>"
        f"<h2>Upcoming {_esc(name)} fixtures</h2>{up_html}"
        f"<h2>{_esc(name)} results and closing prices</h2>"
        "<p class=\"pr-meta\">Home, Draw and Away are the Pinnacle closing 1X2 prices, the last snapshot before kickoff.</p>"
        f"{fin_html}"
        "<h2>Other competitions</h2>"
        f"<p>{league_links_html(db, sport_key)}</p>"
        "<h2>More on SteamWatch</h2>"
        "<ul><li><a href=\"/dropping-odds\">Dropping Odds: the biggest price drops in the last 48 hours</a></li>"
        "<li><a href=\"/steam-results\">Steam Results: how detected steam moves have performed</a></li>"
        "<li><a href=\"/closing-lines\">Closing Lines: the Pinnacle close for every finished match</a></li></ul>"
    )
    return _shell().replace("<!--PRERENDER:HEAD-->", head, 1).replace("<!--PRERENDER:CONTENT-->", body, 1)


def render_league_page(db: Session, slug: str) -> Optional[str]:
    sport_key = fx.SLUG_TO_KEY.get(slug)
    # Unknown slug, or a competition with no priced match this season: 404.
    if not sport_key or sport_key not in fx.active_leagues(db):
        return None
    now = time.time()
    hit = _cache.get(slug)
    if hit and hit[0] > now:
        return hit[1]
    out = _render_hub(db, sport_key)
    _cache[slug] = (now + CACHE_TTL_SECONDS, out)
    return out


# ------------------------------------------------------------------ homepage

def render_homepage(db: Session, static_index_path: str) -> str:
    """The prerendered homepage with the next 30 days's fixtures (grouped by
    competition, each a plain link) appended to its static <main>. The React
    app replaces #root on mount and shows the same matches as cards."""
    now = time.time()
    hit = _cache.get("__home__")
    if hit and hit[0] > now:
        return hit[1]
    with open(static_index_path, encoding="utf-8") as f:
        page = f.read()
    try:
        ups = fx.upcoming_fixtures(db)
        by: dict[str, list[dict]] = {}
        for m in ups:
            by.setdefault(m["sport_key"], []).append(m)
        parts = ["<h2>Upcoming matches</h2>",
                 "<p>Each match links to its Pinnacle price history from open to kickoff.</p>"]
        for k in fx.LEAGUES:
            if k not in by:
                continue
            slug, name, _ = fx.LEAGUES[k]
            items = "".join(f"<li><a href=\"/match/{_esc(m['id'])}\">{_esc(m['home_team'])} vs {_esc(m['away_team'])}</a> "
                            f"<span class=\"pr-meta\">{_when(m['commence_time'])} UTC</span></li>" for m in by[k])
            parts.append(f"<h3><a href=\"/league/{slug}\">{_esc(name)}</a></h3><ul>{items}</ul>")
        parts.append(f"<h2>Competitions</h2><p>{league_links_html(db)}</p>")
        block = "".join(parts)
        if "<!--HOMEPAGE:MARKETS-->" in page:
            page = page.replace("<!--HOMEPAGE:MARKETS-->", block, 1)
        elif "</main>" in page:
            page = page.replace("</main>", block + "</main>", 1)
    except Exception:  # noqa: BLE001  never let the list break the homepage
        pass
    _cache["__home__"] = (now + HOME_TTL_SECONDS, page)
    return page
