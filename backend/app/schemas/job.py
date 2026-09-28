from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class JobDescriptionCreate(BaseModel):
    raw_text: str


class JobDescriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    raw_text: str
    parsed_json: dict[str, Any] | None
    created_at: datetime
