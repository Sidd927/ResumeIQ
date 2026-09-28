from fastapi import APIRouter

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("")
def create_job_description() -> dict[str, str]:
    """Submit a job description for parsing. [Phase 2 implementation]"""
    return {"message": "Job description endpoint — coming in Phase 2"}
