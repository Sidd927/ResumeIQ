from fastapi import APIRouter

from app import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Liveness probe used by deploy platforms and CI smoke tests."""
    return {
        "status": "healthy",
        "project": "ResumeIQ",
        "version": __version__,
    }
