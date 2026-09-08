import logging
from datetime import datetime, timezone
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models import Plan, Subscription, User

logger = logging.getLogger(__name__)

# Single source of truth for the plan matrix: migration 0005 and the test
# fixtures both seed from this. stripe_price_id stays NULL in the DB; price ids
# are resolved from env at runtime (price_id_for_plan / plan_id_for_price).
FREE_PLAN_DOCUMENT_SCOPE_LIMIT = 1

PLAN_SEEDS: list[dict[str, object]] = [
    {
        "id": "free",
        "name": "Free",
        "interval": None,
        "stripe_price_id": None,
        "limit_ai_messages": 25,
        "limit_uploads": 3,
        "limit_storage_mb": 50,
        "limit_document_scope": FREE_PLAN_DOCUMENT_SCOPE_LIMIT,
        "allowed_chat_models": ["gpt-4.1-mini"],
        "is_active": True,
    },
    {
        "id": "pro_monthly",
        "name": "Pro (monthly)",
        "interval": "month",
        "stripe_price_id": None,
        "limit_ai_messages": 1000,
        "limit_uploads": 100,
        "limit_storage_mb": 2048,
        "limit_document_scope": 10,
        "allowed_chat_models": None,
        "is_active": True,
    },
    {
        "id": "pro_yearly",
        "name": "Pro (yearly)",
        "interval": "year",
        "stripe_price_id": None,
        "limit_ai_messages": 1000,
        "limit_uploads": 100,
        "limit_storage_mb": 2048,
        "limit_document_scope": 10,
        "allowed_chat_models": None,
        "is_active": True,
    },
]

FREE_PLAN_ID = "free"
ACTIVE_SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due")
FUTURE_SWITCH_PURPOSE = "future_plan_switch"
SCHEDULED_SUBSCRIPTION_STATUS = "scheduled"

def _stripe_to_plain(value):
    if hasattr(value, "to_dict_recursive"):
        try:
            value = value.to_dict_recursive()
        except AttributeError:
            pass
    if isinstance(value, dict):
        return {key: _stripe_to_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_stripe_to_plain(item) for item in value]
    data = getattr(value, "_data", None)
    if isinstance(data, dict):
        return {key: _stripe_to_plain(item) for key, item in data.items()}
    return value


def get_active_subscription(db: Session, user: User) -> Subscription | None:
    return db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user.id,
            Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES),
        )
        .order_by(Subscription.created_at.desc(), Subscription.id.desc())
        .limit(1)
    )


def get_upcoming_subscription(db: Session, user: User) -> Subscription | None:
    return db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user.id,
            Subscription.status == SCHEDULED_SUBSCRIPTION_STATUS,
        )
        .order_by(Subscription.current_period_end.asc(), Subscription.created_at.desc())
        .limit(1)
    )


def get_active_plan(db: Session, user: User) -> Plan:
    """The single function all limit gating uses."""
    subscription = get_active_subscription(db, user)
    if subscription is not None:
        plan = db.get(Plan, subscription.plan_id)
        if plan is not None:
            return plan
    return db.get(Plan, FREE_PLAN_ID)


def subscription_summary(db: Session, user: User) -> dict[str, object]:
    plan = get_active_plan(db, user)
    subscription = get_active_subscription(db, user)
    upcoming_subscription = get_upcoming_subscription(db, user)
    upcoming_plan = db.get(Plan, upcoming_subscription.plan_id) if upcoming_subscription else None
    upcoming_payload = None
    if upcoming_subscription and upcoming_plan:
        upcoming_payload = {
            "plan": {"id": upcoming_plan.id, "name": upcoming_plan.name, "interval": upcoming_plan.interval},
            "status": upcoming_subscription.status,
            "starts_at": (
                upcoming_subscription.current_period_end.isoformat()
                if upcoming_subscription.current_period_end
                else None
            ),
        }
    return {
        "plan": {"id": plan.id, "name": plan.name, "interval": plan.interval},
        "status": subscription.status if subscription else None,
        "current_period_end": (
            subscription.current_period_end.isoformat()
            if subscription and subscription.current_period_end
            else None
        ),
        "cancel_at_period_end": subscription.cancel_at_period_end if subscription else False,
        "upcoming_subscription": upcoming_payload,
    }


