"""FastAPI application: lifespan (migrations/tables, model warm-up), middleware, router mounts."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

import app.models  # noqa: F401 — registers every table on Base.metadata
from app import __version__
from app.config import settings
from app.database import Base, engine
from app.logging_config import configure_logging
from app.middleware import SecurityHeadersMiddleware, UploadSizeLimitMiddleware
from app.routers import auth, health, jobs, match, resumes

configure_logging()
logger = logging.getLogger("resumeiq")

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def run_migrations() -> None:
    """Apply pending Alembic migrations (``alembic upgrade head``) in-process."""
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(ALEMBIC_INI)), "head")
    # alembic.ini's [formatters] replaced the root handler — restore ours.
    configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """
    Startup:
    - production: apply Alembic migrations (single worker, so no race). Fine
      for this project; larger systems run migrations as a separate release step.
    - development: optionally create missing tables directly (no Alembic).
    - optionally warm the NLP models so the first user request isn't slow.
    """
    logger.info("event=startup environment=%s version=%s", settings.environment, __version__)
    if settings.should_run_migrations:
        run_migrations()
        logger.info("event=migrations_applied")
    elif settings.auto_create_tables:
        try:
            Base.metadata.create_all(bind=engine)
        except OperationalError as exc:
            # Keep booting so /health and /docs work; DB routes will fail loudly.
            logger.error("event=db_unavailable detail=%s", exc)
    if settings.preload_models:
        from app.services.embeddings import load_model
        from app.services.parser import get_nlp
        from app.services.taxonomy import load_taxonomy

        load_taxonomy()
        get_nlp()
        load_model()
        logger.info("event=models_preloaded")
    yield


app = FastAPI(
    title="ResumeIQ API",
    description=(
        "AI-Powered Resume ↔ Job Description Match & Feedback Engine.\n\n"
        "**Try it:** register → login → click **Authorize** and paste the `access_token` → "
        "upload a resume → submit a job description → run a match."
    ),
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
    # Keep the Authorize token across Swagger page reloads (demo convenience).
    swagger_ui_parameters={"persistAuthorization": True},
    lifespan=lifespan,
)

# Middleware — the LAST one added is the OUTERMOST. CORS must be outermost so
# that even early rejections (413, 429) carry CORS headers; otherwise the
# browser hides the real error behind an opaque "network error".
app.add_middleware(UploadSizeLimitMiddleware, path="/api/resumes", max_bytes=settings.max_upload_bytes)
app.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.backend_cors_origin_regex,
    # Tokens travel in the Authorization header, never cookies — no credentialed CORS needed.
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(resumes.router)
app.include_router(jobs.router)
app.include_router(match.router)
