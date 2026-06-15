"""
Polymarket fetcher — hits the free public Gamma API for live World Cup
prices and stores per-match snapshots in the polymarket_snapshots table.

Why Polymarket: it's the highest-liquidity in-play soccer market on the
open internet right now ($22M+ on individual WC matches in 24h with
~1c spreads), and Pinnacle has stopped feeding in-play data via The
Odds API. Polymarket fills the in-play gap.

The Gamma API is free, no auth, no rate limits we've hit. Endpoints:
- /events?active=true&closed=false — lists events (a match = an event)
- Each event embeds its markets — for a soccer match there's a 3-way
  "Will X win" / "Will Y win" / "Will it end in a draw" trio.
"""
import re
import json
import httpx
import structlog
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Match, PolymarketSnapshot
from app.models.database import SessionLocal

logger = structlog.get_logger()

GAMMA_BASE = "https://gamma-api.polymarket.com"

# Team name normalization — Polymarket and The Odds API don't agree on
# every name. Maps lower-cased PM name → canonical Odds API name.
# Add more here as the WC progresses and we find mismatches in the logs.
TEAM_ALIASES = {
    "cabo verde": "cape verde",
    "cape verde": "cape verde",
    "ir iran": "iran",
    "iran": "iran",
    "south korea": "south korea",
    "korea republic": "south korea",
    "north korea": "north korea",
    "korea dpr": "north korea",
    "dpr korea": "north korea",
    "czech republic": "czech republic",
    "czechia": "czech republic",
    "ivory coast": "ivory coast",
    "côte d'ivoire": "ivory coast",
    "cote d'ivoire": "ivory coast",
    "usa": "united states",
    "united states": "united states",
    "us": "united states",
}


def _canonical(team: str) -> str:
    """Lower-case + alias-normalize a team name for fuzzy matching."""
    key = (team or "").strip().lower()
    return TEAM_ALIASES.get(key, key)


def _maybe_float(v) -> Optional[float]:
    """Polymarket prices can come as strings, numbers, or null. Normalize."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _parse_outcome_prices(raw) -> list:
    """outcomePrices comes back as a JSON-encoded string OR a list."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return []
    return []


def _parse_outcomes(raw) -> list:
    """Same json-or-list dance for the outcomes field."""
    return _parse_outcome_prices(raw)


def _extract_team_from_question(question: str) -> Optional[str]:
    """
    Pulls the team name out of a 'Will <Team> win on YYYY-MM-DD?' question.
    Returns the team string or None if the pattern doesn't match.
    """
    m = re.match(r"^Will\s+(.+?)\s+win\s+on\s+\d{4}-\d{2}-\d{2}\??$", question or "", re.IGNORECASE)
    if not m:
        return None
    return m.group(1).strip()


def _is_draw_market(question: str) -> bool:
    return bool(re.match(r"^Will\s+.+\s+end\s+in\s+a\s+draw\??$", question or "", re.IGNORECASE))


def _parse_totals_line(question: str) -> Optional[float]:
    """
    'Belgium vs. Egypt: O/U 2.5' → 2.5
    """
    m = re.search(r"O/U\s+([\d.]+)\s*$", question or "")
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


