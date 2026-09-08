from io import BytesIO
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session

from app.api.chat_routes import message_payload, validated_model
from app.api.deps import get_current_user, get_owned_document
from app.api.pagination import decode_cursor, encode_cursor
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import (
    Document,
    DocumentStatus,
    Folder,
    ProcessingJob,
    ProcessingJobStatus,
    User,
)
from app.models import DocumentChunk
from app.models.mixins import utc_now
from app.services.chat import get_or_create_chat, stream_chat_response
from app.services.preview import PREVIEW_PDF_FORMATS, DocumentPreviewConverter
from app.services.processing import DEFAULT_CHUNK_OVERLAP_TOKENS, UnsupportedFileError
from app.services.storage import build_document_object_key, get_storage_service
from app.services.billing import FREE_PLAN_ID, get_active_plan
from app.services.usage import BYTES_PER_MB, LimitExceeded, check_and_increment, check_storage
from app.services.vector import VectorService, get_vector_service
from app.worker import enqueue_document_processing

router = APIRouter()
logger = logging.getLogger(__name__)


def _enum_value(value: object) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _inline_pdf_disposition(filename: str) -> str:
    safe_filename = filename.replace("\\", "_").replace('"', "'")
    return f'inline; filename="{safe_filename}"'


def _preview_pdf_filename(filename: str) -> str:
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{stem}.pdf"

@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("select 1"))
    return {"status": "ready"}


@router.get("/api/me")
def me(current_user: User = Depends(get_current_user)) -> dict[str, str | None]:
    return {
        "id": str(current_user.id),
        "clerk_user_id": current_user.clerk_user_id,
        "email": current_user.email,
        "name": current_user.name,
    }


def _owned_folder_or_422(db: Session, user: User, raw_folder_id: object) -> Folder:
    """Resolve a client-supplied folder id; unknown, malformed, or cross-user
    folders are a validation error (422), not a 404, because the folder is
    payload here rather than the addressed resource."""
    try:
        folder_uuid = UUID(str(raw_folder_id))
    except ValueError:
        raise HTTPException(status_code=422, detail="Folder not found")
    folder = db.get(Folder, folder_uuid)
    if folder is None or folder.user_id != user.id:
        raise HTTPException(status_code=422, detail="Folder not found")
    return folder


def _document_summary(document: Document) -> dict[str, object]:
    return {
        "id": str(document.id),
        "folder_id": str(document.folder_id) if document.folder_id else None,
        "original_filename": document.original_filename,
        "format": document.format,
        "status": _enum_value(document.status),
        "file_size_bytes": document.file_size_bytes,
        "page_count": document.page_count,
        "chunk_count": document.chunk_count,
        "created_at": document.created_at.isoformat(),
        "processed_at": document.processed_at.isoformat() if document.processed_at else None,
        "failure_code": document.failure_code,
        "failure_message": document.failure_message,
    }

DOCUMENT_LIST_DEFAULT_LIMIT = 50
DOCUMENT_LIST_MAX_LIMIT = 100


@router.get("/api/documents")
def list_documents(
    status_filter: Annotated[DocumentStatus | None, Query(alias="status")] = None,
    folder_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=DOCUMENT_LIST_MAX_LIMIT)] = DOCUMENT_LIST_DEFAULT_LIMIT,
    cursor: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    statement = (
        select(Document)
        .where(Document.user_id == current_user.id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc(), Document.id.desc())
        .limit(limit + 1)
    )
    if status_filter:
        statement = statement.where(Document.status == status_filter)
    if folder_id == "root":
        statement = statement.where(Document.folder_id.is_(None))
    elif folder_id:
        try:
            statement = statement.where(Document.folder_id == UUID(folder_id))
        except ValueError:
            raise HTTPException(status_code=422, detail="folder_id must be a UUID or 'root'")
    if cursor:
        cursor_created_at, cursor_document_id = decode_cursor(cursor, detail="Invalid document cursor")
        statement = statement.where(
            or_(
                Document.created_at < cursor_created_at,
                (Document.created_at == cursor_created_at) & (Document.id < cursor_document_id),
            )
        )
    documents = list(db.scalars(statement).all())
    visible_documents = documents[:limit]
    next_cursor = (
        encode_cursor(visible_documents[-1].created_at, visible_documents[-1].id)
        if len(documents) > limit
        else None
    )
    return {"items": [_document_summary(document) for document in visible_documents], "next_cursor": next_cursor}

