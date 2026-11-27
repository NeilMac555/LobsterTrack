"""One-off emails to the people SteamWatch holds an address for.

Each campaign's wording and audience live here, approved by Neil before
being added. Sending is admin-triggered (/api/admin/email-broadcast) in
three modes: preview (counts and text, nothing sent), test (one copy to
the admin address) and send. Every accepted email is recorded in
email_broadcasts, so a campaign can be re-run after a failure without
emailing anyone twice.

Marketing campaigns carry a one-click unsubscribe link and skip anyone in
email_unsubscribes. The link identifies the recipient by a signed record
reference (u<user id> or s<subscriber id>), never by the address itself.
"""
import asyncio
import hashlib
import hmac
import html

import httpx
import structlog
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import EmailBroadcast, EmailSubscriber, EmailUnsubscribe, Subscription, User

logger = structlog.get_logger()
REPLY_TO = "neilmac@bookieinsiders.io"
SITE = "https://www.steamwatch.io"


def _offer(code: str) -> list:
    return [
        "Hi,",
        "The free SteamWatch Telegram channel has closed. Steam alerts now go to a private channel for Pro members, "
        "and we're improving the alerts as well as delivering better insights there.",
        "Pro is €19.99 a month and includes the alerts channel, the Match Predictor, Research Lab and Form Lab.",
        f"To mark the move, use code {code} at checkout for 50% off for life: {SITE}/pro",
        "Any questions, reply to this email or message me on X @NeilMac555.",
        "Neil",
    ]


# audience: "active" = active subscribers. "lapsed" = has a subscription
# record that is cancelled or inactive (may have paid before, so the code
# must not be first-time-only). "new" = an account with no subscription
# record, or a newsletter sign-up with no account. Members whose payment
# is failing (past_due) are in no audience: they still have a live
# subscription and a second one would double-bill them.
CAMPAIGNS = {
    "pro-telegram-move-2026-11": {
        "audience": "active",
        "marketing": False,
        "subject": "Your SteamWatch alerts have moved",
        "blocks": [
            "Hi,",
            "Quick one. The SteamWatch steam alerts have moved to a new private Telegram channel for Pro members only, "
            "and you're already in as part of your subscription. Nothing extra to pay.",
            "We're improving the alerts as well as delivering better insights to Pro members, and the new channel is "
            "where all of that will land.",
            "To join:",
            [f"Log in at {SITE}", "Click your account circle at the top right", "Click Join Telegram Alerts"],
            "That gives you your own link to the channel. It only works once and runs out after an hour, so if it "
            "expires just press the button again.",
            "The old free channel won't get any more alerts.",
            "Any problems, reply to this email or message me on X @NeilMac555.",
            "Neil",
        ],
    },
    "pro-offer-new-2026-11": {
        "audience": "new", "marketing": True,
        "subject": "SteamWatch alerts have moved to Pro", "blocks": _offer("STEAM50"),
    },
    "pro-offer-lapsed-2026-11": {
        "audience": "lapsed", "marketing": True,
        "subject": "SteamWatch alerts have moved to Pro", "blocks": _offer("COMEBACK50"),
    },
}


# ---- unsubscribe links -----------------------------------------------------
def unsubscribe_sig(ref: str) -> str:
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, f"unsubscribe:{ref}".encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_url(ref: str) -> str:
    return f"{SITE}/api/unsubscribe?r={ref}&s={unsubscribe_sig(ref)}"


def unsubscribe(db: Session, ref: str, sig: str) -> bool:
    """Record an opt-out. Returns False for a bad link."""
    if not ref or not hmac.compare_digest(sig or "", unsubscribe_sig(ref)) or not ref[1:].isdigit():
        return False
    model = {"u": User, "s": EmailSubscriber}.get(ref[0])
    row = db.query(model).filter(model.id == int(ref[1:])).first() if model else None
    if not row or not row.email:
        return False
    email = row.email.strip().lower()
    if not db.query(EmailUnsubscribe).filter(EmailUnsubscribe.email == email).first():
        db.add(EmailUnsubscribe(email=email))
        db.commit()
    return True


# ---- rendering --------------------------------------------------------------
def _linked(text: str) -> str:
    out = html.escape(text)
    for url in (f"{SITE}/pro", SITE):
        if url in out:
            return out.replace(url, f'<a href="{url}" style="color:#0e7490;">{url}</a>', 1)
    return out


