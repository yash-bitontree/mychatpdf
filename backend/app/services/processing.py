from dataclasses import dataclass
import logging
import re
from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models import (
    Document,
    DocumentChunk,
    DocumentStatus,
    ProcessingJob,
    ProcessingJobStatus,
)
from app.models.mixins import utc_now
from app.services.vector import DOCUMENT_INTELLIGENCE_SOURCE_LIMIT, VectorService, build_overview_sources

logger = logging.getLogger(__name__)
DEFAULT_CHUNK_TARGET_TOKENS = 1000
DEFAULT_CHUNK_OVERLAP_TOKENS = 150
UNEXPECTED_PROCESSING_ERROR_CODE = "processing_error"
UNSAFE_CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class NoExtractableTextError(RuntimeError):
    def __init__(self, message: str, page_count: int | None = None):
        super().__init__(message)
        # Pre-filter page count of the document, when the extractor knows it.
        self.page_count = page_count


class UnsupportedFileError(RuntimeError):
    pass


class MaxPagesExceededError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str


def _text_tokens(text: str) -> list[str]:
    return re.findall(r"\S+", text)


def _sanitize_extracted_text(text: str) -> str:
    """Remove unsafe control characters while preserving normal whitespace."""
    return UNSAFE_CONTROL_CHARACTERS.sub("", text)


def chunk_pages(
    document: Document,
    pages: list[ExtractedPage],
    *,
    target_tokens: int = DEFAULT_CHUNK_TARGET_TOKENS,
    overlap_tokens: int = DEFAULT_CHUNK_OVERLAP_TOKENS,
) -> list[DocumentChunk]:
    chunks: list[DocumentChunk] = []
    chunk_index = 0
    for page in pages:
        tokens = _text_tokens(_sanitize_extracted_text(page.text))
        if not tokens:
            continue

        start = 0
        step = max(1, target_tokens - overlap_tokens)
        while start < len(tokens):
            window = tokens[start : start + target_tokens]
            text = " ".join(window)
            chunks.append(
                DocumentChunk(
                    user_id=document.user_id,
                    document_id=document.id,
                    chunk_index=chunk_index,
                    page_start=page.page_number,
                    page_end=page.page_number,
                    text=text,
                    text_excerpt=text[:500],
                    token_count=len(window),
                    pinecone_vector_id=f"doc_{document.id}_chunk_{chunk_index}",
                )
            )
            chunk_index += 1
            if start + target_tokens >= len(tokens):
                break
            start += step
    return chunks


def _latest_job(document: Document) -> ProcessingJob:
    if not document.processing_jobs:
        raise RuntimeError("document has no processing job")
    return document.processing_jobs[-1]


def _fail_job(db: Session, document: Document, job: ProcessingJob, code: str, message: str) -> None:
    document.status = DocumentStatus.FAILED
    document.failure_code = code
    document.failure_message = message
    job.status = ProcessingJobStatus.FAILED
    job.current_step = "failed"
    job.error_code = code
    job.error_message = message
    job.finished_at = utc_now()
    db.commit()


def _fail_no_text(db: Session, document: Document, job: ProcessingJob) -> None:
    if (document.format or "pdf") == "pdf":
        message = "This PDF appears to be scanned or image-based. Phase 1 supports text-based PDFs only."
    else:
        message = "No readable text was found in this file."
    _fail_job(db, document, job, "no_extractable_text", message)


def _fail_unsupported_file(db: Session, document: Document, job: ProcessingJob, reason: str) -> None:
    _fail_job(db, document, job, "unsupported_file", reason or "This file could not be read.")


def _fail_max_pages(db: Session, document: Document, job: ProcessingJob, page_count: int, max_pdf_pages: int) -> None:
    # "Pages" are slides for pptx and 800-word sections for docx/txt/rtf.
    unit = {"pdf": "pages", "pptx": "slides"}.get(document.format or "pdf", "sections")
    message = f"Document has {page_count} {unit}, which exceeds the configured limit of {max_pdf_pages} {unit}."
    _fail_job(db, document, job, "max_pdf_pages_exceeded", message)


def _unexpected_failure_message(step: str) -> str:
    if step == "extracting":
        return "We couldn't read this document. Please retry. If it fails again, upload another copy."
    if step == "chunking":
        return "We couldn't prepare the extracted text for search. Please retry this document."
    if step in {"embedding", "indexing", "analyzing"}:
        return "We couldn't build the document search index. Please retry this document."
    return "We couldn't finish processing this document. Please retry. If the problem continues, contact support."


