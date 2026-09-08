from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_owned_chat
from app.api.pagination import decode_cursor, encode_cursor
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import Chat, Document, DocumentStatus, Folder, Message, MessageSource, User
from app.models.mixins import utc_now
from app.services.billing import get_active_plan
from app.services.chat import create_chat, folder_scope, stream_chat_response
from app.services.usage import check_model_allowed, check_scope_size, require_premium_plan
from app.services.vector import get_vector_service

router = APIRouter()

CHAT_LIST_DEFAULT_LIMIT = 50
CHAT_LIST_MAX_LIMIT = 100
CHAT_TITLE_MAX_CHARS = 512


def _enum_value(value: object) -> str:
    return value.value if hasattr(value, "value") else str(value)


def message_payload(message: Message) -> dict[str, object]:
    return {
        "id": str(message.id),
        "role": _enum_value(message.role),
        "content": message.content,
        "created_at": message.created_at.isoformat(),
        "sources": [
            {
                "source_id": str(source.id),
                "chunk_id": str(source.chunk_id) if source.chunk_id else None,
                "document_id": str(source.document_id),
                "document_filename": source.document.original_filename,
                "page_start": source.page_start,
                "page_end": source.page_end,
                "excerpt": source.excerpt,
                "score": source.score,
            }
            for source in message.sources
        ],
    }


def _chat_summary(chat: Chat) -> dict[str, object]:
    # Folder chats have no chat_documents rows; their documents reflect the
    # folder's current READY documents at read time.
    documents = folder_scope(chat.folder) if chat.folder_id else chat.documents
    return {
        "id": str(chat.id),
        "title": chat.title,
        "model": chat.model,
        "folder": {"id": str(chat.folder.id), "name": chat.folder.name} if chat.folder_id else None,
        "documents": [
            {
                "id": str(document.id),
                "original_filename": document.original_filename,
                "format": document.format,
            }
            for document in documents
        ],
        "created_at": chat.created_at.isoformat(),
        "updated_at": chat.updated_at.isoformat(),
    }


def validated_model(payload: dict[str, object], settings: Settings) -> str | None:
    """Optional "model": a tier ("fast"/"quality") or a raw id from the
    operator allowlist. Shared by chat creation and both stream endpoints."""
    model = payload.get("model")
    if model is None:
        return None
    if not isinstance(model, str) or (
        model not in ("fast", "quality") and model not in settings.allowed_chat_models()
    ):
        raise HTTPException(status_code=422, detail="Model is not allowed")
    return model


def _validated_title(payload: dict[str, object]) -> str | None:
    title = payload.get("title")
    if title is None:
        return None
    if not isinstance(title, str):
        raise HTTPException(status_code=422, detail="Title must be a string")
    title = title.strip()
    if len(title) > CHAT_TITLE_MAX_CHARS:
        raise HTTPException(status_code=422, detail="Title must be 512 characters or fewer")
    return title or None


