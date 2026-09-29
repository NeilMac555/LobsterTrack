"""
Dynamic XML sitemaps (2026-09-29).

  /sitemap.xml            sitemap index -> the two below
  /sitemap-pages.xml      static routes + blog posts, <lastmod> = build time
                          (static/build-info.json, written by the prerender;
                          content can only change with a deploy)
  /sitemap-matches.xml    match pages: current season (July 1 rollover) plus
                          upcoming fixtures, only matches that have odds
                          snapshots (a match with none is served noindex),
                          <lastmod> = the match's latest odds snapshot.
                          Past 5,000 URLs the set is split into
                          /sitemap-matches-1.xml, -2.xml ... and the index
                          lists each part.

Only pages that are indexable and self-canonical are listed: public routes
from routes.json (the single route source), static-only pages, and blog
posts that were actually prerendered. Redirect and internal routes never
appear. No <changefreq>/<priority>: Google ignores both.

Generated on request and cached in-process for CACHE_TTL_SECONDS, so it
tracks the odds feed rather than a build.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Optional
from xml.sax.saxutils import escape

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Match, OddsSnapshot

DOMAIN = "https://www.steamwatch.io"
CACHE_TTL_SECONDS = 15 * 60
MAX_URLS_PER_FILE = 5000

_cache: dict[str, tuple[float, str]] = {}


def _static_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "static")


def _read_json(name: str, default):
    try:
        with open(os.path.join(_static_dir(), name), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return default


def _iso(dt: Optional[datetime]) -> str:
    if dt is None:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _season_start(now: datetime) -> datetime:
    start_year = now.year if now.month >= 7 else now.year - 1
    return datetime(start_year, 7, 1)


def _cached(key: str, build):
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = build()
    _cache[key] = (now + CACHE_TTL_SECONDS, value)
    return value


def _urlset(entries: list[tuple[str, str]]) -> str:
    body = "".join(f"  <url>\n    <loc>{escape(loc)}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>\n" for loc, lastmod in entries)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n'


# ---------------------------------------------------------------- pages

def _build_time() -> str:
    info = _read_json("build-info.json", {})
    return info.get("built_at") or _iso(None)


def _page_entries() -> list[tuple[str, str]]:
    routes = _read_json("routes.json", {"public": [], "static_only": []})
    built = _build_time()
    paths = list(routes.get("public", [])) + list(routes.get("static_only", []))
    # Blog posts: whatever the prerender actually wrote under static/blog/
    blog_dir = os.path.join(_static_dir(), "blog")
    if os.path.isdir(blog_dir):
        for slug in sorted(os.listdir(blog_dir)):
            if os.path.isfile(os.path.join(blog_dir, slug, "index.html")):
                paths.append(f"blog/{slug}")
    seen, out = set(), []
    for p in paths:
        if p in seen:
            continue
        seen.add(p)
        out.append((f"{DOMAIN}/{p}" if p else f"{DOMAIN}/", built))
    return out


def sitemap_pages() -> str:
    return _cached("pages", lambda: _urlset(_page_entries()))


# -------------------------------------------------------------- matches

def _match_entries(db: Session) -> list[tuple[str, str]]:
    now = datetime.utcnow()
    latest = (
        db.query(OddsSnapshot.match_id, func.max(OddsSnapshot.fetched_at).label("last"))
        .group_by(OddsSnapshot.match_id)
        .subquery()
    )
    rows = (
        db.query(Match.id, latest.c.last)
        .join(latest, latest.c.match_id == Match.id)
        .filter((Match.commence_time >= _season_start(now)) | (Match.commence_time > now))
        .order_by(Match.commence_time.desc())
        .all()
    )
    return [(f"{DOMAIN}/match/{mid}", _iso(last)) for mid, last in rows]


def _match_parts(db: Session) -> list[list[tuple[str, str]]]:
    def build():
        entries = _match_entries(db)
        return [entries[i:i + MAX_URLS_PER_FILE] for i in range(0, len(entries), MAX_URLS_PER_FILE)] or [[]]
    return _cached("match_parts", build)


def sitemap_matches(db: Session, part: Optional[int] = None) -> Optional[str]:
    """part=None -> the single file (only valid when there is one part);
    part=N (1-based) -> that part. Returns None when the file doesn't exist."""
    parts = _match_parts(db)
    if part is None:
        return _urlset(parts[0]) if len(parts) == 1 else None
    if 1 <= part <= len(parts) and len(parts) > 1:
        return _urlset(parts[part - 1])
    return None


# ---------------------------------------------------------------- index

def sitemap_index(db: Session) -> str:
    parts = _match_parts(db)
    pages_lastmod = _build_time()
    items = [(f"{DOMAIN}/sitemap-pages.xml", pages_lastmod)]
    if len(parts) == 1:
        newest = max((lm for _, lm in parts[0]), default=_iso(None))
        items.append((f"{DOMAIN}/sitemap-matches.xml", newest))
    else:
        for i, p in enumerate(parts, 1):
            newest = max((lm for _, lm in p), default=_iso(None))
            items.append((f"{DOMAIN}/sitemap-matches-{i}.xml", newest))
    body = "".join(f"  <sitemap>\n    <loc>{escape(loc)}</loc>\n    <lastmod>{lm}</lastmod>\n  </sitemap>\n" for loc, lm in items)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</sitemapindex>\n'
