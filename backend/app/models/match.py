from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base, JSONType


class MatchResult(Base):
    """Persisted output of the scoring engine for one (resume, JD) pair.

    Sub-scores are stored on a 0–1 scale; ``composite_score`` is 0–100.
    """

    __tablename__ = "match_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    resume_id: Mapped[int] = mapped_column(Integer, ForeignKey("resumes.id"), nullable=False)
    jd_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("job_descriptions.id"), nullable=False
    )
    skill_score: Mapped[float] = mapped_column(Float, nullable=False)
    semantic_score: Mapped[float] = mapped_column(Float, nullable=False)
    recency_score: Mapped[float] = mapped_column(Float, nullable=False)
    completeness_score: Mapped[float] = mapped_column(Float, nullable=False)
    composite_score: Mapped[float] = mapped_column(Float, nullable=False)
    missing_skills: Mapped[list[str]] = mapped_column(JSONType, default=list)
    feedback_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
