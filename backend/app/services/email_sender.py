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


email_sender = EmailSender()
