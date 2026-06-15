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
from app.services.email_sender import email_sender
from app.services.stripe_reconciler import stripe_reconciler

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

        # Football-data weekly refresh diagnostics — populated by the
        # Monday 09:00 UTC cron job that re-pulls the current season for
        # every supported league.
        self._fdata_last_run_at: datetime | None = None
        self._fdata_last_summary: dict | None = None
        self._fdata_last_error: str | None = None

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
        Schedule one-shot fetches around kickoff:
          • At KO exactly — captures the true closing line.
          • At KO + 5 minutes — captures the in-play snapshot AFTER the
            first 5 min of action, when sharp money has had time to
            react to confirmed lineups / opening exchanges / weather
            etc. Feeds the /in-play-jumps analytics endpoint.

        Both jobs are idempotent — scheduling the same match twice is a
        no-op because we track which match_ids have already been queued.
        """
        if match_id in self._scheduled_ko_jobs:
            return

        self._scheduled_ko_jobs.add(match_id)

        # Ensure ko_time is timezone-aware for the scheduler
        if ko_time.tzinfo is None:
            ko_time = ko_time.replace(tzinfo=timezone.utc)

        ko_job_id = f"ko_{match_id}"
        in_play_job_id = f"inplay5_{match_id}"
        in_play_time = ko_time + timedelta(minutes=5)

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

        async def in_play_5_fetch():
            try:
                logger.info(
                    "In-play T+5 fetch", sport_key=sport_key, match_id=match_id
                )
                await odds_fetcher.fetch_all_leagues(sport_keys=[sport_key])
                self._last_fetch_by_league[sport_key] = datetime.utcnow()
                logger.info("In-play T+5 captured", match_id=match_id)
            except Exception as e:
                logger.error(
                    "In-play T+5 fetch failed", match_id=match_id, error=str(e)
                )

            # Score check — separate try/except so a /scores outage
            # doesn't cost us the odds snapshot we just stored. Marks
            # the Match with early_goal_minute=5 if anyone has scored
            # by now; /in-play-jumps then excludes these matches by
            # default because the price swing is just market reaction
            # to an obvious goal, not a sharp-money signal.
            try:
                from app.services.score_fetcher import fetch_total_score
                from app.models import Match
                from app.models.database import SessionLocal

                total = await fetch_total_score(sport_key, match_id)
                if total is not None and total > 0:
                    db = SessionLocal()
                    try:
                        match = db.query(Match).filter(Match.id == match_id).first()
                        if match and match.early_goal_minute is None:
                            match.early_goal_minute = 5
                            db.commit()
                            logger.info(
                                "Early goal detected at T+5",
                                match_id=match_id,
                                total_goals=total,
                            )
                    finally:
                        db.close()
            except Exception as e:
                logger.warning(
                    "T+5 score check failed (non-fatal)",
                    match_id=match_id,
                    error=str(e),
                )

            # Discard from the scheduled set ONLY after both the odds
            # fetch and score check are done, so the smart_tick can't
            # re-schedule the match while the in-play job is pending.
            self._scheduled_ko_jobs.discard(match_id)

        try:
            self.scheduler.add_job(
                ko_fetch,
                trigger=DateTrigger(run_date=ko_time),
                id=ko_job_id,
                name=f"KO closing line: {match_id[:20]}",
                replace_existing=True,
                max_instances=1,
            )
            self.scheduler.add_job(
                in_play_5_fetch,
                trigger=DateTrigger(run_date=in_play_time),
                id=in_play_job_id,
                name=f"In-play T+5: {match_id[:20]}",
                replace_existing=True,
                max_instances=1,
            )
            logger.info(
                "Scheduled KO + in-play T+5 fetches",
                match_id=match_id,
                ko_time=ko_time.isoformat(),
                in_play_time=in_play_time.isoformat(),
            )
        except Exception as e:
            logger.error(
                "Failed to schedule KO/in-play fetches",
                match_id=match_id,
                error=str(e),
            )
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

    async def football_data_refresh_job(self):
        """
        Weekly refresh of historical_matches (current season only) from
        football-data.co.uk for every supported league. Older seasons are
        static so we skip them; only the in-progress season changes.

        Each league fetched independently so a single bad CSV doesn't
        kill the others. Failures are logged but never raised — worst
        case the Team P/L tab shows last week's numbers until the next
        Monday run.
        """
        from app.services.football_data_importer import (
            LEAGUE_FILE_CODES,
            import_seasons,
        )

        self._fdata_last_run_at = datetime.utcnow()
        self._fdata_last_error = None
        try:
            logger.info("Starting weekly football-data.co.uk refresh")
            results: dict[str, dict] = {}
            for league_key in LEAGUE_FILE_CODES.keys():
                try:
                    summary = await import_seasons(
                        league_key=league_key, seasons=["2526"]
                    )
                    results[league_key] = {
                        "rows_written": summary.get("total_rows_written", 0),
                        "unmapped_teams": summary.get("total_unmapped_teams", []),
                        "errors": summary.get("errors", []),
                    }
                except Exception as e:
                    results[league_key] = {"error": str(e)}
                    logger.error(
                        "football-data refresh failed for league",
                        league=league_key, error=str(e),
                    )
            self._fdata_last_summary = results
            logger.info("Weekly football-data refresh complete", **{
                k: v.get("rows_written", "err") for k, v in results.items()
            })
        except Exception as e:
            self._fdata_last_error = str(e)
            logger.error("Weekly football-data refresh failed", error=str(e))

    async def stripe_reconcile_job(self):
        """
        Safety net for the Stripe webhook — lists every active Stripe
        subscription and makes sure each one exists in our DB as active.
        Auto-creates users, sends magic links, alerts Neil on anything
        new. Runs every 10 minutes so the most a paid customer ever
        waits is 10m even if the webhook is completely dead.
        """
        try:
            await stripe_reconciler.reconcile()
        except Exception as e:
            logger.error("stripe reconcile failed", error=str(e))

    async def polymarket_fetch_job(self):
        """Polymarket WC snapshot fetch — wraps the fetcher's main entry
        so the scheduler can swallow exceptions without killing the loop."""
        try:
            from app.services.polymarket_fetcher import polymarket_fetcher
            await polymarket_fetcher.fetch_and_store()
        except Exception as e:
            logger.error("polymarket fetch failed", error=str(e))

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

        # Stripe reconciler — every 10 minutes. Catches any Pro signup the
        # webhook missed, creates the user, emails the magic link, and
        # alerts Neil. Worst-case wait for a new customer is now 10 min.
        self.scheduler.add_job(
            self.stripe_reconcile_job,
            trigger=IntervalTrigger(minutes=10),
            id="stripe_reconcile",
            name="Stripe subscription reconciler",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

        # Weekly Team P/L refresh — Monday 09:00 UTC (10am London summer,
        # 9am winter). football-data.co.uk publishes weekend results plus
        # Pinnacle closes overnight Sunday→Monday, so by 09:00 UTC the
        # file is reliably updated. Mon-night fixtures (Italy / France)
        # land in the following week's pull. Refreshes the current
        # season ('2526') only — older seasons are static.
        self.scheduler.add_job(
            self.football_data_refresh_job,
            trigger=CronTrigger(day_of_week="mon", hour=9, minute=0),
            id="football_data_refresh_weekly",
            name="Weekly football-data.co.uk refresh (Team P/L)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )

        # Polymarket WC fetcher — every minute during the WC. Polymarket
        # is free to poll (no auth, no usage cap) and live in-play prices
        # move fast, so 1m gives us a usable per-match time series without
        # being wasteful. Pinnacle dropped in-play matches from The Odds
        # API feed at T+0; this fetcher is the in-play replacement.
        self.scheduler.add_job(
            self.polymarket_fetch_job,
            trigger=IntervalTrigger(minutes=1),
            id="polymarket_fetch",
            name="Polymarket WC snapshot fetch",
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
            # Stripe webhook — has the endpoint been hit at all? If hits=0
            # then Stripe Dashboard doesn't have us configured OR the
            # endpoint is disabled. If hits > 0 but recent_errors shows
            # 'Invalid signature' then STRIPE_WEBHOOK_SECRET is wrong.
            "stripe_webhook": {
                "hits": getattr(self, "_webhook_hit_count", 0),
                "last_hit_at": iso(getattr(self, "_webhook_last_hit_at", None)),
                "seconds_since_last_hit": seconds_ago(getattr(self, "_webhook_last_hit_at", None)),
            },
            # Email pipeline health — so a Resend outage is visible
            # without reading Railway logs.
            "email": {
                "configured": email_sender.is_configured(),
                "sent_count": email_sender.sent_count,
                "failed_count": email_sender.failed_count,
                "last_sent_at": iso(email_sender.last_sent_at),
                "seconds_since_last_sent": seconds_ago(email_sender.last_sent_at),
                "last_failed_at": iso(email_sender.last_failed_at),
                "seconds_since_last_failed": seconds_ago(email_sender.last_failed_at),
                "last_error": email_sender.last_error,
                "last_failure_kind": email_sender.last_failure_kind,
            },
            # Stripe reconciler — webhook safety net, runs every 10 min
            "stripe_reconciler": {
                "last_run_at": iso(stripe_reconciler.last_run_at),
                "seconds_since_last_run": seconds_ago(stripe_reconciler.last_run_at),
                "last_error": stripe_reconciler.last_error,
                "summary": stripe_reconciler.last_run_summary,
                "schedule": "Every 10 minutes",
            },
            # Weekly xG refresh status — last run, how long ago, result summary
            "xg_refresh": {
                "last_run_at": iso(xg_refresher.last_run_at),
                "seconds_since_last_run": seconds_ago(xg_refresher.last_run_at),
                "last_error": xg_refresher.last_error,
                "summary": xg_refresher.last_run_summary,
                "schedule": "Mondays 03:00 UTC",
            },
            # Weekly Team P/L refresh — pulls football-data.co.uk per league
            "football_data_refresh": {
                "last_run_at": iso(self._fdata_last_run_at),
                "seconds_since_last_run": seconds_ago(self._fdata_last_run_at),
                "last_error": self._fdata_last_error,
                "summary": self._fdata_last_summary,
                "schedule": "Mondays 09:00 UTC",
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
