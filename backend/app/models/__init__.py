"""ORM models. Importing this package registers every table on ``Base.metadata``
(required for Alembic autogenerate)."""

from app.models.job import JobDescription
from app.models.match import MatchResult
from app.models.resume import Resume
from app.models.user import User

__all__ = ["User", "Resume", "JobDescription", "MatchResult"]
