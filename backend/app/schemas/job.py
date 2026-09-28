from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import UTCDateTime
from app.schemas.parsed import ParsedJobDescription

MIN_JD_LENGTH = 50
MAX_JD_LENGTH = 30_000


_EXAMPLE_JD = (
    "Senior Full Stack Developer — 3-5 years\n\n"
    "What you'll do:\n"
    "• Build and maintain scalable web applications using React and Node.js\n"
    "• Design and implement RESTful APIs with proper authentication and authorization\n"
    "• Write clean, testable code with comprehensive unit and integration tests\n"
    "• Deploy and manage applications on AWS using containerized architectures\n\n"
    "Required: React, TypeScript, Node.js, PostgreSQL, Docker, AWS, CI/CD, REST APIs\n"
    "Nice to have: Python, FastAPI, Redis, GraphQL, Kubernetes"
)


class JobDescriptionCreate(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"raw_text": _EXAMPLE_JD}]})

    raw_text: str = Field(min_length=MIN_JD_LENGTH, max_length=MAX_JD_LENGTH)


class JobDescriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    raw_text: str
    parsed_json: ParsedJobDescription | None
    created_at: UTCDateTime
