import httpx
import structlog

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


class EmailSender:
    def __init__(self):
        self.api_key = settings.resend_api_key
        self.from_address = settings.email_from
        self.frontend_url = settings.frontend_url

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def send_magic_link(self, to_email: str, token: str) -> bool:
        if not self.is_configured():
            logger.warning("Resend not configured, skipping magic link email")
            return False

        link = f"{self.frontend_url}/auth/verify?token={token}"
        html = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #1e293b;">Sign in to SteamWatch</h2>
            <p>Click the button below to sign in:</p>
            <a href="{link}"
               style="display: inline-block; background: #dc2626; color: white;
                      padding: 12px 24px; border-radius: 6px; text-decoration: none;
                      font-weight: 600;">
                Sign In
            </a>
            <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
                This link expires in {settings.magic_link_expiry_minutes} minutes.
                If you didn't request this, you can safely ignore this email.
            </p>
        </div>
        """

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": self.from_address,
                        "to": [to_email],
                        "subject": "Sign in to SteamWatch",
                        "html": html,
                    },
                )

                if response.status_code == 200:
                    logger.info("Magic link email sent", to=to_email)
                    return True
                else:
                    logger.error(
                        "Failed to send magic link email",
                        status=response.status_code,
                        response=response.text,
                    )
                    return False

        except Exception as e:
            logger.error("Error sending magic link email", error=str(e))
            return False


    async def send_welcome_pro(self, to_email: str) -> bool:
        """Send welcome email to new Pro subscribers."""
        if not self.is_configured():
            logger.warning("Resend not configured, skipping welcome email")
            return False

        html = """
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #1e293b;">
            <h2 style="color: #dc2626;">Welcome to SteamWatch Pro! 🚀</h2>
            <p>Thanks for subscribing — you now have full access to every tool on SteamWatch:</p>
            <ul style="line-height: 1.8;">
                <li><strong>Dixon-Coles Match Predictor</strong> — fair odds for every match</li>
                <li><strong>Rolling xG</strong> — track team form across Europe's top leagues</li>
                <li><strong>Steam Results & Syndicate Alerts</strong> — sharp money tracking</li>
                <li><strong>Closing Line Analysis</strong> — opening vs closing odds</li>
            </ul>
            <p>If you have any questions or feedback, reply directly to this email or reach out at
               <a href="mailto:neilmac@bookieinsiders.io" style="color: #dc2626;">neilmac@bookieinsiders.io</a>.</p>
            <p style="margin-top: 24px;">
                <a href="https://www.steamwatch.io"
                   style="display: inline-block; background: #dc2626; color: white;
                          padding: 12px 24px; border-radius: 6px; text-decoration: none;
                          font-weight: 600;">
                    Go to SteamWatch
                </a>
            </p>
            <p style="color: #64748b; font-size: 13px; margin-top: 32px;">
                — Neil Mac<br>
                <a href="https://x.com/NeilMac555" style="color: #64748b;">@NeilMac555</a> ·
                <a href="https://neilmac.substack.com" style="color: #64748b;">Substack</a> ·
                <a href="https://t.me/steamwatchalerts" style="color: #64748b;">Telegram</a>
            </p>
        </div>
        """

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": self.from_address,
                        "to": [to_email],
                        "reply_to": "neilmac@bookieinsiders.io",
                        "subject": "Welcome to SteamWatch Pro 🚀",
                        "html": html,
                    },
                )

                if response.status_code == 200:
                    logger.info("Welcome email sent", to=to_email)
                    return True
                else:
                    logger.error(
                        "Failed to send welcome email",
                        status=response.status_code,
                        response=response.text,
                    )
                    return False

        except Exception as e:
            logger.error("Error sending welcome email", error=str(e))
            return False


    async def send_admin_notification(self, subject: str, body: str) -> bool:
        """Send a private notification email to the admin (Neil). Never exposes user data publicly."""
        if not self.is_configured():
            logger.warning("Resend not configured, skipping admin notification")
            return False

        admin_email = settings.admin_notify_email
        if not admin_email:
            logger.warning("No admin email configured, skipping notification")
            return False

        html = f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #1e293b;">SteamWatch Admin Alert</h2>
            <pre style="background: #f1f5f9; padding: 16px; border-radius: 8px; font-size: 14px; white-space: pre-wrap;">{body}</pre>
            <p style="color: #64748b; font-size: 12px; margin-top: 24px;">This is a private admin notification from SteamWatch.</p>
        </div>
        """

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": self.from_address,
                        "to": [admin_email],
                        "subject": f"[SteamWatch] {subject}",
                        "html": html,
                    },
                )

                if response.status_code == 200:
                    logger.info("Admin notification sent", subject=subject)
                    return True
                else:
                    logger.error(
                        "Failed to send admin notification",
                        status=response.status_code,
                        response=response.text,
                    )
                    return False

        except Exception as e:
            logger.error("Error sending admin notification", error=str(e))
            return False


email_sender = EmailSender()
