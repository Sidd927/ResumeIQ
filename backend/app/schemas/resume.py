from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ResumeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    raw_text: str
    parsed_json: dict[str, Any] | None
    file_url: str | None
    created_at: datetime