def render(campaign: str, ref: str | None = None) -> tuple[str, str, str]:
    """(subject, html, plain text). ref adds the unsubscribe footer."""
    c = CAMPAIGNS[campaign]
    parts, plain = [], []
    for block in c["blocks"]:
        if isinstance(block, list):
            parts.append("<ol style=\"margin:0 0 16px 20px;padding:0;\">"
                         + "".join(f"<li style=\"margin-bottom:4px;\">{_linked(i)}</li>" for i in block) + "</ol>")
            plain.append("\n".join(f"{n}. {i}" for n, i in enumerate(block, 1)))
        else:
            parts.append(f"<p style=\"margin:0 0 16px;\">{_linked(block)}</p>")
            plain.append(block)
    if c["marketing"] and ref:
        url = unsubscribe_url(ref)
        parts.append("<p style=\"margin:24px 0 0;font-size:12px;color:#64748b;\">Don't want emails from SteamWatch? "
                     f"<a href=\"{html.escape(url)}\" style=\"color:#64748b;\">Unsubscribe here</a>.</p>")
        plain.append(f"Don't want emails from SteamWatch? Unsubscribe here: {url}")
    body = ("<div style=\"font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b;"
            "max-width:520px;margin:0 auto;\">" + "".join(parts) + "</div>")
    return c["subject"], body, "\n\n".join(plain)


# ---- audiences --------------------------------------------------------------
def audience(db: Session, name: str) -> list[tuple[str, str]]:
    """[(ref, lower-cased email)], one entry per address."""
    rows = db.query(User.id, User.email, Subscription.status).outerjoin(Subscription, Subscription.user_id == User.id).all()
    seen, out = set(), []

    def add(ref, email):
        email = (email or "").strip().lower()
        if email and "@" in email and email not in seen:
            seen.add(email)
            out.append((ref, email))

    account_emails = {(e or "").strip().lower() for _, e, _ in rows}
    for uid, email, status in sorted(rows):
        if name == "active" and status == "active":
            add(f"u{uid}", email)
        elif name == "lapsed" and status in ("canceled", "inactive"):
            add(f"u{uid}", email)
        elif name == "new" and status is None:
            add(f"u{uid}", email)
    if name == "new":
        for sid, email in db.query(EmailSubscriber.id, EmailSubscriber.email).order_by(EmailSubscriber.id).all():
            if (email or "").strip().lower() not in account_emails:
                add(f"s{sid}", email)
    return out


def recipients(db: Session, campaign: str) -> tuple[list[tuple[str, str]], int, int]:
    """(still to send, already sent, skipped as unsubscribed)"""
    c = CAMPAIGNS[campaign]
    done = {r[0] for r in db.query(EmailBroadcast.email).filter(EmailBroadcast.campaign == campaign).all()}
    opted_out = {r[0] for r in db.query(EmailUnsubscribe.email).all()} if c["marketing"] else set()
    everyone = audience(db, c["audience"])
    todo = [(ref, e) for ref, e in everyone if e not in done and e not in opted_out]
    return todo, len(done), sum(1 for _, e in everyone if e in opted_out and e not in done)


# ---- sending ----------------------------------------------------------------
async def _send_one(client: httpx.AsyncClient, to: str, subject: str, body: str, text: str, unsub: str | None) -> tuple[bool, str]:
    s = get_settings()
    payload = {"from": s.email_from, "to": [to], "reply_to": REPLY_TO, "subject": subject, "html": body, "text": text}
    if unsub:
        payload["headers"] = {"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"}
    r = await client.post("https://api.resend.com/emails",
                          headers={"Authorization": f"Bearer {s.resend_api_key}", "Content-Type": "application/json"}, json=payload)
    return r.status_code == 200, f"HTTP {r.status_code}: {r.text[:160]}"


async def run(db: Session, campaign: str, mode: str) -> dict:
    if campaign not in CAMPAIGNS:
        return {"error": "unknown campaign", "campaigns": sorted(CAMPAIGNS)}
    s = get_settings()
    marketing = CAMPAIGNS[campaign]["marketing"]
    todo, already, opted_out = recipients(db, campaign)
    subject, _, sample_text = render(campaign, "u0")
    out: dict = {"campaign": campaign, "mode": mode, "subject": subject, "to_send": len(todo),
                 "already_sent": already, "skipped_unsubscribed": opted_out}
    if mode == "preview":
        return {**out, "text": sample_text}
    if not s.resend_api_key:
        return {**out, "error": "email is not configured"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        if mode == "test":
            _, body, text = render(campaign, "u0")
            ok, detail = await _send_one(client, s.admin_notify_email, f"[TEST] {subject}", body, text, None)
            return {**out, "test_sent_to_admin": ok, "detail": None if ok else detail}
        if mode != "send":
            return {**out, "error": "mode must be preview, test or send"}
        sent, failed = 0, []
        for ref, email in todo:
            _, body, text = render(campaign, ref)
            try:
                ok, detail = await _send_one(client, email, subject, body, text, unsubscribe_url(ref) if marketing else None)
            except Exception as e:
                ok, detail = False, str(e)
            if ok:
                db.add(EmailBroadcast(campaign=campaign, email=email))
                db.commit()   # per email: a crash part-way never causes a repeat
                sent += 1
            else:
                failed.append({"ref": ref, "detail": detail})
                logger.error("Broadcast email failed", campaign=campaign, ref=ref, detail=detail)
            await asyncio.sleep(0.6)   # stay under the provider's per-second limit
        logger.info("Broadcast finished", campaign=campaign, sent=sent, failed=len(failed))
        return {**out, "sent": sent, "failed": failed}
