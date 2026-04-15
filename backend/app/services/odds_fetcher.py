import httpx
import structlog
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.config import get_settings
from app.models import Match, OddsSnapshot, SteamMove, TotalsSnapshot, SpreadsSnapshot
from app.models.database import SessionLocal

logger = structlog.get_logger()
settings = get_settings()

# Constants for steam detection
STEAM_THRESHOLD_PROB_POINTS = 3.0  # Implied probability shift >= 3pp is significant
LATE_STEAM_WINDOW_HOURS = 2        # Within 2 hours of kickoff


def _implied_prob(odds: float) -> float:
    """Convert decimal odds to implied probability (0-100 scale)."""
    return (1.0 / odds) * 100


class OddsFetcher:
    """
    Service to fetch odds from The Odds API and store in database.
    Focuses on Pinnacle odds for 1x2 (h2h) markets.
    """

    def __init__(self):
        self.base_url = settings.odds_api_base_url
        self.api_key = settings.odds_api_key
        self.leagues = settings.leagues

    async def fetch_all_leagues(self, sport_keys: list = None) -> dict:
        """
        Fetch odds for configured leagues.
        If sport_keys is provided, only fetch those leagues.
        Returns summary of what was fetched.
        """
        summary = {
            "leagues_processed": 0,
            "matches_found": 0,
            "odds_stored": 0,
            "errors": []
        }

        leagues_to_fetch = {
            k: v for k, v in self.leagues.items()
            if sport_keys is None or k in sport_keys
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            for sport_key, league_name in leagues_to_fetch.items():
                try:
                    result = await self._fetch_league_odds(client, sport_key, league_name)
                    summary["leagues_processed"] += 1
                    summary["matches_found"] += result["matches"]
                    summary["odds_stored"] += result["odds_stored"]
                    logger.info(
                        "League fetched successfully",
                        sport_key=sport_key,
                        matches=result["matches"],
                        odds_stored=result["odds_stored"]
                    )

                    # Fetch totals for all leagues
                    try:
                        totals_result = await self._fetch_league_totals(client, sport_key)
                        logger.info(
                            "Totals fetched successfully",
                            sport_key=sport_key,
                            totals_stored=totals_result["totals_stored"]
                        )
                    except Exception as te:
                        logger.error("Failed to fetch totals", sport_key=sport_key, error=str(te))

                    # Fetch spreads (Asian Handicap) for all leagues
                    try:
                        spreads_result = await self._fetch_league_spreads(client, sport_key)
                        logger.info(
                            "Spreads fetched successfully",
                            sport_key=sport_key,
                            spreads_stored=spreads_result["spreads_stored"]
                        )
                    except Exception as se:
                        logger.error("Failed to fetch spreads", sport_key=sport_key, error=str(se))

                except Exception as e:
                    error_msg = f"{sport_key}: {str(e)}"
                    summary["errors"].append(error_msg)
                    logger.error("Failed to fetch league", sport_key=sport_key, error=str(e))

        # Check for syndicate moves and send Telegram alerts
        try:
            from app.services.syndicate_alerter import syndicate_alerter
            alert_result = await syndicate_alerter.check_and_alert()
            summary["syndicate_alerts"] = alert_result.get("alerts_sent", 0)
            if alert_result.get("alerts_sent", 0) > 0:
                logger.info("Syndicate alerts sent", alerts=alert_result["alerts_sent"])
        except Exception as ae:
            logger.error("Failed to check syndicate alerts", error=str(ae))

        logger.info("Fetch cycle complete", **summary)
        return summary

    async def _fetch_league_odds(self, client: httpx.AsyncClient, sport_key: str, league_name: str) -> dict:
        """
        Fetch odds for a single league from The Odds API.
        """
        url = f"{self.base_url}/sports/{sport_key}/odds"
        params = {
            "apiKey": self.api_key,
            "regions": "eu",  # European odds format (decimal)
            "markets": "h2h",  # 1x2 market
            "bookmakers": "pinnacle",
            "oddsFormat": "decimal"
        }

        response = await client.get(url, params=params)
        response.raise_for_status()

        events = response.json()

        # Log API usage from headers
        remaining = response.headers.get("x-requests-remaining", "unknown")
        used = response.headers.get("x-requests-used", "unknown")
        logger.debug("API quota", remaining=remaining, used=used)

        # Store in database
        result = self._store_odds(events, sport_key, league_name)

        return result

    def _store_odds(self, events: list, sport_key: str, league_name: str) -> dict:
        """
        Store fetched odds in the database.
        Creates matches if they don't exist, adds odds snapshots.
        Also detects and records late steam moves (>5% within 2 hours of kickoff).
        """
        db = SessionLocal()
        try:
            odds_stored = 0
            steam_moves_recorded = 0
            fetch_time = datetime.utcnow()

            for event in events:
                # Upsert match
                match = self._upsert_match(db, event, sport_key, league_name)

                # Extract Pinnacle odds
                pinnacle_odds = self._extract_pinnacle_odds(event)

                if pinnacle_odds:
                    # Check for late steam before adding new snapshot
                    steam_count = self._detect_late_steam(
                        db, match, pinnacle_odds, fetch_time, sport_key
                    )
                    steam_moves_recorded += steam_count

                    snapshot = OddsSnapshot(
                        match_id=match.id,
                        bookmaker="pinnacle",
                        home_odds=pinnacle_odds.get("home"),
                        draw_odds=pinnacle_odds.get("draw"),
                        away_odds=pinnacle_odds.get("away"),
                        fetched_at=fetch_time,
                        last_update=pinnacle_odds.get("last_update")
                    )
                    db.add(snapshot)
                    odds_stored += 1

            db.commit()

            if steam_moves_recorded > 0:
                logger.info(
                    "Late steam moves detected",
                    sport_key=sport_key,
                    count=steam_moves_recorded
                )

            return {"matches": len(events), "odds_stored": odds_stored, "steam_moves": steam_moves_recorded}

        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    def _detect_late_steam(
        self,
        db: Session,
        match: Match,
        current_odds: dict,
        fetch_time: datetime,
        sport_key: str
    ) -> int:
        """
        Detect if current odds represent a significant late move (>5% within 2 hours of kickoff).
        Records any detected steam moves to the database.
        Returns count of steam moves recorded.
        """
        # Make commence_time timezone-aware if it isn't
        commence_time = match.commence_time
        if commence_time.tzinfo is None:
            commence_time = commence_time.replace(tzinfo=timezone.utc)

        fetch_time_aware = fetch_time
        if fetch_time_aware.tzinfo is None:
            fetch_time_aware = fetch_time_aware.replace(tzinfo=timezone.utc)

        # Check if we're within the late steam window
        time_to_kickoff = commence_time - fetch_time_aware
        if time_to_kickoff.total_seconds() < 0:
            # Match already started
            return 0
        if time_to_kickoff > timedelta(hours=LATE_STEAM_WINDOW_HOURS):
            # Not within late steam window
            return 0

        minutes_before_kickoff = int(time_to_kickoff.total_seconds() / 60)

        # Get the opening odds (first snapshot)
        opening_snapshot = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .order_by(OddsSnapshot.fetched_at.asc())
            .first()
        )

        if not opening_snapshot:
            # No previous odds to compare
            return 0

        # Get the most recent snapshot (to compare against)
        previous_snapshot = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )

        steam_count = 0
        outcomes = [
            ("home", match.home_team, opening_snapshot.home_odds, previous_snapshot.home_odds if previous_snapshot else None, current_odds.get("home")),
            ("draw", "Draw", opening_snapshot.draw_odds, previous_snapshot.draw_odds if previous_snapshot else None, current_odds.get("draw")),
            ("away", match.away_team, opening_snapshot.away_odds, previous_snapshot.away_odds if previous_snapshot else None, current_odds.get("away")),
        ]

        for outcome, team_name, opening, previous, current in outcomes:
            if not opening or not current or not previous:
                continue
            if opening <= 0 or current <= 0:
                continue

            # Calculate implied probability movement from opening
            # Positive = odds shortened (probability up, being backed)
            # Negative = odds drifted (probability down)
            prob_move = _implied_prob(current) - _implied_prob(opening)

            # Check if this is a significant move (>= 3pp implied probability shift)
            if abs(prob_move) >= STEAM_THRESHOLD_PROB_POINTS:
                # Check if we already recorded this move (avoid duplicates)
                existing = (
                    db.query(SteamMove)
                    .filter(
                        and_(
                            SteamMove.match_id == match.id,
                            SteamMove.outcome == outcome,
                            SteamMove.current_odds == current
                        )
                    )
                    .first()
                )

                if not existing:
                    steam_move = SteamMove(
                        match_id=match.id,
                        sport_key=sport_key,
                        outcome=outcome,
                        team_name=team_name,
                        opening_odds=opening,
                        previous_odds=previous,
                        current_odds=current,
                        movement_percent=prob_move,
                        detected_at=fetch_time,
                        match_commence_time=match.commence_time,
                        minutes_before_kickoff=minutes_before_kickoff
                    )
                    db.add(steam_move)
                    steam_count += 1

                    logger.info(
                        "Late steam detected",
                        match=f"{match.home_team} vs {match.away_team}",
                        outcome=outcome,
                        team=team_name,
                        prob_change=f"{prob_move:+.1f}pp",
                        minutes_before=minutes_before_kickoff
                    )

        return steam_count

    def _upsert_match(self, db: Session, event: dict, sport_key: str, league_name: str) -> Match:
        """
        Create or update a match record.
        """
        match = db.query(Match).filter(Match.id == event["id"]).first()

        commence_time = datetime.fromisoformat(event["commence_time"].replace("Z", "+00:00"))

        if match:
            # Update if needed
            match.commence_time = commence_time
            match.updated_at = datetime.utcnow()
        else:
            # Create new match
            match = Match(
                id=event["id"],
                sport_key=sport_key,
                league_name=league_name,
                home_team=event["home_team"],
                away_team=event["away_team"],
                commence_time=commence_time
            )
            db.add(match)

        return match

    def _extract_pinnacle_odds(self, event: dict) -> Optional[dict]:
        """
        Extract Pinnacle 1x2 odds from event data.
        Returns dict with home, draw, away odds or None if not found.
        """
        bookmakers = event.get("bookmakers", [])

        for bookmaker in bookmakers:
            if bookmaker["key"] == "pinnacle":
                markets = bookmaker.get("markets", [])

                for market in markets:
                    if market["key"] == "h2h":
                        outcomes = market.get("outcomes", [])
                        odds = {}

                        # Map outcomes to home/draw/away
                        for outcome in outcomes:
                            name = outcome["name"]
                            price = outcome["price"]

                            if name == event["home_team"]:
                                odds["home"] = price
                            elif name == event["away_team"]:
                                odds["away"] = price
                            elif name.lower() == "draw":
                                odds["draw"] = price

                        # Parse last_update if available
                        last_update_str = market.get("last_update")
                        if last_update_str:
                            try:
                                odds["last_update"] = datetime.fromisoformat(
                                    last_update_str.replace("Z", "+00:00")
                                )
                            except (ValueError, TypeError):
                                odds["last_update"] = None

                        return odds if odds else None

        return None

    async def _fetch_league_totals(self, client: httpx.AsyncClient, sport_key: str) -> dict:
        """
        Fetch totals (over/under) odds for a league from The Odds API.

        Requests BOTH `totals` (current main line) and `alternate_totals`
        (every line Pinnacle offers). This lets us:
          1. Keep tracking the opening line all the way to kickoff even
             when the market shifts to a different main line.
          2. Deterministically identify which line was the "main" line
             at opening — we insert it first so it has the lowest id.
        """
        url = f"{self.base_url}/sports/{sport_key}/odds"
        params = {
            "apiKey": self.api_key,
            "regions": "eu",
            "markets": "totals,alternate_totals",
            "bookmakers": "pinnacle",
            "oddsFormat": "decimal"
        }

        response = await client.get(url, params=params)
        response.raise_for_status()

        events = response.json()

        # Log API usage
        remaining = response.headers.get("x-requests-remaining", "unknown")
        logger.debug("API quota (totals)", remaining=remaining)

        # Store totals in database
        result = self._store_totals(events)

        return result

    def _store_totals(self, events: list) -> dict:
        """
        Store fetched totals odds in the database.
        Only stores if match already exists (from 1X2 fetch).
        Stores a snapshot for EVERY line Pinnacle offers (via alternate_totals),
        so the opening line continues to be tracked even when the market
        shifts to a different main line.
        """
        db = SessionLocal()
        try:
            totals_stored = 0
            fetch_time = datetime.utcnow()

            for event in events:
                match_id = event["id"]

                # Check if match exists (should have been created by 1X2 fetch)
                match = db.query(Match).filter(Match.id == match_id).first()
                if not match:
                    continue

                # Extract Pinnacle totals — returns a list of line snapshots
                totals_list = self._extract_pinnacle_totals(event)

                if totals_list:
                    for td in totals_list:
                        snapshot = TotalsSnapshot(
                            match_id=match_id,
                            line=td["line"],
                            over_odds=td.get("over"),
                            under_odds=td.get("under"),
                            fetched_at=fetch_time,
                            last_update=td.get("last_update")
                        )
                        db.add(snapshot)
                        totals_stored += 1

            db.commit()

            return {"totals_stored": totals_stored}

        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    def _extract_pinnacle_totals(self, event: dict) -> list:
        """
        Extract Pinnacle totals odds from event data.
        Returns a list of dicts, one per line offered by Pinnacle:
        [{"line": 2.5, "over": 1.91, "under": 1.91, "last_update": ...}, ...]

        Handles both `totals` (main line only) and `alternate_totals` (all lines)
        market keys — merging them into a single list keyed by line number.
        """
        bookmakers = event.get("bookmakers", [])

        for bookmaker in bookmakers:
            if bookmaker["key"] == "pinnacle":
                markets = bookmaker.get("markets", [])

                # Collect lines across `totals` and `alternate_totals` markets,
                # keyed by line number so duplicates merge. Process `totals`
                # (the main line) FIRST so the main line is inserted into the
                # dict first — giving it the lowest DB id downstream, which
                # makes "opening line" deterministic for this match.
                by_line: dict = {}
                ordered_markets = sorted(
                    [m for m in markets if m.get("key") in ("totals", "alternate_totals")],
                    key=lambda m: 0 if m.get("key") == "totals" else 1,
                )

                for market in ordered_markets:

                    outcomes = market.get("outcomes", [])

                    last_update = None
                    last_update_str = market.get("last_update")
                    if last_update_str:
                        try:
                            last_update = datetime.fromisoformat(
                                last_update_str.replace("Z", "+00:00")
                            )
                        except (ValueError, TypeError):
                            last_update = None

                    for outcome in outcomes:
                        name = outcome.get("name")
                        price = outcome.get("price")
                        point = outcome.get("point")

                        if point is None or price is None:
                            continue

                        entry = by_line.setdefault(point, {
                            "line": point,
                            "over": None,
                            "under": None,
                            "last_update": last_update,
                        })

                        if name == "Over":
                            entry["over"] = price
                        elif name == "Under":
                            entry["under"] = price

                        # Prefer the most recent last_update we see
                        if last_update and (
                            entry["last_update"] is None
                            or last_update > entry["last_update"]
                        ):
                            entry["last_update"] = last_update

                # Keep only lines where we have BOTH over and under odds
                return [e for e in by_line.values() if e["over"] and e["under"]]

        return []

    async def _fetch_league_spreads(self, client: httpx.AsyncClient, sport_key: str) -> dict:
        """
        Fetch spreads (Asian Handicap) odds for a league from The Odds API.
        """
        url = f"{self.base_url}/sports/{sport_key}/odds"
        params = {
            "apiKey": self.api_key,
            "regions": "eu",
            "markets": "spreads",
            "bookmakers": "pinnacle",
            "oddsFormat": "decimal"
        }

        response = await client.get(url, params=params)
        response.raise_for_status()

        events = response.json()

        # Log API usage
        remaining = response.headers.get("x-requests-remaining", "unknown")
        logger.debug("API quota (spreads)", remaining=remaining)

        # Store spreads in database
        result = self._store_spreads(events)

        return result

    def _store_spreads(self, events: list) -> dict:
        """
        Store fetched spreads odds in the database.
        Only stores if match already exists (from 1X2 fetch).
        Always stores regardless of line changes so closing lines are accurate.
        """
        db = SessionLocal()
        try:
            spreads_stored = 0
            fetch_time = datetime.utcnow()

            for event in events:
                match_id = event["id"]

                # Check if match exists (should have been created by 1X2 fetch)
                match = db.query(Match).filter(Match.id == match_id).first()
                if not match:
                    continue

                # Extract Pinnacle spreads
                spreads_data = self._extract_pinnacle_spreads(event)

                if spreads_data:
                    snapshot = SpreadsSnapshot(
                        match_id=match_id,
                        line=spreads_data["line"],
                        home_odds=spreads_data.get("home"),
                        away_odds=spreads_data.get("away"),
                        fetched_at=fetch_time,
                        last_update=spreads_data.get("last_update")
                    )
                    db.add(snapshot)
                    spreads_stored += 1

            db.commit()

            return {"spreads_stored": spreads_stored}

        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

    def _extract_pinnacle_spreads(self, event: dict) -> Optional[dict]:
        """
        Extract Pinnacle spreads (Asian Handicap) odds from event data.
        Returns dict with line, home, away odds or None if not found.

        The line is from the home team's perspective:
        - Negative line (e.g., -0.5) means home team gives 0.5 goal handicap
        - Positive line (e.g., +0.5) means home team receives 0.5 goal handicap
        """
        bookmakers = event.get("bookmakers", [])

        for bookmaker in bookmakers:
            if bookmaker["key"] == "pinnacle":
                markets = bookmaker.get("markets", [])

                for market in markets:
                    if market["key"] == "spreads":
                        outcomes = market.get("outcomes", [])
                        spreads = {}

                        for outcome in outcomes:
                            name = outcome["name"]
                            price = outcome["price"]
                            point = outcome.get("point")

                            if name == event["home_team"]:
                                spreads["home"] = price
                                spreads["line"] = point  # Line from home perspective
                            elif name == event["away_team"]:
                                spreads["away"] = price
                                # Away point should be inverse of home

                        # Parse last_update if available
                        last_update_str = market.get("last_update")
                        if last_update_str:
                            try:
                                spreads["last_update"] = datetime.fromisoformat(
                                    last_update_str.replace("Z", "+00:00")
                                )
                            except (ValueError, TypeError):
                                spreads["last_update"] = None

                        return spreads if spreads.get("line") is not None else None

        return None


# Singleton instance for scheduler
odds_fetcher = OddsFetcher()
