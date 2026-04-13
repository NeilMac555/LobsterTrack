import stripe
import structlog
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.database import get_db
from app.models.user import User
from app.models.subscription import Subscription
from app.api.deps import require_user
from app.services.email_sender import email_sender

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

    try:
        stripe.api_key = settings.stripe_secret_key
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["type"]
    data = event["data"]["object"]

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
        logger.error("Webhook handler error", event_type=event_type, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    return {"status": "ok"}


async def _handle_checkout_completed(session_data: dict, db: Session):
    customer_id = session_data.get("customer")
    subscription_id = session_data.get("subscription")

    if not customer_id or not subscription_id:
        logger.warning("Checkout missing customer/subscription", data=session_data)
        return

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()

    # Fallback: look up by email from the checkout session
    if not user:
        checkout_email = session_data.get("customer_details", {}).get("email") or session_data.get("customer_email")
        if checkout_email:
            user = db.query(User).filter(User.email == checkout_email).first()
            if user:
                user.stripe_customer_id = customer_id
                logger.info("Linked Stripe customer via email fallback", email=checkout_email, customer_id=customer_id)

    if not user:
        logger.warning("Checkout completed for unknown customer", customer_id=customer_id)
        return

    sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
    was_new = sub is None
    if not sub:
        sub = Subscription(user_id=user.id)
        db.add(sub)

    sub.stripe_subscription_id = subscription_id
    sub.status = "active"

    # Try to get subscription details from Stripe for period info
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
        try:
            await email_sender.send_welcome_pro(user.email)
        except Exception as e:
            logger.warning("Failed to send welcome email", error=str(e))

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
    sub = db.query(Subscription).filter(Subscription.stripe_subscription_id == subscription_id).first()
    if not sub:
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
