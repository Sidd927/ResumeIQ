import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.job import JobDescription
from app.models.match import MatchResult
from app.models.resume import Resume
from app.models.user import User
from app.schemas.match import MatchRequest, MatchResponse
from app.services.auth import get_current_user
from app.services.embeddings import Embedder, get_embedder
from app.services.scorer import compute_match
from app.services.taxonomy import Taxonomy, load_taxonomy

router = APIRouter(prefix="/api/match", tags=["matching"])
logger = logging.getLogger("resumeiq.match")


def get_taxonomy() -> Taxonomy:
    """Dependency wrapper so tests can swap the taxonomy."""
    return load_taxonomy()


def _owned_matches(user: User):  # type: ignore[no-untyped-def]
    """Base query: match results whose resume belongs to ``user``."""
    return select(MatchResult).join(Resume, MatchResult.resume_id == Resume.id).where(Resume.user_id == user.id)


@router.post("", response_model=MatchResponse, status_code=status.HTTP_201_CREATED)
def run_match(
    payload: MatchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    taxonomy: Taxonomy = Depends(get_taxonomy),
    embedder: Embedder = Depends(get_embedder),
) -> MatchResult:
    """
    Score one of your resumes against one of your job descriptions.

    The router only loads inputs and persists outputs; all scoring happens in
    the pure ``compute_match`` function (today's date is passed in explicitly).
    """
    resume = db.scalar(select(Resume).where(Resume.id == payload.resume_id, Resume.user_id == user.id))
    if resume is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resume not found")
    job = db.scalar(
        select(JobDescription).where(JobDescription.id == payload.job_id, JobDescription.user_id == user.id)
    )
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job description not found")
    if resume.parsed_json is None or job.parsed_json is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Resume or job description has not been parsed")

    # A plain `def` route runs in FastAPI's threadpool, so CPU-bound embedding
    # inference doesn't block the event loop.
    scores = compute_match(resume.parsed_json, job.parsed_json, taxonomy, embedder, reference_date=date.today())

    result = MatchResult(resume_id=resume.id, jd_id=job.id, **scores)
    db.add(result)
    db.commit()
    db.refresh(result)
    logger.info(
        "event=match_computed match_id=%s user_id=%s composite=%.2f missing=%d",
        result.id,
        user.id,
        result.composite_score,
        len(result.missing_skills),
    )
    return result


# NOTE: /history must be registered BEFORE /{match_id}; otherwise FastAPI would
# route GET /api/match/history to get_match(match_id="history") and return 422.
@router.get("/history", response_model=list[MatchResponse])
def get_match_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[MatchResult]:
    """All of your match results, most recent first."""
    query = _owned_matches(user).order_by(MatchResult.created_at.desc(), MatchResult.id.desc())
    return list(db.scalars(query))


@router.get("/{match_id}", response_model=MatchResponse)
def get_match(match_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MatchResult:
    """One of your match results (404 if it doesn't exist or isn't yours)."""
    result = db.scalar(_owned_matches(user).where(MatchResult.id == match_id))
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match not found")
    return result


@router.post("/{match_id}/feedback", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def generate_feedback(match_id: int, user: User = Depends(get_current_user)) -> dict[str, str]:
    """Generate LLM feedback text FROM stored structured scores. [Stretch goal — Phase 5]"""
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "AI feedback is a Phase 5 stretch goal")
