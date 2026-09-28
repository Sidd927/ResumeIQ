from fastapi import APIRouter

router = APIRouter(prefix="/api/resumes", tags=["resumes"])


@router.post("")
def upload_resume() -> dict[str, str]:
    """Upload and parse a resume (PDF/DOCX). [Phase 2 implementation]"""
    return {"message": "Resume upload endpoint — coming in Phase 2"}
