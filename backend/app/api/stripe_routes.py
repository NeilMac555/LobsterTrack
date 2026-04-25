import stripe
import structlog
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import get_db
from app.models.user import User
from app.models.subscription import Subscription
from app.api.deps import require_user
from app.services.email_sender import email_sender


class PublicCheckoutRequest(BaseModel):
    email: EmailStr

logger = structlog.get_logger()
settings = get_settings()

stripe_router = APIRouter()


def _get_stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = settings.stripe_secret_key


@stripe_router.post("/create-checkout-session")
async def create_checkout_session(user: User = Depends(require_user), db: Session = Depends(get_db)):
    _get_stripe()

    # Create Stripe customer if needed
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(email=user.email)
        user.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=user.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=f"{settings.frontend_url}/tools/match-predictor?checkout=success",
        cancel_url=f"{settings.frontend_url}/tools/match-predictor?checkout=cancel",
    )

    return {"checkout_url": session.url}


@stripe_router.post("/create-public-checkout-session")
async def create_public_checkout_session(
    body: PublicCheckoutRequest, db: Session = Depends(get_db)
):
    """
    Unauthenticated checkout. Anyone can subscribe from the marketing
    site without signing up first — the webhook auto-creates their
    account on successful payment and emails a magic link.

    If the email already belongs to a user with an active subscription,
    bounce them to the sign-in flow instead (prevents double-billing).
    """
    _get_stripe()

    email = body.email.lower().strip()

    existing = db.query(User).filter(User.email == email).first()
    if existing and existing.subscription and existing.subscription.status == "active":
        raise HTTPException(
            status_code=409,
            detail="You already have an active subscription. Please sign in instead.",
        )

    # Reuse the existing Stripe customer if we have one, otherwise let
    # Stripe create one keyed on this email via customer_email.
    customer_id = existing.stripe_customer_id if existing else None

    session_kwargs = dict(
        mode="subscription",
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=f"{settings.frontend_url}/tools/match-predictor?checkout=success",
        cancel_url=f"{settings.frontend_url}/?checkout=cancel",
        allow_promotion_codes=True,
    )
    if customer_id:
        session_kwargs["customer"] = customer_id
    else:
        session_kwargs["customer_email"] = email

    session = stripe.checkout.Session.create(**session_kwargs)
    return {"checkout_url": session.url}


@stripe_router.post("/create-portal-session")
async def create_portal_session(user: User = Depends(require_user), db: Session = Depends(get_db)):
    _get_stripe()

    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No subscription found")

    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.frontend_url}/tools/match-predictor",
    )

    return {"portal_url": session.url}


@stripe_router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    # Count every inbound hit so the admin health panel can show 'Stripe
    # is reaching us at all' regardless of whether the signature validates.
    try:
        from app.services.scheduler import odds_scheduler
        odds_scheduler._webhook_hit_count = getattr(odds_scheduler, "_webhook_hit_count", 0) + 1
        odds_scheduler._webhook_last_hit_at = datetime.utcnow()
    except Exception:
        pass

    try:
        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except ValueError as e:
        logger.error("Stripe webhook: invalid payload", error=str(e))
        try:
            from app.services.scheduler import odds_scheduler
            odds_scheduler._record_error("stripe_webhook", f"Invalid payload: {e}")
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Invalid payload")
    except Exception as e:
        # Signature mismatch is the #1 cause of 'no customers getting emails'.
        # Log it loudly and pipe into recent_errors so /admin/fetcher-health
        # makes it obvious without having to read Railway logs.
        logger.error(
            "Stripe webhook: invalid signature",
            sig_header_prefix=(sig_header or "")[:20] + "...",
            secret_prefix=(settings.stripe_webhook_secret or "")[:10] + "...",
            error=str(e),
        )
        try:
            from app.services.scheduler import odds_scheduler
            odds_scheduler._record_error(
                "stripe_webhook",
                f"Invalid signature — STRIPE_WEBHOOK_SECRET on Railway doesn't "
                f"match the endpoint's signing secret in Stripe Dashboard. {e}"
            )
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Invalid signature")

    # NOTE: Stripe SDK's StripeObject has __getattr__ but no .get() method,
    # so calling `.get("id")` on it raises AttributeError. We re-parse the
    # raw payload into plain dicts so every `.get()` in the handlers below
    # works as Python dicts — and so do nested .get() chains. Signature
    # validation already ran above on the original payload.
    import json as _json
    event_dict = _json.loads(payload)
    event_type = event_dict["type"]
    data = event_dict["data"]["object"]

    try:
        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(data, db)
        elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
            _handle_subscription_updated(data, db)
        elif event_type == "customer.subscription.deleted":
            _handle_subscription_deleted(data, db)
        elif event_type == "invoice.payment_failed":
            _handle_payment_failed(data, db)
    except Exception as e:
        import traceback as _tb
        tb_text = _tb.format_exc()
        err_cls = type(e).__name__
        err_msg = str(e) or repr(e)
        logger.error(
            "Webhook handler error",
            event_type=event_type,
            error_class=err_cls,
            error=err_msg,
            traceback=tb_text,
        )
        # Push into the scheduler's recent_errors so /admin/fetcher-health
        # surfaces the EXACT exception class + message + file:line that blew
        # up. That 'get' in {"detail":"get"} hides the real story.
        try:
            from app.services.scheduler import odds_scheduler
            # Grab the deepest traceback frame for a compact 'where'.
            tb_last = tb_text.strip().splitlines()[-3:] if tb_text else []
            odds_scheduler._record_error(
                "stripe_webhook",
                f"{event_type} -> {err_cls}: {err_msg} | {' | '.join(tb_last)}",
            )
        except Exception:
            pass

        # URGENT: a payment-related webhook blew up. Alert Neil immediately
        # with the full traceback so he can debug + force-activate manually.
        try:
            # `data` is a Stripe object that .get()s like a dict. Be defensive
            # in case e was itself raised BY a .get() call on something weird.
            try:
                details = data.get("customer_details") or {}
                checkout_email = details.get("email") if hasattr(details, "get") else None
                customer_email = (
                    checkout_email
                    or data.get("customer_email")
                    or data.get("receipt_email")
                    or "(unknown)"
                )
                customer_id = data.get("customer")
            except Exception:
                customer_email = "(unknown — data introspection failed)"
                customer_id = "(unknown)"

            await email_sender.send_admin_notification(
                "URGENT: Stripe webhook handler failed",
                f"Event type: {event_type}\n"
                f"Customer email: {customer_email}\n"
                f"Customer ID: {customer_id}\n"
                f"Error class: {err_cls}\n"
                f"Error message: {err_msg}\n\n"
                f"Traceback:\n{tb_text}\n\n"
                f"Action needed: check Stripe dashboard and run force-activate "
                f"if the payment went through.",
            )
        except Exception:
            pass
        # Return 200 so Stripe stops hammering us with retries while we
        # debug the underlying cause — we've already logged, alerted, and
        # recorded. Force-activate endpoint is the manual recovery path.
        return {"status": "error_logged", "error_class": err_cls}

    return {"status": "ok"}


