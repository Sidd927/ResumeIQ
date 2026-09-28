from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base, JSONType


class Resume(Base):
    """An uploaded resume: raw extracted text plus the parser's structured output."""

    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_json: Mapped[dict[str, Any] | None] = mapped_column(JSONType, nullable=True)
    file_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
