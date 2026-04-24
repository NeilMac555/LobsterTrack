"""
Stripe reconciliation — the webhook's safety net.

Walks every active Stripe subscription and makes sure our local
users + subscriptions table matches. Runs every 10 minutes so
even if the webhook is completely broken, new Pro subscribers:

  1) Get a user row auto-created
  2) Get their subscription flipped to 'active'
  3) Receive a magic-link email to sign in
  4) Trigger an admin notification to Neil

Stripe is the source of truth for payments. Webhooks are just a
real-time shortcut — this reconciler is belt-and-braces.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any

import stripe
import structlog

from app.config import get_settings
from app.models import User, Subscription, MagicLink
from app.models.database import SessionLocal
from app.services.email_sender import email_sender

logger = structlog.get_logger()
settings = get_settings()


class StripeReconciler:
    """Reconcile active Stripe subscriptions into our local DB."""

    def __init__(self) -> None:
        self.last_run_at: datetime | None = None
        self.last_run_summary: dict[str, Any] | None = None
        self.last_error: str | None = None

    async def reconcile(self) -> dict[str, Any]:
        """
        Pull every active SteamWatch Pro Stripe subscription (filtered by
        price_id so we don't accidentally activate Ghost / WooCommerce
        customers as Pro) and ensure our DB matches.

        Also runs a demotion pass — any local user currently marked 'active'
        whose email isn't in Stripe's active Pro list gets demoted to
        'inactive'. Keeps the DB self-healing.
        """
        started = datetime.utcnow()
        summary: dict[str, Any] = {
            "started_at": started.isoformat() + "Z",
            "stripe_active_count": 0,
            "newly_created_users": 0,
            "newly_activated_subs": 0,
            "already_in_sync": 0,
            "demoted": 0,
            "errors": [],
            "new_emails": [],
            "demoted_emails": [],
        }

        if not settings.stripe_secret_key:
            summary["errors"].append("STRIPE_SECRET_KEY not configured")
            self.last_run_at = datetime.utcnow()
            self.last_run_summary = summary
            self.last_error = summary["errors"][0]
            return summary

        if not settings.stripe_price_id:
            # Refuse to run without a price filter — without it we'd activate
            # every Stripe customer across every product Neil sells.
            summary["errors"].append(
                "STRIPE_PRICE_ID not configured — refusing to run to prevent "
                "cross-product activation"
            )
            self.last_run_at = datetime.utcnow()
            self.last_run_summary = summary
            self.last_error = summary["errors"][0]
            return summary

        stripe.api_key = settings.stripe_secret_key

        # Build an email-keyed map of every active *SteamWatch Pro* sub.
        # The `price` filter is load-bearing — without it the list includes
        # every Stripe product in the account.
        try:
            active_by_email: dict[str, Any] = {}
            for sub in stripe.Subscription.list(
                status="active",
                price=settings.stripe_price_id,
                limit=100,
                expand=["data.customer"],
            ).auto_paging_iter():
                customer = sub.customer
                email = getattr(customer, "email", None)
                if not email:
                    continue
                email = email.lower().strip()
                existing = active_by_email.get(email)
                if existing is None or sub.created > existing.created:
                    active_by_email[email] = sub
            summary["stripe_active_count"] = len(active_by_email)
        except Exception as e:
            logger.error("stripe_reconciler: list subscriptions failed", error=str(e))
            summary["errors"].append(f"List failed: {e}")
            self.last_run_at = datetime.utcnow()
            self.last_run_summary = summary
            self.last_error = summary["errors"][0]
            return summary

        db = SessionLocal()
        try:
            # Pass 1 — ensure every legitimate Stripe Pro sub is reflected.
            for email, stripe_sub in active_by_email.items():
                try:
                    result = await self._reconcile_one(db, email, stripe_sub)
                    if result == "created_and_activated":
                        summary["newly_created_users"] += 1
                        summary["newly_activated_subs"] += 1
                        summary["new_emails"].append(email)
                    elif result == "activated":
                        summary["newly_activated_subs"] += 1
                        summary["new_emails"].append(email)
                    elif result == "in_sync":
                        summary["already_in_sync"] += 1
                except Exception as e:
                    db.rollback()
                    msg = f"{email}: {type(e).__name__}: {e}"
                    logger.error("stripe_reconciler: per-sub error", email=email, error=str(e))
                    summary["errors"].append(msg)

            # Pass 2 — demote any local 'active' user whose email isn't in
            # the legitimate Pro set. This heals any past drift (e.g. a
            # previous unfiltered run that activated non-Pro customers).
            try:
                legit_emails = set(active_by_email.keys())
                active_subs = (
                    db.query(Subscription, User)
                    .join(User, Subscription.user_id == User.id)
                    .filter(Subscription.status == "active")
                    .all()
                )
                for sub, user in active_subs:
                    if (user.email or "").lower().strip() not in legit_emails:
                        sub.status = "inactive"
                        summary["demoted"] += 1
                        summary["demoted_emails"].append(user.email)
                if summary["demoted"] > 0:
                    db.commit()
            except Exception as e:
                db.rollback()
                logger.error("stripe_reconciler: demotion pass failed", error=str(e))
                summary["errors"].append(f"Demotion pass: {e}")
        finally:
            db.close()

        summary["finished_at"] = datetime.utcnow().isoformat() + "Z"
        summary["duration_seconds"] = (datetime.utcnow() - started).total_seconds()
        self.last_run_at = datetime.utcnow()
        self.last_run_summary = summary
        self.last_error = summary["errors"][0] if summary["errors"] else None

        if summary["newly_activated_subs"] > 0 or summary["errors"]:
            logger.info(
                "stripe_reconciler: cycle complete",
                stripe_active=summary["stripe_active_count"],
                created=summary["newly_created_users"],
                activated=summary["newly_activated_subs"],
                in_sync=summary["already_in_sync"],
                errors=len(summary["errors"]),
            )
        return summary

    async def _reconcile_one(self, db, email: str, stripe_sub: Any) -> str:
        """
        Ensure a single Stripe active subscription is reflected in our DB.
        Returns 'created_and_activated' / 'activated' / 'in_sync'.
        """
        customer_id = stripe_sub.customer.id if hasattr(stripe_sub.customer, "id") else stripe_sub.customer
        subscription_id = stripe_sub.id

        user = db.query(User).filter(User.email == email).first()
        newly_created_user = False

        if not user:
            # Stripe has an active subscriber we know nothing about —
            # create the account on the fly, same as the webhook's
            # auto-create path.
            user = User(email=email, stripe_customer_id=customer_id)
            db.add(user)
            db.commit()
            db.refresh(user)
            newly_created_user = True
            logger.info("stripe_reconciler: auto-created user", email=email, user_id=user.id)
        elif not user.stripe_customer_id:
            # Existing user paid via Stripe but the customer ID wasn't
            # linked (webhook didn't fire). Link it now.
            user.stripe_customer_id = customer_id
            db.commit()

        sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
        was_active = bool(sub and sub.status == "active")

        if not sub:
            sub = Subscription(user_id=user.id)
            db.add(sub)

        sub.stripe_subscription_id = subscription_id
        sub.status = "active"
        period_end = getattr(stripe_sub, "current_period_end", None)
        if period_end:
            sub.current_period_end = datetime.utcfromtimestamp(period_end)
        sub.cancel_at_period_end = getattr(stripe_sub, "cancel_at_period_end", False)
        db.commit()

        if was_active and not newly_created_user:
            return "in_sync"

        # Something changed — send welcome + admin alert.
        # For brand-new users, also send a magic-link so they can sign in.
        if newly_created_user:
            await self._send_magic_link(db, user)
            try:
                await email_sender.send_welcome_pro(user.email)
            except Exception as e:
                logger.warning("welcome email failed (reconciler)", error=str(e))

        try:
            context = "auto-created" if newly_created_user else "activated"
            await email_sender.send_admin_notification(
                f"[Reconciler] Pro subscriber {context}: {user.email}",
                f"The reconciliation job picked up a Stripe active subscription "
                f"that wasn't in sync with our DB and fixed it.\n\n"
                f"Email: {user.email}\n"
                f"User ID: #{user.id}\n"
                f"Stripe subscription: {subscription_id}\n"
                f"Stripe customer: {customer_id}\n"
                f"User {context}\n\n"
                f"This usually means the Stripe webhook didn't fire for this "
                f"event — the reconciler caught it.",
            )
        except Exception as e:
            logger.warning("reconciler admin alert failed", error=str(e))

        return "created_and_activated" if newly_created_user else "activated"

    async def _send_magic_link(self, db, user: User) -> None:
        """Issue + email a one-time sign-in link to a freshly-created user."""
        token = secrets.token_urlsafe(32)
        link = MagicLink(
            email=user.email,
            token=token,
            expires_at=datetime.utcnow() + timedelta(minutes=settings.magic_link_expiry_minutes),
        )
        db.add(link)
        db.commit()
        try:
            await email_sender.send_magic_link(user.email, token)
        except Exception as e:
            logger.warning("reconciler magic-link send failed", email=user.email, error=str(e))


# Singleton — imported by the scheduler and admin routes.
stripe_reconciler = StripeReconciler()