UPLOAD_READ_CHUNK_BYTES = 1024 * 1024
FREE_PLAN_MAX_UPLOAD_MB = 20
PREMIUM_PLAN_MAX_UPLOAD_MB = 50

# extension -> (format, canonical content type). Browsers are inconsistent, so a
# generic content type falls back to the extension.
UPLOAD_FORMATS: dict[str, tuple[str, str]] = {
    ".pdf": ("pdf", "application/pdf"),
    ".docx": ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".pptx": ("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ".txt": ("txt", "text/plain"),
    ".rtf": ("rtf", "application/rtf"),
}
# Windows registers .rtf as application/msword, so that's what Chrome/Edge send.
EXTRA_UPLOAD_CONTENT_TYPES: dict[str, set[str]] = {"rtf": {"text/rtf", "application/msword", "text/richtext"}}
GENERIC_UPLOAD_CONTENT_TYPES = {"", "application/octet-stream"}
UNSUPPORTED_UPLOAD_DETAIL = "Unsupported file type. Upload a PDF, DOCX, PPTX, TXT, or RTF file."


def _resolve_upload_format(file: UploadFile) -> tuple[str, str]:
    """Return (format, content_type) or raise 415."""
    filename = (file.filename or "").lower()
    extension = filename[filename.rfind(".") :] if "." in filename else ""
    entry = UPLOAD_FORMATS.get(extension)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_UPLOAD_DETAIL)

    document_format, canonical_type = entry
    content_type = (file.content_type or "").lower()
    if content_type in GENERIC_UPLOAD_CONTENT_TYPES:
        return document_format, canonical_type
    if content_type == canonical_type or content_type in EXTRA_UPLOAD_CONTENT_TYPES.get(document_format, set()):
        return document_format, content_type
    raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=UNSUPPORTED_UPLOAD_DETAIL)

def _plan_upload_limit_mb(plan_id: str) -> int:
    return FREE_PLAN_MAX_UPLOAD_MB if plan_id == FREE_PLAN_ID else PREMIUM_PLAN_MAX_UPLOAD_MB


def _check_plan_upload_size(incoming_bytes: int, limit_mb: int) -> None:
    if incoming_bytes > limit_mb * BYTES_PER_MB:
        used_mb = (incoming_bytes + BYTES_PER_MB - 1) // BYTES_PER_MB
        raise LimitExceeded("file_size", limit=limit_mb, used=used_mb)


async def _read_upload(file: UploadFile, max_bytes: int) -> bytes:
    chunks = bytearray()
    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        chunks.extend(chunk)
        if len(chunks) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File exceeds the configured upload limit",
            )
    return bytes(chunks)


