"""Every stub endpoint from the CLAUDE.md API surface responds at its canonical path."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_auth_register_stub() -> None:
    response = client.post("/api/auth/register")
    assert response.status_code == 200


def test_auth_login_stub() -> None:
    response = client.post("/api/auth/login")
    assert response.status_code == 200


def test_auth_refresh_stub() -> None:
    response = client.post("/api/auth/refresh")
    assert response.status_code == 200


def test_resume_upload_stub() -> None:
    response = client.post("/api/resumes")
    assert response.status_code == 200


def test_job_create_stub() -> None:
    response = client.post("/api/jobs")
    assert response.status_code == 200


def test_match_run_stub() -> None:
    response = client.post("/api/match")
    assert response.status_code == 200


def test_match_get_stub() -> None:
    response = client.get("/api/match/1")
    assert response.status_code == 200


def test_match_history_stub() -> None:
    response = client.get("/api/match/history")
    assert response.status_code == 200
    assert "history" in response.json()["message"].lower()


def test_match_feedback_stub() -> None:
    response = client.post("/api/match/1/feedback")
    assert response.status_code == 200
