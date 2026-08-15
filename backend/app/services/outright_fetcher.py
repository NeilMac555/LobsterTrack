"""
Polymarket season-outright fetcher — pulls the five domestic-league
"2027 Champion" events from the free Gamma API and stores one
OutrightSnapshot row per club per fetch, plus a content-addressed
OutrightCapture of the raw price payload (deduped by sha256).

Why this exists: The Odds API carries no domestic-league outright
markets at all, so the Forecast Engine's league-level questions had no
market to compare against — the rationale said so explicitly. This
fetcher closes that gap with the only venue that has real money on
European league winners ($3.5M on the 26-27 EPL market alone).

The event list is a hard-coded whitelist, same philosophy as the
forecast source registry: the engine consults exactly what's listed
here, and a new season means updating this table by hand (the Gamma
slugs carry a creation timestamp, so they can't be derived).

Polymarket lists winner markets at season start; top-4 / relegation
books usually appear mid-season — add them to OUTRIGHT_EVENTS when
they exist. The schema already carries a `market` discriminator.

UEFA CHAMPIONS LEAGUE (added 2026-08-15): same idea, one more event —
Polymarket's live "UEFA Champions League: 2027 Champion" market
(verified $7.8M+ volume, real money). The Odds API has no outright
market for this competition at all (checked its /v4/sports listing;
only "soccer_uefa_champs_league_qualification" exists, a match-odds
sport, not a winner market), so Polymarket is the only ToS-clean
source, same as the domestic leagues above. Unlike the domestic
events, its 29 teams span every UEFA nation, not just our 5 tracked
leagues, so it resolves against a MERGED name index across all five
domestic NAME_MAP_BY_LEAGUE tables rather than one league's — see
_build_name_index. Feeds power_ranking_fitter.py's UCL outright blend.
"""
import json
import hashlib
import re
import unicodedata

import httpx
import structlog
from datetime import datetime
from typing import Optional

from app.models import OutrightSnapshot, OutrightCapture
from app.models.database import SessionLocal
from app.services.team_name_normalizer import NAME_MAP_BY_LEAGUE

logger = structlog.get_logger()

GAMMA_BASE = "https://gamma-api.polymarket.com"

# Season the whitelisted events below resolve for (football-data code).
OUTRIGHT_SEASON = "2627"

# The whitelist. Slugs verified against the live Gamma API 2026-08-05;
# every one is the official "<league>: 2027 Champion" negRisk event.
OUTRIGHT_EVENTS: list[dict] = [
    {"league": "soccer_epl",                 "market": "winner", "slug": "epl-2027-champion-20260701200428749"},
    {"league": "soccer_spain_la_liga",       "market": "winner", "slug": "laliga-2027-champion-20260701200737375"},
    {"league": "soccer_italy_serie_a",       "market": "winner", "slug": "serie-a-2027-champion-20260701200118390"},
    {"league": "soccer_germany_bundesliga",  "market": "winner", "slug": "bundesliga-2027-champion-20260708164840303"},
    {"league": "soccer_france_ligue_one",    "market": "winner", "slug": "ligue-1-2027-champion-20260701201053335"},
    {"league": "soccer_uefa_champs_league",  "market": "winner", "slug": "uefa-champions-league-2027-champion-20260701202025549"},
]

# league key used for the merged (all-domestic-leagues) name index —
# the UCL field spans every UEFA nation, not one tracked league.
_UEFA_CL_LEAGUE = "soccer_uefa_champs_league"

