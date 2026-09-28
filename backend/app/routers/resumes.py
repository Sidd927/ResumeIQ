import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.resume import Resume
from app.models.user import User
from app.schemas.resume import ResumeResponse
from app.services.auth import get_current_user
from app.services.parser import SUPPORTED_EXTENSIONS, ResumeParseError, extract_text, parse_resume_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/resumes", tags=["resumes"])


@router.post("", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
def upload_resume(
    file: UploadFile = File(..., description="Resume as PDF or DOCX, max 5 MB"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Resume:
    """Upload a PDF/DOCX resume; returns the stored record with its parsed JSON."""
    filename = file.filename or ""
    if not any(filename.lower().endswith(ext) for ext in SUPPORTED_EXTENSIONS):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Upload a PDF or DOCX file.")

    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 5 MB.")

    # Parsing is CPU-bound (pdfminer + spaCy); a plain `def` route runs in
    # FastAPI's threadpool, so it doesn't block the event loop.
    try:
        text = extract_text(data, filename)
        parsed = parse_resume_text(text)
    except ResumeParseError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except Exception as exc:  # parser bug on odd input: report, don't 500 with a trace
        logger.exception("Unexpected error parsing %s", filename)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "We couldn't parse this resume.") from exc

    resume = Resume(user_id=user.id, raw_text=text, parsed_json=parsed, file_url=None)
    db.add(resume)
    db.commit()
    db.refresh(resume)
    return resume


@router.get("/{resume_id}", response_model=ResumeResponse)
def get_resume(resume_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Resume:
    """Fetch one of your resumes (404 if it doesn't exist or isn't yours)."""
    resume = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    if resume is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found")
    return resume
