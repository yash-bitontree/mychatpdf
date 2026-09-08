from app.models import (
    Chat,
    ChatDocument,
    Document,
    DocumentStatus,
    Message,
    MessageRole,
    MessageStatus,
    User,
)
from app.services.chat import create_chat, get_or_create_chat


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


def test_create_chat_with_one_document_populates_join_table(db_session):
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    document = _ready_document(user)
    db_session.add_all([user, document])
    db_session.commit()

    chat = create_chat(db_session, user, [document])

    link = db_session.query(ChatDocument).one()
    assert link.chat_id == chat.id
    assert link.document_id == document.id
    assert link.position == 0
    assert chat.document_id == document.id
    assert [scoped.id for scoped in chat.documents] == [document.id]


def test_get_or_create_chat_reuses_single_document_chat(db_session):
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    document = _ready_document(user)
    db_session.add_all([user, document])
    db_session.commit()

    first = get_or_create_chat(db_session, user, document)
    second = get_or_create_chat(db_session, user, document)

    assert first.id == second.id
    assert first.title == "paper.pdf"
    assert db_session.query(ChatDocument).count() == 1


def test_deleting_document_cascades_its_join_rows(db_session):
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    document_a = _ready_document(user, "a.pdf")
    document_b = _ready_document(user, "b.pdf")
    db_session.add_all([user, document_a, document_b])
    db_session.commit()
    chat = create_chat(db_session, user, [document_a, document_b])

    db_session.delete(document_a)
    db_session.commit()

    remaining_links = db_session.query(ChatDocument).all()
    assert [link.document_id for link in remaining_links] == [document_b.id]
    assert db_session.get(Chat, chat.id) is not None
    assert [scoped.id for scoped in db_session.get(Chat, chat.id).documents] == [document_b.id]


def test_deleting_single_document_chat_document_removes_chat_and_join_rows(db_session):
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    document = _ready_document(user)
    db_session.add_all([user, document])
    db_session.commit()
    chat = get_or_create_chat(db_session, user, document)

    db_session.delete(document)
    db_session.commit()

    assert db_session.get(Chat, chat.id) is None
    assert db_session.query(ChatDocument).count() == 0


def test_deleting_chat_cascades_messages_and_join_rows(db_session):
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    document = _ready_document(user)
    db_session.add_all([user, document])
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

    db_session.delete(chat)
    db_session.commit()

    assert db_session.query(Message).count() == 0
    assert db_session.query(ChatDocument).count() == 0
    assert db_session.get(Document, document.id) is not None
