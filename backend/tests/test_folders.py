from io import BytesIO
from uuid import UUID, uuid4

from app.models import (
    Chat,
    ChatDocument,
    Document,
    DocumentStatus,
    Folder,
    Message,
    Subscription,
    MessageRole,
    MessageStatus,
    User,
)
from app.models.mixins import utc_now


def _authenticated_user(db_session) -> User:
    user = User(clerk_user_id="user_2abc123", email="casey@example.com", name="Casey Example")
    db_session.add(user)
    db_session.commit()
    return user


def _ready_document(user: User, filename: str = "paper.pdf", folder: Folder | None = None) -> Document:
    return Document(
        user=user,
        folder=folder,
        original_filename=filename,
        content_type="application/pdf",
        file_size_bytes=100,
        status=DocumentStatus.READY,
        wasabi_bucket="bucket",
        wasabi_object_key=f"users/user/documents/{filename}/original.pdf",
        pinecone_namespace="test",
    )


def _folder(db_session, user: User, name: str = "Research") -> Folder:
    folder = Folder(user_id=user.id, name=name)
    db_session.add(folder)
    db_session.commit()
    return folder


class RecordingVectorService:
    """Fake that records the document scope the stream resolved."""

    def __init__(self):
        self.scope_ids: list[UUID] | None = None

    def query_document(self, _user, document, _question):
        self.scope_ids = [document.id]
        return []

    def query_scope(self, _user, documents, _question):
        self.scope_ids = [document.id for document in documents]
        return []

    def stream_answer_tokens(self, _question, _sources, model=None):
        yield "ok"


# ---------------------------------------------------------------------------
# Folder CRUD


def test_create_folder_returns_201_payload(authenticated_client, db_session):
    _authenticated_user(db_session)

    response = authenticated_client.post("/api/folders", json={"name": "  Contracts  "})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Contracts"
    assert body["document_count"] == 0
    assert body["created_at"] and body["updated_at"]
    assert db_session.get(Folder, UUID(body["id"])) is not None


def test_create_folder_rejects_empty_or_long_name(authenticated_client, db_session):
    _authenticated_user(db_session)

    assert authenticated_client.post("/api/folders", json={"name": "   "}).status_code == 422
    assert authenticated_client.post("/api/folders", json={}).status_code == 422
    assert authenticated_client.post("/api/folders", json={"name": "x" * 256}).status_code == 422


