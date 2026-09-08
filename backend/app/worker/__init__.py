"""Background worker entrypoints."""
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import SessionLocal
from app.services.extractors import DocumentTextExtractor
from app.services.preview import DocumentPreviewConverter
from app.services.processing import process_document
from app.services.storage import get_storage_service
from app.services.vector import get_vector_service

QUEUE_NAME = "mychatpdf"


def enqueue_document_processing(settings: Settings, document_id: UUID) -> None:
    if settings.database_url.startswith("sqlite"):
        return

    from redis import Redis
    from rq import Queue

    redis = Redis.from_url(settings.redis_url)
    queue = Queue(QUEUE_NAME, connection=redis)
    queue.enqueue("app.worker.process_document_job", str(document_id))


def process_document_job(document_id: str) -> None:
    settings = Settings()
    with SessionLocal() as db:
        _process_document_with_defaults(db, UUID(document_id), settings)


def _process_document_with_defaults(db: Session, document_id: UUID, settings: Settings) -> None:
    process_document(
        db,
        document_id,
        extractor=DocumentTextExtractor(
            get_storage_service(settings),
            DocumentPreviewConverter(timeout_seconds=settings.document_preview_conversion_timeout_seconds),
        ),
        vector_service=get_vector_service(settings),
        max_pdf_pages=settings.max_pdf_pages,
    )
