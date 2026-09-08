from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_empty_optional_numeric_environment_values_are_none(monkeypatch):
    monkeypatch.setenv("OPENAI_CHAT_TEMPERATURE", "")

    settings = Settings()

    assert settings.openai_chat_temperature is None


def test_allowed_chat_models_parses_comma_separated_env(monkeypatch):
    monkeypatch.setenv("OPENAI_ALLOWED_CHAT_MODELS", "gpt-4.1, o4-mini ,gpt-4.1-mini")

    settings = Settings()

    assert settings.allowed_chat_models() == ["gpt-4.1", "o4-mini", "gpt-4.1-mini"]


def test_allowed_chat_models_default_list():
    assert Settings(_env_file=None).allowed_chat_models() == ["gpt-4.1-mini", "gpt-4.1", "o4-mini"]


def test_cors_origins_combines_legacy_and_list_values():
    settings = Settings(
        _env_file=None,
        frontend_origin="http://localhost:5173/",
        frontend_origins="http://mypdfchat.com, https://mypdfchat.com ,http://mypdfchat.com",
    )

    assert settings.cors_origins() == [
        "http://localhost:5173",
        "http://mypdfchat.com",
        "https://mypdfchat.com",
    ]


def test_cors_preflight_allows_configured_frontend_origin():
    app = create_app(
        Settings(
            _env_file=None,
            frontend_origins="http://mypdfchat.com,http://www.mypdfchat.com",
        )
    )

    response = TestClient(app).options(
        "/api/documents",
        headers={
            "Origin": "http://mypdfchat.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://mypdfchat.com"