async def _handle_checkout_completed(session_data: dict, db: Session):
    customer_id = session_data.get("customer")
    subscription_id = session_data.get("subscription")

    if not customer_id:
        logger.error(
            "Checkout event has no customer — cannot activate",
            session_id=session_data.get("id"),
        )
        await email_sender.send_admin_notification(
            "URGENT: Payment with no customer_id",
            f"A checkout.session.completed event arrived with no customer_id.\n"
            f"Session ID: {session_data.get('id')}\n"
            f"Email from session: {(session_data.get('customer_details') or {}).get('email')}\n\n"
            f"Check Stripe dashboard and activate the user manually.",
        )
        return

    if not subscription_id:
        # Some Stripe event orderings deliver checkout.session.completed
        # before the subscription is attached. Don't bail — we'll still
        # create the user/sub row and let customer.subscription.created
        # fill in the stripe_subscription_id when it arrives.
        logger.warning(
            "Checkout completed without subscription_id — will activate "
            "optimistically and wait for subscription event",
            session_id=session_data.get("id"),
            customer_id=customer_id,
        )

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()

    # Fallback 1: look up by email from the checkout session
    checkout_email = (
        session_data.get("customer_details", {}).get("email")
        or session_data.get("customer_email")
    )

    if not user and checkout_email:
        user = db.query(User).filter(User.email == checkout_email).first()
        if user:
            user.stripe_customer_id = customer_id
            logger.info(
                "Linked Stripe customer via email fallback",
                email=checkout_email,
                customer_id=customer_id,
            )

    # Fallback 2: no user at all — they paid via a Stripe Payment Link
    # before signing up on the site. Auto-create the account so Pro access
    # activates immediately, and send them a magic link to log in.
    if not user and checkout_email:
        user = User(email=checkout_email, stripe_customer_id=customer_id)
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(
            "Auto-created user from Stripe checkout",
            email=checkout_email,
            user_id=user.id,
        )

        # Send a magic link so they can sign in immediately.
        try:
            import secrets
            from datetime import timedelta
            from app.models.magic_link import MagicLink

            token = secrets.token_urlsafe(32)
            link = MagicLink(
                email=user.email,
                token=token,
                expires_at=datetime.utcnow() + timedelta(minutes=settings.magic_link_expiry_minutes),
            )
            db.add(link)
            db.commit()
            sent = await email_sender.send_magic_link(user.email, token)
            if not sent:
                # Email failed — Neil needs to know so he can reach out manually.
                await email_sender.send_admin_notification(
                    "Magic link failed after payment",
                    f"Paid customer auto-created but sign-in email did NOT send.\n"
                    f"Email: {user.email}\n"
                    f"User ID: #{user.id}\n\n"
                    f"Action: email them directly from neilmac@bookieinsiders.io. "
                    f"They have Pro access; they just need to receive a sign-in link.",
                )
        except Exception as e:
            logger.warning("Failed to send post-checkout magic link", error=str(e))
            try:
                await email_sender.send_admin_notification(
                    "Magic link crashed after payment",
                    f"Paid customer auto-created but sign-in flow crashed.\n"
                    f"Email: {user.email}\n"
                    f"User ID: #{user.id}\n"
                    f"Error: {e}\n\n"
                    f"Action: email them directly so they know their account is live.",
                )
            except Exception:
                pass

    if not user:
        logger.warning(
            "Checkout completed with no customer email — cannot activate",
            customer_id=customer_id,
        )
        await email_sender.send_admin_notification(
            "URGENT: Payment with no email — cannot activate",
            f"A Stripe checkout completed but we have no email to identify the customer.\n"
            f"Customer ID: {customer_id}\n"
            f"Subscription ID: {subscription_id}\n\n"
            f"Action: look up this customer in Stripe, find their email, and run "
            f"force-activate manually:\n"
            f"https://www.steamwatch.io/api/admin/force-activate?password=<ADMIN_PW>&email=<THEIR_EMAIL>",
        )
        return

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    was_new = sub is None
    if not sub:
        sub = Subscription(user_id=user.id)
        db.add(sub)

    # Only overwrite stripe_subscription_id if we actually have one —
    # otherwise leave whatever's there so a later subscription event can fill it.
    if subscription_id:
        sub.stripe_subscription_id = subscription_id
    sub.status = "active"

    # Try to get subscription details from Stripe for period info
    if subscription_id:
        try:
            stripe.api_key = settings.stripe_secret_key
            stripe_sub = stripe.Subscription.retrieve(subscription_id)
            period_end = getattr(stripe_sub, "current_period_end", None)
            if period_end:
                sub.current_period_end = datetime.utcfromtimestamp(period_end)
            sub.cancel_at_period_end = getattr(stripe_sub, "cancel_at_period_end", False)
        except Exception as e:
            logger.warning("Could not fetch subscription details", error=str(e))

    db.commit()

    logger.info("Subscription activated", user_id=user.id, subscription_id=subscription_id)

    # Send welcome email to new subscriber
    if was_new:
        welcome_sent = False
        try:
            welcome_sent = await email_sender.send_welcome_pro(user.email)
        except Exception as e:
            logger.warning("Failed to send welcome email", error=str(e))
        if not welcome_sent:
            try:
                await email_sender.send_admin_notification(
                    "Welcome email failed for new Pro subscriber",
                    f"Payment succeeded and Pro is active, but the welcome "
                    f"email did NOT send.\n"
                    f"Email: {user.email}\n"
                    f"User ID: #{user.id}\n\n"
                    f"Action: reach out personally from neilmac@bookieinsiders.io.",
                )
            except Exception:
                pass

    # Notify Neil via private email (never public)
    try:
        await email_sender.send_admin_notification(
            "New Pro Subscriber",
            f"New Pro subscriber: {user.email}\nUser ID: #{user.id}"
        )
    except Exception:
        pass  # Don't fail the webhook over a notification


