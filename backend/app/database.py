"""SQLAlchemy engine, session factory, and declarative base.

``create_engine`` is lazy — no connection is opened until a query runs, so the
app (and the test suite) boots fine without Postgres available.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
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
