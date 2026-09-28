"""End-to-end API flow on SQLite with the real parser, taxonomy and embedding model."""

import pytest

from app.config import settings

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _upload(client, headers, fixture_bytes, name="sample_resume.pdf", mime=PDF):
    return client.post("/api/resumes", headers=headers, files={"file": (name, fixture_bytes(name), mime)})


def test_full_flow(client, auth_headers, fixture_bytes, sample_jd_text):
    # Upload resume
    r = _upload(client, auth_headers, fixture_bytes)
    assert r.status_code == 201, r.text
    resume = r.json()
    assert resume["parsed_json"]["contact_info"]["email"] == "siddhant@example.com"
    assert len(resume["parsed_json"]["work_history"]) == 2
    assert resume["raw_text"].startswith("Siddhant Patil")

    # Submit JD
    r = client.post("/api/jobs", headers=auth_headers, json={"raw_text": sample_jd_text})
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["parsed_json"]["title"] == "Senior Full Stack Developer"

    # Run match
    r = client.post("/api/match", headers=auth_headers, json={"resume_id": resume["id"], "job_id": job["id"]})
    assert r.status_code == 201, r.text
    match = r.json()
    assert set(match) == {
        "id",
        "resume_id",
        "jd_id",
        "skill_score",
        "semantic_score",
        "recency_score",
        "completeness_score",
        "composite_score",
        "missing_skills",
        "feedback_text",
        "created_at",
    }
    assert match["resume_id"] == resume["id"] and match["jd_id"] == job["id"]
    assert match["missing_skills"] == ["Node.js", "AWS", "Redis", "GraphQL", "Kubernetes"]
    assert match["completeness_score"] == 1.0
    expected = (
        0.4 * match["skill_score"]
        + 0.3 * match["semantic_score"]
        + 0.2 * match["recency_score"]
        + 0.1 * match["completeness_score"]
    ) * 100
    assert match["composite_score"] == pytest.approx(expected, abs=0.005)
    assert 50 < match["composite_score"] < 90  # a realistic, decent-but-not-perfect match

    # Fetch it back, and see it in history
    assert client.get(f"/api/match/{match['id']}", headers=auth_headers).json() == match
    history = client.get("/api/match/history", headers=auth_headers).json()
    assert [m["id"] for m in history] == [match["id"]]

    # Resume / JD lookups used by the match report page
    assert client.get(f"/api/resumes/{resume['id']}", headers=auth_headers).json()["id"] == resume["id"]
    assert client.get(f"/api/jobs/{job['id']}", headers=auth_headers).json()["id"] == job["id"]


def test_docx_upload(client, auth_headers, fixture_bytes):
    r = _upload(client, auth_headers, fixture_bytes, "sample_resume.docx", DOCX)
    assert r.status_code == 201, r.text
    assert r.json()["parsed_json"]["contact_info"]["name"] == "Siddhant Patil"


def test_history_is_most_recent_first(client, auth_headers, fixture_bytes, sample_jd_text):
    resume_id = _upload(client, auth_headers, fixture_bytes).json()["id"]
    job_id = client.post("/api/jobs", headers=auth_headers, json={"raw_text": sample_jd_text}).json()["id"]
    ids = [
        client.post("/api/match", headers=auth_headers, json={"resume_id": resume_id, "job_id": job_id}).json()["id"]
        for _ in range(3)
    ]
    history = client.get("/api/match/history", headers=auth_headers).json()
    assert [m["id"] for m in history] == ids[::-1]
    # Same inputs → same scores (deterministic engine).
    assert len({(m["composite_score"], tuple(m["missing_skills"])) for m in history}) == 1


# ── Upload validation ────────────────────────────────────────────────────────


def test_upload_rejects_unsupported_type(client, auth_headers):
    r = client.post("/api/resumes", headers=auth_headers, files={"file": ("resume.txt", b"hello world", "text/plain")})
    assert r.status_code == 415


def test_upload_rejects_fake_pdf(client, auth_headers):
    r = client.post("/api/resumes", headers=auth_headers, files={"file": ("resume.pdf", b"not a pdf at all", PDF)})
    assert r.status_code == 422
    assert "not a PDF" in r.json()["detail"]


def test_upload_rejects_oversized_file(client, auth_headers, fixture_bytes, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_bytes", 1000)
    assert _upload(client, auth_headers, fixture_bytes).status_code == 413


def test_jd_too_short_is_rejected(client, auth_headers):
    assert client.post("/api/jobs", headers=auth_headers, json={"raw_text": "Python dev"}).status_code == 422


# ── Ownership & not-found ────────────────────────────────────────────────────


def test_users_cannot_see_or_use_each_others_data(client, register_and_login, fixture_bytes, sample_jd_text):
    alice = register_and_login("alice@example.com")
    bob = register_and_login("bob@example.com")
    resume_id = _upload(client, alice, fixture_bytes).json()["id"]
    job_id = client.post("/api/jobs", headers=alice, json={"raw_text": sample_jd_text}).json()["id"]
    match_id = client.post("/api/match", headers=alice, json={"resume_id": resume_id, "job_id": job_id}).json()["id"]

    # Bob gets 404 (not 403) so IDs don't leak whether they exist.
    assert client.get(f"/api/match/{match_id}", headers=bob).status_code == 404
    assert client.get(f"/api/resumes/{resume_id}", headers=bob).status_code == 404
    assert client.get(f"/api/jobs/{job_id}", headers=bob).status_code == 404
    assert client.post("/api/match", headers=bob, json={"resume_id": resume_id, "job_id": job_id}).status_code == 404
    assert client.get("/api/match/history", headers=bob).json() == []


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("get", "/api/match/999", None),
        ("get", "/api/resumes/999", None),
        ("get", "/api/jobs/999", None),
        ("post", "/api/match", {"resume_id": 999, "job_id": 999}),
    ],
)
def test_not_found(client, auth_headers, method, path, body):
    r = getattr(client, method)(path, headers=auth_headers, **({"json": body} if body else {}))
    assert r.status_code == 404


# ── Auth required everywhere ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    "method, path",
    [
        ("post", "/api/resumes"),
        ("get", "/api/resumes/1"),
        ("post", "/api/jobs"),
        ("get", "/api/jobs/1"),
        ("post", "/api/match"),
        ("get", "/api/match/1"),
        ("get", "/api/match/history"),
        ("post", "/api/match/1/feedback"),
    ],
)
def test_protected_endpoints_require_auth(client, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_feedback_is_not_implemented_yet(client, auth_headers):
    assert client.post("/api/match/1/feedback", headers=auth_headers).status_code == 501
