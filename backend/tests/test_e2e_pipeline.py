from io import BytesIO
from uuid import UUID

from app.models import Document, DocumentStatus, Message, MessageRole, MessageSource
from app.services.extractors import DocumentTextExtractor
from app.services.processing import ExtractedPage, process_document
from app.services.vector import RetrievedSource


class RecordingStorage:
    def __init__(self):
        self.uploads = []

    def upload_pdf(self, object_key, content, content_type):
        self.uploads.append(
            {
                "object_key": object_key,
                "content": content,
                "content_type": content_type,
            }
        )

    def download_pdf(self, document):
        return next(
            upload["content"] for upload in self.uploads if upload["object_key"] == document.wasabi_object_key
        )


class TextBasedPdfExtractor:
    def extract_pages(self, document):
        document.page_count = 2
        return [
            ExtractedPage(
                page_number=1,
                text="This document describes a RAG pipeline for PDF upload and chat.",
            ),
            ExtractedPage(
                page_number=2,
                text="Pipeline quality improved in regulated industries after end-to-end testing.",
            ),
        ]


class E2EVectorService:
    def __init__(self):
        self.embedding_inputs = []
        self.upserted = []
        self.questions = []

    def embed_texts(self, texts):
        self.embedding_inputs.extend(texts)
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

    def query_document(self, _user, document, question):
        self.questions.append(question)
        matching_chunk = next(chunk for chunk in document.chunks if chunk.page_start == 2)
        return [
            RetrievedSource(
                chunk_id=str(matching_chunk.id),
                page_start=2,
                page_end=2,
                excerpt=matching_chunk.text_excerpt,
                score=0.92,
            )
        ]

    def stream_answer_tokens(self, _question, _sources):
        yield "Pipeline quality improved in regulated industries after end-to-end testing."


def test_e2e_upload_process_chat_with_citation(authenticated_client, db_session, monkeypatch):
    storage = RecordingStorage()
    vector_service = E2EVectorService()
    enqueued_document_ids = []

    monkeypatch.setattr("app.api.routes.get_storage_service", lambda _settings: storage)
    monkeypatch.setattr(
        "app.api.routes.enqueue_document_processing",
        lambda _settings, document_id: enqueued_document_ids.append(document_id),
    )
    monkeypatch.setattr("app.api.routes.get_vector_service", lambda _settings: vector_service)

    upload_response = authenticated_client.post(
        "/api/documents",
        files={
            "file": (
                "rag-pipeline-quality.pdf",
                BytesIO(b"%PDF-1.7\n% e2e upload sample\n"),
                "application/pdf",
            )
        },
    )

    assert upload_response.status_code == 201
    upload_body = upload_response.json()
    document_id = UUID(upload_body["id"])
    assert upload_body["status"] == "uploaded"
    assert enqueued_document_ids == [document_id]
    assert storage.uploads[0]["content_type"] == "application/pdf"
    assert storage.uploads[0]["object_key"].endswith(f"/documents/{document_id}/original.pdf")

    process_document(
        db_session,
        document_id,
        extractor=TextBasedPdfExtractor(),
        vector_service=vector_service,
    )

    document = db_session.get(Document, document_id)
    assert document is not None
    assert document.status == DocumentStatus.READY
    assert document.page_count == 2
    assert document.chunk_count == 2
    assert len(vector_service.embedding_inputs) == 2
    assert vector_service.upserted[0]["chunk_count"] == 2

    status_response = authenticated_client.get(f"/api/documents/{document_id}/processing-status")
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "ready"

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document_id}/chat/stream",
        json={"content": "What improved?"},
    ) as chat_response:
        chat_stream = chat_response.read().decode("utf-8")

    assert chat_response.status_code == 200
    assert "event: message_start" in chat_stream
    assert "Pipeline quality improved in regulated industries" in chat_stream
    assert '"page_start": 2' in chat_stream
    assert "event: message_done" in chat_stream
    assert vector_service.questions == ["What improved?"]

    chat_history_response = authenticated_client.get(f"/api/documents/{document_id}/chat")
    assert chat_history_response.status_code == 200
    chat_history = chat_history_response.json()
    assert [message["role"] for message in chat_history["messages"]] == ["user", "assistant"]
    assert chat_history["messages"][0]["content"] == "What improved?"
    assert "Pipeline quality improved" in chat_history["messages"][1]["content"]
    assert chat_history["messages"][1]["sources"][0]["page_start"] == 2

    assert db_session.query(Message).filter_by(role=MessageRole.USER).count() == 1
    assert db_session.query(Message).filter_by(role=MessageRole.ASSISTANT).count() == 1
    assert db_session.query(MessageSource).one().page_start == 2


def test_e2e_txt_upload_processes_to_ready_and_chats(authenticated_client, db_session, monkeypatch):
    storage = RecordingStorage()
    vector_service = E2EVectorService()

    monkeypatch.setattr("app.api.routes.get_storage_service", lambda _settings: storage)
    monkeypatch.setattr("app.api.routes.enqueue_document_processing", lambda _settings, _document_id: None)
    monkeypatch.setattr("app.api.routes.get_vector_service", lambda _settings: vector_service)

    # 900 words -> two ~800-word sections, so section 2 exists for the citation.
    filler = " ".join(f"filler{index}" for index in range(880))
    text = f"{filler} Pipeline quality improved in regulated industries after end-to-end testing."

    upload_response = authenticated_client.post(
        "/api/documents",
        files={"file": ("pipeline-notes.txt", BytesIO(text.encode("utf-8")), "text/plain")},
    )

    assert upload_response.status_code == 201
    document_id = UUID(upload_response.json()["id"])
    assert storage.uploads[0]["object_key"].endswith(f"/documents/{document_id}/original.txt")

    # Real per-format extractor (no fake): exercises the txt extraction path.
    process_document(
        db_session,
        document_id,
        extractor=DocumentTextExtractor(storage),
        vector_service=vector_service,
    )

    document = db_session.get(Document, document_id)
    assert document.status == DocumentStatus.READY
    assert document.format == "txt"
    assert document.page_count == 2
    assert document.chunk_count == 2

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document_id}/chat/stream",
        json={"content": "What improved?"},
    ) as chat_response:
        chat_stream = chat_response.read().decode("utf-8")

    assert chat_response.status_code == 200
    assert "Pipeline quality improved in regulated industries" in chat_stream
    assert '"page_start": 2' in chat_stream
    assert "event: message_done" in chat_stream
