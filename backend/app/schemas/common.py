from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator


def _as_utc(value: datetime) -> datetime:
    """Treat naive datetimes as UTC (SQLite drops tzinfo; Postgres keeps it) and normalise to UTC."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


# Every timestamp in API responses serialises as ISO-8601 with an explicit UTC offset.
UTCDateTime = Annotated[datetime, AfterValidator(_as_utc)]
