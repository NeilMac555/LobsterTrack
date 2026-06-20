import httpx
import structlog
from datetime import datetime
from typing import Optional

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class TelegramNotifier:
    """
    Service to send Telegram notifications for Syndicate Moves.
    """

    def __init__(self):
        self.bot_token = settings.telegram_bot_token
        self.channel_id = settings.telegram_channel_id
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"

    def is_configured(self) -> bool:
        """Check if Telegram credentials are configured."""
        return bool(self.bot_token and self.channel_id)

    async def send_syndicate_alert(
        self,
        home_team: str,
        away_team: str,
        outcome_name: str,
        outcome_type: str,  # 'H', 'D', 'A', 'O', 'U', 'AH'
        current_odds: float,
        prob_change: float,
        minutes_to_kickoff: int,
        market: str = '1x2',
        best_price: Optional[dict] = None,
        high_conviction: bool = False,
    ) -> bool:
        """
        Send a Syndicate Move alert to Telegram channel.
        prob_change is the implied probability shift in percentage points.
        best_price is an optional {"price": float, "bookmaker": str} dict —
        when present, the alert tells subscribers where they can still get
        the OLD price.
        Returns True if sent successfully.
        """
        if not self.is_configured():
            logger.warning("Telegram not configured, skipping alert")
            return False

        # Format time to kickoff
        hours = minutes_to_kickoff // 60
        mins = minutes_to_kickoff % 60
        if hours > 0:
            time_str = f"{hours}h {mins}m"
        else:
            time_str = f"{mins}m"

        # Format market indicator
        if market == '1x2' or market == 'drift_1x2':
            market_label = outcome_type  # H, D, or A
        elif market == 'totals':
            market_label = outcome_type  # O or U
        else:
            market_label = "AH"

        # Best-price line — only included if a strictly higher price is
        # still available somewhere else.
        best_line = ""
        if best_price and best_price.get("price") is not None:
            try:
                bp = float(best_price["price"])
                book = best_price.get("bookmaker") or "?"
                best_line = f"\n💰 Best price: {bp:.2f} @ {book}"
            except (TypeError, ValueError):
                best_line = ""

        # Header + body shape depends on alert kind. Rapid-steam keeps
        # the original "LATE SHARP ACTION" framing with the down-arrow
        # (caller only sends positive prob_change). Cumulative-drift
        # alerts use a distinct header so subscribers can spot them at
        # a glance, an arrow that follows the actual direction of the
        # implied-prob move (drift can be bidirectional), and "since
        # open" instead of "in last 3h".
        is_drift = market == 'drift_1x2'
        if is_drift:
            arrow = "↑" if prob_change >= 0 else "↓"
            timeframe = "since open"
            header = "🐢 GRADUAL DRIFT"
        else:
            arrow = "↓"
            timeframe = "in last 3h"
            header = "🔥🚨 LATE SHARP ACTION" if high_conviction else "🚨 LATE SHARP ACTION"

        # Build message
        message = f"""{header}

{home_team} vs {away_team}
→ {outcome_name} ({market_label}) @ {current_odds:.2f}
{arrow} {abs(prob_change):.1f}pp implied prob {timeframe}{best_line}
⏱ Kickoff: {time_str}

steamwatch.io"""

        return await self._send_message(message)

    async def _send_message(self, text: str) -> bool:
        """Send a message to the Telegram channel."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{self.base_url}/sendMessage",
                    json={
                        "chat_id": self.channel_id,
                        "text": text,
                        "parse_mode": "HTML",
                        "disable_web_page_preview": True
                    }
                )

                if response.status_code == 200:
                    logger.info("Telegram alert sent successfully")
                    return True
                else:
                    logger.error(
                        "Failed to send Telegram alert",
                        status=response.status_code,
                        response=response.text
                    )
                    return False

        except Exception as e:
            logger.error("Error sending Telegram alert", error=str(e))
            return False

    async def test_connection(self) -> dict:
        """Test the Telegram bot connection."""
        if not self.is_configured():
            return {"success": False, "error": "Telegram not configured"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/getMe")

                if response.status_code == 200:
                    data = response.json()
                    return {
                        "success": True,
                        "bot_name": data.get("result", {}).get("username")
                    }
                else:
                    return {"success": False, "error": response.text}

        except Exception as e:
            return {"success": False, "error": str(e)}


# Singleton instance
telegram_notifier = TelegramNotifier()