# Polymarket labels that don't resolve through the normalizer's names
# even after de-accenting. Two kinds live here:
#   - formatting differences for established clubs (verified canonical)
#   - 26/27 promoted clubs with no normalizer entry yet — best-effort
#     canonical guesses following The Odds API's naming pattern. A
#     wrong guess is harmless (the engine joins on the model's team
#     universe, so a non-matching name simply never joins — same as
#     NULL), and the raw label is always preserved in team_name_raw.
_PM_ALIASES: dict[str, dict[str, str]] = {
    "soccer_epl": {
        "coventry city": "Coventry City",       # promoted 26/27
        "hull city": "Hull City",               # promoted 26/27
    },
    "soccer_spain_la_liga": {
        "racing santander": "Racing Santander",     # promoted 26/27
        "deportivo la coruna": "Deportivo La Coruña",  # promoted 26/27
        "malaga": "Málaga",                          # promoted 26/27
    },
    "soccer_germany_bundesliga": {
        "mainz 05": "FSV Mainz 05",
        "fc augsburg": "Augsburg",
        "sc paderborn": "SC Paderborn",         # promoted 26/27
        "sv elversberg": "SV Elversberg",       # promoted 26/27
    },
    "soccer_france_ligue_one": {
        "le mans": "Le Mans",                   # promoted 26/27
    },
}

# Gamma pads negRisk events with inactive "Team A/B/C" / "Other"
# placeholder markets (and has shipped an *active* stray "Team C" at
# 0.05c on the La Liga book) — never real clubs, always skipped.
_PLACEHOLDER_RE = re.compile(r"^(team [a-z]|other)$")