@router.get("/api/chats")
def list_chats(
    limit: Annotated[int, Query(ge=1, le=CHAT_LIST_MAX_LIMIT)] = CHAT_LIST_DEFAULT_LIMIT,
    cursor: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    statement = (
        select(Chat)
        .options(selectinload(Chat.documents), selectinload(Chat.folder).selectinload(Folder.documents))
        .where(Chat.user_id == current_user.id, Chat.deleted_at.is_(None))
        .order_by(Chat.created_at.desc(), Chat.id.desc())
        .limit(limit + 1)
    )
    if cursor:
        cursor_created_at, cursor_chat_id = decode_cursor(cursor, detail="Invalid chat cursor")
        statement = statement.where(
            or_(
                Chat.created_at < cursor_created_at,
                (Chat.created_at == cursor_created_at) & (Chat.id < cursor_chat_id),
            )
        )
    chats = list(db.scalars(statement).all())
    visible_chats = chats[:limit]
    next_cursor = (
        encode_cursor(visible_chats[-1].created_at, visible_chats[-1].id) if len(chats) > limit else None
    )
    return {"items": [_chat_summary(chat) for chat in visible_chats], "next_cursor": next_cursor}


@router.post("/api/chats", status_code=status.HTTP_201_CREATED)
def create_chat_route(
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    model = validated_model(payload, settings)
    raw_document_ids = payload.get("document_ids")
    raw_folder_id = payload.get("folder_id")
    if (raw_folder_id is None) == (raw_document_ids is None):
        raise HTTPException(status_code=422, detail="Provide exactly one of document_ids or folder_id")

    plan = get_active_plan(db, current_user)
    check_model_allowed(plan, settings.resolve_chat_model(model))

    if raw_folder_id is not None:
        require_premium_plan(plan, "folder_chat")
        try:
            folder_uuid = UUID(str(raw_folder_id))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="folder_id must be a valid UUID") from exc
        folder = db.get(Folder, folder_uuid)
        if folder is None or folder.user_id != current_user.id:
            raise HTTPException(status_code=422, detail="Folder not found")
        # Scope (READY documents, plan size limit) is resolved and enforced at
        # message time, so a growing folder stays part of this conversation.
        chat = Chat(
            user_id=current_user.id, folder_id=folder.id, title=_validated_title(payload), model=model
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)
        return _chat_summary(chat)

    if not isinstance(raw_document_ids, list) or not raw_document_ids:
        raise HTTPException(status_code=422, detail="document_ids must be a non-empty list")
    try:
        document_ids = list(dict.fromkeys(UUID(str(raw_id)) for raw_id in raw_document_ids))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="document_ids must contain valid UUIDs") from exc

    check_scope_size(plan, document_ids)

    documents: list[Document] = []
    for document_id in document_ids:
        document = db.get(Document, document_id)
        if document is None or document.user_id != current_user.id or document.deleted_at is not None:
            raise HTTPException(status_code=422, detail="Document not found")
        if document.status != DocumentStatus.READY:
            raise HTTPException(status_code=422, detail="Document is not ready for chat")
        documents.append(document)

    chat = create_chat(db, current_user, documents, title=_validated_title(payload), model=model)
    return _chat_summary(chat)


@router.get("/api/chats/{chat_id}")
def chat_detail(
    chat_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    chat = get_owned_chat(db, current_user, chat_id)
    db.scalars(
        select(Chat)
        .options(
            selectinload(Chat.documents),
            selectinload(Chat.folder).selectinload(Folder.documents),
            selectinload(Chat.messages).selectinload(Message.sources).selectinload(MessageSource.document),
        )
        .where(Chat.id == chat.id)
    ).first()
    return {
        "chat": _chat_summary(chat),
        "messages": [message_payload(message) for message in chat.messages],
    }


@router.patch("/api/chats/{chat_id}")
def rename_chat(
    chat_id: UUID,
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    chat = get_owned_chat(db, current_user, chat_id)
    title = _validated_title(payload)
    if not title:
        raise HTTPException(status_code=422, detail="Title is required")
    chat.title = title
    db.commit()
    db.refresh(chat)
    return _chat_summary(chat)


@router.delete("/api/chats/{chat_id}")
def delete_chat(
    chat_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    chat = get_owned_chat(db, current_user, chat_id)
    chat.deleted_at = utc_now()
    db.commit()
    return {"status": "deleted"}


@router.post("/api/chats/{chat_id}/messages/stream")
def stream_chat_message(
    chat_id: UUID,
    payload: dict[str, str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    chat = get_owned_chat(db, current_user, chat_id)
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Message content is required")
    model = validated_model(payload, settings)
    if chat.folder_id is not None:
        require_premium_plan(get_active_plan(db, current_user), "folder_chat")
        # Folder chats resolve scope at message time from the folder's current
        # READY documents; the plan's scope limit is re-checked here because
        # the folder may have grown since the chat was created.
        scope = folder_scope(chat.folder)
        if not scope:
            raise HTTPException(status_code=409, detail="Folder has no ready documents")
        check_scope_size(get_active_plan(db, current_user), [document.id for document in scope])
    else:
        scope = list(chat.documents)
        if not scope:
            raise HTTPException(status_code=409, detail="Chat has no documents in scope")

    vector_service = get_vector_service(settings)
    return StreamingResponse(
        stream_chat_response(
            db, current_user, scope, content, vector_service, chat=chat, model=model, settings=settings
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
