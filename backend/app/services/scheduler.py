import structlog
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.services.odds_fetcher import odds_fetcher
from app.services.results_fetcher import results_fetcher
from app.services.closing_line_capturer import closing_line_capturer
from app.services.xg_refresher import xg_refresher

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

        # Health / diagnostics — surfaced via /api/admin/fetcher-health
        self._started_at: datetime | None = None
        self._last_tick_at: datetime | None = None
        self._last_tick_result: str | None = None  # "ok:<count> leagues" / "idle" / "error:..."
        self._last_fetch_summary: dict | None = None  # last cycle's summary dict
        self._recent_errors: list[dict] = []          # bounded to 10 most recent

    def _record_error(self, where: str, message: str):
        """Keep the last 10 errors so the admin health page can display them."""
        self._recent_errors.append({
            "at": datetime.utcnow().isoformat() + "Z",
            "where": where,
            "error": message,
        })
        # Keep bounded
        if len(self._recent_errors) > 10:
            self._recent_errors = self._recent_errors[-10:]

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
            self._last_tick_at = now
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
                self._last_tick_result = "idle (no leagues due)"
                return

            sport_keys = [sk for sk, _ in leagues_to_fetch]
            intervals_str = ", ".join(f"{sk}({iv}m)" for sk, iv in leagues_to_fetch)
            logger.info("Smart fetch", leagues=intervals_str)

            summary = await odds_fetcher.fetch_all_leagues(sport_keys=sport_keys)
            self._last_fetch_summary = summary
            self._last_tick_result = f"ok: fetched {len(sport_keys)} leagues, {summary.get('odds_stored', 0)} snapshots"

            # Surface any fetch-level errors into the recent-errors log
            for err in summary.get("errors", []) or []:
                self._record_error("fetch", str(err))

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
            self._last_tick_result = f"error: {e}"
            self._record_error("smart_tick", str(e))

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

    async def xg_refresh_job(self):
        """
        Weekly refresh of rolling-xG data scraped from Understat.
        Failures are logged but don't propagate — worst case the xg_data
        table keeps last week's numbers until the next run.
        """
        try:
            logger.info("Starting weekly xG refresh")
            await xg_refresher.refresh()
        except Exception as e:
            logger.error("xG refresh failed", error=str(e))

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

        # Weekly xG refresh from Understat — Monday 03:00 UTC. By that point
        # the weekend games are all settled and Understat's xG has been
        # retagged by their analysts. Catches every matchweek once.
        self.scheduler.add_job(
            self.xg_refresh_job,
            trigger=CronTrigger(day_of_week="mon", hour=3, minute=0),
            id="xg_refresh_weekly",
            name="Weekly xG refresh from Understat",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

        self.scheduler.start()
        self._is_running = True
        self._started_at = datetime.utcnow()
        logger.info(
            "Smart scheduler started",
            tick_interval=f"{TICK_INTERVAL}m",
            windows=f"default={WINDOW_DEFAULT}m, early={WINDOW_EARLY}m, closing={WINDOW_CLOSING}m"
        )

    def get_health(self) -> dict:
        """
        Return a snapshot of scheduler + fetcher health for the admin UI.
        Everything here is in-memory state (no DB query) so it's always fast.
        """
        from app.services.odds_fetcher import odds_fetcher

        now = datetime.utcnow()

        def iso(dt):
            return (dt.isoformat() + "Z") if dt else None

        def seconds_ago(dt):
            return int((now - dt).total_seconds()) if dt else None

        # Per-league status — intended interval + last in-process fetch + computed staleness
        leagues = {}
        for sport_key in settings.leagues:
            interval, _ = self._get_league_refresh_info(sport_key)
            last_fetch = self._last_fetch_by_league.get(sport_key)
            leagues[sport_key] = {
                "current_interval_minutes": interval,
                "last_fetch_at": iso(last_fetch),
                "seconds_since_last_fetch": seconds_ago(last_fetch),
                "is_stale": (
                    last_fetch is None
                    or (now - last_fetch).total_seconds() > interval * 60 + 60
                ),
            }

        return {
            "scheduler_running": self._is_running,
            "started_at": iso(self._started_at),
            "now": iso(now),
            "last_tick_at": iso(self._last_tick_at),
            "seconds_since_last_tick": seconds_ago(self._last_tick_at),
            "last_tick_result": self._last_tick_result,
            "last_fetch_summary": self._last_fetch_summary,
            "tick_interval_seconds": TICK_INTERVAL * 60,
            "windows_minutes": {
                "default": WINDOW_DEFAULT,
                "early": WINDOW_EARLY,
                "closing": WINDOW_CLOSING,
            },
            "leagues": leagues,
            "api_quota": {
                "last_seen": odds_fetcher.last_quota,
                "last_seen_at": iso(odds_fetcher.last_quota_at),
                "seconds_since_last_seen": seconds_ago(odds_fetcher.last_quota_at),
            },
            "recent_errors": list(self._recent_errors),
            "scheduled_ko_jobs": len(self._scheduled_ko_jobs),
            # Weekly xG refresh status — last run, how long ago, result summary
            "xg_refresh": {
                "last_run_at": iso(xg_refresher.last_run_at),
                "seconds_since_last_run": seconds_ago(xg_refresher.last_run_at),
                "last_error": xg_refresher.last_error,
                "summary": xg_refresher.last_run_summary,
                "schedule": "Mondays 03:00 UTC",
            },
        }

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
