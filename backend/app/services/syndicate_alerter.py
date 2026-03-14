import structlog
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.models import Match, OddsSnapshot, TotalsSnapshot, SpreadsSnapshot, SyndicateAlert
from app.models.database import SessionLocal
from app.services.telegram_notifier import telegram_notifier

logger = structlog.get_logger()

# Alert threshold: minimum implied probability shift (in percentage points)
# e.g. 3.0 means odds must move enough to shift implied prob by 3+ points
SYNDICATE_THRESHOLD_PROB_POINTS = 3.0


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
            three_hours_from_now = now + timedelta(hours=3)

            # Get matches kicking off within 3 hours
            matches = (
                db.query(Match)
                .filter(Match.commence_time > now)
                .filter(Match.commence_time <= three_hours_from_now)
                .all()
            )

            if not matches:
                return {"alerts_sent": 0, "matches_checked": 0}

            alerts_sent = 0

            for match in matches:
                window_start = match.commence_time - timedelta(hours=3)
                time_to_ko = match.commence_time - now
                minutes_to_ko = int(time_to_ko.total_seconds() / 60)

                # Check 1X2 market
                alerts_sent += await self._check_1x2_market(
                    db, match, window_start, minutes_to_ko
                )

                # Check Totals market — disabled for now (line changes cause noise)
                # alerts_sent += await self._check_totals_market(
                #     db, match, window_start, minutes_to_ko
                # )

                # Check Spreads market — disabled for now (line changes cause noise)
                # alerts_sent += await self._check_spreads_market(
                #     db, match, window_start, minutes_to_ko
                # )

            db.commit()
            return {"alerts_sent": alerts_sent, "matches_checked": len(matches)}

        except Exception as e:
            db.rollback()
            logger.error("Error checking syndicate alerts", error=str(e))
            return {"alerts_sent": 0, "error": str(e)}
        finally:
            db.close()

    async def _check_1x2_market(
        self, db: Session, match: Match, window_start: datetime, minutes_to_ko: int
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
                if prob_move >= SYNDICATE_THRESHOLD_PROB_POINTS:
                    sent = await self._send_alert_if_new(
                        db, match, '1x2', outcome, label, name,
                        curr_odds, prob_move, minutes_to_ko
                    )
                    if sent:
                        alerts_sent += 1

        return alerts_sent

    async def _check_totals_market(
        self, db: Session, match: Match, window_start: datetime, minutes_to_ko: int
    ) -> int:
        """Check Totals market for syndicate moves."""
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
        line = baseline.line
        outcomes = [
            ('over', 'O', f'O {line}', baseline.over_odds, latest.over_odds),
            ('under', 'U', f'U {line}', baseline.under_odds, latest.under_odds),
        ]

        for outcome, label, name, baseline_odds, curr_odds in outcomes:
            if baseline_odds and curr_odds and baseline_odds > 0 and curr_odds > 0:
                prob_move = prob_movement(baseline_odds, curr_odds)

                if prob_move >= SYNDICATE_THRESHOLD_PROB_POINTS:
                    sent = await self._send_alert_if_new(
                        db, match, 'totals', outcome, label, name,
                        curr_odds, prob_move, minutes_to_ko
                    )
                    if sent:
                        alerts_sent += 1

        return alerts_sent

    async def _check_spreads_market(
        self, db: Session, match: Match, window_start: datetime, minutes_to_ko: int
    ) -> int:
        """Check Spreads (Asian Handicap) market for syndicate moves."""
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
        line = baseline.line
        line_str = f"+{line}" if line > 0 else str(line)

        outcomes = [
            ('home_spread', 'AH', f'AH {line_str} ({match.home_team})', baseline.home_odds, latest.home_odds),
            ('away_spread', 'AH', f'AH {-line if line else 0:+g} ({match.away_team})', baseline.away_odds, latest.away_odds),
        ]

        for outcome, label, name, baseline_odds, curr_odds in outcomes:
            if baseline_odds and curr_odds and baseline_odds > 0 and curr_odds > 0:
                prob_move = prob_movement(baseline_odds, curr_odds)

                if prob_move >= SYNDICATE_THRESHOLD_PROB_POINTS:
                    sent = await self._send_alert_if_new(
                        db, match, 'spreads', outcome, label, name,
                        curr_odds, prob_move, minutes_to_ko
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
        minutes_to_ko: int
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

        # Send Telegram alert
        success = await telegram_notifier.send_syndicate_alert(
            home_team=match.home_team,
            away_team=match.away_team,
            outcome_name=outcome_name,
            outcome_type=outcome_label,
            current_odds=current_odds,
            prob_change=prob_change,
            minutes_to_kickoff=minutes_to_ko,
            market=market
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
