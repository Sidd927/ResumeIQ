"""Application settings loaded from environment variables / .env file."""

from typing import Literal

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-secret-key-change-in-production"
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    """Typed runtime configuration. Every field can be overridden by an env var
    of the same name (case-insensitive), e.g. ``DATABASE_URL``."""

    environment: Literal["development", "production"] = "development"
    # Unset → "debug" in development, "info" in production.
    log_level: Literal["debug", "info", "warning", "error"] | None = None

    database_url: str = "postgresql://resumeiq_user:resumeiq_pass@localhost:5432/resumeiq_db"
    # Development convenience only — production refuses to start with this value.
    jwt_secret_key: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # Comma-separated. Defaults cover local Vite dev (5173), `vite preview` (4173)
    # and an alternate dev port (3000). Set the real frontend URL in production.
    # CORS_ORIGINS is accepted as an alias.
    backend_cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://localhost:3000",
        validation_alias=AliasChoices("backend_cors_origins", "cors_origins"),
    )
    # Optional regex for origins that can't be listed up front — e.g. Vercel
    # preview deployments: ^https://resumeiq(-[a-z0-9-]+)?\.vercel\.app$
    backend_cors_origin_regex: str | None = None

    spacy_model: str = "en_core_web_sm"
    embedding_model: str = "all-MiniLM-L6-v2"
    anthropic_api_key: str | None = None

    # Dev convenience: create missing tables on startup. Set to false wherever
    # Alembic owns the schema (production), otherwise `alembic upgrade` will
    # find tables it did not create.
    auto_create_tables: bool = True
    # Apply Alembic migrations at startup. Unset → on in production only.
    run_migrations: bool | None = None
    # Load spaCy + the embedding model at startup instead of on the first request.
    preload_models: bool = False

    max_upload_bytes: int = 5 * 1024 * 1024
    bcrypt_rounds: int = 12  # tests lower this; 12 is a sane production cost

    # Per-IP limits on credential endpoints (brute-force protection).
    rate_limit_enabled: bool = True
    login_rate_limit_per_minute: int = 5
    register_rate_limit_per_minute: int = 3

    # env_ignore_empty: a blank line like `LOG_LEVEL=` in .env means "use the default".
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True, env_ignore_empty=True)

    @field_validator("database_url")
    @classmethod
    def normalise_postgres_scheme(cls, v: str) -> str:
        # Some hosts hand out "postgres://", which SQLAlchemy 2 rejects.
        return "postgresql://" + v.removeprefix("postgres://") if v.startswith("postgres://") else v

    @model_validator(mode="after")
    def refuse_unsafe_production_config(self) -> "Settings":
        if self.environment == "production":
            if self.jwt_secret_key == DEV_JWT_SECRET or len(self.jwt_secret_key) < MIN_PRODUCTION_SECRET_LENGTH:
                raise ValueError(
                    "ENVIRONMENT=production requires JWT_SECRET_KEY to be set to a random value of at least "
                    f"{MIN_PRODUCTION_SECRET_LENGTH} characters (e.g. `openssl rand -hex 32`)."
                )
            if self.database_url.startswith("sqlite"):
                raise ValueError("ENVIRONMENT=production requires a PostgreSQL DATABASE_URL.")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def effective_log_level(self) -> str:
        return (self.log_level or ("info" if self.is_production else "debug")).upper()

    @property
    def should_run_migrations(self) -> bool:
        return self.is_production if self.run_migrations is None else self.run_migrations

    @property
    def cors_origins(self) -> list[str]:
        """Comma-separated ``BACKEND_CORS_ORIGINS`` parsed into a clean list."""
        return [o.strip().rstrip("/") for o in self.backend_cors_origins.split(",") if o.strip()]


settings = Settings()
