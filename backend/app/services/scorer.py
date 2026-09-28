"""
4-Signal Scoring Engine — a PURE function of structured inputs.

    compute_match(parsed_resume, parsed_jd, taxonomy, embedder, reference_date)
        → {skill_score, semantic_score, recency_score, completeness_score,
           composite_score, missing_skills}

Sub-scores (each 0–1, each independently unit-tested):
1. skill_match_score        (40%) taxonomy-normalised required/preferred overlap
2. semantic_relevance_score (30%) calibrated best-match embedding similarity
3. title_recency_score      (20%) title similarity + recency-weighted skill evidence
4. completeness_score       (10%) did the parser extract each resume section?

composite = (0.4·skill + 0.3·semantic + 0.2·recency + 0.1·completeness) × 100

Purity rules (never violate):
- No DB access, no I/O, no LLM calls, no global mutable state.
- "Today" is an explicit argument (``reference_date``), so the same inputs
  always give the same output — even when re-scored a year later.
- The embedder is injected; with the same model its output is deterministic.
"""

from __future__ import annotations

import re
from datetime import date
from difflib import SequenceMatcher
from typing import Any

from app.services.embeddings import Embedder
from app.services.taxonomy import Taxonomy, canonical_or_raw, find_missing_skills

# ── Composite weights ────────────────────────────────────────────────────────
WEIGHTS: dict[str, float] = {
    "skill_score": 0.4,
    "semantic_score": 0.3,
    "recency_score": 0.2,
    "completeness_score": 0.1,
}

# ── Skill match ──────────────────────────────────────────────────────────────
REQUIRED_WEIGHT = 2.0
PREFERRED_WEIGHT = 1.0

# ── Semantic calibration ─────────────────────────────────────────────────────
# all-MiniLM-L6-v2 best-match cosines are compressed: unrelated professions
# (nurse vs. developer JD) land around 0.08–0.15, a strong on-topic resume
# around 0.45–0.55, and close paraphrases around 0.6–0.7. We rescale linearly
# so SEMANTIC_FLOOR → 0 and SEMANTIC_CEILING → 1, then clamp.
SEMANTIC_FLOOR = 0.15
SEMANTIC_CEILING = 0.65

# ── Title & recency ──────────────────────────────────────────────────────────
RECENT_YEARS = 2.0  # experience within this window counts fully
RECENCY_HALF_LIFE_YEARS = 2.0  # older experience halves in weight every 2 years
UNKNOWN_DATES_WEIGHT = 0.5  # role with no parseable dates: neutral evidence

SENIORITY_LEVELS: dict[str, int] = {
    "intern": 0,
    "internship": 0,
    "trainee": 0,
    "apprentice": 0,
    "junior": 1,
    "jr": 1,
    "entry": 1,
    "graduate": 1,
    "associate": 1,
    "mid": 2,
    "senior": 3,
    "sr": 3,
    "lead": 4,
    "staff": 4,
    "principal": 5,
    "head": 5,
    "director": 6,
    "vp": 6,
    "chief": 7,
    "cto": 7,
}
DEFAULT_SENIORITY = 2  # a title with no seniority word ("Software Engineer")
UNDER_QUALIFIED_PENALTY = 0.15  # per level the candidate is below the JD
OVER_QUALIFIED_PENALTY = 0.05  # per level above
MIN_SENIORITY_FACTOR = 0.4

_TITLE_PHRASES: tuple[tuple[str, str], ...] = (
    (r"full[\s-]?stack", "fullstack"),
    (r"front[\s-]?end", "frontend"),
    (r"back[\s-]?end", "backend"),
    (r"machine learning", "ml"),
    (r"artificial intelligence", "ai"),
    (r"dev[\s-]?ops", "devops"),
)
_TITLE_SYNONYMS: dict[str, str] = {
    "developer": "engineer",
    "programmer": "engineer",
    "dev": "engineer",
    "eng": "engineer",
    "engineering": "engineer",
    "swe": "engineer",
    "sde": "engineer",
    "mgr": "manager",
    "management": "manager",
    "scientist": "scientist",
    "science": "scientist",
    "analytics": "analyst",
}
_TITLE_STOPWORDS = frozenset(
    {"of", "and", "the", "a", "an", "for", "in", "to", "at", "i", "ii", "iii", "iv", "&", "-", "/"}
)