@router.post("/api/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: Annotated[UploadFile, File()],
    folder_id: Annotated[str | None, Form()] = None,
    content_length: Annotated[str | None, Header(alias="content-length")] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    folder = _owned_folder_or_422(db, current_user, folder_id) if folder_id else None
    plan = get_active_plan(db, current_user)
    plan_upload_limit_mb = _plan_upload_limit_mb(plan.id)
    max_upload_mb = max(settings.max_upload_mb, PREMIUM_PLAN_MAX_UPLOAD_MB)
    max_bytes = max_upload_mb * BYTES_PER_MB
    parsed_content_length = int(content_length) if content_length and content_length.isdigit() else None
    if parsed_content_length is not None and parsed_content_length > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds the configured upload limit",
        )
    document_format, content_type = _resolve_upload_format(file)
    content = await _read_upload(file, max_bytes)
    _check_plan_upload_size(len(content), plan_upload_limit_mb)

    # Plan limits before any document row exists; the increment only becomes
    # durable at the final commit, so a failed upload does not consume quota.
    check_and_increment(db, current_user, "upload")
    check_storage(db, current_user, len(content))

    document = Document(
        user_id=current_user.id,
        folder_id=folder.id if folder else None,
        original_filename=file.filename or f"upload.{document_format}",
        content_type=content_type,
        format=document_format,
        file_size_bytes=len(content),
        status=DocumentStatus.UPLOADED,
        wasabi_bucket=settings.wasabi_bucket,
        wasabi_object_key="pending",
        pinecone_namespace=settings.pinecone_namespace,
    )
    db.add(document)
    db.flush()
    document.wasabi_object_key = build_document_object_key(current_user.id, document.id, document_format)

    storage_service = get_storage_service(settings)
    try:
        storage_service.upload_pdf(document.wasabi_object_key, content, document.content_type)
    except Exception:
        # Nothing is committed yet, so the flushed document is discarded on session close.
        logger.exception(
            "Failed to store uploaded PDF",
            extra={"document_id": str(document.id), "user_id": str(current_user.id)},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to store the uploaded file. Please try again.",
        )

    job = ProcessingJob(
        user_id=current_user.id,
        document_id=document.id,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(document)
    db.refresh(job)
    enqueue_document_processing(settings, document.id)
    logger.info("Document uploaded", extra={"document_id": str(document.id), "user_id": str(current_user.id)})

    return {
        "id": str(document.id),
        "status": _enum_value(document.status),
        "processing_job_id": str(job.id),
    }


@router.get("/api/documents/{document_id}")
def document_detail(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_owned_document(db, current_user, document_id)
    return _document_summary(document)


@router.patch("/api/documents/{document_id}")
def move_document(
    document_id: UUID,
    payload: dict[str, object],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_owned_document(db, current_user, document_id)
    if "folder_id" not in payload:
        raise HTTPException(status_code=422, detail="folder_id is required")
    raw_folder_id = payload["folder_id"]
    document.folder_id = (
        _owned_folder_or_422(db, current_user, raw_folder_id).id if raw_folder_id is not None else None
    )
    db.commit()
    db.refresh(document)
    return _document_summary(document)


@router.delete("/api/documents/{document_id}")
def delete_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    document = get_owned_document(db, current_user, document_id)
    document.status = DocumentStatus.DELETING
    document.deleted_at = utc_now()

    # Best-effort external cleanup: a third-party failure must not block the
    # soft-delete or leak a 500. Orphans are logged for ops follow-up.
    try:
        get_storage_service(settings).delete_pdf(document)
    except Exception:
        logger.exception("Failed to delete PDF from storage", extra={"document_id": str(document.id)})
    try:
        get_vector_service(settings).delete_document_vectors(current_user, document)
    except Exception:
        logger.exception("Failed to delete document vectors", extra={"document_id": str(document.id)})

    db.commit()
    logger.info("Document deleted", extra={"document_id": str(document.id), "user_id": str(current_user.id)})
    return {"status": DocumentStatus.DELETING.value}


@router.post("/api/documents/{document_id}/retry")
def retry_document_processing(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    document = get_owned_document(db, current_user, document_id)
    if document.status != DocumentStatus.FAILED:
        raise HTTPException(status_code=409, detail="Only failed documents can be retried")
    document.status = DocumentStatus.UPLOADED
    document.failure_code = None
    document.failure_message = None
    job = ProcessingJob(
        user_id=current_user.id,
        document_id=document.id,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    enqueue_document_processing(settings, document.id)
    logger.info("Document processing retry enqueued", extra={"document_id": str(document.id)})
    return {"processing_job_id": str(job.id), "status": ProcessingJobStatus.QUEUED.value}


@router.get("/api/documents/{document_id}/file-url")
def document_file_url(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    document = get_owned_document(db, current_user, document_id)
    return get_storage_service(settings).signed_file_url(document)


@router.get("/api/documents/{document_id}/preview-file")
def document_preview_file(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    document = get_owned_document(db, current_user, document_id)
    storage_service = get_storage_service(settings)
    document_format = document.format or "pdf"
    if document_format == "pdf":
        preview_bytes = storage_service.download_pdf(document)
        preview_filename = document.original_filename
    elif document_format in PREVIEW_PDF_FORMATS:
        preview_bytes = storage_service.download_preview_pdf(document)
        preview_filename = _preview_pdf_filename(document.original_filename)
        if not preview_bytes and document.status == DocumentStatus.READY:
            original_bytes = storage_service.download_pdf(document)
            if original_bytes:
                try:
                    preview_bytes = DocumentPreviewConverter(
                        timeout_seconds=settings.document_preview_conversion_timeout_seconds
                    ).convert_to_pdf(original_bytes, document_format)
                    try:
                        storage_service.upload_preview_pdf(document, preview_bytes)
                    except Exception:
                        logger.exception("Document preview PDF could not be cached", extra={"document_id": str(document.id)})
                except UnsupportedFileError:
                    logger.info("Document preview PDF could not be generated", extra={"document_id": str(document.id)})
    else:
        raise HTTPException(status_code=404, detail="Preview PDF is not available for this file type")

    if not preview_bytes:
        raise HTTPException(status_code=404, detail="Preview PDF is not available")

    return StreamingResponse(
        BytesIO(preview_bytes),
        media_type="application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": _inline_pdf_disposition(preview_filename),
        },
    )

@router.get("/api/documents/{document_id}/file")
def document_file(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    document = get_owned_document(db, current_user, document_id)
    pdf_bytes = get_storage_service(settings).download_pdf(document)
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="PDF file is not available")

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type=document.content_type or "application/pdf",
        headers={
            "Cache-Control": "private, no-store",
            "Content-Disposition": _inline_pdf_disposition(document.original_filename),
        },
    )


@router.get("/api/documents/{document_id}/pages")
def document_pages(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    """Extracted text grouped by page/section for the workspace preview.

    Chunks are stored with a sliding window (overlap=DEFAULT_CHUNK_OVERLAP_TOKENS),
    so joining chunks on the same page would repeat the overlap. Drop those
    tokens from every chunk after the first on each page."""
    document = get_owned_document(db, current_user, document_id)
    chunks = db.scalars(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document.id)
        .order_by(DocumentChunk.chunk_index)
    ).all()

    pages: list[dict[str, object]] = []
    current_page: int | None = None
    current_tokens: list[str] = []

    def flush() -> None:
        if current_page is None:
            return
        pages.append({"page_number": current_page, "text": " ".join(current_tokens).strip()})

    for chunk in chunks:
        chunk_tokens = chunk.text.split()
        if chunk.page_start != current_page:
            flush()
            current_page = chunk.page_start
            current_tokens = list(chunk_tokens)
            continue
        current_tokens.extend(chunk_tokens[DEFAULT_CHUNK_OVERLAP_TOKENS:])
    flush()

    return {
        "document_id": str(document.id),
        "format": document.format,
        "pages": pages,
    }


@router.get("/api/documents/{document_id}/processing-status")
def document_processing_status(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str | None]:
    document = get_owned_document(db, current_user, document_id)
    job = document.processing_jobs[-1] if document.processing_jobs else None
    return {
        "document_id": str(document.id),
        "status": _enum_value(document.status),
        "current_step": job.current_step if job else _enum_value(document.status),
        "failure_code": document.failure_code,
        "failure_message": document.failure_message,
    }


@router.get("/api/documents/{document_id}/chat")
def get_document_chat(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    document = get_owned_document(db, current_user, document_id)
    chat = get_or_create_chat(db, current_user, document)
    db.refresh(chat)
    return {
        "chat": {
            "id": str(chat.id),
            "document_id": str(document.id),
            "title": chat.title,
            "model": chat.model,
        },
        "messages": [message_payload(message) for message in chat.messages],
    }


@router.post("/api/documents/{document_id}/chat/stream")
def stream_document_chat(
    document_id: UUID,
    payload: dict[str, str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    document = get_owned_document(db, current_user, document_id)
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Message content is required")
    model = validated_model(payload, settings)

    vector_service = get_vector_service(settings)
    return StreamingResponse(
        stream_chat_response(db, current_user, document, content, vector_service, model=model, settings=settings),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )








