import structlog
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models import Match, OddsSnapshot, TotalsSnapshot, SpreadsSnapshot, SyndicateAlert
from app.models.database import SessionLocal
from app.services.telegram_notifier import telegram_notifier

logger = structlog.get_logger()

# Alert threshold: minimum implied probability shift (in percentage points)
# to fire a Telegram alert.
#
# History:
#   - Originally 3.0pp (everything). Cohort showed sub-5pp = -32% ROI.
#   - Tightened to 5.0pp + T-30 in May 2026 (~+15% ROI on 161 alerts).
#   - Loosened to 4.0pp + T-90 in May 2026 to restore alert volume.
#   - Simplified back to 3.0pp + T-180 in June 2026 (Neil's call):
#     uniform rule for every league, no per-league overrides, no
#     separate cumulative-drift detector. One simple model.
#   - Raised to 4.0pp on 2026-08-24 (Neil's call) — fewer, bigger
#     alerts. NOTE: steam-move DETECTION (odds_fetcher.py's
#     STEAM_THRESHOLD_PROB_POINTS, feeding Steam Results/Drifters
#     history) deliberately stays at 3.0 — this constant only gates
#     what fires a Telegram alert / tweet / homepage Syndicate row.
SYNDICATE_THRESHOLD_PROB_POINTS = 4.0

# Time-to-kickoff window for alerts. Only fire alerts when the match is
# within this many minutes of KO. 960 = sixteen hours before kickoff.
# History: 180 (3h) originally; widened to 720 (12h) 2026-08-14 per
# Neil; widened to 960 (16h) 2026-08-22 per Neil after Brentford v
# Spurs steamed 2.39 -> 2.11 between T-12h41 and T-11h53 — the move
# finished 8 minutes after the 12h window opened, so the baseline
# (first snapshot INSIDE the window) caught the post-steam price and
# measured ~0.2pp. NOTE the structural caveat stands at any width: a
# move completing entirely before the window opens is invisible,
# because the baseline is anchored to KO-minus-window rather than to
# a rolling lookback. Widening pushes the cliff earlier into hours
# where big moves are rarer; it does not remove it.
SYNDICATE_ALERT_WINDOW_MINUTES = 960

# Odds threshold above which an alert is tagged as 'high conviction' with
# a 🔥 emoji in the Telegram message. Cohort analysis showed steam moves
# landing at odds ≥ 4.00 carry meaningfully more signal than moves
# inside the favourite/coinflip range — sharp money rarely follows a
# heavy dog without a real informational edge.
SYNDICATE_FIRE_TIER_ODDS = 4.0

# Per-league override layer. Other leagues use the 4.0pp / 960-min
# defaults above. WC override per Neil 2026-06-26: 24-hour pre-KO
# window at 3.5pp so we catch anything material that moves in the
# day before KO, not just the final 3 hours.
LEAGUE_OVERRIDES: dict[str, dict[str, float]] = {
    "soccer_fifa_world_cup": {
        "threshold_pp": 3.5,
        "window_minutes": 1440,
    },
}


def threshold_for(sport_key: str) -> float:
    """Per-league prob-shift threshold, falling back to the global default."""
    return float(
        LEAGUE_OVERRIDES.get(sport_key, {}).get(
            "threshold_pp", SYNDICATE_THRESHOLD_PROB_POINTS
        )
    )


def window_for(sport_key: str) -> int:
    """Per-league alert-window minutes, falling back to the global default."""
    return int(
        LEAGUE_OVERRIDES.get(sport_key, {}).get(
            "window_minutes", SYNDICATE_ALERT_WINDOW_MINUTES
        )
    )


def implied_prob(odds: float) -> float:
    """Convert decimal odds to implied probability (0-100 scale)."""
    return (1.0 / odds) * 100


def prob_movement(baseline_odds: float, current_odds: float) -> float:
    """
    Calculate implied probability movement in percentage points.
    Positive = odds shortened (probability increased, being backed).
    Negative = odds drifted (probability decreased).
    e.g. 2.00 -> 1.80 = +5.6pp (50% -> 55.6%)
    e.g. 2.00 -> 2.20 = -4.1pp (50% -> 45.5%)
    """
    return implied_prob(current_odds) - implied_prob(baseline_odds)


