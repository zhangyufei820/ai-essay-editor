import httpx
import pytest

from app.config import Settings
from app.omnivoice_client import OmniVoiceClient
from app.schemas import TTSRequest

AsyncClient = httpx.AsyncClient


@pytest.mark.asyncio
async def test_prefers_generate_endpoint_by_default(tmp_path, monkeypatch):
    calls: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        assert request.url.path == "/generate"
        return httpx.Response(200, content=b"RIFF....WAVE", headers={"content-type": "audio/wav"})

    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: AsyncClient(transport=httpx.MockTransport(handler)))

    settings = Settings(
        VOICE_GATEWAY_API_KEY="test-key",
        MEDIA_DIR=tmp_path / "media",
        JOBS_DIR=tmp_path / "jobs",
    )
    client = OmniVoiceClient(settings)

    result = await client.synthesize(TTSRequest(text="hello", format="wav"), "teacher_female_01")

    assert calls == ["/generate"]
    assert result["mime_type"] == "audio/wav"
    assert result["filename"].endswith(".wav")


@pytest.mark.asyncio
async def test_openai_compat_mode_falls_back_to_generate_on_405(tmp_path, monkeypatch):
    calls: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/v1/audio/speech":
            return httpx.Response(405)
        return httpx.Response(200, content=b"RIFF....WAVE", headers={"content-type": "audio/wav"})

    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: AsyncClient(transport=httpx.MockTransport(handler)))

    settings = Settings(
        VOICE_GATEWAY_API_KEY="test-key",
        MEDIA_DIR=tmp_path / "media",
        JOBS_DIR=tmp_path / "jobs",
        PREFER_GENERATE_ENDPOINT=False,
    )
    client = OmniVoiceClient(settings)

    result = await client.synthesize(TTSRequest(text="hello", format="wav"), "teacher_female_01")

    assert calls == ["/v1/audio/speech", "/generate"]
    assert result["mime_type"] == "audio/wav"


@pytest.mark.asyncio
async def test_list_voices_falls_back_to_allowed_voice_ids(tmp_path, monkeypatch):
    calls: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        return httpx.Response(404, json={"detail": "Not Found"})

    monkeypatch.setattr(httpx, "AsyncClient", lambda *args, **kwargs: AsyncClient(transport=httpx.MockTransport(handler)))

    settings = Settings(
        VOICE_GATEWAY_API_KEY="test-key",
        MEDIA_DIR=tmp_path / "media",
        JOBS_DIR=tmp_path / "jobs",
        ALLOWED_VOICE_IDS="teacher_female_01,default",
    )
    client = OmniVoiceClient(settings)

    result = await client.list_voices()

    assert calls == ["/v1/audio/voices"]
    assert [voice["voice_id"] for voice in result["voices"]] == ["teacher_female_01", "default"]
    assert result["voices"][0]["enabled"] is True
