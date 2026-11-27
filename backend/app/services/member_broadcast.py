"""One-off emails to active Pro members.

Each campaign's wording lives here, approved by Neil before it is added.
Sending is admin-triggered (see /api/admin/email-pro-members) in three
modes: preview (who would get it, nothing sent), test (one copy to the
admin address) and send. Every accepted email is recorded in
email_broadcasts, so a campaign can be re-run after a failure without
emailing anyone twice.
"""
import asyncio
import html

import httpx
import structlog
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import EmailBroadcast, Subscription, User

logger = structlog.get_logger()
REPLY_TO = "neilmac@bookieinsiders.io"

CAMPAIGNS = {
    "pro-telegram-move-2026-11": {
        "subject": "Your SteamWatch alerts have moved",
        "blocks": [
            "Hi,",
            "Quick one. The SteamWatch steam alerts have moved to a new private Telegram channel for Pro members only, "
            "and you're already in as part of your subscription. Nothing extra to pay.",
            "We're improving the alerts as well as delivering better insights to Pro members, and the new channel is "
            "where all of that will land.",
            "To join:",
            ["Log in at https://www.steamwatch.io", "Click your account circle at the top right", "Click Join Telegram Alerts"],
            "That gives you your own link to the channel. It only works once and runs out after an hour, so if it "
            "expires just press the button again.",
            "The old free channel won't get any more alerts.",
            "Any problems, reply to this email or message me on X @NeilMac555.",
            "Neil",
        ],
    },
}


def _linked(text: str) -> str:
    escaped = html.escape(text)
    return escaped.replace("https://www.steamwatch.io", '<a href="https://www.steamwatch.io" style="color:#0e7490;">https://www.steamwatch.io</a>')


def render(campaign: str) -> tuple[str, str, str]:
    """(subject, html, plain text)"""
    c = CAMPAIGNS[campaign]
    parts, plain = [], []
    for block in c["blocks"]:
        if isinstance(block, list):
            parts.append("<ol style=\"margin:0 0 16px 20px;padding:0;\">" + "".join(f"<li style=\"margin-bottom:4px;\">{_linked(i)}</li>" for i in block) + "</ol>")
            plain.append("\n".join(f"{n}. {i}" for n, i in enumerate(block, 1)))
        else:
            parts.append(f"<p style=\"margin:0 0 16px;\">{_linked(block)}</p>")
            plain.append(block)
    body = ("<div style=\"font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;"
            "max-width:520px;margin:0 auto;\">" + "".join(parts) + "</div>")
    return c["subject"], body, "\n\n".join(plain)


def recipients(db: Session, campaign: str) -> list[User]:
    """Active subscribers who have not yet been sent this campaign."""
    done = {r[0] for r in db.query(EmailBroadcast.user_id).filter(EmailBroadcast.campaign == campaign).all()}
    users = (db.query(User).join(Subscription, Subscription.user_id == User.id)
             .filter(Subscription.status == "active").order_by(User.id).all())
    return [u for u in users if u.id not in done and u.email]


async def _send_one(client: httpx.AsyncClient, to: str, subject: str, body: str, text: str) -> tuple[bool, str]:
    s = get_settings()
    r = await client.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {s.resend_api_key}", "Content-Type": "application/json"},
        json={"from": s.email_from, "to": [to], "reply_to": REPLY_TO, "subject": subject, "html": body, "text": text},
    )
    return r.status_code == 200, f"HTTP {r.status_code}: {r.text[:160]}"


async def run(db: Session, campaign: str, mode: str) -> dict:
    if campaign not in CAMPAIGNS:
        return {"error": "unknown campaign"}
    s = get_settings()
    subject, body, text = render(campaign)
    todo = recipients(db, campaign)
    already = db.query(EmailBroadcast).filter(EmailBroadcast.campaign == campaign).count()
    out: dict = {"campaign": campaign, "mode": mode, "subject": subject, "to_send": len(todo), "already_sent": already}
    if mode == "preview":
        out["text"] = text
        return out
    if not s.resend_api_key:
        return {**out, "error": "email is not configured"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        if mode == "test":
            ok, detail = await _send_one(client, s.admin_notify_email, f"[TEST] {subject}", body, text)
            return {**out, "test_sent_to_admin": ok, "detail": None if ok else detail}
        if mode != "send":
            return {**out, "error": "mode must be preview, test or send"}
        sent, failed = 0, []
        for user in todo:
            try:
                ok, detail = await _send_one(client, user.email, subject, body, text)
            except Exception as e:
                ok, detail = False, str(e)
            if ok:
                db.add(EmailBroadcast(campaign=campaign, user_id=user.id))
                db.commit()   # per email: a crash part-way never causes a repeat
                sent += 1
            else:
                failed.append({"user_id": user.id, "detail": detail})
                logger.error("Broadcast email failed", campaign=campaign, user_id=user.id, detail=detail)
            await asyncio.sleep(0.6)   # stay under the provider's per-second limit
        logger.info("Broadcast finished", campaign=campaign, sent=sent, failed=len(failed))
        return {**out, "sent": sent, "failed": failed}
