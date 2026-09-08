from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from app.models import (
    Chat,
    ChatDocument,
    Document,
    DocumentStatus,
    Message,
    MessageRole,
    MessageSource,
    MessageStatus,
    User,
)
from app.services.chat import create_chat


def _ready_document(user: User, filename: str = "paper.pdf") -> Document:
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


def _authenticated_user(db_session) -> User:
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    db_session.add(user)
    db_session.commit()
    return user


def test_create_chat_returns_201_with_scoped_documents(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()

    response = authenticated_client.post("/api/chats", json={"document_ids": [str(document.id)]})

    assert response.status_code == 201
    body = response.json()
    assert body["title"] is None
    assert body["documents"] == [{"id": str(document.id), "original_filename": "paper.pdf", "format": "pdf"}]
    chat = db_session.get(Chat, UUID(body["id"]))
    assert chat is not None
    assert db_session.query(ChatDocument).filter_by(chat_id=chat.id).count() == 1


def test_create_chat_rejects_non_ready_document(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    document.status = DocumentStatus.UPLOADED
    db_session.add(document)
    db_session.commit()

    response = authenticated_client.post("/api/chats", json={"document_ids": [str(document.id)]})

    assert response.status_code == 422
    assert response.json()["detail"] == "Document is not ready for chat"


def test_create_chat_rejects_unowned_document(authenticated_client, db_session):
    _authenticated_user(db_session)
    owner = User(clerk_user_id="owner", email="owner@example.com")
    document = _ready_document(owner, "private.pdf")
    db_session.add_all([owner, document])
    db_session.commit()

    response = authenticated_client.post("/api/chats", json={"document_ids": [str(document.id)]})

    assert response.status_code == 422


def test_create_chat_rejects_empty_document_list(authenticated_client, db_session):
    _authenticated_user(db_session)

    response = authenticated_client.post("/api/chats", json={"document_ids": []})

    assert response.status_code == 422


def test_list_chats_paginates_with_cursor(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    base_time = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)
    for index in range(3):
        chat = create_chat(db_session, user, [document], title=f"chat-{index}")
        chat.created_at = base_time - timedelta(minutes=index)
    db_session.commit()

    first_page = authenticated_client.get("/api/chats?limit=2")

    assert first_page.status_code == 200
    first_body = first_page.json()
    assert [item["title"] for item in first_body["items"]] == ["chat-0", "chat-1"]
    assert first_body["items"][0]["documents"][0]["original_filename"] == "paper.pdf"
    assert first_body["next_cursor"]

    second_page = authenticated_client.get(f"/api/chats?limit=2&cursor={first_body['next_cursor']}")

    assert second_page.status_code == 200
    second_body = second_page.json()
    assert [item["title"] for item in second_body["items"]] == ["chat-2"]
    assert second_body["next_cursor"] is None


def test_list_chats_rejects_invalid_cursor(authenticated_client, db_session):
    _authenticated_user(db_session)

    response = authenticated_client.get("/api/chats?cursor=not-a-valid-cursor")

    assert response.status_code == 422
    assert response.json()["detail"] == "Invalid chat cursor"


def test_chat_detail_returns_404_for_other_users_chat(authenticated_client, db_session):
    _authenticated_user(db_session)
    owner = User(clerk_user_id="owner", email="owner@example.com")
    document = _ready_document(owner, "private.pdf")
    db_session.add_all([owner, document])
    db_session.commit()
    chat = create_chat(db_session, owner, [document])

    response = authenticated_client.get(f"/api/chats/{chat.id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "Chat not found"


def test_chat_detail_returns_404_for_missing_chat(authenticated_client, db_session):
    _authenticated_user(db_session)

    response = authenticated_client.get(f"/api/chats/{uuid4()}")

    assert response.status_code == 404


def test_chat_detail_returns_ordered_messages_with_sources(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])
    base_time = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)
    user_message = Message(
        user=user,
        document=document,
        chat=chat,
        role=MessageRole.USER,
        status=MessageStatus.SUCCEEDED,
        content="What improved?",
        created_at=base_time,
    )
    assistant_message = Message(
        user=user,
        document=document,
        chat=chat,
        role=MessageRole.ASSISTANT,
        status=MessageStatus.SUCCEEDED,
        content="Pipeline quality improved.",
        created_at=base_time + timedelta(seconds=1),
    )
    db_session.add_all([user_message, assistant_message])
    db_session.flush()
    db_session.add(
        MessageSource(
            message_id=assistant_message.id,
            document_id=document.id,
            page_start=7,
            page_end=8,
            excerpt="Pipeline quality improved in regulated industries.",
            score=0.9,
            rank=1,
        )
    )
    db_session.commit()

    response = authenticated_client.get(f"/api/chats/{chat.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["chat"]["id"] == str(chat.id)
    assert body["chat"]["documents"] == [{"id": str(document.id), "original_filename": "paper.pdf", "format": "pdf"}]
    assert [message["role"] for message in body["messages"]] == ["user", "assistant"]
    source = body["messages"][1]["sources"][0]
    assert source["document_filename"] == "paper.pdf"
    assert source["page_start"] == 7
    assert source["page_end"] == 8
    assert source["excerpt"] == "Pipeline quality improved in regulated industries."


def test_stream_persists_user_and_assistant_messages(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document], title="paper.pdf")

    with authenticated_client.stream(
        "POST",
        f"/api/chats/{chat.id}/messages/stream",
        json={"content": "Summarize this document."},
    ) as response:
        body = response.read().decode("utf-8")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: message_start" in body
    assert "event: message_done" in body
    messages = db_session.query(Message).filter_by(chat_id=chat.id).order_by(Message.created_at).all()
    assert [message.role for message in messages] == [MessageRole.USER, MessageRole.ASSISTANT]
    assert messages[0].content == "Summarize this document."
    assert messages[1].status == MessageStatus.SUCCEEDED


def test_stream_auto_titles_chat_from_first_user_message(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])
    content = "What are the payment terms for the vendor agreement and when does the contract renew?"

    with authenticated_client.stream(
        "POST",
        f"/api/chats/{chat.id}/messages/stream",
        json={"content": content},
    ) as response:
        response.read()

    db_session.refresh(chat)
    assert chat.title == content[:80]
    assert len(chat.title) == 80


def test_rename_chat_updates_title(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])

    response = authenticated_client.patch(f"/api/chats/{chat.id}", json={"title": "Contract review"})

    assert response.status_code == 200
    assert response.json()["title"] == "Contract review"
    db_session.refresh(chat)
    assert chat.title == "Contract review"


def test_rename_chat_rejects_title_over_512_chars(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document], title="original")

    response = authenticated_client.patch(f"/api/chats/{chat.id}", json={"title": "x" * 513})

    assert response.status_code == 422
    db_session.refresh(chat)
    assert chat.title == "original"


def test_delete_chat_soft_deletes_and_hides_chat(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()
    chat = create_chat(db_session, user, [document])
    db_session.add(
        Message(
            user=user,
            document=document,
            chat=chat,
            role=MessageRole.USER,
            status=MessageStatus.SUCCEEDED,
            content="Hello",
        )
    )
    db_session.commit()

    response = authenticated_client.delete(f"/api/chats/{chat.id}")

    assert response.status_code == 200
    # Soft delete: the row survives (so the activity feed can report it) but
    # the chat disappears from every user-facing endpoint.
    db_session.refresh(chat)
    assert chat.deleted_at is not None
    assert db_session.query(Message).count() == 1
    assert authenticated_client.get(f"/api/chats/{chat.id}").status_code == 404
    assert authenticated_client.get("/api/chats").json()["items"] == []
