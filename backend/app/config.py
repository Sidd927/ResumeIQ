"""Application settings loaded from environment variables / .env file."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed runtime configuration. Every field can be overridden by an env var
    of the same name (case-insensitive), e.g. ``DATABASE_URL``."""

    database_url: str = "postgresql://resumeiq_user:resumeiq_pass@localhost:5432/resumeiq_db"
    jwt_secret_key: str = "dev-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7
    backend_cors_origins: str = "http://localhost:5173"
    spacy_model: str = "en_core_web_sm"
    embedding_model: str = "all-MiniLM-L6-v2"
    anthropic_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        """Comma-separated ``BACKEND_CORS_ORIGINS`` parsed into a clean list."""
        return [o.strip() for o in self.backend_cors_origins.split(",") if o.strip()]


settings = Settings()
