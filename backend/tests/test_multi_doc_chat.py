from uuid import UUID

import pytest

from app.core.config import Settings
from app.models import (
    Chat,
    Document,
    DocumentChunk,
    DocumentStatus,
    Message,
    MessageRole,
    MessageSource,
    Subscription,
    User,
)
from app.services.chat import create_chat, stream_chat_response
from app.services.vector import RetrievedSource


def _authenticated_user(db_session) -> User:
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    db_session.add(user)
    db_session.commit()
    return user


def _ready_document(user: User, filename: str) -> Document:
    return Document(
        user=user,
        original_filename=filename,
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key=f"users/user/documents/{filename}/original.pdf",
        pinecone_namespace="test",
    )


def _chunk(user: User, document: Document, index: int, page: int, text: str, vector_id: str) -> DocumentChunk:
    return DocumentChunk(
        user=user,
        document=document,
        chunk_index=index,
        page_start=page,
        page_end=page,
        text=text,
        text_excerpt=text,
        pinecone_vector_id=vector_id,
    )


def test_multi_doc_stream_persists_sources_from_both_documents(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document_a = _ready_document(user, "contract-a.pdf")
    document_b = _ready_document(user, "contract-b.pdf")
    db_session.add_all(
        [
            document_a,
            document_b,
            _chunk(user, document_a, 0, 12, "Contract A requires a 30 day notice before termination.", "vec-a-0"),
            _chunk(user, document_b, 0, 4, "Contract B requires a 60 day notice before termination.", "vec-b-0"),
        ]
    )
    db_session.commit()
    chat = create_chat(db_session, user, [document_a, document_b])

    with authenticated_client.stream(
        "POST",
        f"/api/chats/{chat.id}/messages/stream",
        json={"content": "Compare the termination clauses."},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "event: sources" in body
    assert '"document_filename": "contract-a.pdf"' in body
    assert '"document_filename": "contract-b.pdf"' in body
    source_document_ids = {source.document_id for source in db_session.query(MessageSource).all()}
    assert source_document_ids == {document_a.id, document_b.id}
    assistant_message = db_session.query(Message).filter_by(role=MessageRole.ASSISTANT).one()
    assert assistant_message.document_id is None

    detail = authenticated_client.get(f"/api/chats/{chat.id}")

    assert detail.status_code == 200
    filenames = {
        source["document_filename"]
        for message in detail.json()["messages"]
        for source in message["sources"]
    }
    assert filenames == {"contract-a.pdf", "contract-b.pdf"}


def test_multi_doc_stream_skips_single_doc_insight_shortcuts(db_session):
    user = _authenticated_user(db_session)
    document_a = _ready_document(user, "contract-a.pdf")
    document_b = _ready_document(user, "contract-b.pdf")
    db_session.add_all([document_a, document_b])
    db_session.commit()
    chat = create_chat(db_session, user, [document_a, document_b])

    class RecordingVectorService:
        def __init__(self):
            self.scope = None

        def generate_document_insight(self, _sources):
            raise AssertionError("multi-doc questions must not build single-doc insights")

        def query_scope(self, _user, documents, _question):
            self.scope = documents
            return []

        def stream_answer_tokens(self, _question, _sources):
            yield "ok"

    vector_service = RecordingVectorService()

    list(
        stream_chat_response(
            db_session,
            user,
            [document_a, document_b],
            "Summarize this document.",
            vector_service,
            chat=chat,
        )
    )

    assert vector_service.scope == [document_a, document_b]


def test_create_chat_with_allowed_model_persists_it(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()

    # gpt-4.1-mini is in both the settings allowlist and the free plan's models.
    response = authenticated_client.post(
        "/api/chats",
        json={"document_ids": [str(document.id)], "model": "gpt-4.1-mini"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["model"] == "gpt-4.1-mini"
    chat = db_session.get(Chat, UUID(body["id"]))
    assert chat.model == "gpt-4.1-mini"


def test_create_chat_rejects_disallowed_model(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()

    response = authenticated_client.post(
        "/api/chats",
        json={"document_ids": [str(document.id)], "model": "gpt-3.5-turbo"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Model is not allowed"


def test_create_chat_accepts_fast_tier(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()

    # "fast" resolves to gpt-4.1-mini by default, which the free plan allows.
    response = authenticated_client.post(
        "/api/chats",
        json={"document_ids": [str(document.id)], "model": "fast"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["model"] == "fast"
    assert db_session.get(Chat, UUID(body["id"])).model == "fast"


def test_create_chat_accepts_quality_tier_on_pro_plan(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add_all(
        [
            document,
            Subscription(
                user_id=user.id,
                plan_id="pro_monthly",
                stripe_subscription_id="sub_123",
                status="active",
            ),
        ]
    )
    db_session.commit()

    response = authenticated_client.post(
        "/api/chats",
        json={"document_ids": [str(document.id)], "model": "quality"},
    )

    assert response.status_code == 201
    assert response.json()["model"] == "quality"


class _ModelRecordingVectorService:
    def __init__(self):
        self.model = "unset"

    def query_document(self, _user, _document, _question):
        return []

    def stream_answer_tokens(self, _question, _sources, model=None):
        self.model = model
        yield "ok"


@pytest.mark.parametrize(
    ("tier", "expected_model"),
    [("fast", "model-fast-x"), ("quality", "model-quality-x")],
)
def test_stream_resolves_tier_to_configured_model(db_session, tier, expected_model):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    # Pro plan: no model allowlist, so gating passes for any resolved model.
    db_session.add_all(
        [
            document,
            Subscription(
                user_id=user.id,
                plan_id="pro_monthly",
                stripe_subscription_id="sub_123",
                status="active",
            ),
        ]
    )
    db_session.commit()
    chat = create_chat(db_session, user, [document], model=tier)
    settings = Settings(
        _env_file=None, openai_fast_model="model-fast-x", openai_quality_model="model-quality-x"
    )
    vector_service = _ModelRecordingVectorService()

    list(
        stream_chat_response(
            db_session,
            user,
            [document],
            "What is the notice period?",
            vector_service,
            chat=chat,
            settings=settings,
        )
    )

    assert vector_service.model == expected_model


def test_stream_model_in_body_switches_and_persists_tier(authenticated_client, db_session, monkeypatch):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add_all(
        [
            document,
            Subscription(
                user_id=user.id,
                plan_id="pro_monthly",
                stripe_subscription_id="sub_123",
                status="active",
            ),
        ]
    )
    db_session.commit()
    chat = create_chat(db_session, user, [document], model="fast")
    vector_service = _ModelRecordingVectorService()
    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: vector_service)

    with authenticated_client.stream(
        "POST",
        f"/api/chats/{chat.id}/messages/stream",
        json={"content": "Go deeper.", "model": "quality"},
    ) as response:
        response.read()

    assert response.status_code == 200
    # Conftest settings use the defaults: quality resolves to gpt-4.1.
    assert vector_service.model == "gpt-4.1"
    db_session.refresh(chat)
    assert chat.model == "quality"


def test_stream_rejects_junk_model_in_body(authenticated_client, db_session, monkeypatch):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])
    vector_service = _ModelRecordingVectorService()
    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: vector_service)

    response = authenticated_client.post(
        f"/api/chats/{chat.id}/messages/stream",
        json={"content": "Hello?", "model": "gpt-junk"},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Model is not allowed"
    assert vector_service.model == "unset"


def test_legacy_stream_accepts_tier_and_persists_it(authenticated_client, db_session, monkeypatch):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    db_session.add(document)
    db_session.commit()
    vector_service = _ModelRecordingVectorService()
    monkeypatch.setattr("app.api.routes.get_vector_service", lambda _settings: vector_service)

    with authenticated_client.stream(
        "POST",
        f"/api/documents/{document.id}/chat/stream",
        json={"content": "Summarize the notice terms.", "model": "fast"},
    ) as response:
        response.read()

    assert response.status_code == 200
    assert vector_service.model == "gpt-4.1-mini"
    chat = db_session.query(Chat).filter_by(document_id=document.id).one()
    assert chat.model == "fast"


def test_stream_uses_chat_model_override(db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "paper.pdf")
    # o4-mini is only allowed on pro plans; the stream re-checks the plan.
    db_session.add_all(
        [
            document,
            Subscription(
                user_id=user.id,
                plan_id="pro_monthly",
                stripe_subscription_id="sub_123",
                status="active",
            ),
        ]
    )
    db_session.commit()
    chat = create_chat(db_session, user, [document], model="o4-mini")

    class RecordingVectorService:
        def __init__(self):
            self.model = "unset"

        def query_document(self, _user, _document, _question):
            return []

        def stream_answer_tokens(self, _question, _sources, model=None):
            self.model = model
            yield "ok"

    vector_service = RecordingVectorService()

    list(stream_chat_response(db_session, user, [document], "What is the notice period?", vector_service, chat=chat))

    assert vector_service.model == "o4-mini"


def test_all_files_question_includes_overview_source_from_every_document(db_session):
    user = _authenticated_user(db_session)
    documents = [
        _ready_document(user, "magi.pdf"),
        _ready_document(user, "mandarin.pdf"),
        _ready_document(user, "kahaniyan.pdf"),
    ]
    chunks = [
        _chunk(user, documents[0], 0, 1, "The Gift of the Magi teaches sacrificial love and generosity.", "vec-0"),
        _chunk(user, documents[1], 0, 1, "The Mandarin file teaches extensive reading for language learning.", "vec-1"),
        _chunk(user, documents[2], 0, 1, "The Hindi story teaches unity and teamwork.", "vec-2"),
    ]
    db_session.add_all([*documents, *chunks])
    db_session.commit()
    chat = create_chat(db_session, user, documents)

    class PartialVectorService:
        def __init__(self):
            self.sources: list[RetrievedSource] = []

        def query_scope(self, _user, _documents, _question):
            return [
                RetrievedSource(
                    chunk_id=str(chunks[1].id),
                    page_start=chunks[1].page_start,
                    page_end=chunks[1].page_end,
                    excerpt=chunks[1].text_excerpt,
                    score=0.95,
                    document_id=str(documents[1].id),
                    document_filename=documents[1].original_filename,
                )
            ]

        def stream_answer_tokens(self, _question, sources):
            self.sources = sources
            yield "ok"

    vector_service = PartialVectorService()

    list(
        stream_chat_response(
            db_session,
            user,
            documents,
            "What is the summary from all the files?",
            vector_service,
            chat=chat,
        )
    )

    source_document_ids = {source.document_id for source in vector_service.sources}
    assert source_document_ids == {str(document.id) for document in documents}
    persisted_document_ids = {source.document_id for source in db_session.query(MessageSource).all()}
    assert persisted_document_ids == {document.id for document in documents}

def test_multi_doc_merge_keeps_vector_sources_when_keywords_saturate(db_session):
    user = _authenticated_user(db_session)
    documents = [_ready_document(user, f"contract-{index}.pdf") for index in range(3)]
    keyword_chunks = [
        _chunk(
            user,
            document,
            chunk_index,
            chunk_index + 1,
            f"Termination notice terms for contract {doc_index} clause {chunk_index}.",
            f"vec-{doc_index}-{chunk_index}",
        )
        for doc_index, document in enumerate(documents)
        for chunk_index in range(3)
    ]
    # Only reachable through vector retrieval: matches no keyword terms.
    vector_chunk = _chunk(user, documents[2], 3, 9, "Arbitration is governed by the Vienna rules.", "vec-2-3")
    db_session.add_all([*documents, *keyword_chunks, vector_chunk])
    db_session.commit()
    chat = create_chat(db_session, user, documents)

    class SaturatingVectorService:
        def query_scope(self, _user, _documents, _question):
            return [
                RetrievedSource(
                    chunk_id=str(vector_chunk.id),
                    page_start=9,
                    page_end=9,
                    excerpt=vector_chunk.text_excerpt,
                    score=0.95,
                    document_id=str(documents[2].id),
                    document_filename=documents[2].original_filename,
                )
            ]

        def stream_answer_tokens(self, _question, _sources):
            yield "ok"

    list(
        stream_chat_response(
            db_session,
            user,
            documents,
            "Compare the termination notice requirements.",
            SaturatingVectorService(),
            chat=chat,
        )
    )

    # 9 keyword sources would fill the whole budget; the vector source must
    # still make it into the persisted sources.
    persisted_chunk_ids = {source.chunk_id for source in db_session.query(MessageSource).all()}
    assert vector_chunk.id in persisted_chunk_ids


def test_single_doc_merge_keeps_all_lexical_sources_before_vector(db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user, "handbook.pdf")
    exact_chunks = [
        _chunk(user, document, index, index + 1, f"Problem 12 asks about the liability cap, part {index}.", f"vec-e-{index}")
        for index in range(3)
    ]
    keyword_chunks = [
        _chunk(user, document, index + 3, index + 4, f"Termination notice terms, clause {index}.", f"vec-k-{index}")
        for index in range(3)
    ]
    vector_chunks = [
        _chunk(user, document, index + 6, index + 7, f"Unrelated appendix text {index}.", f"vec-v-{index}")
        for index in range(3)
    ]
    db_session.add_all([document, *exact_chunks, *keyword_chunks, *vector_chunks])
    db_session.commit()
    chat = create_chat(db_session, user, [document])

    class VectorOnlyService:
        def query_document(self, _user, _document, _question):
            return [
                RetrievedSource(
                    chunk_id=str(chunk.id),
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    excerpt=chunk.text_excerpt,
                    score=0.9,
                )
                for chunk in vector_chunks
            ]

        def stream_answer_tokens(self, _question, _sources):
            yield "ok"

    list(
        stream_chat_response(
            db_session,
            user,
            [document],
            "What is the answer to problem 12 about the termination notice requirements?",
            VectorOnlyService(),
            chat=chat,
        )
    )

    # Single-doc merge is unchanged: all 6 lexical sources keep their slots
    # (no half-budget cap), and vector sources fill the rest up to 8.
    persisted_chunk_ids = {source.chunk_id for source in db_session.query(MessageSource).all()}
    assert {chunk.id for chunk in exact_chunks} <= persisted_chunk_ids
    assert {chunk.id for chunk in keyword_chunks} <= persisted_chunk_ids
    assert len(persisted_chunk_ids) == 8
