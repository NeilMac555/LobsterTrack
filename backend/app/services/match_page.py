"""
Server-rendered HTML for /match/{id} (2026-09-29).

Match pages are dynamic (odds move every 15 minutes), so instead of a
build-time prerender they are rendered here from the database on each
request, behind a short in-process cache. The document is the same shell
every prerendered page uses (dist/_shell.html, written by
frontend/scripts/prerender-blog.mjs: nav, footer, inline CSS, and the
hashed script/CSS tags of the current build), with a per-match head and
body filled in. The React app then mounts over #root exactly as it does
on every other page.

Content rules (Neil's brief): observed market movement only. No model
probabilities, no claims about why a price moved. Title, description,
an answer-first paragraph on the biggest open-to-now move, a real
<table> of prices, WebPage JSON-LD, and links back to the
league view, Steam Results and Closing Lines.

Indexing: a match with no odds snapshots is served with a noindex robots
meta rather than a 404. Finished matches keep a normal indexable page
showing opening and closing prices.
"""
from __future__ import annotations

import html
import json
import os
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Match, OddsSnapshot, TotalsSnapshot, SpreadsSnapshot, ClosingLine
from app.models.closing_line import MarketType

DOMAIN = "https://www.steamwatch.io"
CACHE_TTL_SECONDS = 60
_cache: dict[str, tuple[float, str, int]] = {}


def _static_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "static")


@lru_cache(maxsize=1)
def _shell() -> str:
    with open(os.path.join(_static_dir(), "_shell.html"), encoding="utf-8") as f:
        return f.read()


@lru_cache(maxsize=1)
def _not_found_page() -> str:
    with open(os.path.join(_static_dir(), "404.html"), encoding="utf-8") as f:
        return f.read()


def _esc(v) -> str:
    return html.escape(str(v), quote=True)


def _fmt(v: Optional[float]) -> str:
    return f"{v:.2f}" if v is not None else "—"


def _imp(v: Optional[float]) -> Optional[float]:
    return (100.0 / v) if v else None


def _pp(open_: Optional[float], now: Optional[float]) -> Optional[float]:
    a, b = _imp(open_), _imp(now)
    return (b - a) if a is not None and b is not None else None


def _pp_str(v: Optional[float]) -> str:
    if v is None:
        return "—"
    return f"{v:+.1f}pp"


def _pp_cls(v: Optional[float]) -> str:
    # Site convention (2026-09-03): price shortening (implied prob up) = red,
    # drifting = green.
    if v is None or abs(v) < 0.05:
        return ""
    return "pr-down" if v > 0 else "pr-up"


def _naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _kickoff_label(dt: datetime) -> str:
    return dt.strftime("%-d %b %Y") if os.name != "nt" else dt.strftime("%d %b %Y").lstrip("0")


def _time_label(dt: datetime) -> str:
    return dt.strftime("%H:%M UTC on ") + _kickoff_label(dt)


def render_match_page(db: Session, match_id: str) -> tuple[str, int]:
    """Return (html, status). Cached for CACHE_TTL_SECONDS per match."""
    now_ts = time.time()
    hit = _cache.get(match_id)
    if hit and hit[0] > now_ts:
        return hit[1], hit[2]

    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        return _not_found_page(), 404

    html_out = _render(db, match)
    _cache[match_id] = (now_ts + CACHE_TTL_SECONDS, html_out, 200)
    if len(_cache) > 2000:  # crude bound; entries expire anyway
        for k in list(_cache)[:500]:
            _cache.pop(k, None)
    return html_out, 200


XG_NOTE_MIN_GAP = 3.0


def _xg_note(db: Session, match: Match) -> str:
    """One sentence per side on goals vs expected goals over the last 12
    months (services/xg_goals), linking to /goals-coming-soon. Only for
    clubs the data can name with confidence and gaps of 3+ goals; never
    lets a data problem break a match page. XgGapNote.tsx mirrors it."""
    try:
        from app.services.xg_goals import club_gap
        lines = []
        for team in (match.home_team, match.away_team):
            r = club_gap(db, match.sport_key, team)
            if not r or abs(r["gap"]) < XG_NOTE_MIN_GAP:
                continue
            word = "fewer" if r["gap"] < 0 else "more"
            lines.append(f"{_esc(team)} have scored {abs(r['gap']):.1f} goals {word} than their expected goals over the "
                         f"last 12 months ({r['matches']} league matches).")
        if not lines:
            return ""
        return f"<p class=\"pr-note\">{' '.join(lines)} See <a href=\"/goals-coming-soon\">Goals Coming Soon</a>.</p>"
    except Exception:  # noqa: BLE001
        return ""


