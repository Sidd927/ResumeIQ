from pydantic import BaseModel, ConfigDict

from app.schemas.common import UTCDateTime
from app.schemas.parsed import ParsedResume


class ResumeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    raw_text: str
    parsed_json: ParsedResume | None
    file_url: str | None
    created_at: UTCDateTime
