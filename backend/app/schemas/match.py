from pydantic import BaseModel, ConfigDict

from app.schemas.common import UTCDateTime


class MatchRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"resume_id": 1, "job_id": 1}]})

    resume_id: int
    job_id: int


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
    created_at: UTCDateTime
