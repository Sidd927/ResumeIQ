from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.job import JobDescription
from app.models.user import User
from app.schemas.job import JobDescriptionCreate, JobDescriptionResponse
from app.services.auth import get_current_user
from app.services.parser import parse_job_description

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=JobDescriptionResponse, status_code=status.HTTP_201_CREATED)
def create_job_description(
    payload: JobDescriptionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobDescription:
    """Submit pasted job-description text; returns the stored record with its parsed JSON."""
    raw_text = payload.raw_text.strip()
    job = JobDescription(user_id=user.id, raw_text=raw_text, parsed_json=parse_job_description(raw_text))
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobDescriptionResponse)
def get_job_description(
    job_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> JobDescription:
    """Fetch one of your job descriptions (404 if it doesn't exist or isn't yours)."""
    job = db.scalar(select(JobDescription).where(JobDescription.id == job_id, JobDescription.user_id == user.id))
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job description not found")
    return job
