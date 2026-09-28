"""
Integration tests against a REAL PostgreSQL (JSONB columns, join queries).

Skipped by default. Run with:
    TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/resumeiq_test pytest -m integration

Uses its own engine and overrides ``get_db``, creating and dropping all tables
— point it at a throwaway database.
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker

from app.database import Base, get_db
from app.main import app

pytestmark = pytest.mark.integration

PG_URL = os.environ.get("TEST_POSTGRES_URL")


@pytest.fixture
def pg_client() -> Iterator[TestClient]:
    if not PG_URL:
        pytest.skip("TEST_POSTGRES_URL not set")
    engine = create_engine(PG_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, autoflush=False)

    def _get_db() -> Iterator[Session]:
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_json_columns_are_jsonb_on_postgres(pg_client):
    engine = create_engine(PG_URL)  # type: ignore[arg-type]
    columns = {c["name"]: c["type"] for c in inspect(engine).get_columns("match_results")}
    assert type(columns["missing_skills"]).__name__ == "JSONB"
    engine.dispose()


def test_full_flow_on_postgres(pg_client, fixture_bytes, sample_jd_text):
    pg_client.post("/api/auth/register", json={"email": "pg@example.com", "password": "correct-horse-battery"})
    token = pg_client.post(
        "/api/auth/login", json={"email": "pg@example.com", "password": "correct-horse-battery"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resume = pg_client.post(
        "/api/resumes", headers=headers, files={"file": ("r.pdf", fixture_bytes("sample_resume.pdf"), "application/pdf")}
    ).json()
    job = pg_client.post("/api/jobs", headers=headers, json={"raw_text": sample_jd_text}).json()
    match = pg_client.post("/api/match", headers=headers, json={"resume_id": resume["id"], "job_id": job["id"]}).json()

    assert match["missing_skills"] == ["Node.js", "AWS", "Redis", "GraphQL", "Kubernetes"]
    assert pg_client.get("/api/match/history", headers=headers).json()[0]["id"] == match["id"]
