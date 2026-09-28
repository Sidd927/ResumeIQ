from fastapi import APIRouter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register")
def register() -> dict[str, str]:
    """Register a new user (bcrypt-hashed password). [Phase 3 implementation]"""
    return {"message": "Auth register endpoint — coming in Phase 3"}


@router.post("/login")
def login() -> dict[str, str]:
    """Login and receive JWT access + refresh tokens. [Phase 3 implementation]"""
    return {"message": "Auth login endpoint — coming in Phase 3"}


@router.post("/refresh")
def refresh_token() -> dict[str, str]:
    """Exchange a refresh token for a new access token. [Phase 3 implementation]"""
    return {"message": "Auth refresh endpoint — coming in Phase 3"}
