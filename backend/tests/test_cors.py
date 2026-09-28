"""CORS: the Vite dev/preview origins may call the API from the browser; unknown origins may not."""

import pytest


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://localhost:4173", "http://localhost:3000"])
def test_preflight_allows_configured_origins(client, origin):
    r = client.options(
        "/api/auth/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin
    # Bearer tokens, not cookies → credentialed CORS is deliberately off.
    assert "access-control-allow-credentials" not in r.headers


def test_unknown_origin_is_not_allowed(client):
    r = client.options(
        "/api/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in r.headers


def test_error_responses_still_carry_cors_headers(client):
    """A 401 must be readable by the frontend, or it shows a generic network error instead."""
    r = client.get("/api/match/history", headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 401
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"
