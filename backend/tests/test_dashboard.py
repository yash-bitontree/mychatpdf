from datetime import datetime, timedelta, timezone

from app.models import Chat, Document, DocumentStatus, User


def _seeded_user(db_session) -> User:
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    db_session.add(user)
    db_session.commit()
    return user


def _document(user: User, filename: str, **overrides) -> Document:
    fields = {
        "user": user,
        "original_filename": filename,
        "content_type": "application/pdf",
        "format": "pdf",
        "file_size_bytes": 1000,
        "status": DocumentStatus.READY,
        "wasabi_bucket": "bucket",
        "wasabi_object_key": f"users/user/documents/{filename}/original",
        "pinecone_namespace": "test",
    }
    fields.update(overrides)
    return Document(**fields)


def test_dashboard_returns_stats_conversations_and_activity(authenticated_client, db_session):
    user = _seeded_user(db_session)
    base_time = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)
    doc_early = _document(user, "early.pdf", created_at=base_time)
    doc_late = _document(
        user,
        "late.docx",
        format="docx",
        status=DocumentStatus.FAILED,
        file_size_bytes=2000,
        created_at=base_time + timedelta(hours=2),
    )
    doc_deleted = _document(
        user,
        "gone.pdf",
        file_size_bytes=5000,
        created_at=base_time,
        deleted_at=base_time,
        status=DocumentStatus.DELETING,
    )
    chat_between = Chat(
        user=user,
        title="Contract questions",
        created_at=base_time,
        updated_at=base_time + timedelta(hours=1),
    )
    chat_oldest = Chat(
        user=user,
        title=None,
        created_at=base_time - timedelta(hours=2),
        updated_at=base_time - timedelta(hours=1),
    )
    chat_deleted = Chat(
        user=user,
        title="Old research",
        created_at=base_time - timedelta(hours=3),
        updated_at=base_time - timedelta(hours=3),
        deleted_at=base_time + timedelta(hours=3),
    )
    db_session.add_all([doc_early, doc_late, doc_deleted, chat_between, chat_oldest, chat_deleted])
    db_session.commit()

    response = authenticated_client.get("/api/dashboard")

    assert response.status_code == 200
    body = response.json()

    assert body["subscription"]["plan"]["id"] == "free"
    assert body["usage"]["ai_messages"] == {"used": 0, "limit": 25}

    assert body["documents"]["total"] == 2
    assert body["documents"]["by_status"] == {"ready": 1, "failed": 1}
    assert body["documents"]["by_format"] == {"pdf": 1, "docx": 1}
    assert body["documents"]["storage_bytes"] == 3000

    assert [chat["title"] for chat in body["recent_conversations"]] == [
        "Contract questions",
        None,
    ]

    activity = body["recent_activity"]
    assert [(item["type"], item["label"]) for item in activity] == [
        ("conversation_deleted", "Old research"),
        ("document_uploaded", "late.docx"),
        ("conversation_updated", "Contract questions"),
        ("document_uploaded", "early.pdf"),
        ("conversation_updated", "Untitled conversation"),
    ]
    timestamps = [item["timestamp"] for item in activity]
    assert timestamps == sorted(timestamps, reverse=True)


def test_dashboard_is_empty_but_well_formed_for_new_user(authenticated_client):
    response = authenticated_client.get("/api/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert body["documents"] == {"total": 0, "by_status": {}, "by_format": {}, "storage_bytes": 0}
    assert body["recent_conversations"] == []
    assert body["recent_activity"] == []


def test_dashboard_caps_activity_at_ten_items(authenticated_client, db_session):
    user = _seeded_user(db_session)
    base_time = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)
    documents = [
        _document(user, f"doc-{index}.pdf", created_at=base_time + timedelta(minutes=index))
        for index in range(8)
    ]
    chats = [
        Chat(
            user=user,
            title=f"chat-{index}",
            created_at=base_time,
            updated_at=base_time + timedelta(minutes=30 + index),
        )
        for index in range(4)
    ]
    db_session.add_all([*documents, *chats])
    db_session.commit()

    response = authenticated_client.get("/api/dashboard")

    body = response.json()
    assert len(body["recent_activity"]) == 10
    assert len(body["recent_conversations"]) == 4
    # Newest overall first: the 4 chats (later timestamps), then newest documents.
    assert [item["label"] for item in body["recent_activity"][:4]] == [
        "chat-3",
        "chat-2",
        "chat-1",
        "chat-0",
    ]