def _handle_subscription_updated(sub_data: dict, db: Session):
    subscription_id = sub_data.get("id")
    customer_id = sub_data.get("customer")

    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == subscription_id).first()

    # If we don't have this subscription row yet, try to find the user by
    # customer_id and create one — covers the case where checkout.session.completed
    # either never fired or fired without a subscription_id attached.
    if not sub and customer_id:
        user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if user:
            sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
            if not sub:
                sub = Subscription(user_id=user.id)
                db.add(sub)
            sub.stripe_subscription_id = subscription_id
            logger.info(
                "Linked subscription row from subscription event",
                user_id=user.id,
                subscription_id=subscription_id,
            )

    if not sub:
        logger.warning(
            "Subscription event for unknown subscription/customer",
            subscription_id=subscription_id,
            customer_id=customer_id,
        )
        return

    sub.status = sub_data.get("status", sub.status)
    period_end = sub_data.get("current_period_end")
    sub.current_period_end = datetime.utcfromtimestamp(period_end) if period_end else None
    sub.cancel_at_period_end = sub_data.get("cancel_at_period_end", False)
    db.commit()

    logger.info("Subscription updated", subscription_id=subscription_id, status=sub.status)


def _handle_subscription_deleted(sub_data: dict, db: Session):
    subscription_id = sub_data.get("id")
    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == subscription_id).first()
    if not sub:
        return

    sub.status = "canceled"
    db.commit()

    logger.info("Subscription canceled", subscription_id=subscription_id)


def _handle_payment_failed(invoice_data: dict, db: Session):
    customer_id = invoice_data.get("customer")
    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user or not user.subscription:
        return

    user.subscription.status = "past_due"
    db.commit()

    logger.info("Payment failed", user_id=user.id)


@stripe_router.get("/config/public")
async def get_public_config():
    return {"publishable_key": settings.stripe_publishable_key}
