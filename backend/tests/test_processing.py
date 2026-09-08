import pytest

from app.models import Document, DocumentStatus, ProcessingJob, ProcessingJobStatus, User
from app.models import DocumentChunk
from app.services.extractors import DocumentTextExtractor
from app.services.processing import (
    ExtractedPage,
    MaxPagesExceededError,
    NoExtractableTextError,
    UnsupportedFileError,
    process_document,
)
from app.services.processing import chunk_pages
from app.services.vector import DOCUMENT_INTELLIGENCE_VERSION


class NoTextExtractor:
    def extract_pages(self, _document):
        return []


class CorruptFileExtractor:
    def extract_pages(self, _document):
        raise UnsupportedFileError("This DOCX file could not be opened. It may be corrupt.")


class UnusedVectorService:
    def embed_texts(self, _texts):
        raise AssertionError("embedding should not run without extracted text")

    def upsert_document_chunks(self, _user, _document, _chunks, _vectors):
        raise AssertionError("indexing should not run without extracted text")


class TextExtractor:
    def extract_pages(self, _document):
        return [
            ExtractedPage(page_number=1, text=" First page with useful text. "),
            ExtractedPage(page_number=2, text="Second page with more useful text."),
        ]


class NulTextExtractor:
    def extract_pages(self, _document):
        return [ExtractedPage(page_number=1, text="Text before\x00\x01text after\nnext line")]


class TooManyPagesExtractor:
    def extract_pages(self, _document):
        return [
            ExtractedPage(page_number=1, text="Page one."),
            ExtractedPage(page_number=2, text="Page two."),
        ]


class RecordingVectorService:
    def __init__(self):
        self.upserted = []

    def embed_texts(self, texts):
        return [[float(index)] for index, _text in enumerate(texts)]

    def upsert_document_chunks(self, user, document, chunks, vectors):
        self.upserted.append(
            {
                "user_id": user.id,
                "document_id": document.id,
                "chunk_count": len(list(chunks)),
                "vector_count": len(vectors),
            }
        )


class FailingEmbeddingVectorService(RecordingVectorService):
    def embed_texts(self, _texts):
        raise RuntimeError("private provider failure details")


class InsightVectorService(RecordingVectorService):
    def __init__(self):
        super().__init__()
        self.insight_sources = []

    def generate_document_insight(self, sources):
        self.insight_sources = sources
        return {
            "version": DOCUMENT_INTELLIGENCE_VERSION,
            "summary": "- Summary from cache (p. 1)",
            "key_takeaways": "- Takeaway from cache (p. 1)",
            "action_items": "- No explicit action items found in the provided context.",
            "attention_points": "- Pay attention to the core concept (p. 2)",
            "sources": [
                {
                    "chunk_id": source.chunk_id,
                    "page_start": source.page_start,
                    "page_end": source.page_end,
                    "excerpt": source.excerpt,
                }
                for source in sources
            ],
        }


class FailingInsightVectorService(RecordingVectorService):
    def generate_document_insight(self, _sources):
        raise RuntimeError("insight unavailable")


class StaticStorage:
    def __init__(self, data: bytes):
        self.data = data
        self.preview_pdf = None

    def download_pdf(self, _document):
        return self.data

    def upload_preview_pdf(self, _document, content: bytes):
        self.preview_pdf = content

class StaticPreviewConverter:
    def __init__(self, preview_pdf: bytes):
        self.preview_pdf = preview_pdf
        self.calls = []

    def convert_to_pdf(self, data: bytes, document_format: str) -> bytes:
        self.calls.append({"data": data, "format": document_format})
        return self.preview_pdf

def _blank_pdf_bytes(page_count: int) -> bytes:
    import fitz

    pdf = fitz.open()
    for _ in range(page_count):
        pdf.new_page()
    return pdf.tobytes()

