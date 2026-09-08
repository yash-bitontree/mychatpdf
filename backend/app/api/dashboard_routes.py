from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.chat_routes import _chat_summary
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Chat, Document, Folder, User
from app.services.billing import subscription_summary
from app.services.usage import usage_summary

router = APIRouter()

RECENT_CONVERSATION_LIMIT = 5
RECENT_ACTIVITY_LIMIT = 10


def _enum_value(value: object) -> str:
    return value.value if hasattr(value, "value") else str(value)


@router.get("/api/dashboard")
def dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    # Document stats in one grouped query: counts by status/format + total size.
    stat_rows = db.execute(
        select(
            Document.status,
            Document.format,
            func.count(Document.id),
            func.coalesce(func.sum(Document.file_size_bytes), 0),
        )
        .where(Document.user_id == current_user.id, Document.deleted_at.is_(None))
        .group_by(Document.status, Document.format)
    ).all()
    total = 0
    storage_bytes = 0
    by_status: dict[str, int] = {}
    by_format: dict[str, int] = {}
    for status_value, format_value, count, size in stat_rows:
        status_key = _enum_value(status_value)
        total += count
        storage_bytes += size
        by_status[status_key] = by_status.get(status_key, 0) + count
        by_format[format_value] = by_format.get(format_value, 0) + count

    recent_chats = list(
        db.scalars(
            select(Chat)
            .where(Chat.user_id == current_user.id, Chat.deleted_at.is_(None))
            .options(
                selectinload(Chat.documents),
                selectinload(Chat.folder).selectinload(Folder.documents),
            )
            .order_by(Chat.updated_at.desc(), Chat.id.desc())
            .limit(RECENT_CONVERSATION_LIMIT)
        )
    )

    recent_documents = db.execute(
        select(Document.id, Document.original_filename, Document.created_at)
        .where(Document.user_id == current_user.id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc(), Document.id.desc())
        .limit(RECENT_ACTIVITY_LIMIT)
    ).all()
    activity_chats = db.execute(
        select(Chat.id, Chat.title, Chat.updated_at)
        .where(Chat.user_id == current_user.id, Chat.deleted_at.is_(None))
        .order_by(Chat.updated_at.desc(), Chat.id.desc())
        .limit(RECENT_ACTIVITY_LIMIT)
    ).all()
    deleted_chats = db.execute(
        select(Chat.id, Chat.title, Chat.deleted_at)
        .where(Chat.user_id == current_user.id, Chat.deleted_at.is_not(None))
        .order_by(Chat.deleted_at.desc(), Chat.id.desc())
        .limit(RECENT_ACTIVITY_LIMIT)
    ).all()
    activity = [
        {
            "type": "document_uploaded",
            "id": str(document_id),
            "label": filename,
            "timestamp": created_at,
        }
        for document_id, filename, created_at in recent_documents
    ] + [
        {
            "type": "conversation_updated",
            "id": str(chat_id),
            "label": title or "Untitled conversation",
            "timestamp": updated_at,
        }
        for chat_id, title, updated_at in activity_chats
    ] + [
        {
            "type": "conversation_deleted",
            "id": str(chat_id),
            "label": title or "Untitled conversation",
            "timestamp": deleted_at,
        }
        for chat_id, title, deleted_at in deleted_chats
    ]
    activity.sort(key=lambda item: item["timestamp"], reverse=True)
    for item in activity:
        item["timestamp"] = item["timestamp"].isoformat()

    return {
        "subscription": subscription_summary(db, current_user),
        "usage": usage_summary(db, current_user),
        "documents": {
            "total": total,
            "by_status": by_status,
            "by_format": by_format,
            "storage_bytes": storage_bytes,
        },
        "recent_conversations": [_chat_summary(chat) for chat in recent_chats],
        "recent_activity": activity[:RECENT_ACTIVITY_LIMIT],
    }
