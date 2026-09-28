"""SQLAlchemy engine, session factory, and declarative base.

``create_engine`` is lazy — no connection is opened until a query runs, so the
app (and the test suite) boots fine without Postgres available.

Postgres is the real target. ``sqlite://`` URLs are also supported (tests use
an in-memory SQLite database); JSONB columns fall back to JSON there — see
``JSONType``.
"""

from collections.abc import Generator
from typing import Any

from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings

# JSONB on Postgres, plain JSON elsewhere (SQLite in tests).
JSONType = JSON().with_variant(JSONB(), "postgresql")


def make_engine(url: str) -> Engine:
    """Create an engine; in-memory SQLite gets one shared connection so every
    session (and thread, e.g. TestClient) sees the same database."""
    kwargs: dict[str, Any] = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url in ("sqlite://", "sqlite:///"):
            kwargs["poolclass"] = StaticPool
    return create_engine(url, **kwargs)


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base shared by all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a DB session that is always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