class SyndicateAlerter:
    """
    Checks for Syndicate Move conditions and sends Telegram alerts.
    Runs after each odds fetch cycle.
    Uses implied probability movement instead of raw odds percentage change
    to avoid false positives on longshots.
    """

    async def check_and_alert(self) -> dict:
        """
        Check all matches within the configured pre-KO window (16h by
        default — see SYNDICATE_ALERT_WINDOW_MINUTES) for syndicate moves
        on the 1X2 market only (Totals/Spreads checks disabled 2026-08-14
        per Neil's call — see _check_totals_market/_check_spreads_market,
        left in place but no longer called, in case they're wanted back).
        Send alerts for qualifying moves that haven't been alerted yet.
        """
        if not telegram_notifier.is_configured():
            logger.debug("Telegram not configured, skipping syndicate alerts")
            return {"alerts_sent": 0, "skipped": "not_configured"}

        db = SessionLocal()
        try:
            now = datetime.utcnow()

            # Pull the widest configured window across default + per-league
            # overrides so the DB query catches every potentially-eligible
            # match. Per-match window filtering happens in the loop below.
            max_window = max(
                SYNDICATE_ALERT_WINDOW_MINUTES,
                *[int(cfg.get("window_minutes", 0)) for cfg in LEAGUE_OVERRIDES.values()],
            )
            alert_window_end = now + timedelta(minutes=max_window)

            matches = (
                db.query(Match)
                .filter(Match.commence_time > now)
                .filter(Match.commence_time <= alert_window_end)
                .all()
            )

            if not matches:
                return {"alerts_sent": 0, "matches_checked": 0}

            alerts_sent = 0

            for match in matches:
                time_to_ko = match.commence_time - now
                minutes_to_ko = int(time_to_ko.total_seconds() / 60)

                # Per-league overrides: WC uses a 24-hour window at 3.5pp.
                # Other leagues stick to the 4.0pp / 960-min defaults.
                league_window = window_for(match.sport_key)
                league_threshold = threshold_for(match.sport_key)

                # Baseline = first snapshot inside the per-league pre-KO
                # window. WC = 24 hours; everything else = 16 hours.
                window_start = match.commence_time - timedelta(minutes=league_window)

                # Skip this match if it sits outside its own league's
                # window. The DB query already bounded by the widest
                # window across all leagues; this is the per-league trim.
                if minutes_to_ko > league_window:
                    continue

                # Each match gets its own try/except: an unhandled
                # exception checking one match's markets (e.g. a bad
                # snapshot, a bug in one of the three market checks)
                # used to propagate out of the whole loop and abort
                # every other match's check for this cycle silently
                # (only a swallowed logger.error, nothing surfaced) —
                # see the France v Spain 2026-07-14 post-mortem. Not
                # calling db.rollback() here: that would also discard
                # SyndicateAlert rows already added-but-uncommitted for
                # earlier matches this cycle; the final db.commit()
                # below persists whatever succeeded.
                try:
                    # 1X2 only — Totals/Spreads checks disabled per Neil's
                    # call (see check_and_alert's docstring).
                    alerts_sent += await self._check_1x2_market(
                        db, match, window_start, minutes_to_ko, league_threshold
                    )
                except Exception as e:
                    logger.error(
                        "Error checking syndicate alerts for match (other matches still checked)",
                        match_id=match.id,
                        match=f"{match.home_team} vs {match.away_team}",
                        error=str(e),
                    )
                    continue

            db.commit()
            return {"alerts_sent": alerts_sent, "matches_checked": len(matches)}

        except Exception as e:
            db.rollback()
            logger.error("Error checking syndicate alerts", error=str(e))
            return {"alerts_sent": 0, "error": str(e)}
        finally:
            db.close()

    async def _check_1x2_market(
        self,
        db: Session,
        match: Match,
        window_start: datetime,
        minutes_to_ko: int,
        threshold: float = SYNDICATE_THRESHOLD_PROB_POINTS,
    ) -> int:
        """Check 1X2 market for syndicate moves."""
        # Pinnacle only — these thresholds are calibrated against
        # Pinnacle's price behavior specifically. Betfair Exchange rows
        # (the fallback source for matches Pinnacle doesn't cover) are
        # excluded so a real-money-relevant Telegram/tweet alert never
        # fires on an unvalidated source.
        baseline = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id, OddsSnapshot.bookmaker == "pinnacle")
            .filter(OddsSnapshot.fetched_at >= window_start)
            .order_by(OddsSnapshot.fetched_at.asc())
            .first()
        )

        latest = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id, OddsSnapshot.bookmaker == "pinnacle")
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )

        if not baseline or not latest or baseline.id == latest.id:
            return 0

        alerts_sent = 0
        outcomes = [
            ('home', 'H', match.home_team, baseline.home_odds, latest.home_odds),
            ('draw', 'D', 'Draw', baseline.draw_odds, latest.draw_odds),
            ('away', 'A', match.away_team, baseline.away_odds, latest.away_odds),
        ]

        for outcome, label, name, baseline_odds, curr_odds in outcomes:
            if baseline_odds and curr_odds and baseline_odds > 0 and curr_odds > 0:
                prob_move = prob_movement(baseline_odds, curr_odds)

                # Only shortening odds (positive prob_move = probability increased)
                if prob_move >= threshold:
                    sent = await self._send_alert_if_new(
                        db, match, '1x2', outcome, label, name,
                        baseline_odds, curr_odds, prob_move, minutes_to_ko
                    )
                    if sent:
                        alerts_sent += 1

        return alerts_sent

    async def _check_totals_market(  # noqa: D401
        self,
        db: Session,
        match: Match,
        window_start: datetime,
        minutes_to_ko: int,
        threshold: float = SYNDICATE_THRESHOLD_PROB_POINTS,
    ) -> int:
        """Check Totals market for syndicate moves.

        Baseline = first snapshot in the alert window; latest = most
        recent snapshot overall, regardless of line — same pattern as
        _check_1x2_market. This used to pin to the opening line, on the
        assumption that alternate_totals kept that line's shadow price
        updating even as the headline line moved. We confirmed
        alternate_totals returns 422 on our Odds API plan — we only ever
        store the CURRENT main line per fetch, so once Pinnacle moved
        the line off the opening value, no new snapshots at that line
        ever arrived again and the comparison silently went stale
        forever (baseline == latest-at-opening-line, zero movement,
        no alert — even when a large real move happened on the new
        line). Comparing raw odds across a line change is an
        approximation (Over @ 2.75 and Over @ 2.5 aren't identical
        bets), but it's a far better approximation than never detecting
        the move at all, and matches how a bettor actually experiences
        the price shifting.
        """
        baseline = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.fetched_at >= window_start)
            .order_by(TotalsSnapshot.fetched_at.asc())
            .first()
        )

        latest = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .order_by(TotalsSnapshot.fetched_at.desc())
            .first()
        )

        if not baseline or not latest or baseline.id == latest.id:
            return 0

        alerts_sent = 0
        line = latest.line
        outcomes = [
            ('over', 'O', f'O {line}', baseline.over_odds, latest.over_odds),
            ('under', 'U', f'U {line}', baseline.under_odds, latest.under_odds),
        ]

        for outcome, label, name, baseline_odds, curr_odds in outcomes:
            if baseline_odds and curr_odds and baseline_odds > 0 and curr_odds > 0:
                prob_move = prob_movement(baseline_odds, curr_odds)

                if prob_move >= threshold:
                    sent = await self._send_alert_if_new(
                        db, match, 'totals', outcome, label, name,
                        baseline_odds, curr_odds, prob_move, minutes_to_ko,
                        line=line,
                    )
                    if sent:
                        alerts_sent += 1

        return alerts_sent

    async def _check_spreads_market(
        self,
        db: Session,
        match: Match,
        window_start: datetime,
        minutes_to_ko: int,
        threshold: float = SYNDICATE_THRESHOLD_PROB_POINTS,
    ) -> int:
        """Check Spreads (Asian Handicap) market for syndicate moves.

        Baseline = first snapshot in the alert window; latest = most
        recent snapshot overall, regardless of line. Used to skip the
        match entirely if the handicap line had moved at all within the
        window — but AH lines shift often (we've seen a single WC match
        move 10+ times in 3 days), so that guard meant the alerter went
        blind on most matches the moment the line first moved, the same
        bug _check_totals_market had. Comparing raw odds across a line
        change is an approximation, but it's a far better one than never
        detecting the move at all.
        """
        baseline = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == match.id)
            .filter(SpreadsSnapshot.fetched_at >= window_start)
            .order_by(SpreadsSnapshot.fetched_at.asc())
            .first()
        )

        latest = (
            db.query(SpreadsSnapshot)
            .filter(SpreadsSnapshot.match_id == match.id)
            .order_by(SpreadsSnapshot.fetched_at.desc())
            .first()
        )

        if not baseline or not latest or baseline.id == latest.id:
            return 0

        alerts_sent = 0
        line = latest.line
        line_str = f"+{line}" if line > 0 else str(line)

        outcomes = [
            ('home_spread', 'AH', f'AH {line_str} ({match.home_team})', baseline.home_odds, latest.home_odds),
            ('away_spread', 'AH', f'AH {-line if line else 0:+g} ({match.away_team})', baseline.away_odds, latest.away_odds),
        ]

        for outcome, label, name, baseline_odds, curr_odds in outcomes:
            if baseline_odds and curr_odds and baseline_odds > 0 and curr_odds > 0:
                prob_move = prob_movement(baseline_odds, curr_odds)

                if prob_move >= threshold:
                    sent = await self._send_alert_if_new(
                        db, match, 'spreads', outcome, label, name,
                        baseline_odds, curr_odds, prob_move, minutes_to_ko,
                        line=line,
                    )
                    if sent:
                        alerts_sent += 1

        return alerts_sent

    async def _send_alert_if_new(
        self,
        db: Session,
        match: Match,
        market: str,
        outcome: str,
        outcome_label: str,
        outcome_name: str,
        opening_odds: float,
        current_odds: float,
        prob_change: float,
        minutes_to_ko: int,
        line: float | None = None,
    ) -> bool:
        """Send alert if we haven't already alerted for this match/market/outcome."""
        # Check if already alerted
        existing = (
            db.query(SyndicateAlert)
            .filter(SyndicateAlert.match_id == match.id)
            .filter(SyndicateAlert.market == market)
            .filter(SyndicateAlert.outcome == outcome)
            .first()
        )

        if existing:
            return False

        # Look up the best price for this outcome across all bookmakers.
        # Best-effort — if it fails, the alert still goes out without it.
        best_price_info = None
        try:
            from app.services.best_price_lookup import find_best_alternative_price
            best_price_info = await find_best_alternative_price(
                sport_key=match.sport_key,
                event_id=match.id,
                market=market,  # type: ignore[arg-type]
                outcome=outcome,
                home_team=match.home_team,
                away_team=match.away_team,
                line=line,
                pinnacle_price=current_odds,
            )
        except Exception as e:
            logger.warning("best-price lookup crashed", error=str(e))

        # Send Telegram alert. The 🔥 emoji ('high conviction') is added
        # to the message header when the move landed at odds at/above
        # SYNDICATE_FIRE_TIER_ODDS — the cohort where the data shows the
        # strongest +ROI inside the alert set.
        high_conviction = current_odds >= SYNDICATE_FIRE_TIER_ODDS
        success = await telegram_notifier.send_syndicate_alert(
            home_team=match.home_team,
            away_team=match.away_team,
            outcome_name=outcome_name,
            outcome_type=outcome_label,
            current_odds=current_odds,
            prob_change=prob_change,
            minutes_to_kickoff=minutes_to_ko,
            market=market,
            best_price=best_price_info,
            high_conviction=high_conviction,
        )

        if success:
            # Record that we sent this alert (store implied prob change)
            alert = SyndicateAlert(
                match_id=match.id,
                market=market,
                outcome=outcome,
                movement_percent=prob_change,
                odds_at_alert=current_odds
            )
            db.add(alert)

            logger.info(
                "Syndicate alert sent",
                match=f"{match.home_team} vs {match.away_team}",
                market=market,
                outcome=outcome_name,
                prob_change=f"{prob_change:.1f}pp"
            )

            # ALSO post a tweet — once per match. The post_late_steam_tweet
            # helper dedups on (match, 'late_steam') so subsequent Telegram
            # alerts on the same match for different outcomes add no new
            # tweets. Wrapped so a Twitter failure never poisons the
            # Telegram alert path.
            try:
                from app.services.tweet_generator import post_late_steam_tweet
                post_late_steam_tweet(
                    db, match, outcome_name, opening_odds, current_odds, prob_change, minutes_to_ko
                )
            except Exception as e:
                logger.warning(
                    "Steam tweet failed (Telegram alert still went)",
                    error=str(e),
                )
            return True

        return False


# Singleton instance
syndicate_alerter = SyndicateAlerter()
