"""FastAPI application: lifespan (table creation), CORS, router mounts."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

import app.models  # noqa: F401 — registers every table on Base.metadata
from app import __version__
from app.config import settings
from app.database import Base, engine
from app.routers import auth, health, jobs, match, resumes

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Startup: create missing tables (dev convenience; Alembic owns production) and optionally warm the models."""
    if settings.auto_create_tables:
        try:
            Base.metadata.create_all(bind=engine)
        except OperationalError as exc:
            # Keep booting so /health and /docs work; DB routes will fail loudly.
            logger.error("Database unavailable at startup, tables not created: %s", exc)
    if settings.preload_models:
        from app.services.embeddings import load_model
        from app.services.parser import get_nlp
        from app.services.taxonomy import load_taxonomy

        load_taxonomy()
        get_nlp()
        load_model()
        logger.info("NLP models preloaded")
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

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(resumes.router)
app.include_router(jobs.router)
app.include_router(match.router)
