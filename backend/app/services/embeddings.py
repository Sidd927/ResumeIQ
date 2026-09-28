"""
Embedding Service — sentence-transformers wrapper

- load_model()            → cached SentenceTransformer (lazy: first call only)
- encode_texts(texts)     → L2-normalised embeddings (n × d numpy array)
- compute_similarity(a,b) → cosine similarity matrix (len(b) × len(a))
- best_match_similarity(resume_bullets, jd_requirements)
      For each JD requirement take its closest resume bullet (max cosine),
      then average those maxima. Returns the RAW mean cosine in [0, 1];
      calibration to a score lives in the scorer, where it is explainable.

The model is never loaded at import time, so importing the app (and the test
suite) stays fast; the ~80 MB model downloads once to the HuggingFace cache.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import TYPE_CHECKING, Protocol

import numpy as np

from app.config import settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class Embedder(Protocol):
    """What the scoring engine needs from an embedder (lets tests inject fakes)."""

    def best_match_similarity(self, resume_bullets: list[str], jd_requirements: list[str]) -> float: ...


@lru_cache(maxsize=1)
def load_model(model_name: str | None = None) -> SentenceTransformer:
    """Load (once) and cache the sentence-transformer model."""
    from sentence_transformers import SentenceTransformer  # heavy import, deferred

    name = model_name or settings.embedding_model
    logger.info("Loading embedding model %s", name)
    return SentenceTransformer(name, device="cpu")


def _clean(texts: list[str]) -> list[str]:
    return [t.strip() for t in texts if t and t.strip()]


def encode_texts(texts: list[str]) -> np.ndarray:
    """Encode texts to unit-length vectors, so a dot product is cosine similarity."""
    cleaned = _clean(texts)
    if not cleaned:
        return np.zeros((0, 0), dtype=np.float32)
    return load_model().encode(cleaned, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)


def compute_similarity(texts_a: list[str], texts_b: list[str]) -> np.ndarray:
    """Cosine similarity matrix of shape (len(texts_b), len(texts_a)); empty input → empty matrix."""
    emb_a = encode_texts(texts_a)
    emb_b = encode_texts(texts_b)
    if emb_a.size == 0 or emb_b.size == 0:
        return np.zeros((0, 0), dtype=np.float32)
    return emb_b @ emb_a.T


def best_match_similarity(resume_bullets: list[str], jd_requirements: list[str]) -> float:
    """Mean over JD requirements of the best-matching resume bullet's cosine similarity."""
    sims = compute_similarity(resume_bullets, jd_requirements)
    if sims.size == 0:
        return 0.0
    best_per_requirement = np.clip(sims.max(axis=1), 0.0, 1.0)
    return float(best_per_requirement.mean())


class SentenceTransformerEmbedder:
    """Default Embedder implementation backed by this module's cached model."""

    def best_match_similarity(self, resume_bullets: list[str], jd_requirements: list[str]) -> float:
        return best_match_similarity(resume_bullets, jd_requirements)


@lru_cache(maxsize=1)
def get_embedder() -> SentenceTransformerEmbedder:
    """FastAPI dependency (override in tests with ``app.dependency_overrides``)."""
    return SentenceTransformerEmbedder()