# ── Completeness ─────────────────────────────────────────────────────────────
COMPLETENESS_WEIGHTS: dict[str, float] = {
    "name": 0.125,
    "email": 0.125,
    "work_history": 0.30,
    "education": 0.20,
    "skills": 0.25,
}
MIN_SKILLS_FOR_FULL_CREDIT = 3


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


# ═════════════════════════════════════════════════════════════════════════════
# 1. Skill match (40%)
# ═════════════════════════════════════════════════════════════════════════════


def skill_match_score(
    resume_skills: list[str],
    jd_required: list[str],
    jd_preferred: list[str],
    taxonomy: Taxonomy,
) -> float:
    """
    Weighted overlap of JD skills present on the resume, compared by canonical
    taxonomy name (so "ML" satisfies "Machine Learning"):

        (2·matched_required + 1·matched_preferred) / (2·total_required + 1·total_preferred)

    A skill listed as both required and preferred counts once, as required.
    If the JD names no skills at all there is nothing missing, so the score is
    1.0 — consistent with an empty missing-skills list.
    """
    missing = find_missing_skills(resume_skills, jd_required, jd_preferred, taxonomy)
    required = {canonical_or_raw(s, taxonomy).lower() for s in jd_required}
    preferred = {canonical_or_raw(s, taxonomy).lower() for s in jd_preferred} - required

    total = REQUIRED_WEIGHT * len(required) + PREFERRED_WEIGHT * len(preferred)
    if total == 0:
        return 1.0
    matched_required = len(required) - len(missing["required_missing"])
    matched_preferred = len(preferred) - len(missing["preferred_missing"])
    return _clamp01((REQUIRED_WEIGHT * matched_required + PREFERRED_WEIGHT * matched_preferred) / total)


# ═════════════════════════════════════════════════════════════════════════════
# 2. Semantic relevance (30%)
# ═════════════════════════════════════════════════════════════════════════════


def calibrate_similarity(raw_cosine: float) -> float:
    """Map a raw mean best-match cosine onto 0–1 (see SEMANTIC_FLOOR/CEILING)."""
    return _clamp01((raw_cosine - SEMANTIC_FLOOR) / (SEMANTIC_CEILING - SEMANTIC_FLOOR))


def semantic_relevance_score(
    resume_bullets: list[str],
    jd_requirements: list[str],
    embedder: Embedder,
) -> float:
    """
    For each JD requirement, find the most similar resume bullet (cosine over
    sentence embeddings); average those maxima and calibrate to 0–1. Captures
    relevance even when wording differs. Empty inputs → 0.0.
    """
    bullets = [b for b in resume_bullets if b and b.strip()]
    requirements = [r for r in jd_requirements if r and r.strip()]
    if not bullets or not requirements:
        return 0.0
    return calibrate_similarity(embedder.best_match_similarity(bullets, requirements))


# ═════════════════════════════════════════════════════════════════════════════
# 3. Title & recency (20%)
# ═════════════════════════════════════════════════════════════════════════════


def _title_tokens(title: str) -> tuple[set[str], int]:
    """Split a job title into (role tokens, seniority level)."""
    text = title.lower()
    for pattern, replacement in _TITLE_PHRASES:
        text = re.sub(pattern, replacement, text)
    words = [w.strip(".") for w in re.findall(r"[a-z0-9+#.]+", text) if w.strip(".")]
    levels = [SENIORITY_LEVELS[w] for w in words if w in SENIORITY_LEVELS]
    role = {_TITLE_SYNONYMS.get(w, w) for w in words if w not in SENIORITY_LEVELS and w not in _TITLE_STOPWORDS}
    return role, (max(levels) if levels else DEFAULT_SENIORITY)


