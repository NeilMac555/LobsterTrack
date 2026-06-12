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
#   - Loosened back to 4.0pp + T-90 in May 2026 (Neil's call) to
#     restore alert volume. Backtest: ~+5.8% ROI on 407 alerts.
#
# Recording threshold in odds_fetcher.py stays at 3.0pp / T-2h so we
# retain a broader archive for future re-tuning.
SYNDICATE_THRESHOLD_PROB_POINTS = 4.0

# Time-to-kickoff window for alerts. Only fire alerts when the match is
# within this many minutes of KO.
SYNDICATE_ALERT_WINDOW_MINUTES = 90

# Odds threshold above which an alert is tagged as 'high conviction' with
# a 🔥 emoji in the Telegram message. Cohort analysis showed steam moves
# landing at odds ≥ 4.00 carry meaningfully more signal than moves
# inside the favourite/coinflip range — sharp money rarely follows a
# heavy dog without a real informational edge.
SYNDICATE_FIRE_TIER_ODDS = 4.0

# Per-league override layer. When a sport_key has an entry here we use
# its threshold/window in place of the defaults above. World Cup runs
# with a lower threshold (3.5pp) and a wider window (180 minutes)
# because the international markets move more slowly than club
# fixtures — by the time a domestic-tight 4pp/90min trigger fires on
# a WC game, the move is usually already public. Tournaments are also
# the moment we most want to be over-alerting rather than under.
LEAGUE_OVERRIDES: dict[str, dict[str, float]] = {
    "soccer_fifa_world_cup": {
        "threshold_pp": 3.5,
        "window_minutes": 180.0,
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
        Check all matches within 3 hours of kickoff for syndicate moves.
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
                window_start = match.commence_time - timedelta(hours=3)
                time_to_ko = match.commence_time - now
                minutes_to_ko = int(time_to_ko.total_seconds() / 60)

                # Per-league overrides: WC fires earlier (T-180) at a
                # lower 3.5pp threshold; other leagues stick to the
                # 4pp / T-90 defaults.
                league_window = window_for(match.sport_key)
                league_threshold = threshold_for(match.sport_key)

                # Skip this match if it sits outside its own league's
                # window. The DB query already bounded by the widest
                # window across all leagues; this is the per-league trim.
                if minutes_to_ko > league_window:
                    continue

                # Check 1X2 market
                alerts_sent += await self._check_1x2_market(
                    db, match, window_start, minutes_to_ko, league_threshold
                )

                # Check Totals market (only same-line comparisons)
                alerts_sent += await self._check_totals_market(
                    db, match, window_start, minutes_to_ko, league_threshold
                )

                # Check Spreads / Asian Handicap market (only same-line comparisons)
                alerts_sent += await self._check_spreads_market(
                    db, match, window_start, minutes_to_ko, league_threshold
                )

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
        baseline = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
            .filter(OddsSnapshot.fetched_at >= window_start)
            .order_by(OddsSnapshot.fetched_at.asc())
            .first()
        )

        latest = (
            db.query(OddsSnapshot)
            .filter(OddsSnapshot.match_id == match.id)
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
                        curr_odds, prob_move, minutes_to_ko
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
        """Check Totals market for syndicate moves on the OPENING line.

        With alternate_totals we store many lines per fetch, so we pin the
        comparison to the opening line — that way the market's main line
        drifting (e.g. 2.5 -> 3.0) doesn't silence alerts, and we still
        compare like-for-like odds.
        """
        opening = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .order_by(TotalsSnapshot.fetched_at.asc(), TotalsSnapshot.id.asc())
            .first()
        )
        if not opening:
            return 0

        opening_line = opening.line

        baseline = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.line == opening_line)
            .filter(TotalsSnapshot.fetched_at >= window_start)
            .order_by(TotalsSnapshot.fetched_at.asc())
            .first()
        )

        latest = (
            db.query(TotalsSnapshot)
            .filter(TotalsSnapshot.match_id == match.id)
            .filter(TotalsSnapshot.line == opening_line)
            .order_by(TotalsSnapshot.fetched_at.desc())
            .first()
        )

        if not baseline or not latest or baseline.id == latest.id:
            return 0

        alerts_sent = 0
        line = baseline.line
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
                        curr_odds, prob_move, minutes_to_ko,
                        line=opening_line,
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
        """Check Spreads (Asian Handicap) market for syndicate moves. Only compares when line hasn't changed."""
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

        # Skip if the handicap line has moved (e.g. -1.25 -> -1.75) — only compare same-line odds
        if baseline.line != latest.line:
            return 0

        alerts_sent = 0
        line = baseline.line
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
                        curr_odds, prob_move, minutes_to_ko,
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
            return True

        return False


# Singleton instance
syndicate_alerter = SyndicateAlerter()
