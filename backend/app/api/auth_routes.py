import secrets
from datetime import datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import get_db
from app.models.user import User
from app.models.subscription import Subscription
from app.models.magic_link import MagicLink
from app.services.auth import create_jwt
from app.services.email_sender import email_sender
from app.api.deps import require_user
from app.api.auth_schemas import (
    MagicLinkRequest,
    VerifyRequest,
    AuthResponse,
    UserResponse,
    SubscriptionInfo,
)

logger = structlog.get_logger()
settings = get_settings()

auth_router = APIRouter()


def _user_response(user: User) -> UserResponse:
    sub = user.subscription
    return UserResponse(
        id=user.id,
        email=user.email,
        subscription=SubscriptionInfo(
            status=sub.status if sub else "inactive",
            current_period_end=sub.current_period_end if sub else None,
            cancel_at_period_end=sub.cancel_at_period_end if sub else False,
        ),
    )


@auth_router.post("/magic-link")
async def request_magic_link(body: MagicLinkRequest, db: Session = Depends(get_db)):
    email = body.email.lower().strip()

    # Rate limit: 1 per email per 60 seconds
    recent = (
        db.query(MagicLink)
        .filter(
            MagicLink.email == email,
            MagicLink.created_at > datetime.utcnow() - timedelta(seconds=60),
        )
        .first()
    )
    if recent:
        raise HTTPException(status_code=429, detail="Please wait before requesting another link")

    # Create or get user
    user = db.query(User).filter(User.email == email).first()
    is_new_user = user is None
    if not user:
        user = User(email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    # Notify Neil on new sign-up (private email, never public)
    if is_new_user:
        try:
            await email_sender.send_admin_notification(
                "New Sign-Up",
                f"New user: {email}\nUser ID: #{user.id}"
            )
        except Exception:
            pass

    # Generate token
    token = secrets.token_urlsafe(32)
    magic_link = MagicLink(
        email=email,
        token=token,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.magic_link_expiry_minutes),
    )
    db.add(magic_link)
    db.commit()

    # Send email
    sent = await email_sender.send_magic_link(email, token)
    if not sent:
        logger.warning("Magic link email not sent (Resend not configured?)", email=email)

    # Always return success to avoid email enumeration
    return {"message": "If that email is registered, you'll receive a sign-in link shortly."}


@auth_router.post("/verify", response_model=AuthResponse)
async def verify_magic_link(body: VerifyRequest, db: Session = Depends(get_db)):
    magic_link = (
        db.query(MagicLink)
        .filter(MagicLink.token == body.token, MagicLink.used == False)
        .first()
    )

    if not magic_link:
        raise HTTPException(status_code=400, detail="Invalid or expired link")

    if magic_link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Link has expired")

    # Mark as used
    magic_link.used = True
    db.commit()

    # Get user
    user = db.query(User).filter(User.email == magic_link.email).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    # Create JWT
    token = create_jwt(user.id, user.email)

    return AuthResponse(token=token, user=_user_response(user))


@auth_router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(require_user)):
    return _user_response(user)


@auth_router.get("/debug-token")
async def debug_token(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    """Temporary debug endpoint to diagnose JWT issues"""
    import jwt as pyjwt
    from app.services.auth import decode_jwt
    if not authorization:
        return {"error": "No Authorization header"}
    if not authorization.startswith("Bearer "):
        return {"error": "Not Bearer token"}
    token = authorization[7:]
    secret = settings.jwt_secret
    # Try manual decode with full error
    try:
        manual = pyjwt.decode(token, secret, algorithms=["HS256"])
        manual_ok = True
        manual_err = None
    except Exception as e:
        manual = None
        manual_ok = False
        manual_err = str(e)
    payload = decode_jwt(token)
    return {
        "secret_prefix": secret[:10] + "...",
        "secret_len": len(secret),
        "token_prefix": token[:20],
        "decode_result": payload,
        "manual_ok": manual_ok,
        "manual_err": manual_err,
    }
