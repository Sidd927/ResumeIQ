from datetime import timedelta

import pytest

from app.services.auth import (
    InvalidTokenError,
    _encode,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

PROTECTED = "/api/match/history"
CREDS = {"email": "ada@example.com", "password": "correct-horse-battery"}


# ── Service ──────────────────────────────────────────────────────────────────


def test_password_hashing_round_trip():
    hashed = hash_password("s3cret-password")
    assert hashed != "s3cret-password" and hashed.startswith("$2b$")
    assert verify_password("s3cret-password", hashed)
    assert not verify_password("wrong-password", hashed)
    assert not verify_password("anything", "not-a-bcrypt-hash")


def test_hashes_are_salted():
    assert hash_password("same-password") != hash_password("same-password")


def test_token_payloads():
    access = decode_token(create_access_token(7, "ada@example.com"), expected_type="access")
    assert access["sub"] == "7" and access["email"] == "ada@example.com" and access["type"] == "access"
    refresh = decode_token(create_refresh_token(7), expected_type="refresh")
    assert refresh["sub"] == "7" and refresh["type"] == "refresh"


def test_decode_rejects_wrong_type_expired_and_tampered_tokens():
    with pytest.raises(InvalidTokenError, match="access"):
        decode_token(create_refresh_token(1), expected_type="access")
    expired = _encode({"sub": "1", "type": "access"}, timedelta(seconds=-5))
    with pytest.raises(InvalidTokenError, match="expired"):
        decode_token(expired)
    token = create_access_token(1, "a@b.co")
    with pytest.raises(InvalidTokenError):
        decode_token(token[:-2] + ("AA" if token[-2:] != "AA" else "BB"))


# ── Register ─────────────────────────────────────────────────────────────────


def test_register_success(client):
    r = client.post("/api/auth/register", json=CREDS)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == CREDS["email"] and isinstance(body["id"], int) and "created_at" in body
    assert "password" not in body and "password_hash" not in body


def test_register_duplicate_email_is_rejected_case_insensitively(client):
    assert client.post("/api/auth/register", json=CREDS).status_code == 201
    r = client.post("/api/auth/register", json={**CREDS, "email": "ADA@Example.com"})
    assert r.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": "long-enough-pw"},
        {"email": "ada@example.com", "password": "short"},
        {"email": "ada@example.com", "password": "x" * 73},
        {"email": "ada@example.com"},
    ],
)
def test_register_validation(client, payload):
    assert client.post("/api/auth/register", json=payload).status_code == 422


# ── Login ────────────────────────────────────────────────────────────────────


def test_login_success(client):
    client.post("/api/auth/register", json=CREDS)
    r = client.post("/api/auth/login", json={**CREDS, "email": "Ada@Example.com"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert decode_token(body["access_token"], "access")["email"] == CREDS["email"]
    assert decode_token(body["refresh_token"], "refresh")["type"] == "refresh"


def test_login_wrong_password_and_unknown_email_look_identical(client):
    client.post("/api/auth/register", json=CREDS)
    wrong_pw = client.post("/api/auth/login", json={**CREDS, "password": "not-the-password"})
    no_user = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "whatever-pw"})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json() == {"detail": "Invalid email or password"}


# ── Refresh ──────────────────────────────────────────────────────────────────


def test_refresh_issues_working_access_token(client):
    client.post("/api/auth/register", json=CREDS)
    tokens = client.post("/api/auth/login", json=CREDS).json()
    r = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200
    new_access = r.json()["access_token"]
    assert client.get(PROTECTED, headers={"Authorization": f"Bearer {new_access}"}).status_code == 200


def test_refresh_rejects_access_tokens_and_garbage(client):
    client.post("/api/auth/register", json=CREDS)
    tokens = client.post("/api/auth/login", json=CREDS).json()
    assert client.post("/api/auth/refresh", json={"refresh_token": tokens["access_token"]}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": "garbage"}).status_code == 401


# ── Protected endpoints ──────────────────────────────────────────────────────


def test_protected_endpoint_without_token(client):
    r = client.get(PROTECTED)
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("header", ["Bearer garbage", "Basic YWRhOnB3", "Bearer "])
def test_protected_endpoint_with_bad_credentials(client, header):
    assert client.get(PROTECTED, headers={"Authorization": header}).status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(client):
    client.post("/api/auth/register", json=CREDS)
    refresh = client.post("/api/auth/login", json=CREDS).json()["refresh_token"]
    assert client.get(PROTECTED, headers={"Authorization": f"Bearer {refresh}"}).status_code == 401


def test_expired_access_token_is_rejected(client):
    user_id = client.post("/api/auth/register", json=CREDS).json()["id"]
    expired = _encode({"sub": str(user_id), "email": CREDS["email"], "type": "access"}, timedelta(seconds=-1))
    assert client.get(PROTECTED, headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_protected_endpoint_with_valid_token(client, auth_headers):
    r = client.get(PROTECTED, headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []
