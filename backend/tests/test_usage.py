from datetime import datetime, timezone
from io import BytesIO

from app.models import (
    Document,
    DocumentStatus,
    Message,
    MessageRole,
    MessageStatus,
    Subscription,
    UsagePeriod,
    User,
)
from app.services.chat import create_chat
from app.services.usage import current_period

MB = 1024 * 1024


def _seeded_user(db_session) -> User:
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    db_session.add(user)
    db_session.commit()
    return user


def _ready_document(user: User, filename: str = "paper.pdf", size: int = 100, **overrides) -> Document:
    fields = {
        "user": user,
        "original_filename": filename,
        "content_type": "application/pdf",
        "file_size_bytes": size,
        "status": DocumentStatus.READY,
        "wasabi_bucket": "bucket",
        "wasabi_object_key": f"users/user/documents/{filename}/original.pdf",
        "pinecone_namespace": "test",
    }
    fields.update(overrides)
    return Document(**fields)


class RecordingVectorService:
    def __init__(self):
        self.query_calls = 0
        self.answer_calls = 0

    def query_document(self, _user, _document, _question):
        self.query_calls += 1
        return []

    def query_scope(self, _user, _documents, _question):
        self.query_calls += 1
        return []

    def stream_answer_tokens(self, _question, _sources, **_kwargs):
        self.answer_calls += 1
        yield "answer"


def _exhaust_message_limit(db_session, user: User) -> UsagePeriod:
    period = current_period(db_session, user)
    period.ai_messages_used = 25  # free plan limit
    db_session.commit()
    return period


def test_message_limit_returns_402_and_skips_openai(authenticated_client, db_session, monkeypatch):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])
    _exhaust_message_limit(db_session, user)
    vector_service = RecordingVectorService()
    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: vector_service)

    response = authenticated_client.post(
        f"/api/chats/{chat.id}/messages/stream", json={"content": "Hello?"}
    )

    assert response.status_code == 402
    assert response.json() == {"code": "limit_exceeded", "kind": "ai_message", "limit": 25, "used": 25}
    assert vector_service.query_calls == 0
    assert vector_service.answer_calls == 0
    assert db_session.query(Message).count() == 0


def test_message_limit_applies_to_legacy_document_stream(authenticated_client, db_session, monkeypatch):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    _exhaust_message_limit(db_session, user)
    vector_service = RecordingVectorService()
    monkeypatch.setattr("app.api.routes.get_vector_service", lambda _settings: vector_service)

    response = authenticated_client.post(
        f"/api/documents/{document.id}/chat/stream", json={"content": "Hello?"}
    )

    assert response.status_code == 402
    assert response.json()["kind"] == "ai_message"
    assert vector_service.answer_calls == 0
    assert db_session.query(Message).count() == 0


def test_message_within_limit_streams_and_increments_counter(authenticated_client, db_session, monkeypatch):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])
    vector_service = RecordingVectorService()
    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: vector_service)

    response = authenticated_client.post(
        f"/api/chats/{chat.id}/messages/stream", json={"content": "What is covered?"}
    )

    assert response.status_code == 200
    assert vector_service.answer_calls == 1
    period = db_session.query(UsagePeriod).filter_by(user_id=user.id).one()
    db_session.refresh(period)
    assert period.ai_messages_used == 1


def test_stream_rejects_premium_model_after_downgrade(authenticated_client, db_session, monkeypatch):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    # Chat was created while the user had a pro plan; the subscription is gone.
    chat = create_chat(db_session, user, [document], model="gpt-4.1")
    vector_service = RecordingVectorService()
    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: vector_service)

    response = authenticated_client.post(
        f"/api/chats/{chat.id}/messages/stream", json={"content": "Hello?"}
    )

    assert response.status_code == 402
    assert response.json()["kind"] == "chat_model"
    assert vector_service.query_calls == 0
    assert vector_service.answer_calls == 0
    assert db_session.query(Message).count() == 0


def test_failed_generation_refunds_ai_message_credit(authenticated_client, db_session, monkeypatch):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])

    class FailingVectorService(RecordingVectorService):
        def stream_answer_tokens(self, _question, _sources, **_kwargs):
            raise RuntimeError("OpenAI unavailable")
            yield ""

    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: FailingVectorService())

    with authenticated_client.stream(
        "POST", f"/api/chats/{chat.id}/messages/stream", json={"content": "Hello?"}
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert "event: error" in body
    period = db_session.query(UsagePeriod).filter_by(user_id=user.id).one()
    db_session.refresh(period)
    assert period.ai_messages_used == 0
    user_message = db_session.query(Message).filter_by(role=MessageRole.USER).one()
    assert user_message.status == MessageStatus.SUCCEEDED
    assistant_message = db_session.query(Message).filter_by(role=MessageRole.ASSISTANT).one()
    assert assistant_message.status == MessageStatus.FAILED


def test_upload_limit_returns_402(authenticated_client, db_session):
    user = _seeded_user(db_session)
    period = current_period(db_session, user)
    period.uploads_used = 3  # free plan limit
    db_session.commit()

    response = authenticated_client.post(
        "/api/documents",
        files={"file": ("paper.pdf", BytesIO(b"%PDF-1.7"), "application/pdf")},
    )

    assert response.status_code == 402
    assert response.json() == {"code": "limit_exceeded", "kind": "upload", "limit": 3, "used": 3}
    assert db_session.query(Document).count() == 0


def test_storage_limit_returns_402(authenticated_client, db_session):
    user = _seeded_user(db_session)
    existing = _ready_document(user, "big.pdf", size=50 * MB)  # free plan: 50 MB
    db_session.add(existing)
    db_session.commit()

    response = authenticated_client.post(
        "/api/documents",
        files={"file": ("paper.pdf", BytesIO(b"%PDF-1.7"), "application/pdf")},
    )

    assert response.status_code == 402
    body = response.json()
    assert body["kind"] == "storage"
    assert body["limit"] == 50
    assert body["used"] == 50


def test_deleted_documents_are_excluded_from_storage(authenticated_client, db_session):
    user = _seeded_user(db_session)
    deleted = _ready_document(
        user,
        "gone.pdf",
        size=50 * MB,
        status=DocumentStatus.DELETING,
        deleted_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
    )
    db_session.add(deleted)
    db_session.commit()

    upload = authenticated_client.post(
        "/api/documents",
        files={"file": ("paper.pdf", BytesIO(b"%PDF-1.7"), "application/pdf")},
    )
    usage = authenticated_client.get("/api/usage")

    assert upload.status_code == 201
    assert usage.json()["storage_mb"]["used"] == 0


def test_period_rollover_creates_fresh_row(db_session):
    user = _seeded_user(db_session)
    old_period = UsagePeriod(
        user_id=user.id,
        period_start=datetime(2026, 6, 1, tzinfo=timezone.utc),
        period_end=datetime(2026, 7, 1, tzinfo=timezone.utc),
        ai_messages_used=25,
        uploads_used=3,
    )
    db_session.add(old_period)
    db_session.commit()

    period = current_period(db_session, user)

    assert period.id != old_period.id
    assert period.ai_messages_used == 0
    assert period.uploads_used == 0
    assert db_session.query(UsagePeriod).count() == 2


def test_subscription_period_bounds_are_used_when_active(db_session):
    user = _seeded_user(db_session)
    period_start = datetime(2026, 6, 20, tzinfo=timezone.utc)
    period_end = datetime(2026, 7, 20, tzinfo=timezone.utc)
    db_session.add(
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_123",
            status="active",
            current_period_start=period_start,
            current_period_end=period_end,
        )
    )
    db_session.commit()

    period = current_period(db_session, user)

    assert period.period_start.replace(tzinfo=timezone.utc) == period_start
    assert period.period_end.replace(tzinfo=timezone.utc) == period_end


def test_scope_over_free_limit_returns_402_on_chat_create(authenticated_client, db_session):
    user = _seeded_user(db_session)
    documents = [_ready_document(user, f"doc-{index}.pdf") for index in range(3)]
    db_session.add_all(documents)
    db_session.commit()

    response = authenticated_client.post(
        "/api/chats", json={"document_ids": [str(document.id) for document in documents]}
    )

    assert response.status_code == 402
    assert response.json() == {"code": "limit_exceeded", "kind": "document_scope", "limit": 1, "used": 3}


def test_quality_tier_rejected_on_free_plan_at_creation(authenticated_client, db_session):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()

    # "quality" resolves to gpt-4.1 by default, which the free plan disallows.
    response = authenticated_client.post(
        "/api/chats", json={"document_ids": [str(document.id)], "model": "quality"}
    )

    assert response.status_code == 402
    assert response.json()["kind"] == "chat_model"


def test_quality_tier_rejected_on_free_plan_at_stream(authenticated_client, db_session, monkeypatch):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])
    vector_service = RecordingVectorService()
    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: vector_service)

    response = authenticated_client.post(
        f"/api/chats/{chat.id}/messages/stream", json={"content": "Hello?", "model": "quality"}
    )

    assert response.status_code == 402
    assert response.json()["kind"] == "chat_model"
    assert vector_service.query_calls == 0
    assert vector_service.answer_calls == 0
    assert db_session.query(Message).count() == 0
    db_session.refresh(chat)
    assert chat.model is None


def test_premium_model_rejected_on_free_plan(authenticated_client, db_session):
    user = _seeded_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()

    response = authenticated_client.post(
        "/api/chats", json={"document_ids": [str(document.id)], "model": "gpt-4.1"}
    )

    assert response.status_code == 402
    assert response.json()["kind"] == "chat_model"


def test_pro_plan_allows_premium_model_and_larger_scope(authenticated_client, db_session):
    user = _seeded_user(db_session)
    documents = [_ready_document(user, f"doc-{index}.pdf") for index in range(3)]
    db_session.add_all(documents)
    db_session.add(
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_123",
            status="active",
        )
    )
    db_session.commit()

    response = authenticated_client.post(
        "/api/chats",
        json={"document_ids": [str(document.id) for document in documents], "model": "gpt-4.1"},
    )

    assert response.status_code == 201


def test_usage_endpoint_returns_plan_period_and_counters(authenticated_client, db_session):
    user = _seeded_user(db_session)
    document = _ready_document(user, size=2 * MB)
    db_session.add(document)
    db_session.commit()
    period = current_period(db_session, user)
    period.ai_messages_used = 4
    period.uploads_used = 1
    db_session.commit()

    response = authenticated_client.get("/api/usage")

    assert response.status_code == 200
    body = response.json()
    assert body["plan"] == {"id": "free", "name": "Free"}
    assert body["period_start"] == period.period_start.isoformat()
    assert body["period_end"] == period.period_end.isoformat()
    assert body["ai_messages"] == {"used": 4, "limit": 25}
    assert body["uploads"] == {"used": 1, "limit": 3}
    assert body["storage_mb"] == {"used": 2, "limit": 50}
