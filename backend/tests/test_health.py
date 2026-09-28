from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["project"] == "ResumeIQ"


def test_docs_accessible() -> None:
    response = client.get("/docs")
    assert response.status_code == 200
