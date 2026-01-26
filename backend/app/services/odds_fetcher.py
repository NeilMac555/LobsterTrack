import httpx
import structlog
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Match, OddsSnapshot
from app.models.database import SessionLocal

logger = structlog.get_logger()
settings = get_settings()


class OddsFetcher:
    """
    Service to fetch odds from The Odds API and store in database.
    Focuses on Pinnacle odds for 1x2 (h2h) markets.
    """

    def __init__(self):
        self.base_url = settings.odds_api_base_url
        self.api_key = settings.odds_api_key
        self.leagues = settings.leagues

    async def fetch_all_leagues(self) -> dict:
        """
        Fetch odds for all configured leagues.
        Returns summary of what was fetched.
        """
        summary = {
            "leagues_processed": 0,
            "matches_found": 0,
            "odds_stored": 0,
            "errors": []
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            for sport_key, league_name in self.leagues.items():
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
                except Exception as e:
                    error_msg = f"{sport_key}: {str(e)}"
                    summary["errors"].append(error_msg)
                    logger.error("Failed to fetch league", sport_key=sport_key, error=str(e))

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
        """
        db = SessionLocal()
        try:
            odds_stored = 0
            fetch_time = datetime.utcnow()

            for event in events:
                # Upsert match
                match = self._upsert_match(db, event, sport_key, league_name)

                # Extract Pinnacle odds
                pinnacle_odds = self._extract_pinnacle_odds(event)

                if pinnacle_odds:
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
            return {"matches": len(events), "odds_stored": odds_stored}

        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

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


# Singleton instance for scheduler
odds_fetcher = OddsFetcher()