class BillingService:
    def __init__(self, settings: Settings, stripe_client=None):
        self.settings = settings
        if stripe_client is None:
            stripe.api_key = settings.stripe_secret_key
            stripe_client = stripe
        self._stripe = stripe_client

    def is_configured(self) -> bool:
        return bool(self.settings.stripe_secret_key)

    def price_id_for_plan(self, plan_id: str) -> str | None:
        return {
            "pro_monthly": self.settings.stripe_price_pro_monthly,
            "pro_yearly": self.settings.stripe_price_pro_yearly,
        }.get(plan_id)

    def plan_id_for_price(self, price_id: str | None) -> str | None:
        if not price_id:
            return None
        for plan_id in ("pro_monthly", "pro_yearly"):
            if self.price_id_for_plan(plan_id) == price_id:
                return plan_id
        return None

    def _return_url(self) -> str:
        if self.settings.billing_return_url:
            return str(self.settings.billing_return_url)
        origins = self.settings.cors_origins()
        base = origins[0] if origins else "http://localhost:5173"
        return f"{base}/app/billing"

    def ensure_customer(self, db: Session, user: User) -> str:
        if user.stripe_customer_id:
            return user.stripe_customer_id
        customer = self._stripe.Customer.create(
            email=user.email,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer["id"]
        db.commit()
        return user.stripe_customer_id

    def create_checkout_session_url(self, db: Session, user: User, price_id: str) -> str:
        customer_id = self.ensure_customer(db, user)
        return_url = self._return_url()
        session = self._stripe.checkout.Session.create(
            customer=customer_id,
            client_reference_id=str(user.id),
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{return_url}?checkout=success",
            cancel_url=f"{return_url}?checkout=canceled",
        )
        return session["url"]

    def create_portal_session_url(self, db: Session, user: User) -> str:
        customer_id = self.ensure_customer(db, user)
        session = self._stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=self._return_url(),
        )
        return session["url"]

    def create_future_checkout_session_url(
        self,
        db: Session,
        user: User,
        subscription: Subscription,
        plan: Plan,
        price_id: str,
    ) -> str:
        if not subscription.current_period_end or not plan.interval:
            raise ValueError("Subscription cannot be scheduled")
        period_end = subscription.current_period_end
        if period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=timezone.utc)
        customer_id = self.ensure_customer(db, user)
        return_url = self._return_url()
        metadata = {
            "purpose": FUTURE_SWITCH_PURPOSE,
            "user_id": str(user.id),
            "plan_id": plan.id,
            "previous_subscription_id": subscription.stripe_subscription_id,
        }
        session = self._stripe.checkout.Session.create(
            customer=customer_id,
            client_reference_id=str(user.id),
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            payment_method_collection="always",
            subscription_data={
                "trial_end": int(period_end.timestamp()),
                "metadata": metadata,
                "trial_settings": {"end_behavior": {"missing_payment_method": "cancel"}},
            },
            metadata=metadata,
            success_url=f"{return_url}?checkout=scheduled",
            cancel_url=f"{return_url}?checkout=canceled",
        )
        return session["url"]

    def construct_webhook_event(self, payload: bytes, signature: str):
        event = self._stripe.Webhook.construct_event(
            payload, signature, self.settings.stripe_webhook_secret
        )
        return _stripe_to_plain(event)

    def apply_webhook_event(self, db: Session, event) -> None:
        """Idempotent: replays of the same event converge on the same rows."""
        event_type = event["type"]
        data_object = event["data"]["object"]

        if event_type == "checkout.session.completed":
            self._link_customer(db, data_object)
            self._record_future_switch_checkout(db, data_object)
        elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
            self._upsert_subscription(db, data_object)
        elif event_type == "customer.subscription.deleted":
            self._upsert_subscription(db, data_object, force_status="canceled")
        elif event_type == "invoice.payment_failed":
            # 2025-03-31+ Stripe API versions moved the reference under parent.subscription_details.
            subscription_id = data_object.get("subscription") or (
                (data_object.get("parent") or {}).get("subscription_details") or {}
            ).get("subscription")
            subscription = db.scalar(
                select(Subscription).where(
                    Subscription.stripe_subscription_id == subscription_id
                )
            )
            if subscription is not None:
                subscription.status = "past_due"
        else:
            logger.info("Ignoring unhandled Stripe event", extra={"event_type": event_type})
        db.commit()

    def _link_customer(self, db: Session, session_object) -> None:
        reference = session_object.get("client_reference_id")
        customer_id = session_object.get("customer")
        if not reference or not customer_id:
            return
        try:
            user = db.get(User, UUID(str(reference)))
        except ValueError:
            user = None
        if user is not None and user.stripe_customer_id != customer_id:
            user.stripe_customer_id = customer_id

    def _record_future_switch_checkout(self, db: Session, session_object) -> None:
        metadata = session_object.get("metadata") or {}
        if metadata.get("purpose") != FUTURE_SWITCH_PURPOSE:
            return
        subscription_id = session_object.get("subscription")
        plan_id = metadata.get("plan_id")
        if not subscription_id or not plan_id:
            return
        subscription = db.scalar(
            select(Subscription).where(Subscription.stripe_subscription_id == subscription_id)
        )
        if subscription is not None:
            return
        user = None
        reference = session_object.get("client_reference_id")
        if reference:
            try:
                user = db.get(User, UUID(str(reference)))
            except ValueError:
                user = None
        if user is None:
            user = db.scalar(select(User).where(User.stripe_customer_id == session_object.get("customer")))
        if user is None:
            return
        previous_subscription = db.scalar(
            select(Subscription).where(
                Subscription.stripe_subscription_id == metadata.get("previous_subscription_id")
            )
        )
        subscription = Subscription(
            user_id=user.id,
            plan_id=str(plan_id),
            stripe_subscription_id=str(subscription_id),
            status=SCHEDULED_SUBSCRIPTION_STATUS,
            current_period_end=previous_subscription.current_period_end if previous_subscription else None,
            cancel_at_period_end=False,
        )
        db.add(subscription)

    def _upsert_subscription(self, db: Session, subscription_object, force_status: str | None = None) -> None:
        stripe_subscription_id = subscription_object["id"]
        items = (subscription_object.get("items") or {}).get("data") or []
        price = (items[0].get("price") or {}) if items else {}
        plan_id = self.plan_id_for_price(price.get("id"))

        metadata = subscription_object.get("metadata") or {}
        is_future_switch = metadata.get("purpose") == FUTURE_SWITCH_PURPOSE
        is_future_switch_canceled = bool(
            is_future_switch
            and (
                force_status == "canceled"
                or subscription_object.get("status") == "canceled"
                or subscription_object.get("canceled_at")
                or subscription_object.get("ended_at")
            )
        )
        is_future_switch_trial = is_future_switch and subscription_object.get("status") == "trialing"
        next_status = force_status or subscription_object.get("status")
        if is_future_switch_canceled:
            next_status = "canceled"
        elif is_future_switch_trial:
            next_status = SCHEDULED_SUBSCRIPTION_STATUS

        subscription = db.scalar(
            select(Subscription).where(
                Subscription.stripe_subscription_id == stripe_subscription_id
            )
        )
        if subscription is None:
            user = db.scalar(
                select(User).where(User.stripe_customer_id == subscription_object.get("customer"))
            )
            if user is None or plan_id is None:
                logger.warning(
                    "Cannot resolve user or plan for Stripe subscription; skipping",
                    extra={"stripe_subscription_id": stripe_subscription_id},
                )
                return
            subscription = Subscription(
                user_id=user.id,
                plan_id=plan_id,
                stripe_subscription_id=stripe_subscription_id,
                status=next_status or "active",
            )
            db.add(subscription)

        if plan_id is not None:
            subscription.plan_id = plan_id
        subscription.status = next_status or subscription.status
        cancel_at = subscription_object.get("cancel_at")
        subscription.cancel_at_period_end = bool(
            subscription_object.get("cancel_at_period_end", False)
            or (cancel_at and subscription.status in ACTIVE_SUBSCRIPTION_STATUSES)
        )
        # 2025-03-31+ Stripe API versions moved period bounds onto subscription items.
        first_item = items[0] if items else {}
        period_start = subscription_object.get("current_period_start") or first_item.get(
            "current_period_start"
        )
        period_end = (
            subscription_object.get("current_period_end")
            or subscription_object.get("trial_end")
            or first_item.get("current_period_end")
        )
        if period_start:
            subscription.current_period_start = datetime.fromtimestamp(period_start, tz=timezone.utc)
        if period_end:
            subscription.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)


def get_billing_service(settings: Settings) -> BillingService:
    return BillingService(settings)
