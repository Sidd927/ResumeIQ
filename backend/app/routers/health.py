from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Liveness probe used by deploy platforms and CI smoke tests."""
    return {
        "status": "healthy",
        "project": "ResumeIQ",
        "version": "0.1.0",
    }