def test_list_folders_returns_document_counts_in_created_order(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder_a = _folder(db_session, user, "Alpha")
    folder_b = _folder(db_session, user, "Beta")
    deleted = _ready_document(user, "deleted.pdf", folder=folder_a)
    deleted.deleted_at = utc_now()
    db_session.add_all(
        [
            _ready_document(user, "a1.pdf", folder=folder_a),
            _ready_document(user, "a2.pdf", folder=folder_a),
            deleted,
            _ready_document(user, "root.pdf"),
        ]
    )
    db_session.commit()

    response = authenticated_client.get("/api/folders")

    assert response.status_code == 200
    items = response.json()["items"]
    assert [(item["name"], item["document_count"]) for item in items] == [("Alpha", 2), ("Beta", 0)]


def test_rename_folder_updates_name(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user, "Old")

    response = authenticated_client.patch(f"/api/folders/{folder.id}", json={"name": "New"})

    assert response.status_code == 200
    assert response.json()["name"] == "New"
    db_session.refresh(folder)
    assert folder.name == "New"


def test_folder_ownership_denial_returns_404(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    db_session.add(
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_folder_unowned",
            status="active",
        )
    )
    owner = User(clerk_user_id="owner", email="owner@example.com")
    db_session.add(owner)
    db_session.commit()
    folder = _folder(db_session, owner, "Private")

    assert authenticated_client.patch(f"/api/folders/{folder.id}", json={"name": "Mine"}).status_code == 404
    assert authenticated_client.delete(f"/api/folders/{folder.id}").status_code == 404
    assert authenticated_client.delete(f"/api/folders/{uuid4()}").status_code == 404


# ---------------------------------------------------------------------------
# Upload into folder / move / list filtering


def test_upload_with_folder_id_lands_in_folder(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)

    response = authenticated_client.post(
        "/api/documents",
        files={"file": ("paper.pdf", BytesIO(b"%PDF-1.7\ntext"), "application/pdf")},
        data={"folder_id": str(folder.id)},
    )

    assert response.status_code == 201
    document = db_session.get(Document, UUID(response.json()["id"]))
    assert document.folder_id == folder.id


def test_upload_with_invalid_folder_returns_422(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    db_session.add(
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_folder_unowned",
            status="active",
        )
    )
    owner = User(clerk_user_id="owner", email="owner@example.com")
    db_session.add(owner)
    db_session.commit()
    other_folder = _folder(db_session, owner, "Private")

    for folder_id in (str(uuid4()), str(other_folder.id), "not-a-uuid"):
        response = authenticated_client.post(
            "/api/documents",
            files={"file": ("paper.pdf", BytesIO(b"%PDF-1.7\ntext"), "application/pdf")},
            data={"folder_id": folder_id},
        )
        assert response.status_code == 422
    assert db_session.query(Document).count() == 0


def test_move_document_between_folders_and_to_root(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder_a = _folder(db_session, user, "Alpha")
    folder_b = _folder(db_session, user, "Beta")
    document = _ready_document(user, folder=folder_a)
    db_session.add(document)
    db_session.commit()

    moved = authenticated_client.patch(f"/api/documents/{document.id}", json={"folder_id": str(folder_b.id)})

    assert moved.status_code == 200
    assert moved.json()["folder_id"] == str(folder_b.id)
    db_session.refresh(document)
    assert document.folder_id == folder_b.id

    to_root = authenticated_client.patch(f"/api/documents/{document.id}", json={"folder_id": None})

    assert to_root.status_code == 200
    assert to_root.json()["folder_id"] is None
    db_session.refresh(document)
    assert document.folder_id is None


def test_move_document_rejects_cross_user_folder(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    owner = User(clerk_user_id="owner", email="owner@example.com")
    document = _ready_document(user)
    db_session.add_all([owner, document])
    db_session.commit()
    other_folder = _folder(db_session, owner, "Private")

    response = authenticated_client.patch(
        f"/api/documents/{document.id}", json={"folder_id": str(other_folder.id)}
    )

    assert response.status_code == 422
    assert authenticated_client.patch(f"/api/documents/{document.id}", json={}).status_code == 422
    db_session.refresh(document)
    assert document.folder_id is None


def test_list_documents_filters_by_folder(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    db_session.add_all(
        [
            _ready_document(user, "in-folder.pdf", folder=folder),
            _ready_document(user, "at-root.pdf"),
        ]
    )
    db_session.commit()

    in_folder = authenticated_client.get(f"/api/documents?folder_id={folder.id}")
    at_root = authenticated_client.get("/api/documents?folder_id=root")
    everything = authenticated_client.get("/api/documents")

    assert [item["original_filename"] for item in in_folder.json()["items"]] == ["in-folder.pdf"]
    assert in_folder.json()["items"][0]["folder_id"] == str(folder.id)
    assert [item["original_filename"] for item in at_root.json()["items"]] == ["at-root.pdf"]
    assert len(everything.json()["items"]) == 2
    assert authenticated_client.get("/api/documents?folder_id=not-a-uuid").status_code == 422


# ---------------------------------------------------------------------------
# Folder chats


def test_create_folder_chat_stores_folder_without_chat_documents(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    ready = _ready_document(user, "ready.pdf", folder=folder)
    pending = _ready_document(user, "pending.pdf", folder=folder)
    pending.status = DocumentStatus.UPLOADED
    db_session.add_all([
        ready,
        pending,
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_folder_create",
            status="active",
        ),
    ])
    db_session.commit()

    response = authenticated_client.post("/api/chats", json={"folder_id": str(folder.id)})

    assert response.status_code == 201
    body = response.json()
    assert body["folder"] == {"id": str(folder.id), "name": "Research"}
    assert [document["original_filename"] for document in body["documents"]] == ["ready.pdf"]
    chat = db_session.get(Chat, UUID(body["id"]))
    assert chat.folder_id == folder.id
    assert db_session.query(ChatDocument).count() == 0


def test_create_chat_requires_exactly_one_of_folder_or_documents(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    document = _ready_document(user)
    db_session.add(document)
    db_session.commit()

    neither = authenticated_client.post("/api/chats", json={})
    both = authenticated_client.post(
        "/api/chats", json={"folder_id": str(folder.id), "document_ids": [str(document.id)]}
    )

    assert neither.status_code == 422
    assert both.status_code == 422


def test_create_folder_chat_requires_premium_plan(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    db_session.add(_ready_document(user, "ready.pdf", folder=folder))
    db_session.commit()

    response = authenticated_client.post("/api/chats", json={"folder_id": str(folder.id)})

    assert response.status_code == 402
    assert response.json()["kind"] == "folder_chat"

def test_create_chat_rejects_unowned_folder(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    db_session.add(
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_folder_unowned",
            status="active",
        )
    )
    owner = User(clerk_user_id="owner", email="owner@example.com")
    db_session.add(owner)
    db_session.commit()
    other_folder = _folder(db_session, owner, "Private")

    assert authenticated_client.post("/api/chats", json={"folder_id": str(other_folder.id)}).status_code == 422
    assert authenticated_client.post("/api/chats", json={"folder_id": "not-a-uuid"}).status_code == 422


def test_folder_chat_detail_reflects_documents_added_later(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    db_session.add(_ready_document(user, "first.pdf", folder=folder))
    db_session.commit()
    db_session.add(Subscription(user_id=user.id, plan_id="pro_monthly", stripe_subscription_id="sub_folder_stream", status="active"))
    db_session.commit()
    chat_id = authenticated_client.post("/api/chats", json={"folder_id": str(folder.id)}).json()["id"]

    db_session.add(_ready_document(user, "second.pdf", folder=folder))
    db_session.commit()

    detail = authenticated_client.get(f"/api/chats/{chat_id}")

    assert detail.status_code == 200
    filenames = [document["original_filename"] for document in detail.json()["chat"]["documents"]]
    assert filenames == ["first.pdf", "second.pdf"]


def test_folder_chat_stream_widens_scope_as_folder_grows(authenticated_client, db_session, monkeypatch):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    first = _ready_document(user, "first.pdf", folder=folder)
    db_session.add(first)
    db_session.commit()
    db_session.add(Subscription(user_id=user.id, plan_id="pro_monthly", stripe_subscription_id="sub_folder_stream", status="active"))
    db_session.commit()
    chat_id = authenticated_client.post("/api/chats", json={"folder_id": str(folder.id)}).json()["id"]

    vector_service = RecordingVectorService()
    monkeypatch.setattr("app.api.chat_routes.get_vector_service", lambda _settings: vector_service)

    with authenticated_client.stream(
        "POST", f"/api/chats/{chat_id}/messages/stream", json={"content": "What is covered?"}
    ) as response:
        response.read()

    assert response.status_code == 200
    assert vector_service.scope_ids == [first.id]

    second = _ready_document(user, "second.pdf", folder=folder)
    not_ready = _ready_document(user, "processing.pdf", folder=folder)
    not_ready.status = DocumentStatus.EMBEDDING
    db_session.add_all([second, not_ready])
    db_session.commit()

    with authenticated_client.stream(
        "POST", f"/api/chats/{chat_id}/messages/stream", json={"content": "And now?"}
    ) as response:
        response.read()

    assert response.status_code == 200
    assert vector_service.scope_ids == [first.id, second.id]


def test_folder_chat_stream_with_no_ready_documents_returns_409(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    db_session.add(Subscription(user_id=user.id, plan_id="pro_monthly", stripe_subscription_id="sub_folder_stream", status="active"))
    db_session.commit()
    chat_id = authenticated_client.post("/api/chats", json={"folder_id": str(folder.id)}).json()["id"]

    response = authenticated_client.post(
        f"/api/chats/{chat_id}/messages/stream", json={"content": "Anything?"}
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Folder has no ready documents"


def test_folder_chat_stream_over_plan_scope_limit_returns_402(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    db_session.add(
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_folder_scope_limit",
            status="active",
        )
    )
    db_session.commit()
    chat_id = authenticated_client.post("/api/chats", json={"folder_id": str(folder.id)}).json()["id"]
    # Pro folder chats can still exceed the 10-document scope cap as folders grow.
    db_session.add_all([_ready_document(user, f"doc-{index}.pdf", folder=folder) for index in range(11)])
    db_session.commit()

    response = authenticated_client.post(
        f"/api/chats/{chat_id}/messages/stream", json={"content": "Compare them."}
    )

    assert response.status_code == 402
    assert response.json()["kind"] == "document_scope"


# ---------------------------------------------------------------------------
# Folder deletion


def test_delete_folder_keeps_documents_and_removes_folder_chats(authenticated_client, db_session):
    user = _authenticated_user(db_session)
    folder = _folder(db_session, user)
    document = _ready_document(user, folder=folder)
    db_session.add_all([
        document,
        Subscription(
            user_id=user.id,
            plan_id="pro_monthly",
            stripe_subscription_id="sub_folder_delete",
            status="active",
        ),
    ])
    db_session.commit()
    chat_id = UUID(authenticated_client.post("/api/chats", json={"folder_id": str(folder.id)}).json()["id"])
    db_session.add(
        Message(
            user_id=user.id,
            chat_id=chat_id,
            document_id=document.id,
            role=MessageRole.USER,
            status=MessageStatus.SUCCEEDED,
            content="Hello",
        )
    )
    db_session.commit()

    response = authenticated_client.delete(f"/api/folders/{folder.id}")

    assert response.status_code == 200
    assert response.json() == {"status": "deleted"}
    assert db_session.get(Folder, folder.id) is None
    db_session.refresh(document)
    assert document.folder_id is None
    assert document.deleted_at is None
    assert db_session.get(Chat, chat_id) is None
    assert db_session.query(Message).count() == 0
