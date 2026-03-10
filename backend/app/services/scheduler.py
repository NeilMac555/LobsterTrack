import structlog
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger

from app.config import get_settings
from app.services.odds_fetcher import odds_fetcher
from app.services.results_fetcher import results_fetcher
from app.services.closing_line_capturer import closing_line_capturer

logger = structlog.get_logger()
settings = get_settings()

# Dynamic refresh windows (minutes)
WINDOW_DEFAULT = 15    # No matches imminent (>2hrs out)
WINDOW_EARLY = 10      # T-120 to T-30
WINDOW_CLOSING = 2     # T-30 to T-0

# Tick interval - runs at the fastest rate we might need
TICK_INTERVAL = 2  # minutes


class OddsScheduler:
    """
    Smart scheduler with dynamic refresh rates based on proximity to kickoff.

    | Window                        | Refresh | Why                       |
    | Default (no matches imminent) | 15 min  | Conserve API quota        |
    | T-120 to T-30                 | 10 min  | Catch early steam         |
    | T-30 to T-0                   | 2 min   | Catch sharp money         |
    | Exact KO timestamp            | 1 shot  | True closing line capture |
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._is_running = False
        self._last_fetch_by_league: dict[str, datetime] = {}
        self._scheduled_ko_jobs: set[str] = set()  # match IDs with KO jobs scheduled

    def _get_league_refresh_info(self, sport_key: str) -> tuple[int, list]:
        """
        Check upcoming matches for a league and return:
        - The appropriate refresh interval in minutes
        - List of matches needing KO-time one-shot jobs
        """
        from app.models import Match
        from app.models.database import SessionLocal

        db = SessionLocal()
        try:
            now = datetime.utcnow().replace(tzinfo=timezone.utc)

            upcoming = (
                db.query(Match)
                .filter(
                    Match.sport_key == sport_key,
                    Match.commence_time > now,
                    Match.commence_time < now + timedelta(hours=3)
                )
                .order_by(Match.commence_time.asc())
                .all()
            )

            if not upcoming:
                return WINDOW_DEFAULT, []

            best_interval = WINDOW_DEFAULT
            ko_matches = []

            for match in upcoming:
                commence = match.commence_time
                if commence.tzinfo is None:
                    commence = commence.replace(tzinfo=timezone.utc)

                minutes_to_ko = (commence - now).total_seconds() / 60

                if minutes_to_ko <= 30:
                    best_interval = min(best_interval, WINDOW_CLOSING)
                    # Schedule KO one-shot if within 5 min and not already scheduled
                    if minutes_to_ko <= 5 and match.id not in self._scheduled_ko_jobs:
                        ko_matches.append((match.id, commence))
                elif minutes_to_ko <= 120:
                    best_interval = min(best_interval, WINDOW_EARLY)

            return best_interval, ko_matches

        finally:
            db.close()

    async def smart_tick(self):
        """
        Main tick that runs every 2 minutes.
        Determines which leagues need fetching based on their closest match.
        """
        try:
            now = datetime.utcnow()
            leagues_to_fetch = []

            for sport_key in settings.leagues:
                interval, ko_matches = self._get_league_refresh_info(sport_key)
                last_fetch = self._last_fetch_by_league.get(sport_key)

                should_fetch = False
                if last_fetch is None:
                    should_fetch = True
                else:
                    elapsed = (now - last_fetch).total_seconds() / 60
                    if elapsed >= interval:
                        should_fetch = True

                if should_fetch:
                    leagues_to_fetch.append((sport_key, interval))

                # Schedule one-shot KO jobs for closing line capture
                for match_id, ko_time in ko_matches:
                    self._schedule_ko_fetch(sport_key, match_id, ko_time)

            if not leagues_to_fetch:
                return

            sport_keys = [sk for sk, _ in leagues_to_fetch]
            intervals_str = ", ".join(f"{sk}({iv}m)" for sk, iv in leagues_to_fetch)
            logger.info("Smart fetch", leagues=intervals_str)

            summary = await odds_fetcher.fetch_all_leagues(sport_keys=sport_keys)

            # Update last fetch times
            for sk, _ in leagues_to_fetch:
                self._last_fetch_by_league[sk] = now

            # Capture closing lines for any past-KO matches
            try:
                cl_summary = await closing_line_capturer.capture_closing_lines()
                if cl_summary["closing_lines_captured"] > 0:
                    logger.info(
                        "Closing lines captured",
                        captured=cl_summary["closing_lines_captured"]
                    )
            except Exception as e:
                logger.error("Closing line capture failed", error=str(e))

            if summary.get("odds_stored", 0) > 0 or summary.get("errors"):
                logger.info(
                    "Smart fetch complete",
                    leagues=len(sport_keys),
                    matches=summary["matches_found"],
                    odds=summary["odds_stored"],
                    errors=len(summary["errors"])
                )

        except Exception as e:
            logger.error("Smart tick failed", error=str(e))

    def _schedule_ko_fetch(self, sport_key: str, match_id: str, ko_time: datetime):
        """
        Schedule a one-shot fetch at exact KO time to capture the true closing line.
        """
        if match_id in self._scheduled_ko_jobs:
            return

        self._scheduled_ko_jobs.add(match_id)

        # Ensure ko_time is timezone-aware for the scheduler
        if ko_time.tzinfo is None:
            ko_time = ko_time.replace(tzinfo=timezone.utc)

        job_id = f"ko_{match_id}"

        async def ko_fetch():
            try:
                logger.info("KO closing line fetch", sport_key=sport_key, match_id=match_id)
                await odds_fetcher.fetch_all_leagues(sport_keys=[sport_key])
                self._last_fetch_by_league[sport_key] = datetime.utcnow()

                # Immediately capture closing lines
                await closing_line_capturer.capture_closing_lines()
                logger.info("KO closing line captured", match_id=match_id)
            except Exception as e:
                logger.error("KO fetch failed", match_id=match_id, error=str(e))
            finally:
                self._scheduled_ko_jobs.discard(match_id)

        try:
            self.scheduler.add_job(
                ko_fetch,
                trigger=DateTrigger(run_date=ko_time),
                id=job_id,
                name=f"KO closing line: {match_id[:20]}",
                replace_existing=True,
                max_instances=1,
            )
            logger.info(
                "Scheduled KO fetch",
                match_id=match_id,
                ko_time=ko_time.isoformat()
            )
        except Exception as e:
            logger.error("Failed to schedule KO fetch", match_id=match_id, error=str(e))
            self._scheduled_ko_jobs.discard(match_id)

    async def results_job(self):
        """
        Job function that updates steam move results.
        Runs less frequently than odds fetching.
        """
        try:
            logger.info("Starting scheduled results update")
            summary = await results_fetcher.update_steam_move_results()
            logger.info(
                "Results update complete",
                steam_moves_updated=summary["steam_moves_updated"],
                errors=len(summary["errors"])
            )
        except Exception as e:
            logger.error("Results update failed", error=str(e))

    def start(self):
        """
        Start the scheduler with smart dynamic intervals.
        """
        if self._is_running:
            logger.warning("Scheduler already running")
            return

        # Main smart tick - runs every 2 minutes, decides what to fetch
        self.scheduler.add_job(
            self.smart_tick,
            trigger=IntervalTrigger(minutes=TICK_INTERVAL),
            id="smart_tick",
            name="Smart odds fetch tick",
            replace_existing=True,
            max_instances=1,
            coalesce=True
        )

        # Results update job (runs every hour)
        self.scheduler.add_job(
            self.results_job,
            trigger=IntervalTrigger(hours=1),
            id="results_update",
            name="Update Steam Move Results",
            replace_existing=True,
            max_instances=1,
            coalesce=True
        )

        self.scheduler.start()
        self._is_running = True
        logger.info(
            "Smart scheduler started",
            tick_interval=f"{TICK_INTERVAL}m",
            windows=f"default={WINDOW_DEFAULT}m, early={WINDOW_EARLY}m, closing={WINDOW_CLOSING}m"
        )

    def stop(self):
        """
        Stop the scheduler gracefully.
        """
        if self._is_running:
            self.scheduler.shutdown(wait=True)
            self._is_running = False
            logger.info("Scheduler stopped")

    async def run_now(self):
        """
        Trigger an immediate fetch of all leagues (for startup).
        """
        summary = await odds_fetcher.fetch_all_leagues()

        # Capture closing lines
        try:
            await closing_line_capturer.capture_closing_lines()
        except Exception as e:
            logger.error("Closing line capture failed on startup", error=str(e))

        return summary


# Singleton instance
odds_scheduler = OddsScheduler()
