from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    database_url: str = "sqlite+pysqlite:///./mychatpdf.db"
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""
    clerk_jwks_timeout_seconds: int = Field(default=5, ge=1)
    clerk_audience: str | None = None
    frontend_origin: str | AnyHttpUrl | None = None
    frontend_origins: str | None = None

    wasabi_access_key_id: str | None = None
    wasabi_secret_access_key: str | None = None
    wasabi_bucket: str = "mychatpdf-local"
    wasabi_region: str = "us-east-1"
    wasabi_endpoint_url: str | None = None
    signed_url_ttl_seconds: int = Field(
        default=900,
        validation_alias="WASABI_SIGNED_URL_EXPIRES_SECONDS",
    )

    openai_api_key: str | None = None
    openai_embedding_model: str = "text-embedding-3-small"
    openai_embedding_dimensions: int | None = Field(default=None, ge=1)
    openai_embedding_batch_size: int = Field(default=64, ge=1, le=2048)
    openai_request_max_retries: int = Field(default=3, ge=1, le=10)
    openai_retry_initial_seconds: float = Field(default=0.5, ge=0)
    openai_chat_model: str = "gpt-5.1"
    openai_fast_model: str = "gpt-4.1-mini"
    openai_quality_model: str = "gpt-5.1"
    openai_chat_temperature: float | None = Field(default=None, ge=0, le=2)
    openai_allowed_chat_models: str = "gpt-5.1,gpt-4.1-mini"

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_pro_monthly: str | None = None
    stripe_price_pro_yearly: str | None = None
    billing_return_url: str | None = None

    pinecone_api_key: str | None = None
    pinecone_index_name: str = "mychatpdf"
    pinecone_namespace: str = "local"

    retrieval_top_k: int = Field(default=8, ge=1)
    max_context_sources: int = Field(default=8, ge=1)

    sentry_dsn: str | None = None

    max_upload_mb: int = Field(default=50, ge=1)
    max_pdf_pages: int = Field(default=2000, ge=1)
    document_preview_conversion_timeout_seconds: int = Field(default=90, ge=5)
    redis_url: str = "redis://redis:6379/0"
    log_level: str = "INFO"

    def allowed_chat_models(self) -> list[str]:
        return [model.strip() for model in self.openai_allowed_chat_models.split(",") if model.strip()]

    def resolve_chat_model(self, model: str | None) -> str | None:
        """Map a stored tier ("fast"/"quality") to its operator-configured
        OpenAI model. Legacy chats that stored a raw model id pass through."""
        if model == "fast":
            return self.openai_fast_model
        if model == "quality":
            return self.openai_quality_model
        return model

    def cors_origins(self) -> list[str]:
        origins: list[str] = []

        if self.frontend_origin:
            origins.append(str(self.frontend_origin))

        if self.frontend_origins:
            origins.extend(self.frontend_origins.split(","))

        normalized_origins = []
        seen_origins = set()
        for origin in origins:
            normalized_origin = origin.strip().rstrip("/")
            if normalized_origin and normalized_origin not in seen_origins:
                normalized_origins.append(normalized_origin)
                seen_origins.add(normalized_origin)

        return normalized_origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
