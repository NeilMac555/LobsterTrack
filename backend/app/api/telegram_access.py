"""Pro-only access to the private Telegram alerts channel.

How it fits together:
  1. An active subscriber asks for a link (POST /pro/telegram-invite) and
     gets a one-use invite, named after their user id, that expires in an
     hour.
  2. When someone joins through it, Telegram tells the webhook which
     Telegram account used which link, and we store the pairing.
  3. A sweep every few minutes removes anyone whose subscription is no
     longer active.

The bot must be an admin of the channel with the rights to invite users
and to ban users. A member added by hand inside Telegram has no pairing,
so the sweep cannot see them.
"""
import hashlib
import hmac
import time

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.api.deps import require_user
from app.config import get_settings
from app.models import Subscription, TelegramMember, User, get_db
from app.models.database import SessionLocal

router = APIRouter()
logger = structlog.get_logger()

INVITE_TTL_SECONDS = 3600
LINK_PREFIX = "user "
WEBHOOK_URL = "https://www.steamwatch.io/api/telegram/webhook"


def webhook_secret() -> str:
    """Derived from the JWT secret so there is no extra variable to set."""
    return hashlib.sha256(f"telegram-webhook:{get_settings().jwt_secret}".encode()).hexdigest()[:48]


async def bot(method: str, **params) -> dict:
    s = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(f"https://api.telegram.org/bot{s.telegram_bot_token}/{method}", json=params)
    return r.json()


def configured() -> bool:
    s = get_settings()
    return bool(s.telegram_bot_token and s.telegram_channel_id)


async def remove_from_channel(telegram_user_id: int) -> bool:
    """Ban then unban: removes them now, and lets them rejoin with a new link later."""
    chat = get_settings().telegram_channel_id
    banned = await bot("banChatMember", chat_id=chat, user_id=telegram_user_id)
    if not banned.get("ok"):
        logger.error("Telegram removal failed", telegram_user_id=telegram_user_id, response=banned.get("description"))
        return False
    await bot("unbanChatMember", chat_id=chat, user_id=telegram_user_id, only_if_banned=True)
    return True


