import asyncio
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings
from app.services.odds_fetcher import odds_fetcher

logger = structlog.get_logger()
settings = get_settings()


class OddsScheduler:
    """
    Manages scheduled fetching of odds data.
    Uses APScheduler with asyncio support.
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._is_running = False

    async def fetch_job(self):
        """
        Job function that fetches all odds.
        Wrapped to handle errors gracefully.
        """
        try:
            logger.info("Starting scheduled odds fetch")
            summary = await odds_fetcher.fetch_all_leagues()
            logger.info(
                "Scheduled fetch complete",
                matches=summary["matches_found"],
                odds=summary["odds_stored"],
                errors=len(summary["errors"])
            )
        except Exception as e:
            logger.error("Scheduled fetch failed", error=str(e))

    def start(self):
        """
        Start the scheduler with configured interval.
        """
        if self._is_running:
            logger.warning("Scheduler already running")
            return

        interval_minutes = settings.fetch_interval_minutes

        # Add the fetch job
        self.scheduler.add_job(
            self.fetch_job,
            trigger=IntervalTrigger(minutes=interval_minutes),
            id="odds_fetch",
            name="Fetch Pinnacle Odds",
            replace_existing=True,
            max_instances=1,  # Prevent overlapping runs
            coalesce=True  # Combine missed runs
        )

        self.scheduler.start()
        self._is_running = True
        logger.info("Scheduler started", interval_minutes=interval_minutes)

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
        Trigger an immediate fetch (for manual triggers or startup).
        """
        await self.fetch_job()


# Singleton instance
odds_scheduler = OddsScheduler()