def _render(db: Session, match: Match) -> str:
    kickoff = _naive_utc(match.commence_time)
    finished = datetime.utcnow() >= kickoff
    home, away = match.home_team, match.away_team
    competition = match.league_name
    url = f"{DOMAIN}/match/{match.id}"

    snaps = (
        db.query(OddsSnapshot)
        .filter(OddsSnapshot.match_id == match.id, OddsSnapshot.fetched_at < kickoff)
        .order_by(OddsSnapshot.fetched_at.asc())
        .all()
    )
    totals = (
        db.query(TotalsSnapshot)
        .filter(TotalsSnapshot.match_id == match.id, TotalsSnapshot.fetched_at < kickoff)
        .order_by(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
        .all()
    )
    spreads = (
        db.query(SpreadsSnapshot)
        .filter(SpreadsSnapshot.match_id == match.id, SpreadsSnapshot.fetched_at < kickoff)
        .order_by(SpreadsSnapshot.fetched_at.asc(), SpreadsSnapshot.id.asc())
        .all()
    )
    closes: dict[str, ClosingLine] = {}
    if finished:
        for cl in db.query(ClosingLine).filter(ClosingLine.match_id == match.id).all():
            closes[cl.market_type.value if hasattr(cl.market_type, "value") else str(cl.market_type)] = cl

    has_odds = bool(snaps)
    now_word = "at the close" if finished else "now"
    now_col = "Close" if finished else "Now"

    # ---- 1X2 open / latest (closing line row wins for finished matches)
    first, last = (snaps[0], snaps[-1]) if snaps else (None, None)
    h2h_close = closes.get(MarketType.H2H.value) if closes else None
    cur_home = h2h_close.close_home if h2h_close and h2h_close.close_home else (last.home_odds if last else None)
    cur_draw = h2h_close.close_draw if h2h_close and h2h_close.close_draw else (last.draw_odds if last else None)
    cur_away = h2h_close.close_away if h2h_close and h2h_close.close_away else (last.away_odds if last else None)

    rows = []  # (market, selection, open, now, pp, series_key)
    if first:
        rows.append(("1X2", home, first.home_odds, cur_home, _pp(first.home_odds, cur_home), "home"))
        rows.append(("1X2", "Draw", first.draw_odds, cur_draw, _pp(first.draw_odds, cur_draw), "draw"))
        rows.append(("1X2", away, first.away_odds, cur_away, _pp(first.away_odds, cur_away), "away"))

    line_notes = []
    if totals:
        t0, t1 = totals[0], totals[-1]
        same_line = abs(t0.line - t1.line) < 1e-9
        rows.append(("Totals", f"Over {t1.line:g}", t0.over_odds if same_line else None, t1.over_odds, _pp(t0.over_odds, t1.over_odds) if same_line else None, "over"))
        rows.append(("Totals", f"Under {t1.line:g}", t0.under_odds if same_line else None, t1.under_odds, _pp(t0.under_odds, t1.under_odds) if same_line else None, "under"))
        if not same_line:
            line_notes.append(f"The totals line moved from {t0.line:g} at open to {t1.line:g} {now_word}, so open and current prices are not directly comparable.")
    if spreads:
        s0, s1 = spreads[0], spreads[-1]
        same_line = abs(s0.line - s1.line) < 1e-9
        rows.append(("Asian handicap", f"{home} {s1.line:+g}", s0.home_odds if same_line else None, s1.home_odds, _pp(s0.home_odds, s1.home_odds) if same_line else None, "ah_home"))
        rows.append(("Asian handicap", f"{away} {-s1.line:+g}", s0.away_odds if same_line else None, s1.away_odds, _pp(s0.away_odds, s1.away_odds) if same_line else None, "ah_away"))
        if not same_line:
            line_notes.append(f"The Asian handicap line moved from {s0.line:+g} at open to {s1.line:+g} {now_word}.")

    # ---- biggest move + when its largest single step happened
    biggest = None
    for r in rows:
        if r[4] is not None and (biggest is None or abs(r[4]) > abs(biggest[4])):
            biggest = r
    step_time = None
    if biggest and biggest[5] in ("home", "draw", "away") and len(snaps) > 1:
        attr = f"{biggest[5]}_odds"
        best = 0.0
        for a, b in zip(snaps, snaps[1:]):
            va, vb = getattr(a, attr), getattr(b, attr)
            d = _pp(va, vb)
            if d is not None and abs(d) > abs(best):
                best, step_time = d, b.fetched_at

    # ---- copy
    title = f"{home} vs {away} Odds Movement, {competition} {_kickoff_label(kickoff)} | SteamWatch"
    description = f"{home} vs {away}: how the 1X2, Asian handicap and totals prices moved from open to kickoff."

    if not has_odds:
        lead = (f"No pre-kickoff Pinnacle prices have been recorded for {home} vs {away} ({competition}, "
                f"{_kickoff_label(kickoff)}) yet. Prices are captured roughly every 15 minutes once the market is listed.")
    elif biggest is None or abs(biggest[4]) < 0.05:
        lead = (f"Prices for {home} vs {away} ({competition}, {_kickoff_label(kickoff)}) have barely moved: "
                f"{home} opened at {_fmt(first.home_odds)} and is {_fmt(cur_home)} {now_word}, the draw {_fmt(first.draw_odds)} to {_fmt(cur_draw)}, "
                f"{away} {_fmt(first.away_odds)} to {_fmt(cur_away)}.")
    else:
        m, sel, o, n, pp, _ = biggest
        direction = "shortened" if pp > 0 else "drifted"
        when = f", with the largest single step at {_time_label(step_time)}" if step_time else ""
        lead = (f"The biggest pre-kickoff move for {home} vs {away} ({competition}, {_kickoff_label(kickoff)}) was on "
                f"{sel} in the {m} market: {direction} from {_fmt(o)} at open to {_fmt(n)} {now_word}, "
                f"a {pp:+.1f} percentage-point change in implied probability{when}.")

    table_rows = "".join(
        f"<tr><td>{_esc(m)}</td><td>{_esc(sel)}</td><td class=\"pr-num\">{_fmt(o)}</td>"
        f"<td class=\"pr-num\">{_fmt(n)}</td><td class=\"pr-num {_pp_cls(pp)}\">{_pp_str(pp)}</td></tr>"
        for m, sel, o, n, pp, _ in rows
    )
    table = (
        f"<table><thead><tr><th>Market</th><th>Selection</th><th>Open</th><th>{now_col}</th><th>Implied change</th></tr></thead>"
        f"<tbody>{table_rows}</tbody></table>"
    ) if rows else ""
    notes = "".join(f"<p>{_esc(n)}</p>" for n in line_notes)
    recorded = (f"<p class=\"pr-meta\">{len(snaps)} pre-kickoff 1X2 snapshots · first {_time_label(first.fetched_at)} · "
                f"last {_time_label(last.fetched_at)}</p>") if snaps else ""

    league_link = f"/?league={_esc(match.sport_key)}"
    xg_note = _xg_note(db, match)
    body = (
        f"<p class=\"pr-meta\">{_esc(competition)} · kickoff {_time_label(kickoff)}</p>"
        f"<h1>{_esc(home)} vs {_esc(away)}: odds movement</h1>"
        f"<p class=\"pr-lead\">{_esc(lead)}</p>"
        f"{notes}"
        f"{xg_note}"
        f"<h2>Pinnacle prices, open to {'close' if finished else 'now'}</h2>"
        f"{table}{recorded}"
        f"<p>Implied change is the movement in implied probability (100 divided by the decimal price) from open to {'close' if finished else 'now'}, in percentage points. "
        f"Positive means the price shortened, negative means it drifted. Prices are Pinnacle's, captured roughly every 15 minutes before kickoff.</p>"
        f"<h2>More on SteamWatch</h2>"
        f"<ul><li><a href=\"{league_link}\">All {_esc(competition)} matches and movers</a></li>"
        f"<li><a href=\"/steam-results\">Steam Results: how detected steam moves have performed</a></li>"
        f"<li><a href=\"/closing-lines\">Closing Lines: the Pinnacle close for every finished match</a></li></ul>"
    )

    # This is an odds-analysis page, not an event attendance listing. Our
    # match feed has no verified venue/address. Do not emit incomplete events
    # (including a nested league event) or invent venue/ticket information.
    json_ld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "description": description,
        "url": url,
        "about": [
            {"@type": "SportsTeam", "name": home},
            {"@type": "SportsTeam", "name": away},
        ],
        "isPartOf": {"@type": "WebSite", "name": "SteamWatch", "url": DOMAIN},
    }

    head_parts = [
        f"<title data-prerender=\"1\">{_esc(title)}</title>",
        f"<meta name=\"description\" content=\"{_esc(description)}\" data-prerender=\"1\" />",
        f"<link rel=\"canonical\" href=\"{url}\" data-prerender=\"1\" />",
        "<meta name=\"robots\" content=\"noindex\" data-prerender=\"1\" />" if not has_odds else "",
        "<meta property=\"og:type\" content=\"website\" data-prerender=\"1\" />",
        f"<meta property=\"og:title\" content=\"{_esc(title)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:description\" content=\"{_esc(description)}\" data-prerender=\"1\" />",
        f"<meta property=\"og:url\" content=\"{url}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:title\" content=\"{_esc(title)}\" data-prerender=\"1\" />",
        f"<meta name=\"twitter:description\" content=\"{_esc(description)}\" data-prerender=\"1\" />",
        f"<script type=\"application/ld+json\">{json.dumps(json_ld)}</script>",
    ]
    head = "\n    ".join(p for p in head_parts if p)
    return _shell().replace("<!--PRERENDER:HEAD-->", head, 1).replace("<!--PRERENDER:CONTENT-->", body, 1)
