from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def test_tts_requires_api_key():
    client = TestClient(app)
    response = client.post("/v1/tts", json={"text": "hello", "voice_id": "teacher_female_01"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_voice_clone_disabled(monkeypatch):
    monkeypatch.setenv("VOICE_GATEWAY_API_KEY", "test-key")
    get_settings.cache_clear()
    client = TestClient(app)
    response = client.post(
        "/v1/voice-clone",
        headers={"X-API-Key": "test-key"},
        json={
            "audio_url": "https://example.com/a.wav",
            "speaker_name": "Teacher",
            "consent_confirmed": True,
            "intended_use": "internal test",
        },
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "VOICE_CLONE_DISABLED"
