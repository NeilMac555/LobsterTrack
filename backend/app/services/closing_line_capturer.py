import structlog
from datetime import datetime, timedelta
from sqlalchemy import and_

from app.models import Match, OddsSnapshot, TotalsSnapshot, SpreadsSnapshot
from app.models.closing_line import ClosingLine, MarketType
from app.models.database import SessionLocal

logger = structlog.get_logger()


class ClosingLineCapturer:
    """
    Captures closing lines for matches whose kickoff has passed.
    For each match, finds the last pre-kickoff odds snapshot and saves it
    as the closing line. Runs for all three markets: 1x2, asian_handicap, totals.
    """

    async def capture_closing_lines(self) -> dict:
        """
        Check all matches where kickoff has passed and capture closing lines
        if we don't already have them stored.
        """
        summary = {
            "matches_checked": 0,
            "closing_lines_captured": 0,
            "by_market": {"1x2": 0, "asian_handicap": 0, "totals": 0},
            "errors": []
        }

        db = SessionLocal()
        try:
            now = datetime.utcnow()

            # Find matches where kickoff has passed but we might be missing closing lines.
            # Look back up to 7 days to catch any we missed.
            # Only process matches that have at least some odds data.
            recent_past_matches = (
                db.query(Match)
                .filter(Match.commence_time <= now)
                .filter(Match.commence_time >= now - timedelta(days=7))
                .all()
            )

            if not recent_past_matches:
                logger.debug("No recent past matches to process for closing lines")
                return summary

            for match in recent_past_matches:
                summary["matches_checked"] += 1

                try:
                    # Capture 1x2 closing line
                    captured = self._capture_1x2(db, match)
                    if captured:
                        summary["closing_lines_captured"] += 1
                        summary["by_market"]["1x2"] += 1

                    # Capture Asian Handicap closing line
                    captured = self._capture_asian_handicap(db, match)
                    if captured:
                        summary["closing_lines_captured"] += 1
                        summary["by_market"]["asian_handicap"] += 1

                    # Capture Totals closing line
                    captured = self._capture_totals(db, match)
                    if captured:
                        summary["closing_lines_captured"] += 1
                        summary["by_market"]["totals"] += 1

                except Exception as e:
                    error_msg = f"Error capturing closing line for {match.home_team} vs {match.away_team}: {e}"
                    logger.error(error_msg)
                    summary["errors"].append(error_msg)

            db.commit()

            if summary["closing_lines_captured"] > 0:
                logger.info(
                    "Closing lines captured",
                    total=summary["closing_lines_captured"],
                    h2h=summary["by_market"]["1x2"],
                    asian_handicap=summary["by_market"]["asian_handicap"],
                    totals=summary["by_market"]["totals"],
                    matches_checked=summary["matches_checked"]
                )

        except Exception as e:
            logger.error("Closing line capture failed", error=str(e))
            summary["errors"].append(str(e))
            db.rollback()
        finally:
            db.close()

        return summary

    def _capture_1x2(self, db, match: Match) -> bool:
        """Capture 1x2 closing line for a match. Returns True if newly captured."""
        # Check if we already have this closing line
        existing = (
            db.query(ClosingLine)
            .filter(
                and_(
                    ClosingLine.match_id == match.id,
                    ClosingLine.market_type == MarketType.H2H
                )
            )
            .first()
        )
        if existing:
            return False

        # Get the last odds snapshot BEFORE kickoff
        last_snapshot = (
            db.query(OddsSnapshot)
            .filter(
                and_(
                    OddsSnapshot.match_id == match.id,
                    OddsSnapshot.fetched_at < match.commence_time
                )
            )
            .order_by(OddsSnapshot.fetched_at.desc())
            .first()
        )

        if not last_snapshot:
            return False

        # Need at least home and away odds to be meaningful
        if not last_snapshot.home_odds or not last_snapshot.away_odds:
            return False

        minutes_before = int(
            (match.commence_time - last_snapshot.fetched_at).total_seconds() / 60
        )

        closing_line = ClosingLine(
            match_id=match.id,
            league=match.sport_key,
            home_team=match.home_team,
            away_team=match.away_team,
            kickoff_time=match.commence_time,
            market_type=MarketType.H2H,
            close_home=last_snapshot.home_odds,
            close_draw=last_snapshot.draw_odds,
            close_away=last_snapshot.away_odds,
            captured_at=last_snapshot.fetched_at,
            minutes_before_kickoff=minutes_before,
        )
        db.add(closing_line)

        logger.info(
            "Captured 1x2 closing line",
            match=f"{match.home_team} vs {match.away_team}",
            home=last_snapshot.home_odds,
            draw=last_snapshot.draw_odds,
            away=last_snapshot.away_odds,
            minutes_before=minutes_before,
        )
        return True

    def _capture_asian_handicap(self, db, match: Match) -> bool:
        """Capture Asian Handicap closing line for a match. Returns True if newly captured."""
        existing = (
            db.query(ClosingLine)
            .filter(
                and_(
                    ClosingLine.match_id == match.id,
                    ClosingLine.market_type == MarketType.ASIAN_HANDICAP
                )
            )
            .first()
        )
        if existing:
            return False

        last_snapshot = (
            db.query(SpreadsSnapshot)
            .filter(
                and_(
                    SpreadsSnapshot.match_id == match.id,
                    SpreadsSnapshot.fetched_at < match.commence_time
                )
            )
            .order_by(SpreadsSnapshot.fetched_at.desc())
            .first()
        )

        if not last_snapshot:
            return False

        if not last_snapshot.home_odds or not last_snapshot.away_odds:
            return False

        minutes_before = int(
            (match.commence_time - last_snapshot.fetched_at).total_seconds() / 60
        )

        closing_line = ClosingLine(
            match_id=match.id,
            league=match.sport_key,
            home_team=match.home_team,
            away_team=match.away_team,
            kickoff_time=match.commence_time,
            market_type=MarketType.ASIAN_HANDICAP,
            close_line=last_snapshot.line,
            close_home_price=last_snapshot.home_odds,
            close_away_price=last_snapshot.away_odds,
            captured_at=last_snapshot.fetched_at,
            minutes_before_kickoff=minutes_before,
        )
        db.add(closing_line)

        logger.info(
            "Captured AH closing line",
            match=f"{match.home_team} vs {match.away_team}",
            line=last_snapshot.line,
            home_price=last_snapshot.home_odds,
            away_price=last_snapshot.away_odds,
            minutes_before=minutes_before,
        )
        return True

    def _capture_totals(self, db, match: Match) -> bool:
        """Capture Totals closing line for a match. Returns True if newly captured."""
        existing = (
            db.query(ClosingLine)
            .filter(
                and_(
                    ClosingLine.match_id == match.id,
                    ClosingLine.market_type == MarketType.TOTALS
                )
            )
            .first()
        )
        if existing:
            return False

        last_snapshot = (
            db.query(TotalsSnapshot)
            .filter(
                and_(
                    TotalsSnapshot.match_id == match.id,
                    TotalsSnapshot.fetched_at < match.commence_time
                )
            )
            .order_by(TotalsSnapshot.fetched_at.desc())
            .first()
        )

        if not last_snapshot:
            return False

        if not last_snapshot.over_odds or not last_snapshot.under_odds:
            return False

        minutes_before = int(
            (match.commence_time - last_snapshot.fetched_at).total_seconds() / 60
        )

        closing_line = ClosingLine(
            match_id=match.id,
            league=match.sport_key,
            home_team=match.home_team,
            away_team=match.away_team,
            kickoff_time=match.commence_time,
            market_type=MarketType.TOTALS,
            close_line=last_snapshot.line,
            close_over_price=last_snapshot.over_odds,
            close_under_price=last_snapshot.under_odds,
            captured_at=last_snapshot.fetched_at,
            minutes_before_kickoff=minutes_before,
        )
        db.add(closing_line)

        logger.info(
            "Captured totals closing line",
            match=f"{match.home_team} vs {match.away_team}",
            line=last_snapshot.line,
            over=last_snapshot.over_odds,
            under=last_snapshot.under_odds,
            minutes_before=minutes_before,
        )
        return True


# Singleton instance
closing_line_capturer = ClosingLineCapturer()
