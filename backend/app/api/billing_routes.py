import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import Plan, User
from app.services.billing import FREE_PLAN_DOCUMENT_SCOPE_LIMIT, FREE_PLAN_ID, get_active_subscription, get_billing_service, subscription_summary
from app.services.usage import usage_summary

router = APIRouter()
logger = logging.getLogger(__name__)

BILLING_NOT_CONFIGURED_DETAIL = "Billing is not configured"


def _plan_payload(plan: Plan) -> dict[str, object]:
    return {
        "id": plan.id,
        "name": plan.name,
        "interval": plan.interval,
        "limit_ai_messages": plan.limit_ai_messages,
        "limit_uploads": plan.limit_uploads,
        "limit_storage_mb": plan.limit_storage_mb,
        "limit_document_scope": FREE_PLAN_DOCUMENT_SCOPE_LIMIT if plan.id == FREE_PLAN_ID else plan.limit_document_scope,
        "allowed_chat_models": plan.allowed_chat_models,
    }


@router.get("/api/billing/plans")
def list_plans(db: Session = Depends(get_db)) -> dict[str, object]:
    plans = db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.limit_ai_messages)).all()
    return {"items": [_plan_payload(plan) for plan in plans]}


@router.get("/api/billing/me")
def billing_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return subscription_summary(db, current_user)


@router.post("/api/billing/checkout")
def create_checkout_session(
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    service = get_billing_service(settings)
    if not service.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=BILLING_NOT_CONFIGURED_DETAIL)
    plan_id = payload.get("plan_id")
    plan = db.get(Plan, plan_id) if isinstance(plan_id, str) else None
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=422, detail="Unknown plan")
    if plan.interval is None:
        raise HTTPException(status_code=422, detail="Plan cannot be purchased")
    if get_active_subscription(db, current_user) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use the billing portal to manage an existing subscription",
        )
    price_id = service.price_id_for_plan(plan.id)
    if price_id is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=BILLING_NOT_CONFIGURED_DETAIL)
    return {"url": service.create_checkout_session_url(db, current_user, price_id)}


@router.post("/api/billing/schedule-switch")
def schedule_subscription_switch(
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    service = get_billing_service(settings)
    if not service.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=BILLING_NOT_CONFIGURED_DETAIL)
    plan_id = payload.get("plan_id")
    plan = db.get(Plan, plan_id) if isinstance(plan_id, str) else None
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=422, detail="Unknown plan")
    if plan.interval is None:
        raise HTTPException(status_code=422, detail="Plan cannot be purchased")

    subscription = get_active_subscription(db, current_user)
    if subscription is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Use checkout to start a paid plan")
    if subscription.plan_id == plan.id:
        raise HTTPException(status_code=422, detail="Plan is already current")
    if not subscription.cancel_at_period_end:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancel the current subscription before scheduling a replacement plan",
        )

    price_id = service.price_id_for_plan(plan.id)
    if price_id is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=BILLING_NOT_CONFIGURED_DETAIL)
    try:
        url = service.create_future_checkout_session_url(db, current_user, subscription, plan, price_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"url": url}

@router.post("/api/billing/switch")
def switch_subscription_plan(
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    service = get_billing_service(settings)
    if not service.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=BILLING_NOT_CONFIGURED_DETAIL)
    plan_id = payload.get("plan_id")
    plan = db.get(Plan, plan_id) if isinstance(plan_id, str) else None
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=422, detail="Unknown plan")
    if plan.interval is None:
        raise HTTPException(status_code=422, detail="Plan cannot be purchased")

    subscription = get_active_subscription(db, current_user)
    if subscription is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Use checkout to start a paid plan")
    if subscription.plan_id == plan.id:
        raise HTTPException(status_code=422, detail="Plan is already current")
    if subscription.cancel_at_period_end:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Use scheduled checkout for subscriptions ending this period",
        )

    current_plan = db.get(Plan, subscription.plan_id)
    current_plan_name = current_plan.name if current_plan else "your current plan"
    raise HTTPException(
        status_code=422,
        detail=f"You already have {current_plan_name} enabled. Cancel it to choose {plan.name}.",
    )

@router.post("/api/billing/portal")
def create_portal_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    service = get_billing_service(settings)
    if not service.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=BILLING_NOT_CONFIGURED_DETAIL)
    return {"url": service.create_portal_session_url(db, current_user)}


@router.post("/api/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, bool]:
    if not settings.stripe_webhook_secret:
        logger.error("Received Stripe webhook but STRIPE_WEBHOOK_SECRET is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=BILLING_NOT_CONFIGURED_DETAIL
        )
    service = get_billing_service(settings)
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = service.construct_webhook_event(payload, signature)
    except Exception as exc:
        logger.warning("Rejected Stripe webhook with invalid signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature") from exc
    service.apply_webhook_event(db, event)
    return {"received": True}


@router.get("/api/usage")
def usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return usage_summary(db, current_user)
