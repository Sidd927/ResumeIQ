"""
Shared fixtures.

Tests run against an in-memory SQLite database — no Postgres needed. The
environment is configured BEFORE the app is imported so ``app.database``
builds its engine from the test URL.

Postgres-only tests are marked ``@pytest.mark.integration`` and skipped by
default (see pytest.ini); run them with ``pytest -m integration``.
"""

from __future__ import annotations

import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["BCRYPT_ROUNDS"] = "4"  # fast hashing in tests; production default is 12
os.environ["JWT_SECRET_KEY"] = "test-secret-key-at-least-32-bytes-long!!"
os.environ["AUTO_CREATE_TABLES"] = "false"

from collections.abc import Callable, Iterator  # noqa: E402
from copy import deepcopy  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401 — register tables
from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services.embeddings import SentenceTransformerEmbedder  # noqa: E402
from app.services.taxonomy import Taxonomy, load_taxonomy  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


# ── Database / client ────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _fresh_schema() -> Iterator[None]:
    """Every test starts with empty tables."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def register_and_login(client: TestClient) -> Callable[..., dict[str, str]]:
    """Factory: create a user and return Authorization headers for them."""

    def _make(email: str = "ada@example.com", password: str = "correct-horse-battery") -> dict[str, str]:
        r = client.post("/api/auth/register", json={"email": email, "password": password})
        assert r.status_code == 201, r.text
        r = client.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _make


@pytest.fixture
def auth_headers(register_and_login: Callable[..., dict[str, str]]) -> dict[str, str]:
    return register_and_login()


# ── NLP ──────────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def taxonomy() -> Taxonomy:
    return load_taxonomy()


@pytest.fixture(scope="session")
def embedder() -> SentenceTransformerEmbedder:
    """The real all-MiniLM-L6-v2 embedder (loaded once per test session)."""
    return SentenceTransformerEmbedder()


class StubEmbedder:
    """Deterministic embedder returning a fixed raw similarity — isolates scorer math from the model."""

    def __init__(self, raw_similarity: float) -> None:
        self.raw_similarity = raw_similarity
        self.calls = 0

    def best_match_similarity(self, resume_bullets: list[str], jd_requirements: list[str]) -> float:
        self.calls += 1
        return self.raw_similarity


@pytest.fixture
def stub_embedder() -> Callable[[float], StubEmbedder]:
    return StubEmbedder


# ── Sample data (hand-written, independent of the parser) ────────────────────

_SAMPLE_RESUME: dict[str, Any] = {
    "contact_info": {
        "name": "Siddhant Patil",
        "email": "siddhant@example.com",
        "phone": "+91 98765 43210",
        "location": "Mumbai, India",
    },
    "work_history": [
        {
            "title": "Full Stack Developer",
            "company": "TechCorp Solutions",
            "start_date": "2024-06",
            "end_date": None,
            "bullets": [
                "Built and deployed microservices using FastAPI and PostgreSQL, handling 10K+ daily requests",
                "Developed responsive React dashboards with TypeScript, reducing page load times by 40%",
                "Implemented CI/CD pipelines using GitHub Actions, cutting deployment time from 2 hours to 15 minutes",
                "Collaborated with a cross-functional team of 8 to deliver features on a 2-week sprint cycle",
            ],
        },
        {
            "title": "Software Engineering Intern",
            "company": "DataFlow Analytics",
            "start_date": "2023-01",
            "end_date": "2024-05",
            "bullets": [
                "Designed REST APIs serving ML model predictions to 50+ enterprise clients",
                "Created data visualization components using Recharts, adopted across 3 product teams",
                "Wrote unit and integration tests achieving 85% code coverage on critical services",
            ],
        },
    ],
    "education": [{"degree": "B.Tech Computer Science", "institution": "Mumbai University", "year": 2025}],
    "skills": [
        "Python", "JavaScript", "TypeScript", "React", "FastAPI", "PostgreSQL",
        "Docker", "Git", "REST APIs", "CI/CD", "Tailwind CSS",
    ],
}

_SAMPLE_JD: dict[str, Any] = {
    "title": "Senior Full Stack Developer",
    "required_skills": ["React", "TypeScript", "Node.js", "PostgreSQL", "Docker", "AWS", "CI/CD", "REST APIs"],
    "preferred_skills": ["Python", "FastAPI", "Redis", "GraphQL", "Kubernetes"],
    "experience_level": "3-5 years",
    "requirements": [
        "Build and maintain scalable web applications using React and Node.js",
        "Design and implement RESTful APIs with proper authentication and authorization",
        "Write clean, testable code with comprehensive unit and integration tests",
        "Deploy and manage applications on AWS using containerized architectures",
        "Collaborate with product managers and designers in an agile environment",
    ],
}


@pytest.fixture
def sample_parsed_resume() -> dict[str, Any]:
    return deepcopy(_SAMPLE_RESUME)


@pytest.fixture
def sample_parsed_jd() -> dict[str, Any]:
    return deepcopy(_SAMPLE_JD)


@pytest.fixture(scope="session")
def fixture_bytes() -> Callable[[str], bytes]:
    return lambda name: (FIXTURES / name).read_bytes()


@pytest.fixture(scope="session")
def sample_jd_text() -> str:
    return (FIXTURES / "sample_jd.txt").read_text(encoding="utf-8")