def title_similarity(resume_title: str, jd_title: str) -> float:
    """
    0–1 similarity between two job titles.

    Role similarity is the Dice overlap of normalised role words
    ("Developer" ≡ "Engineer", "Full-Stack" ≡ "Full Stack"), backed off to
    character similarity for near-misses. It is then scaled by a seniority
    factor: each level the candidate sits *below* the posting costs 15%,
    each level above costs 5%.
    """
    if not resume_title or not jd_title:
        return 0.0
    role_a, level_a = _title_tokens(resume_title)
    role_b, level_b = _title_tokens(jd_title)
    if not role_a or not role_b:
        return 0.0
    dice = 2 * len(role_a & role_b) / (len(role_a) + len(role_b))
    chars = SequenceMatcher(None, " ".join(sorted(role_a)), " ".join(sorted(role_b))).ratio()
    role_similarity = max(dice, 0.8 * chars)

    gap = level_b - level_a
    penalty = UNDER_QUALIFIED_PENALTY * gap if gap > 0 else OVER_QUALIFIED_PENALTY * -gap
    return _clamp01(role_similarity * max(MIN_SENIORITY_FACTOR, 1.0 - penalty))


def _parse_partial_date(value: str | None, *, is_end: bool) -> date | None:
    """'2024-06' → 2024-06-01; '2022' → Jan 1 (start) or Dec 1 (end); junk → None."""
    if not value:
        return None
    m = re.match(r"^(\d{4})(?:-(\d{1,2}))?", str(value))
    if not m:
        return None
    year = int(m.group(1))
    month = int(m.group(2)) if m.group(2) else (12 if is_end else 1)
    return date(year, max(1, min(12, month)), 1)


def role_recency_weight(role: dict[str, Any], reference_date: date) -> float:
    """
    1.0 for a current role or one that ended within RECENT_YEARS; older roles
    decay with a RECENCY_HALF_LIFE_YEARS half-life. No dates → neutral 0.5.
    """
    start = _parse_partial_date(role.get("start_date"), is_end=False)
    end = _parse_partial_date(role.get("end_date"), is_end=True)
    if end is None:
        return 1.0 if start is not None else UNKNOWN_DATES_WEIGHT  # start only ⇒ ongoing
    years_ago = max(0.0, (reference_date - end).days / 365.25)
    if years_ago <= RECENT_YEARS:
        return 1.0
    return 0.5 ** ((years_ago - RECENT_YEARS) / RECENCY_HALF_LIFE_YEARS)


def _role_text(role: dict[str, Any]) -> str:
    return " ".join([role.get("title") or "", *(role.get("bullets") or [])])


def title_recency_score(
    work_history: list[dict[str, Any]],
    jd_title: str,
    jd_skills: list[str] | None = None,
    taxonomy: Taxonomy | None = None,
    reference_date: date | None = None,
) -> float:
    """
    Average of two components:

    1. Title similarity between the MOST RECENT role and the JD title.
    2. Recency-weighted skill presence: for each JD skill, the recency weight
       of the most recent role whose title/bullets show it (0 if no role
       does), averaged over JD skills. Skills used last year beat skills
       used five years ago. Without JD skills, falls back to the recency
       weight of the most recent role.

    No work history → 0.0. ``work_history`` is assumed most-recent-first
    (the parser guarantees this).
    """
    if not work_history:
        return 0.0
    ref = reference_date or date.today()
    title_component = title_similarity(work_history[0].get("title") or "", jd_title or "")

    if jd_skills and taxonomy is not None:
        wanted = {canonical_or_raw(s, taxonomy).lower() for s in jd_skills}
        best_weight: dict[str, float] = {}
        for role in work_history:
            weight = role_recency_weight(role, ref)
            for skill in taxonomy.extract_from_text(_role_text(role)):
                key = skill.lower()
                if key in wanted:
                    best_weight[key] = max(best_weight.get(key, 0.0), weight)
        recency_component = sum(best_weight.values()) / len(wanted)
    else:
        recency_component = role_recency_weight(work_history[0], ref)

    return _clamp01((title_component + recency_component) / 2)


