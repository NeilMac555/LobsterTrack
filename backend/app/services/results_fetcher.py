import httpx
import structlog
from datetime import datetime, timedelta
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Match, SteamMove
from app.models.database import SessionLocal

logger = structlog.get_logger()
settings = get_settings()


class ResultsFetcher:
    """
    Service to fetch match results from The Odds API and update steam moves.
    Uses the /scores endpoint to get completed match results.
    """

    def __init__(self):
        self.base_url = settings.odds_api_base_url
        self.api_key = settings.odds_api_key
        self.leagues = settings.leagues

    async def update_steam_move_results(self) -> dict:
        """
        Fetch results for matches with pending steam moves and update them.
        Only looks at matches that have completed (past commence_time + 3 hours).
        """
        summary = {
            "leagues_processed": 0,
            "steam_moves_updated": 0,
            "matches_checked": 0,
            "errors": []
        }

        db = SessionLocal()
        try:
            # Find steam moves that need result updates
            # Look for matches that started more than 3 hours ago (should be finished)
            cutoff_time = datetime.utcnow() - timedelta(hours=3)

            pending_moves = (
                db.query(SteamMove)
                .filter(
                    and_(
                        SteamMove.result_updated == False,
                        SteamMove.match_commence_time < cutoff_time
                    )
                )
                .all()
            )

            if not pending_moves:
                logger.debug("No steam moves pending result updates")
                return summary

            # Group by sport_key to minimize API calls
            moves_by_league = {}
            for move in pending_moves:
                if move.sport_key not in moves_by_league:
                    moves_by_league[move.sport_key] = []
                moves_by_league[move.sport_key].append(move)

            async with httpx.AsyncClient(timeout=30.0) as client:
                for sport_key, moves in moves_by_league.items():
                    try:
                        updated = await self._fetch_and_update_results(
                            client, db, sport_key, moves
                        )
                        summary["leagues_processed"] += 1
                        summary["steam_moves_updated"] += updated
                    except Exception as e:
                        error_msg = f"{sport_key}: {str(e)}"
                        summary["errors"].append(error_msg)
                        logger.error("Failed to fetch results", sport_key=sport_key, error=str(e))

            db.commit()
            logger.info("Results update complete", **summary)

        except Exception as e:
            db.rollback()
            logger.error("Results update failed", error=str(e))
            summary["errors"].append(str(e))
        finally:
            db.close()

        return summary

    async def _fetch_and_update_results(
        self,
        client: httpx.AsyncClient,
        db: Session,
        sport_key: str,
        moves: list
    ) -> int:
        """
        Fetch scores for a league and update the steam moves.
        """
        # Fetch scores with completed games
        url = f"{self.base_url}/sports/{sport_key}/scores"
        params = {
            "apiKey": self.api_key,
            "daysFrom": 3,  # Look back 3 days for completed matches
        }

        response = await client.get(url, params=params)
        response.raise_for_status()

        scores = response.json()

        # Build a lookup of match_id -> scores
        scores_lookup = {}
        for score_data in scores:
            if score_data.get("completed"):
                match_id = score_data["id"]
                home_score = None
                away_score = None

                for score_entry in score_data.get("scores", []):
                    if score_entry["name"] == score_data["home_team"]:
                        home_score = int(score_entry["score"])
                    elif score_entry["name"] == score_data["away_team"]:
                        away_score = int(score_entry["score"])

                if home_score is not None and away_score is not None:
                    scores_lookup[match_id] = {
                        "home_score": home_score,
                        "away_score": away_score
                    }

        updated_count = 0

        for move in moves:
            if move.match_id in scores_lookup:
                result = scores_lookup[move.match_id]
                home_score = result["home_score"]
                away_score = result["away_score"]

                # Determine if the steamed outcome won
                won = False
                if move.outcome == "home" and home_score > away_score:
                    won = True
                elif move.outcome == "away" and away_score > home_score:
                    won = True
                elif move.outcome == "draw" and home_score == away_score:
                    won = True

                # Update the steam move
                move.result_updated = True
                move.won = won
                move.home_score = home_score
                move.away_score = away_score

                updated_count += 1

                logger.info(
                    "Steam move result updated",
                    match_id=move.match_id,
                    outcome=move.outcome,
                    team=move.team_name,
                    movement=f"{move.movement_percent:+.1f}%",
                    won=won,
                    score=f"{home_score}-{away_score}"
                )

        return updated_count


# Singleton instance for scheduler
results_fetcher = ResultsFetcher()