class PolymarketFetcher:
    """
    Polls the Gamma API for active WC events and stores per-match
    snapshots. Designed to be safe to call repeatedly — uses Match.id
    as the join key and never duplicates rows (one new snapshot per call).
    """

    def __init__(self):
        self.last_run_at: Optional[datetime] = None
        self.last_events_seen: int = 0
        self.last_matches_matched: int = 0
        self.last_snapshots_stored: int = 0
        self.last_unmatched_events: list = []
        self.last_error: Optional[str] = None

    async def fetch_and_store(self) -> dict:
        """Main entry point — fetch live WC events, store snapshots."""
        fetch_time = datetime.utcnow()
        summary = {
            "events_seen": 0,
            "match_events_seen": 0,
            "matches_matched": 0,
            "snapshots_stored": 0,
            "unmatched_events": [],
            "errors": [],
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                # Fetch a broad slice of active events. order by 24h volume
                # so WC games (highest-volume sports events on the platform)
                # come back early in the list.
                resp = await client.get(
                    f"{GAMMA_BASE}/events",
                    params={
                        "limit": 200,
                        "active": "true",
                        "closed": "false",
                        "order": "volume24hr",
                        "ascending": "false",
                    },
                )
                resp.raise_for_status()
                events = resp.json()

            summary["events_seen"] = len(events)

            # Filter to per-match WC events only (excludes outright "Will X
            # win the World Cup?" markets and the 'More Markets' / 'Exact
            # Score' sibling events — we handle those via a side query).
            wc_match_events = [
                e for e in events
                if (e.get("slug") or "").startswith("fifwc-")
                and not (e.get("slug") or "").endswith("-more-markets")
                and not (e.get("slug") or "").endswith("-exact-score")
                # Three markets = the home-win / away-win / draw trio
                and len(e.get("markets") or []) == 3
            ]
            summary["match_events_seen"] = len(wc_match_events)

            # Build a lookup of WC matches in our DB for fast association.
            db = SessionLocal()
            try:
                wc_matches = db.query(Match).filter(
                    Match.sport_key == "soccer_fifa_world_cup"
                ).all()
                # Pre-built indexes:
                #   - by polymarket_event_slug for O(1) re-lookup
                #   - by (canonical home, canonical away, date) for first-time match
                by_slug = {m.polymarket_event_slug: m for m in wc_matches if m.polymarket_event_slug}
                by_teams_date = {}
                for m in wc_matches:
                    key = (_canonical(m.home_team), _canonical(m.away_team), m.commence_time.date())
                    by_teams_date[key] = m
                    # Also index the reversed-team order in case Polymarket
                    # orders them differently than The Odds API does.
                    key_rev = (_canonical(m.away_team), _canonical(m.home_team), m.commence_time.date())
                    by_teams_date[key_rev] = m

                # Build a lookup of "More Markets" events keyed by base slug,
                # so we can grab the totals price for matched matches.
                more_events = {
                    (e.get("slug") or "").replace("-more-markets", ""): e
                    for e in events
                    if (e.get("slug") or "").endswith("-more-markets")
                }

                for ev in wc_match_events:
                    slug = ev.get("slug")
                    try:
                        match = by_slug.get(slug)
                        if not match:
                            match = self._match_event_to_match(ev, by_teams_date)
                            if match:
                                match.polymarket_event_slug = slug
                                by_slug[slug] = match
                        if not match:
                            summary["unmatched_events"].append({
                                "slug": slug,
                                "title": ev.get("title"),
                            })
                            continue
                        summary["matches_matched"] += 1

                        snapshot = self._build_snapshot(
                            ev,
                            more_events.get(slug),
                            match,
                            fetch_time,
                        )
                        if snapshot:
                            db.add(snapshot)
                            summary["snapshots_stored"] += 1
                    except Exception as ie:
                        summary["errors"].append(f"{slug}: {ie}")
                        logger.warning("Polymarket per-event store failed", slug=slug, error=str(ie))

                db.commit()
            finally:
                db.close()

        except Exception as e:
            self.last_error = str(e)
            summary["errors"].append(str(e))
            logger.error("Polymarket fetch failed", error=str(e))

        # Persist diagnostics so the admin endpoint can read them out.
        self.last_run_at = fetch_time
        self.last_events_seen = summary["events_seen"]
        self.last_matches_matched = summary["matches_matched"]
        self.last_snapshots_stored = summary["snapshots_stored"]
        self.last_unmatched_events = summary["unmatched_events"][:20]
        if not summary["errors"]:
            self.last_error = None

        logger.info(
            "Polymarket fetch complete",
            events=summary["events_seen"],
            match_events=summary["match_events_seen"],
            matched=summary["matches_matched"],
            stored=summary["snapshots_stored"],
            unmatched=len(summary["unmatched_events"]),
        )
        return summary

    def _match_event_to_match(self, ev: dict, by_teams_date: dict) -> Optional[Match]:
        """
        Fuzzy-match a Polymarket event to a local Match by parsing the
        team names out of the 'Will X win' market questions and looking
        up our matches by (canonical home, canonical away, date).
        """
        markets = ev.get("markets") or []
        team_names = []
        for m in markets:
            t = _extract_team_from_question(m.get("question") or "")
            if t:
                team_names.append(t)
        if len(team_names) != 2:
            return None

        # The event's endDate is the match KO time.
        end = ev.get("endDate") or ev.get("endDateIso")
        if not end:
            return None
        try:
            ko = datetime.fromisoformat(end.replace("Z", "+00:00")).date()
        except (ValueError, AttributeError):
            return None

        a, b = _canonical(team_names[0]), _canonical(team_names[1])
        return by_teams_date.get((a, b, ko)) or by_teams_date.get((b, a, ko))

    def _build_snapshot(
        self,
        ev: dict,
        more_ev: Optional[dict],
        match: Match,
        fetch_time: datetime,
    ) -> Optional[PolymarketSnapshot]:
        """
        Parse the 1X2 trio out of `ev`, the O/U 2.5 line out of `more_ev`
        if present, and return a fully-populated PolymarketSnapshot.
        Returns None if we can't even identify which market is which.
        """
        home_team = _canonical(match.home_team)
        away_team = _canonical(match.away_team)

        home_yes = home_bid = home_ask = None
        away_yes = away_bid = away_ask = None
        draw_yes = draw_bid = draw_ask = None
        home_vol = None
        event_vol_24h = 0.0
        any_market_seen = False

        for m in ev.get("markets") or []:
            q = m.get("question") or ""
            prices = _parse_outcome_prices(m.get("outcomePrices"))
            yes_price = _maybe_float(prices[0]) if prices else None
            bid = _maybe_float(m.get("bestBid"))
            ask = _maybe_float(m.get("bestAsk"))
            vol = _maybe_float(m.get("volume24hrClob") or m.get("volume24hr")) or 0.0
            event_vol_24h += vol
            any_market_seen = True

            if _is_draw_market(q):
                draw_yes, draw_bid, draw_ask = yes_price, bid, ask
            else:
                team = _canonical(_extract_team_from_question(q) or "")
                if team == home_team:
                    home_yes, home_bid, home_ask, home_vol = yes_price, bid, ask, vol
                elif team == away_team:
                    away_yes, away_bid, away_ask = yes_price, bid, ask

        if not any_market_seen:
            return None

        over_yes = under_yes = over_bid = over_ask = None
        if more_ev:
            for m in more_ev.get("markets") or []:
                if _parse_totals_line(m.get("question") or "") == 2.5:
                    prices = _parse_outcome_prices(m.get("outcomePrices"))
                    outcomes = _parse_outcomes(m.get("outcomes"))
                    # Order is always ["Over", "Under"] for O/U markets.
                    if outcomes and len(outcomes) >= 2 and prices and len(prices) >= 2:
                        over_yes = _maybe_float(prices[0])
                        under_yes = _maybe_float(prices[1])
                        over_bid = _maybe_float(m.get("bestBid"))
                        over_ask = _maybe_float(m.get("bestAsk"))
                    break

        in_play = fetch_time > match.commence_time

        return PolymarketSnapshot(
            match_id=match.id,
            polymarket_event_slug=ev.get("slug"),
            fetched_at=fetch_time,
            in_play=in_play,
            home_win_yes=home_yes,
            draw_yes=draw_yes,
            away_win_yes=away_yes,
            home_win_bid=home_bid,
            home_win_ask=home_ask,
            draw_bid=draw_bid,
            draw_ask=draw_ask,
            away_win_bid=away_bid,
            away_win_ask=away_ask,
            over_2_5_yes=over_yes,
            under_2_5_yes=under_yes,
            over_2_5_bid=over_bid,
            over_2_5_ask=over_ask,
            home_win_volume_24h=home_vol,
            event_volume_24h=event_vol_24h or None,
        )


polymarket_fetcher = PolymarketFetcher()