def _norm_key(name: str) -> str:
    """Lookup key: lowercase, de-accent, hyphens→spaces, collapse ws.
    Makes 'Paris Saint-Germain' meet 'Paris Saint Germain' and
    'Borussia Mönchengladbach' meet 'Borussia Monchengladbach'."""
    s = unicodedata.normalize("NFD", (name or "").strip().lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.replace("-", " ")
    return re.sub(r"\s+", " ", s)


def _build_name_index() -> dict[str, dict[str, str]]:
    """Per-league: normalized alias -> canonical name, built from the
    normalizer's source spellings + canonical names + _PM_ALIASES. Also
    builds one merged index (under _UEFA_CL_LEAGUE) spanning all five
    domestic leagues, since the Champions League field isn't confined
    to one of them — a team from a league we don't track (Porto,
    Sporting, etc.) simply won't resolve, same as any other unmatched
    label (kept via team_name_raw, never guessed)."""
    index: dict[str, dict[str, str]] = {}
    merged: dict[str, str] = {}
    for league, name_map in NAME_MAP_BY_LEAGUE.items():
        idx: dict[str, str] = {}
        for source_name, canonical in name_map.items():
            idx[_norm_key(canonical)] = canonical
            idx[_norm_key(source_name)] = canonical
        for alias, canonical in _PM_ALIASES.get(league, {}).items():
            idx[_norm_key(alias)] = canonical
        index[league] = idx
        merged.update(idx)
    for alias, canonical in _PM_ALIASES.get(_UEFA_CL_LEAGUE, {}).items():
        merged[_norm_key(alias)] = canonical
    index[_UEFA_CL_LEAGUE] = merged
    return index


_NAME_INDEX = _build_name_index()


def _maybe_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _yes_price(m: dict) -> Optional[float]:
    """outcomePrices is a JSON-encoded string or list, ['Yes','No'] order."""
    raw = m.get("outcomePrices")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return None
    if isinstance(raw, list) and raw:
        return _maybe_float(raw[0])
    return None


def _canonical_payload(event: dict, entry: dict, team_markets: list[dict]) -> str:
    """The content that gets hashed: every price-relevant field, sorted
    and minified, so byte-identical prices hash identically across
    fetches and the capture table stays deduped."""
    doc = {
        "event_slug": entry["slug"],
        "event_id": event.get("id"),
        "market": entry["market"],
        "season": OUTRIGHT_SEASON,
        "teams": sorted(
            (
                {
                    "label": m.get("groupItemTitle"),
                    "question": m.get("question"),
                    "outcomePrices": m.get("outcomePrices"),
                    "bestBid": m.get("bestBid"),
                    "bestAsk": m.get("bestAsk"),
                    "lastTradePrice": m.get("lastTradePrice"),
                    "spread": m.get("spread"),
                    "volume24hr": m.get("volume24hr"),
                    "clobTokenIds": m.get("clobTokenIds"),
                }
                for m in team_markets
            ),
            key=lambda d: d["label"] or "",
        ),
    }
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


class OutrightFetcher:
    """Polls Gamma for the whitelisted outright events. Safe to call
    repeatedly — every call appends a fresh snapshot batch; captures
    are deduped by content hash."""

    def __init__(self):
        self.last_run_at: Optional[datetime] = None
        self.last_summary: Optional[dict] = None
        self.last_error: Optional[str] = None

    async def fetch_and_store(self) -> dict:
        fetch_time = datetime.utcnow()
        summary = {
            "events_fetched": 0,
            "snapshots_stored": 0,
            "captures_stored": 0,
            "unresolved_teams": [],   # [{league, label}] — stored with team_name NULL
            "events_missing": [],     # slug returned nothing / closed
            "errors": [],
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                db = SessionLocal()
                try:
                    for entry in OUTRIGHT_EVENTS:
                        try:
                            stored = await self._fetch_event(client, db, entry, fetch_time, summary)
                            summary["snapshots_stored"] += stored
                        except Exception as ie:
                            summary["errors"].append(f"{entry['slug']}: {ie}")
                            logger.warning("Outright event fetch failed",
                                           slug=entry["slug"], error=str(ie))
                    db.commit()
                finally:
                    db.close()
        except Exception as e:
            summary["errors"].append(str(e))
            logger.error("Outright fetch failed", error=str(e))

        self.last_run_at = fetch_time
        self.last_summary = summary
        self.last_error = summary["errors"][-1] if summary["errors"] else None
        logger.info(
            "Outright fetch complete",
            events=summary["events_fetched"],
            snapshots=summary["snapshots_stored"],
            captures=summary["captures_stored"],
            unresolved=len(summary["unresolved_teams"]),
            errors=len(summary["errors"]),
        )
        return summary

    async def _fetch_event(self, client, db, entry: dict, fetch_time: datetime,
                           summary: dict) -> int:
        resp = await client.get(f"{GAMMA_BASE}/events", params={"slug": entry["slug"]})
        resp.raise_for_status()
        events = resp.json()
        if not events or events[0].get("closed"):
            summary["events_missing"].append(entry["slug"])
            return 0
        event = events[0]
        summary["events_fetched"] += 1

        team_markets = [
            m for m in (event.get("markets") or [])
            if m.get("groupItemTitle")
            and not _PLACEHOLDER_RE.match(_norm_key(m.get("groupItemTitle")))
            and not m.get("closed")
            and m.get("active")
        ]
        if not team_markets:
            summary["events_missing"].append(f"{entry['slug']} (no active team markets)")
            return 0

        payload = _canonical_payload(event, entry, team_markets)
        sha = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        if db.query(OutrightCapture).filter(OutrightCapture.sha256 == sha).first() is None:
            db.add(OutrightCapture(
                sha256=sha, league=entry["league"], market=entry["market"],
                event_slug=entry["slug"], first_seen_at=fetch_time, payload=payload,
            ))
            summary["captures_stored"] += 1

        name_index = _NAME_INDEX.get(entry["league"], {})
        event_volume = _maybe_float(event.get("volume"))
        event_liquidity = _maybe_float(event.get("liquidity"))

        stored = 0
        for m in team_markets:
            raw_label = (m.get("groupItemTitle") or "").strip()
            canonical = name_index.get(_norm_key(raw_label))
            if canonical is None:
                summary["unresolved_teams"].append(
                    {"league": entry["league"], "label": raw_label})
            db.add(OutrightSnapshot(
                league=entry["league"], market=entry["market"],
                season=OUTRIGHT_SEASON, event_slug=entry["slug"],
                fetched_at=fetch_time,
                team_name=canonical, team_name_raw=raw_label,
                yes_price=_yes_price(m),
                best_bid=_maybe_float(m.get("bestBid")),
                best_ask=_maybe_float(m.get("bestAsk")),
                last_trade_price=_maybe_float(m.get("lastTradePrice")),
                volume_24h=_maybe_float(m.get("volume24hrClob") or m.get("volume24hr")),
                event_volume=event_volume,
                event_liquidity=event_liquidity,
                capture_sha256=sha,
            ))
            stored += 1
        return stored


outright_fetcher = OutrightFetcher()
