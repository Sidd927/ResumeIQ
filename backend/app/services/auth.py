"""
Auth service: bcrypt password hashing, JWT issue/verify, and the
``get_current_user`` FastAPI dependency.

Token payload: {"sub": "<user id>", "email": ..., "type": "access"|"refresh",
"iat": ..., "exp": ...}. ``sub`` is a string because PyJWT ≥ 2.10 enforces
the RFC 7519 requirement that the subject claim be a string.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User

TokenType = Literal["access", "refresh"]

# auto_error=False so we can return a consistent 401 (HTTPBearer's default is 403).
_bearer = HTTPBearer(auto_error=False, description="Paste the access_token from /api/auth/login")


class InvalidTokenError(Exception):
    """Token is malformed, expired, or of the wrong type."""


# ── Passwords ────────────────────────────────────────────────────────────────


def hash_password(plain: str) -> str:
    """bcrypt hash with a per-password random salt (cost = settings.bcrypt_rounds)."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=settings.bcrypt_rounds)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time comparison via bcrypt. Malformed hashes simply fail."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ── Tokens ───────────────────────────────────────────────────────────────────


def _encode(payload: dict[str, Any], lifetime: timedelta) -> str:
    now = datetime.now(timezone.utc)
    claims = {**payload, "iat": now, "exp": now + lifetime}
    return jwt.encode(claims, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int, email: str) -> str:
    return _encode(
        {"sub": str(user_id), "email": email, "type": "access"},
        timedelta(minutes=settings.jwt_access_token_expire_minutes),
    )


def create_refresh_token(user_id: int) -> str:
    return _encode(
        {"sub": str(user_id), "type": "refresh"},
        timedelta(days=settings.jwt_refresh_token_expire_days),
    )


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    """Verify signature + expiry (+ type). Raises InvalidTokenError on any problem."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],  # pin the algorithm: never trust the header's
            options={"require": ["exp", "sub", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise InvalidTokenError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise InvalidTokenError("Invalid token") from exc
    if expected_type and payload.get("type") != expected_type:
        raise InvalidTokenError(f"Expected a {expected_type} token")
    return payload


def user_id_from_payload(payload: dict[str, Any]) -> int:
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidTokenError("Invalid token subject") from exc


# ── FastAPI dependency ───────────────────────────────────────────────────────


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the Bearer access token to a User, or respond 401."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Not authenticated")
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
        user_id = user_id_from_payload(payload)
    except InvalidTokenError as exc:
        raise _unauthorized(str(exc)) from exc
    user = db.get(User, user_id)
    if user is None:
        raise _unauthorized("User no longer exists")
    return user
