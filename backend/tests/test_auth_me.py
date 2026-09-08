import asyncio

import jwt
import pytest

from app.api.deps import get_clerk_jwks_client, get_current_clerk_claims, sync_user_from_claims
from app.core.config import Settings
from app.models import User


@pytest.fixture(autouse=True)
def clear_clerk_jwks_client_cache():
    get_clerk_jwks_client.cache_clear()
    yield
    get_clerk_jwks_client.cache_clear()


def test_me_rejects_missing_authorization(client):
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated"


def test_clerk_jwks_client_uses_configured_timeout(monkeypatch):
    calls = []

    class FakeJwksClient:
        def __init__(self, url, timeout=None):
            calls.append({"url": url, "timeout": timeout})

        def get_signing_key_from_jwt(self, _token):
            raise jwt.PyJWTError("stop after construction")

    monkeypatch.setattr("app.api.deps.PyJWKClient", FakeJwksClient)
    settings = Settings(
        clerk_issuer="https://example.clerk.accounts.dev",
        clerk_jwks_url="https://example.clerk.accounts.dev/.well-known/jwks.json",
        clerk_jwks_timeout_seconds=3,
    )

    with pytest.raises(Exception):
        asyncio.run(get_current_clerk_claims("Bearer token", settings))

    assert calls == [
        {
            "url": "https://example.clerk.accounts.dev/.well-known/jwks.json",
            "timeout": 3,
        }
    ]


def test_clerk_jwks_client_is_reused_between_auth_checks(monkeypatch):
    calls = []

    class FakeSigningKey:
        key = "public-key"

    class FakeJwksClient:
        def __init__(self, url, timeout=None):
            calls.append({"url": url, "timeout": timeout})

        def get_signing_key_from_jwt(self, _token):
            return FakeSigningKey()

    monkeypatch.setattr("app.api.deps.PyJWKClient", FakeJwksClient)
    monkeypatch.setattr("app.api.deps.jwt.decode", lambda *args, **kwargs: {"sub": "user_2abc123"})
    settings = Settings(
        clerk_issuer="https://example.clerk.accounts.dev",
        clerk_jwks_url="https://example.clerk.accounts.dev/.well-known/jwks.json",
        clerk_jwks_timeout_seconds=3,
    )

    asyncio.run(get_current_clerk_claims("Bearer token", settings))
    asyncio.run(get_current_clerk_claims("Bearer token", settings))

    assert calls == [
        {
            "url": "https://example.clerk.accounts.dev/.well-known/jwks.json",
            "timeout": 3,
        }
    ]


def test_me_creates_local_user_from_clerk_claims(authenticated_client, db_session):
    response = authenticated_client.get("/api/me")

    assert response.status_code == 200
    body = response.json()
    assert body["clerk_user_id"] == "user_2abc123"
    assert body["email"] == "casey@example.com"
    assert body["name"] == "Casey Example"

    user = db_session.query(User).filter_by(clerk_user_id="user_2abc123").one()
    assert str(user.id) == body["id"]


def test_me_updates_existing_local_user_from_clerk_claims(
    authenticated_client,
    app,
    db_session,
):
    first = authenticated_client.get("/api/me")
    assert first.status_code == 200

    from app.api.deps import get_current_clerk_claims

    async def changed_claims():
        return {
            "sub": "user_2abc123",
            "email": "renamed@example.com",
            "name": "Renamed User",
        }

    app.dependency_overrides[get_current_clerk_claims] = changed_claims
    response = authenticated_client.get("/api/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == first.json()["id"]
    assert body["email"] == "renamed@example.com"
    assert body["name"] == "Renamed User"

    assert db_session.query(User).filter_by(clerk_user_id="user_2abc123").count() == 1


def test_sync_user_skips_commit_when_existing_claims_are_unchanged():
    class FakeSession:
        def __init__(self):
            self.user = User(
                clerk_user_id="user_2abc123",
                email="casey@example.com",
                name="Casey Example",
            )
            self.commits = 0
            self.refreshes = 0

        def scalar(self, _statement):
            return self.user

        def add(self, _user):
            raise AssertionError("existing user should not be re-added")

        def commit(self):
            self.commits += 1

        def refresh(self, _user):
            self.refreshes += 1

    db = FakeSession()

    user = sync_user_from_claims(
        db,
        {
            "sub": "user_2abc123",
            "email": "casey@example.com",
            "name": "Casey Example",
        },
    )

    assert user is db.user
    assert db.commits == 0
    assert db.refreshes == 0
