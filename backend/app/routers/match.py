from fastapi import APIRouter

router = APIRouter(prefix="/api/match", tags=["matching"])


@router.post("")
def run_match() -> dict[str, str]:
    """Run the scoring engine on a resume + JD pair. [Phase 2 implementation]"""
    return {"message": "Match endpoint — coming in Phase 2"}


# NOTE: /history must be registered BEFORE /{match_id}; otherwise FastAPI would
# route GET /api/match/history to get_match(match_id="history") and return 422.
@router.get("/history")
def get_match_history() -> dict[str, str]:
    """List all past match results for the current user. [Phase 2 implementation]"""
    return {"message": "Match history — coming in Phase 2"}


@router.get("/{match_id}")
def get_match(match_id: int) -> dict[str, str]:
    """Fetch a past match result by id. [Phase 2 implementation]"""
    return {"message": f"Get match {match_id} — coming in Phase 2"}


@router.post("/{match_id}/feedback")
def generate_feedback(match_id: int) -> dict[str, str]:
    """Generate LLM feedback text FROM stored structured scores. [Stretch goal]"""
    return {"message": f"Feedback for match {match_id} — stretch goal"}