@router.post("/pro/telegram-invite")
async def telegram_invite(response: Response, user: User = Depends(require_user)):
    response.headers["Cache-Control"] = "private, no-store"
    if not user.subscription or user.subscription.status != "active":
        raise HTTPException(403, "The alerts channel is for SteamWatch Pro members.")
    if not configured():
        raise HTTPException(503, "Telegram is not set up.")

    try:
        data = await bot(
            "createChatInviteLink",
            chat_id=get_settings().telegram_channel_id,
            name=f"{LINK_PREFIX}{user.id}",
            member_limit=1,
            expire_date=int(time.time()) + INVITE_TTL_SECONDS,
        )
    except Exception as e:
        logger.error("Telegram invite request failed", user_id=user.id, error=str(e))
        raise HTTPException(502, "Could not reach Telegram. Try again in a minute.") from e

    link = (data.get("result") or {}).get("invite_link")
    if not data.get("ok") or not link:
        logger.error("Telegram refused invite link", user_id=user.id, response=data.get("description"))
        raise HTTPException(502, "Telegram would not create an invite link.")

    logger.info("Telegram invite issued", user_id=user.id)
    return {"invite_link": link, "expires_in_minutes": INVITE_TTL_SECONDS // 60}


@router.post("/telegram/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str | None = Header(None),
    db: Session = Depends(get_db),
):
    if not hmac.compare_digest(x_telegram_bot_api_secret_token or "", webhook_secret()):
        raise HTTPException(403, "Forbidden")
    try:
        await record_membership_change(db, await request.json())
    except Exception as e:
        # Always answer 200: Telegram retries anything else for hours.
        db.rollback()
        logger.error("Telegram webhook handling failed", error=str(e))
    return {"ok": True}


async def record_membership_change(db: Session, update: dict) -> str:
    change = update.get("chat_member")
    if not change or str(change.get("chat", {}).get("id")) != str(get_settings().telegram_channel_id):
        return "ignored"
    member = change.get("new_chat_member") or {}
    telegram_id = (member.get("user") or {}).get("id")
    status = member.get("status")
    if not telegram_id:
        return "ignored"

    if status in ("left", "kicked"):
        db.query(TelegramMember).filter(TelegramMember.telegram_user_id == telegram_id).delete()
        db.commit()
        return "left"

    name = (change.get("invite_link") or {}).get("name") or ""
    if status != "member" or not name.startswith(LINK_PREFIX) or not name[len(LINK_PREFIX):].isdigit():
        return "ignored"
    user_id = int(name[len(LINK_PREFIX):])
    if not db.query(User.id).filter(User.id == user_id).first():
        return "ignored"

    row = db.query(TelegramMember).filter(TelegramMember.user_id == user_id).first()
    previous = row.telegram_user_id if row else None
    if row:
        row.telegram_user_id = telegram_id
    else:
        db.add(TelegramMember(user_id=user_id, telegram_user_id=telegram_id))
    db.commit()
    logger.info("Telegram member linked", user_id=user_id)

    # One seat per subscription: a second Telegram account joining on the
    # same subscription replaces the first.
    if previous and previous != telegram_id:
        await remove_from_channel(previous)
    return "joined"


async def remove_lapsed_members() -> dict:
    """Remove every linked member whose subscription is not active."""
    if not configured():
        return {"removed": 0, "skipped": "not_configured"}
    db = SessionLocal()
    removed = failed = 0
    try:
        lapsed = (
            db.query(TelegramMember)
            .outerjoin(Subscription, Subscription.user_id == TelegramMember.user_id)
            .filter((Subscription.id.is_(None)) | (Subscription.status != "active"))
            .all()
        )
        for row in lapsed:
            try:
                ok = await remove_from_channel(row.telegram_user_id)
            except Exception as e:
                logger.error("Telegram removal errored", user_id=row.user_id, error=str(e))
                ok = False
            if ok:
                logger.info("Telegram member removed (subscription not active)", user_id=row.user_id)
                db.delete(row)
                removed += 1
            else:
                failed += 1
        db.commit()
        return {"removed": removed, "failed": failed}
    finally:
        db.close()


@router.get("/admin/telegram-channel")
async def telegram_channel_admin(
    password: str = Query(..., description="Admin password"),
    set_webhook: bool = Query(False, description="Point the bot's updates at this site"),
    db: Session = Depends(get_db),
):
    """Admin check of the channel wiring. With set_webhook=true, also registers the webhook."""
    from app.api.routes import ADMIN_PASSWORD
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    if not configured():
        return {"configured": False}

    out: dict = {"configured": True}
    if set_webhook:
        out["set_webhook"] = await bot(
            "setWebhook", url=WEBHOOK_URL, secret_token=webhook_secret(), allowed_updates=["chat_member"]
        )
    info = (await bot("getWebhookInfo")).get("result") or {}
    out["webhook"] = {k: info.get(k) for k in ("url", "pending_update_count", "last_error_message", "allowed_updates")}
    me = (await bot("getMe")).get("result") or {}
    chat = get_settings().telegram_channel_id
    rights = (await bot("getChatMember", chat_id=chat, user_id=me.get("id"))).get("result") or {}
    out["bot_in_channel"] = {k: rights.get(k) for k in ("status", "can_invite_users", "can_restrict_members")}
    out["channel"] = {k: ((await bot("getChat", chat_id=chat)).get("result") or {}).get(k) for k in ("title", "type")}
    out["linked_members"] = db.query(TelegramMember).count()
    return out


@router.post("/admin/email-broadcast")
async def email_broadcast(
    password: str = Query(..., description="Admin password"),
    campaign: str = Query(...),
    mode: str = Query("preview", description="preview (nothing sent), test (one copy to the admin address) or send"),
    db: Session = Depends(get_db),
):
    """Send an approved one-off email campaign. See services/member_broadcast."""
    from app.api.routes import ADMIN_PASSWORD
    from app.services.member_broadcast import run
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    return await run(db, campaign, mode)


_UNSUB_PAGE = (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\">"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>SteamWatch email preferences</title></head>"
    "<body style=\"font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#0d1418;color:#e2e8f0;"
    "max-width:480px;margin:80px auto;padding:0 20px;line-height:1.5;\"><h1 style=\"font-size:20px;\">{title}</h1>"
    "<p>{body}</p><p><a href=\"https://www.steamwatch.io\" style=\"color:#22d3ee;\">Back to SteamWatch</a></p></body></html>"
)


@router.api_route("/unsubscribe", methods=["GET", "POST"], include_in_schema=False)
def unsubscribe_email(r: str = Query(""), s: str = Query(""), db: Session = Depends(get_db)):
    """One-click opt-out from marketing email. GET is the link in the email;
    POST is what mail apps send for their own Unsubscribe button."""
    from app.services.member_broadcast import unsubscribe
    if unsubscribe(db, r, s):
        return HTMLResponse(_UNSUB_PAGE.format(
            title="You're unsubscribed",
            body="You won't get any more marketing emails from SteamWatch. Login links and payment receipts still arrive as normal."))
    return HTMLResponse(_UNSUB_PAGE.format(
        title="That link didn't work",
        body="Reply to the email you received and you'll be taken off the list by hand."), status_code=400)
