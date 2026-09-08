import os

# Isolate the test suite from any real .env / shell credentials BEFORE the app
# modules import (app.db.session builds its engine at import time from settings).
# This keeps `pytest` hermetic: no postgres driver requirement, no live
# OpenAI/Pinecone/Wasabi calls, regardless of a configured .env.
os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
for _key in (
    "OPENAI_API_KEY",
    "PINECONE_API_KEY",
    "WASABI_ACCESS_KEY_ID",
    "WASABI_SECRET_ACCESS_KEY",
):
    os.environ.pop(_key, None)

from collections.abc import Generator  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.api.deps import get_current_clerk_claims  # noqa: E402
from app.core.config import Settings, get_settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Plan  # noqa: E402
from app.services.billing import PLAN_SEEDS  # noqa: E402


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        # The billing migration seeds the plan rows; create_all does not, so
        # mirror it here from the same single source of truth.
        session.add_all([Plan(**seed) for seed in PLAN_SEEDS])
        session.commit()
        yield session

    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def app(db_session: Session):
    settings = Settings(
        _env_file=None,
        database_url="sqlite+pysqlite:///:memory:",
        clerk_issuer="https://example.clerk.accounts.dev",
        clerk_jwks_url="https://example.clerk.accounts.dev/.well-known/jwks.json",
        clerk_audience="mychatpdf-test",
        frontend_origin="https://app.example.test",
        # Force the no-credential code paths so tests never touch live
        # OpenAI/Pinecone/Wasabi even when a real .env or shell env is present.
        openai_api_key=None,
        pinecone_api_key=None,
        wasabi_access_key_id=None,
        wasabi_secret_access_key=None,
    )
    app = create_app(settings)

    def override_settings() -> Settings:
        return settings

    def override_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_settings] = override_settings
    app.dependency_overrides[get_db] = override_db
    return app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


@pytest.fixture
def authenticated_client(app) -> TestClient:
    async def override_claims():
        return {
            "sub": "user_2abc123",
            "email": "casey@example.com",
            "name": "Casey Example",
        }

    app.dependency_overrides[get_current_clerk_claims] = override_claims
    return TestClient(app)