# ═════════════════════════════════════════════════════════════════════════════
# 4. Section completeness (10%)
# ═════════════════════════════════════════════════════════════════════════════


def completeness_score(parsed_resume: dict[str, Any]) -> float:
    """
    How cleanly did the parser extract the resume?
      name +0.125, email +0.125, ≥1 work role +0.30, education +0.20,
      ≥3 skills +0.25 (fewer skills earn proportional credit).
    """
    contact = parsed_resume.get("contact_info") or {}
    score = 0.0
    if contact.get("name"):
        score += COMPLETENESS_WEIGHTS["name"]
    if contact.get("email"):
        score += COMPLETENESS_WEIGHTS["email"]
    if parsed_resume.get("work_history"):
        score += COMPLETENESS_WEIGHTS["work_history"]
    if parsed_resume.get("education"):
        score += COMPLETENESS_WEIGHTS["education"]
    n_skills = len(parsed_resume.get("skills") or [])
    score += COMPLETENESS_WEIGHTS["skills"] * min(1.0, n_skills / MIN_SKILLS_FOR_FULL_CREDIT)
    return _clamp01(score)


# ═════════════════════════════════════════════════════════════════════════════
# Orchestrator
# ═════════════════════════════════════════════════════════════════════════════


def resume_semantic_texts(parsed_resume: dict[str, Any]) -> list[str]:
    """Texts that represent the candidate's experience: every bullet plus each role title."""
    texts: list[str] = []
    for role in parsed_resume.get("work_history") or []:
        texts.extend(b for b in (role.get("bullets") or []) if b)
        if role.get("title"):
            texts.append(role["title"])
    return texts


def composite_from(sub_scores: dict[str, float]) -> float:
    """Weighted sum on a 0–100 scale."""
    return sum(WEIGHTS[k] * sub_scores[k] for k in WEIGHTS) * 100


def compute_match(
    parsed_resume: dict[str, Any],
    parsed_jd: dict[str, Any],
    taxonomy: Taxonomy,
    embedder: Embedder,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """
    Run all four signals and combine them.

    Sub-scores are rounded to 4 dp *before* the composite is computed, so the
    stored composite always equals the weighted sum of the stored sub-scores.
    ``missing_skills`` lists required gaps first, then preferred.
    """
    resume_skills: list[str] = parsed_resume.get("skills") or []
    required: list[str] = parsed_jd.get("required_skills") or []
    preferred: list[str] = parsed_jd.get("preferred_skills") or []

    sub_scores = {
        "skill_score": skill_match_score(resume_skills, required, preferred, taxonomy),
        "semantic_score": semantic_relevance_score(
            resume_semantic_texts(parsed_resume), parsed_jd.get("requirements") or [], embedder
        ),
        "recency_score": title_recency_score(
            parsed_resume.get("work_history") or [],
            parsed_jd.get("title") or "",
            jd_skills=required + preferred,
            taxonomy=taxonomy,
            reference_date=reference_date,
        ),
        "completeness_score": completeness_score(parsed_resume),
    }
    sub_scores = {k: round(v, 4) for k, v in sub_scores.items()}

    missing = find_missing_skills(resume_skills, required, preferred, taxonomy)
    return {
        **sub_scores,
        "composite_score": round(composite_from(sub_scores), 2),
        "missing_skills": missing["required_missing"] + missing["preferred_missing"],
    }