def _record_unexpected_failure(
    db: Session,
    document_id: UUID,
    job_id: UUID,
    step: str,
) -> None:
    # A failed flush leaves the session unusable until it is rolled back. Load
    # fresh model instances afterward so the failure state can be committed.
    db.rollback()
    document = db.get(Document, document_id)
    job = db.get(ProcessingJob, job_id)
    if document is None or job is None:
        logger.error(
            "Could not record document processing failure",
            extra={"document_id": str(document_id), "processing_job_id": str(job_id)},
        )
        return
    _fail_job(
        db,
        document,
        job,
        UNEXPECTED_PROCESSING_ERROR_CODE,
        _unexpected_failure_message(step),
    )


def process_document(
    db: Session,
    document_id: UUID,
    *,
    extractor,
    vector_service: VectorService,
    max_pdf_pages: int | None = None,
) -> None:
    document = db.get(Document, document_id)
    if document is None:
        raise ValueError("document not found")

    job = _latest_job(document)
    job.status = ProcessingJobStatus.RUNNING
    job.started_at = utc_now()
    job.attempt_count += 1
    document.status = DocumentStatus.EXTRACTING
    job.current_step = "extracting"
    db.commit()

    document_id = document.id
    job_id = job.id

    try:
        try:
            pages = extractor.extract_pages(document)
        except NoExtractableTextError as error:
            # An image-only document over the page cap is a page-cap failure, not
            # a no-text one; check the cap first so the failure code matches.
            page_count = document.page_count or error.page_count
            if max_pdf_pages is not None and page_count and page_count > max_pdf_pages:
                logger.info(
                    "Document exceeded page limit",
                    extra={
                        "document_id": str(document.id),
                        "page_count": page_count,
                        "max_pdf_pages": max_pdf_pages,
                    },
                )
                _fail_max_pages(db, document, job, page_count, max_pdf_pages)
                raise MaxPagesExceededError("max pdf pages exceeded") from error
            logger.info("Document has no extractable text", extra={"document_id": str(document.id)})
            _fail_no_text(db, document, job)
            raise
        except UnsupportedFileError as error:
            logger.info(
                "Document file could not be parsed",
                extra={"document_id": str(document.id), "format": document.format},
            )
            _fail_unsupported_file(db, document, job, str(error))
            raise

        page_count = document.page_count or len(pages)
        if max_pdf_pages is not None and page_count > max_pdf_pages:
            logger.info(
                "Document exceeded page limit",
                extra={
                    "document_id": str(document.id),
                    "page_count": page_count,
                    "max_pdf_pages": max_pdf_pages,
                },
            )
            _fail_max_pages(db, document, job, page_count, max_pdf_pages)
            raise MaxPagesExceededError("max pdf pages exceeded")

        pages = [
            ExtractedPage(page_number=page.page_number, text=_sanitize_extracted_text(page.text))
            for page in pages
        ]
        pages = [page for page in pages if page.text.strip()]
        if not pages:
            logger.info("Document has no extractable text", extra={"document_id": str(document.id)})
            _fail_no_text(db, document, job)
            raise NoExtractableTextError("no extractable text")

        document.status = DocumentStatus.CHUNKING
        job.current_step = "chunking"
        document.insight_payload = None
        document.insight_generated_at = None
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        chunks = chunk_pages(document, pages)
        db.add_all(chunks)
        document.chunk_count = len(chunks)
        db.commit()

        document.status = DocumentStatus.EMBEDDING
        job.current_step = "embedding"
        vectors = vector_service.embed_texts([chunk.text for chunk in chunks])
        db.commit()

        document.status = DocumentStatus.INDEXING
        job.current_step = "indexing"
        vector_service.upsert_document_chunks(document.user, document, chunks, vectors)

        insight_generator = getattr(vector_service, "generate_document_insight", None)
        if callable(insight_generator):
            job.current_step = "analyzing"
            db.commit()
            try:
                insight_payload = insight_generator(
                    build_overview_sources(chunks, limit=DOCUMENT_INTELLIGENCE_SOURCE_LIMIT)
                )
            except Exception:
                logger.exception("Document insight generation failed", extra={"document_id": str(document.id)})
            else:
                if insight_payload:
                    document.insight_payload = insight_payload
                    document.insight_generated_at = utc_now()

        document.status = DocumentStatus.READY
        document.failure_code = None
        document.failure_message = None
        document.processed_at = utc_now()
        job.status = ProcessingJobStatus.SUCCEEDED
        job.current_step = "ready"
        job.finished_at = utc_now()
        db.commit()
    except (NoExtractableTextError, UnsupportedFileError, MaxPagesExceededError):
        raise
    except Exception:
        failed_step = job.current_step or "processing"
        logger.exception(
            "Document processing failed unexpectedly",
            extra={"document_id": str(document_id), "processing_step": failed_step},
        )
        _record_unexpected_failure(db, document_id, job_id, failed_step)
        raise
