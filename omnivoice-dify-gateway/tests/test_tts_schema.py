from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def _client(monkeypatch, *, max_text_chars="20"):
    monkeypatch.setenv("VOICE_GATEWAY_API_KEY", "test-key")
    monkeypatch.setenv("MAX_TEXT_CHARS", max_text_chars)
    monkeypatch.setenv("ALLOWED_VOICE_IDS", "teacher_female_01,default")
    get_settings.cache_clear()
    return TestClient(app)


def test_tts_rejects_long_text(monkeypatch):
    client = _client(monkeypatch, max_text_chars="5")
    response = client.post(
        "/v1/tts",
        headers={"X-API-Key": "test-key"},
        json={"text": "hello world", "voice_id": "teacher_female_01"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "TEXT_TOO_LONG"


def test_tts_rejects_unallowed_voice(monkeypatch):
    client = _client(monkeypatch)
    response = client.post(
        "/v1/tts",
        headers={"X-API-Key": "test-key"},
        json={"text": "hello", "voice_id": "not_allowed"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VOICE_NOT_ALLOWED"


def test_openapi_contains_dify_operations(monkeypatch):
    client = _client(monkeypatch)
    schema = client.get("/openapi.json").json()
    operations = {
        operation.get("operationId")
        for path in schema["paths"].values()
        for operation in path.values()
        if isinstance(operation, dict)
    }
    assert "createTTS" in operations
    assert "createEssayCommentary" in operations