def _text_pdf_bytes(*page_texts: str) -> bytes:
    import fitz

    pdf = fitz.open()
    for text in page_texts:
        page = pdf.new_page()
        page.insert_text((72, 72), text)
    return pdf.tobytes()

def _document_with_job(db_session, clerk_id: str, **overrides) -> tuple[Document, ProcessingJob]:
    user = User(clerk_user_id=clerk_id, email=f"{clerk_id}@example.com")
    fields = {
        "user": user,
        "original_filename": "scan.pdf",
        "content_type": "application/pdf",
        "file_size_bytes": 200,
        "status": DocumentStatus.UPLOADED,
        "wasabi_bucket": "bucket",
        "wasabi_object_key": "users/user/documents/doc/original.pdf",
        "pinecone_namespace": "test",
    }
    fields.update(overrides)
    document = Document(**fields)
    job = ProcessingJob(user=user, document=document, status=ProcessingJobStatus.QUEUED, current_step="queued")
    db_session.add_all([user, document, job])
    db_session.commit()
    return document, job


def test_no_text_processing_marks_document_and_job_failed(db_session):
    user = User(clerk_user_id="user_processing", email="processing@example.com")
    document = Document(
        user=user,
        original_filename="scan.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()

    try:
        process_document(
            db_session,
            document.id,
            extractor=NoTextExtractor(),
            vector_service=UnusedVectorService(),
        )
    except NoExtractableTextError:
        pass

    db_session.refresh(document)
    db_session.refresh(job)

    assert document.status == DocumentStatus.FAILED
    assert document.failure_code == "no_extractable_text"
    assert "text-based PDFs" in document.failure_message
    assert job.status == ProcessingJobStatus.FAILED
    assert job.error_code == "no_extractable_text"


def test_text_processing_stores_chunks_indexes_vectors_and_marks_ready(db_session):
    user = User(clerk_user_id="user_ready", email="ready@example.com")
    document = Document(
        user=user,
        original_filename="text.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()
    vector_service = RecordingVectorService()

    process_document(
        db_session,
        document.id,
        extractor=TextExtractor(),
        vector_service=vector_service,
    )

    db_session.refresh(document)
    db_session.refresh(job)
    chunks = db_session.query(DocumentChunk).order_by(DocumentChunk.chunk_index).all()

    assert document.status == DocumentStatus.READY
    assert document.chunk_count == 2
    assert job.status == ProcessingJobStatus.SUCCEEDED
    assert [chunk.page_start for chunk in chunks] == [1, 2]
    assert vector_service.upserted == [
        {
            "user_id": user.id,
            "document_id": document.id,
            "chunk_count": 2,
            "vector_count": 2,
        }
    ]


def test_processing_removes_nul_characters_before_storing_chunks(db_session):
    document, job = _document_with_job(db_session, "user_nul_text")
    vector_service = RecordingVectorService()

    process_document(
        db_session,
        document.id,
        extractor=NulTextExtractor(),
        vector_service=vector_service,
    )

    db_session.refresh(document)
    db_session.refresh(job)
    chunk = db_session.query(DocumentChunk).filter_by(document_id=document.id).one()

    assert document.status == DocumentStatus.READY
    assert job.status == ProcessingJobStatus.SUCCEEDED
    assert "\x00" not in chunk.text
    assert "\x01" not in chunk.text
    assert chunk.text == "Text beforetext after next line"
    assert "\x00" not in chunk.text_excerpt
    assert "\x01" not in chunk.text_excerpt


def test_unexpected_processing_error_marks_document_and_job_failed(db_session):
    document, job = _document_with_job(db_session, "user_unexpected_failure")

    with pytest.raises(RuntimeError, match="private provider failure details"):
        process_document(
            db_session,
            document.id,
            extractor=TextExtractor(),
            vector_service=FailingEmbeddingVectorService(),
        )

    db_session.refresh(document)
    db_session.refresh(job)

    assert document.status == DocumentStatus.FAILED
    assert document.failure_code == "processing_error"
    assert document.failure_message == "We couldn't build the document search index. Please retry this document."
    assert "private provider failure details" not in document.failure_message
    assert job.status == ProcessingJobStatus.FAILED
    assert job.current_step == "failed"
    assert job.error_code == "processing_error"
    assert job.error_message == document.failure_message
    assert job.finished_at is not None


def test_text_processing_stores_document_insight_cache(db_session):
    user = User(clerk_user_id="user_insight", email="insight@example.com")
    document = Document(
        user=user,
        original_filename="text.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()
    vector_service = InsightVectorService()

    process_document(
        db_session,
        document.id,
        extractor=TextExtractor(),
        vector_service=vector_service,
    )

    db_session.refresh(document)
    assert document.status == DocumentStatus.READY
    assert document.insight_payload["summary"] == "- Summary from cache (p. 1)"
    assert document.insight_payload["sources"][0]["page_start"] == 1
    assert document.insight_generated_at is not None
    assert [source.page_start for source in vector_service.insight_sources] == [1, 2]


def test_text_processing_continues_when_document_insight_fails(db_session):
    user = User(clerk_user_id="user_insight_fail", email="insight-fail@example.com")
    document = Document(
        user=user,
        original_filename="text.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()

    process_document(
        db_session,
        document.id,
        extractor=TextExtractor(),
        vector_service=FailingInsightVectorService(),
    )

    db_session.refresh(document)
    assert document.status == DocumentStatus.READY
    assert document.insight_payload is None


def test_chunk_pages_splits_long_pages_with_token_overlap(db_session):
    user = User(clerk_user_id="user_chunking", email="chunking@example.com")
    document = Document(
        user=user,
        original_filename="long.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    db_session.add_all([user, document])
    db_session.flush()
    words = [f"term{i}" for i in range(1300)]

    chunks = chunk_pages(
        document,
        [ExtractedPage(page_number=3, text=" ".join(words))],
        target_tokens=1000,
        overlap_tokens=150,
    )

    assert len(chunks) == 2
    assert [chunk.token_count for chunk in chunks] == [1000, 450]
    assert chunks[0].text.split()[-150:] == chunks[1].text.split()[:150]
    assert [chunk.page_start for chunk in chunks] == [3, 3]


def test_document_text_extractor_stores_preview_pdf_and_extracts_rendered_pages(db_session):
    document, _job = _document_with_job(
        db_session,
        "user_preview_extract",
        original_filename="brief.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format="docx",
        wasabi_object_key="users/user/documents/doc/original.docx",
    )
    preview_pdf = _text_pdf_bytes("Rendered first page text", "Rendered second page text")
    storage = StaticStorage(b"original docx bytes")
    converter = StaticPreviewConverter(preview_pdf)

    pages = DocumentTextExtractor(storage, converter).extract_pages(document)

    assert converter.calls == [{"data": b"original docx bytes", "format": "docx"}]
    assert storage.preview_pdf == preview_pdf
    assert [page.page_number for page in pages] == [1, 2]
    assert "Rendered first page text" in pages[0].text
    assert "Rendered second page text" in pages[1].text
    assert document.page_count == 2

def test_processing_fails_before_embedding_when_pdf_exceeds_page_limit(db_session):
    user = User(clerk_user_id="user_page_limit", email="limit@example.com")
    document = Document(
        user=user,
        original_filename="long.pdf",
        content_type="application/pdf",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.pdf",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()

    try:
        process_document(
            db_session,
            document.id,
            extractor=TooManyPagesExtractor(),
            vector_service=UnusedVectorService(),
            max_pdf_pages=1,
        )
    except MaxPagesExceededError:
        pass

    db_session.refresh(document)
    db_session.refresh(job)

    assert document.status == DocumentStatus.FAILED
    assert document.failure_code == "max_pdf_pages_exceeded"
    assert job.status == ProcessingJobStatus.FAILED
    assert job.error_code == "max_pdf_pages_exceeded"


def test_no_text_pdf_failure_records_page_count(db_session):
    document, job = _document_with_job(db_session, "user_no_text_pages")

    with pytest.raises(NoExtractableTextError):
        process_document(
            db_session,
            document.id,
            extractor=DocumentTextExtractor(StaticStorage(_blank_pdf_bytes(3))),
            vector_service=UnusedVectorService(),
            max_pdf_pages=300,
        )

    db_session.refresh(document)
    db_session.refresh(job)
    assert document.page_count == 3
    assert document.failure_code == "no_extractable_text"
    assert job.error_code == "no_extractable_text"


def test_no_text_pdf_over_page_cap_fails_as_max_pages(db_session):
    document, job = _document_with_job(db_session, "user_no_text_cap")

    with pytest.raises(MaxPagesExceededError):
        process_document(
            db_session,
            document.id,
            extractor=DocumentTextExtractor(StaticStorage(_blank_pdf_bytes(3))),
            vector_service=UnusedVectorService(),
            max_pdf_pages=2,
        )

    db_session.refresh(document)
    db_session.refresh(job)
    assert document.page_count == 3
    assert document.failure_code == "max_pdf_pages_exceeded"
    assert "3 pages" in document.failure_message
    assert job.error_code == "max_pdf_pages_exceeded"


def test_unknown_format_document_fails_unsupported_file(db_session):
    document, job = _document_with_job(
        db_session, "user_unknown_format", original_filename="weird.xyz", format="xyz"
    )

    with pytest.raises(UnsupportedFileError):
        process_document(
            db_session,
            document.id,
            extractor=DocumentTextExtractor(StaticStorage(b"binary soup")),
            vector_service=UnusedVectorService(),
        )

    db_session.refresh(document)
    db_session.refresh(job)
    assert document.failure_code == "unsupported_file"
    assert "xyz" in document.failure_message
    assert job.error_code == "unsupported_file"


def test_txt_over_page_cap_message_counts_sections(db_session):
    document, job = _document_with_job(
        db_session, "user_txt_cap", original_filename="notes.txt", content_type="text/plain", format="txt"
    )
    text = " ".join(f"word{index}" for index in range(900)).encode("utf-8")  # two 800-word sections

    with pytest.raises(MaxPagesExceededError):
        process_document(
            db_session,
            document.id,
            extractor=DocumentTextExtractor(StaticStorage(text)),
            vector_service=UnusedVectorService(),
            max_pdf_pages=1,
        )

    db_session.refresh(document)
    assert document.failure_code == "max_pdf_pages_exceeded"
    assert "2 sections" in document.failure_message
    assert "1 sections" in document.failure_message


def test_unsupported_file_processing_marks_document_and_job_failed(db_session):
    user = User(clerk_user_id="user_unsupported", email="unsupported@example.com")
    document = Document(
        user=user,
        original_filename="corrupt.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format="docx",
        file_size_bytes=200,
        status=DocumentStatus.UPLOADED,
        wasabi_bucket="bucket",
        wasabi_object_key="users/user/documents/doc/original.docx",
        pinecone_namespace="test",
    )
    job = ProcessingJob(
        user=user,
        document=document,
        status=ProcessingJobStatus.QUEUED,
        current_step="queued",
    )
    db_session.add_all([user, document, job])
    db_session.commit()

    try:
        process_document(
            db_session,
            document.id,
            extractor=CorruptFileExtractor(),
            vector_service=UnusedVectorService(),
        )
    except UnsupportedFileError:
        pass

    db_session.refresh(document)
    db_session.refresh(job)

    assert document.status == DocumentStatus.FAILED
    assert document.failure_code == "unsupported_file"
    assert "could not be opened" in document.failure_message
    assert job.status == ProcessingJobStatus.FAILED
    assert job.error_code == "unsupported_file"




