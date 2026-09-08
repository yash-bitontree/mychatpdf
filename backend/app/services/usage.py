from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Document, Plan, UsagePeriod, User
from app.models.mixins import utc_now
from app.services.billing import FREE_PLAN_DOCUMENT_SCOPE_LIMIT, FREE_PLAN_ID, get_active_plan, get_active_subscription

BYTES_PER_MB = 1024 * 1024

# kind -> (usage counter column name, plan limit column name)
USAGE_KINDS: dict[str, tuple[str, str]] = {
    "ai_message": ("ai_messages_used", "limit_ai_messages"),
    "upload": ("uploads_used", "limit_uploads"),
}


class LimitExceeded(Exception):
    """Mapped to HTTP 402 by the handler registered in app.main."""

    def __init__(self, kind: str, limit: int | None = None, used: int | None = None):
        super().__init__(f"{kind} limit exceeded")
        self.kind = kind
        self.limit = limit
        self.used = used


def _period_bounds(db: Session, user: User) -> tuple[datetime, datetime]:
    subscription = get_active_subscription(db, user)
    if subscription and subscription.current_period_start and subscription.current_period_end:
        return subscription.current_period_start, subscription.current_period_end
    now = utc_now()
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    end = datetime(now.year + (now.month == 12), now.month % 12 + 1, 1, tzinfo=timezone.utc)
    return start, end


def current_period(db: Session, user: User) -> UsagePeriod:
    """Get or create the user's usage row for the current billing period.

    First-of-period creation commits immediately so concurrent requests see the
    row without blocking on this request's transaction. Enforcement helpers
    call this at the top of a request, before any other pending writes, so the
    early commit never makes unrelated state durable; keep that ordering.
    """
    period_start, period_end = _period_bounds(db, user)
    statement = select(UsagePeriod).where(
        UsagePeriod.user_id == user.id, UsagePeriod.period_start == period_start
    )
    period = db.scalar(statement)
    if period is not None:
        return period
    # Race-safe get-or-create: the UNIQUE(user_id, period_start) constraint
    # arbitrates concurrent inserts; the loser re-selects the winner's row.
    try:
        with db.begin_nested():
            period = UsagePeriod(user_id=user.id, period_start=period_start, period_end=period_end)
            db.add(period)
            db.flush()
        db.commit()
        return period
    except IntegrityError:
        period = db.scalar(statement)
        if period is None:
            # The conflict was not the winner's row (callers deref the result).
            raise
        return period


def check_and_increment(db: Session, user: User, kind: Literal["ai_message", "upload"]) -> None:
    counter_name, limit_name = USAGE_KINDS[kind]
    plan = get_active_plan(db, user)
    limit = getattr(plan, limit_name)
    period = current_period(db, user)
    counter = getattr(UsagePeriod, counter_name)
    result = db.execute(
        update(UsagePeriod)
        .where(UsagePeriod.id == period.id, counter < limit)
        .values({counter_name: counter + 1})
    )
    # ponytail: the increment stays uncommitted until the caller's next commit.
    # Uploads fail before that commit, so they never burn a credit; chat commits
    # its messages before generation and refunds via refund_ai_message on failure.
    if result.rowcount == 0:
        db.refresh(period)
        raise LimitExceeded(kind, limit=limit, used=getattr(period, counter_name))
    db.expire(period)


def refund_ai_message(db: Session, user: User) -> None:
    """Return the credit taken by check_and_increment when the increment was
    already committed but the AI generation failed afterwards."""
    period = current_period(db, user)
    db.execute(
        update(UsagePeriod)
        .where(UsagePeriod.id == period.id, UsagePeriod.ai_messages_used > 0)
        .values(ai_messages_used=UsagePeriod.ai_messages_used - 1)
    )
    db.expire(period)


def storage_used_bytes(db: Session, user: User) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(Document.file_size_bytes), 0)).where(
            Document.user_id == user.id, Document.deleted_at.is_(None)
        )
    )


def check_storage(db: Session, user: User, incoming_bytes: int) -> None:
    plan = get_active_plan(db, user)
    used_bytes = storage_used_bytes(db, user)
    if used_bytes + incoming_bytes > plan.limit_storage_mb * BYTES_PER_MB:
        raise LimitExceeded(
            "storage", limit=plan.limit_storage_mb, used=used_bytes // BYTES_PER_MB
        )


def check_scope_size(plan: Plan, document_ids: list[UUID]) -> None:
    limit = FREE_PLAN_DOCUMENT_SCOPE_LIMIT if plan.id == FREE_PLAN_ID else plan.limit_document_scope
    if len(document_ids) > limit:
        raise LimitExceeded(
            "document_scope", limit=limit, used=len(document_ids)
        )



def require_premium_plan(plan: Plan, kind: str) -> None:
    if plan.id == FREE_PLAN_ID:
        raise LimitExceeded(kind)

def check_model_allowed(plan: Plan, model: str | None) -> None:
    if model is None or plan.allowed_chat_models is None:
        return
    if model not in plan.allowed_chat_models:
        raise LimitExceeded("chat_model")


def usage_summary(db: Session, user: User) -> dict[str, object]:
    plan = get_active_plan(db, user)
    period = current_period(db, user)
    return {
        "plan": {"id": plan.id, "name": plan.name},
        "period_start": period.period_start.isoformat(),
        "period_end": period.period_end.isoformat(),
        "ai_messages": {"used": period.ai_messages_used, "limit": plan.limit_ai_messages},
        "uploads": {"used": period.uploads_used, "limit": plan.limit_uploads},
        "storage_mb": {
            "used": storage_used_bytes(db, user) // BYTES_PER_MB,
            "limit": plan.limit_storage_mb,
        },
    }
