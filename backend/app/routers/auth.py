from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import AccessTokenResponse, TokenRefresh, TokenResponse, UserCreate, UserLogin, UserResponse
from app.services.auth import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    user_id_from_payload,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Same message for unknown email and wrong password, so the endpoint can't be
# used to discover which emails have accounts.
_BAD_CREDENTIALS = "Invalid email or password"


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    """Create an account. Emails are case-insensitive and must be unique (409 if taken)."""
    if db.scalar(select(User).where(User.email == payload.email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:  # concurrent registration with the same email
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists") from exc
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    """Exchange email + password for an access token (short-lived) and a refresh token."""
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _BAD_CREDENTIALS)
    return TokenResponse(
        access_token=create_access_token(user.id, user.email),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh_token(payload: TokenRefresh, db: Session = Depends(get_db)) -> AccessTokenResponse:
    """Exchange a valid refresh token for a new access token."""
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
        user = db.get(User, user_id_from_payload(claims))
    except InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return AccessTokenResponse(access_token=create_access_token(user.id, user.email))
