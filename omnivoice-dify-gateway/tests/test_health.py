from fastapi.testclient import TestClient

from app.main import app


def test_healthz_without_api_key():
    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["gateway"] == "ok"

