from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MatchRequest(BaseModel):
    resume_id: int
    job_id: int


class MatchScoreBreakdown(BaseModel):
    skill_score: float
    semantic_score: float
    recency_score: float
    completeness_score: float
    composite_score: float
    missing_skills: list[str]
    feedback_text: str | None = None


class MatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    resume_id: int
    jd_id: int
    skill_score: float
    semantic_score: float
    recency_score: float
    completeness_score: float
    composite_score: float
    missing_skills: list[str]
    feedback_text: str | None
    created_at: datetime
