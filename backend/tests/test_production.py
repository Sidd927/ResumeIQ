"""Production hardening: config guards, rate limiting, security headers, upload size guard."""

import pytest
from pydantic import ValidationError

from app.config import DEV_JWT_SECRET, Settings
from app.services.rate_limit import SlidingWindowLimiter

STRONG_SECRET = "x" * 64
PG = "postgresql://u:p@db:5432/resumeiq"

# ── Config ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("secret", [DEV_JWT_SECRET, "short-secret"])
def test_production_refuses_weak_jwt_secret(secret):
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(environment="production", jwt_secret_key=secret, database_url=PG)


def test_production_refuses_sqlite():
    with pytest.raises(ValidationError, match="PostgreSQL"):
        Settings(environment="production", jwt_secret_key=STRONG_SECRET, database_url="sqlite://")


def test_production_defaults():
    s = Settings(environment="production", jwt_secret_key=STRONG_SECRET, database_url=PG)
    assert s.effective_log_level == "INFO"
    assert s.should_run_migrations is True


def test_development_defaults():
    s = Settings(environment="development")
    assert s.effective_log_level == "DEBUG"
    assert s.should_run_migrations is False


def test_postgres_scheme_is_normalised():
    assert Settings(database_url="postgres://u:p@h/db").database_url == "postgresql://u:p@h/db"


def test_cors_origins_alias_and_trailing_slash(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://resumeiq.vercel.app/, http://localhost:5173")
    assert Settings().cors_origins == ["https://resumeiq.vercel.app", "http://localhost:5173"]


# ── Rate limiting ────────────────────────────────────────────────────────────


def test_sliding_window_limiter():
    limiter = SlidingWindowLimiter(window=60)
    assert [limiter.hit("k", 2, now=t) for t in (0, 1)] == [None, None]
    assert limiter.hit("k", 2, now=2) == pytest.approx(58)  # third hit blocked until t=60
    assert limiter.hit("other", 2, now=2) is None  # keys are independent
    assert limiter.hit("k", 2, now=60.5) is None  # window slid past the first hit


def test_login_is_rate_limited_per_ip(client):
    creds = {"email": "ada@example.com", "password": "wrong-password"}
    codes = [client.post("/api/auth/login", json=creds).status_code for _ in range(6)]
    assert codes == [401] * 5 + [429]
    r = client.post("/api/auth/login", json=creds)
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0
    assert "Too many attempts" in r.json()["detail"]


def test_register_is_rate_limited(client):
    codes = [
        client.post("/api/auth/register", json={"email": f"u{i}@example.com", "password": "long-enough-pw"}).status_code
        for i in range(4)
    ]
    assert codes == [201, 201, 201, 429]


# ── Headers & upload guard ───────────────────────────────────────────────────


def test_security_headers_present(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "strict-transport-security" not in r.headers  # HTTPS-only header is production-only


def test_oversized_upload_rejected_before_reading_body(client, auth_headers):
    r = client.post(
        "/api/resumes",
        headers={
            **auth_headers,
            "Content-Length": str(50 * 1024 * 1024),
            "Content-Type": "multipart/form-data; boundary=x",
        },
        content=b"--x--",
    )
    assert r.status_code == 413
    assert "5 MB" in r.json()["detail"]


# ── Startup ──────────────────────────────────────────────────────────────────


def test_startup_preloads_models_when_enabled(monkeypatch, embedder):
    from fastapi.testclient import TestClient

    from app.config import settings
    from app.main import app
    from app.services.embeddings import load_model

    monkeypatch.setattr(settings, "preload_models", True)
    load_model.cache_clear()
    with TestClient(app) as c:
        assert load_model.cache_info().currsize == 1  # loaded during startup, before any request
        assert c.get("/health").status_code == 200
