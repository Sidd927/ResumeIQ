from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import UTCDateTime

MIN_PASSWORD_LENGTH = 8
BCRYPT_MAX_BYTES = 72  # bcrypt ignores anything past 72 bytes; reject rather than truncate silently


# Shown pre-filled in Swagger "Try it out", so register → login works with zero typing.
_DEMO_CREDENTIALS = {"examples": [{"email": "user@example.com", "password": "correct-horse-battery"}]}


class UserCreate(BaseModel):
    model_config = ConfigDict(json_schema_extra=_DEMO_CREDENTIALS)

    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD_LENGTH)

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
        return v


class UserLogin(BaseModel):
    model_config = ConfigDict(json_schema_extra=_DEMO_CREDENTIALS)

    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.lower()


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    created_at: UTCDateTime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str
