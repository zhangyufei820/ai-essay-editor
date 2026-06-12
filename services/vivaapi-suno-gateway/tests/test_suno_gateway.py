import json

import pytest
import respx
from httpx import Response


def test_missing_gateway_key_returns_401(client):
    response = client.post("/api/v1/suno/lyrics", json={"prompt": "dance"})

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["message"] == "未授权"


@respx.mock
def test_authorization_bearer_auto_prefix(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/suno/submit/lyrics").mock(return_value=Response(200, json={"code": "success"}))

    response = client.post("/api/v1/suno/lyrics", headers=auth_headers, json={"prompt": "dance"})

    assert response.status_code == 200
    assert route.calls.last.request.headers["Authorization"] == "Bearer test-token"


@respx.mock
def test_music_custom_submit(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/suno/submit/music").mock(
        return_value=Response(200, json={"code": "success", "data": {"task_id": "task-1", "audio_url": "https://a.test/a.mp3"}})
    )

    response = client.post(
        "/api/v1/suno/music/custom",
        headers=auth_headers,
        json={"prompt": "歌词", "mv": "chirp-v5", "title": "标题", "tags": "pop"},
    )

    assert response.status_code == 200
    assert response.json()["task_id"] == "task-1"
    assert response.json()["audio_urls"] == ["https://a.test/a.mp3"]
    assert json.loads(route.calls.last.request.content)["title"] == "标题"


@respx.mock
def test_extend_defaults_task(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/suno/submit/music").mock(return_value=Response(200, json={"code": "success"}))

    response = client.post(
        "/api/v1/suno/music/extend",
        headers=auth_headers,
        json={
            "prompt": "续写",
            "mv": "chirp-v5",
            "continue_clip_id": "clip-1",
            "continue_at": 120,
        },
    )

    assert response.status_code == 200
    assert json.loads(route.calls.last.request.content)["task"] == "extend"


@respx.mock
def test_lyrics(client, auth_headers, provider_base):
    respx.post(f"{provider_base}/suno/submit/lyrics").mock(
        return_value=Response(200, json={"code": "success", "data": {"task_id": "lyric-task"}})
    )

    response = client.post("/api/v1/suno/lyrics", headers=auth_headers, json={"prompt": "dance"})

    assert response.json()["task_id"] == "lyric-task"


@respx.mock
def test_concat(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/suno/submit/concat").mock(return_value=Response(200, json={"code": "success"}))

    response = client.post("/api/v1/suno/concat", headers=auth_headers, json={"clip_id": "clip-1", "is_infill": False})

    assert response.status_code == 200
    assert json.loads(route.calls.last.request.content)["clip_id"] == "clip-1"


@respx.mock
def test_upload_authorize(client, auth_headers, provider_base):
    respx.post(f"{provider_base}/suno/uploads/audio").mock(
        return_value=Response(
            200,
            json={"code": "success", "data": {"id": "upload-1", "url": "https://s3.test", "fields": {"key": "k"}}},
        )
    )

    response = client.post("/api/v1/suno/upload/authorize", headers=auth_headers, json={"extension": "mp3"})

    assert response.json()["upload_id"] == "upload-1"
    assert "provider_response" not in response.json()


@respx.mock
def test_upload_full_flow_mock(client, auth_headers, provider_base, tmp_path):
    respx.post(f"{provider_base}/suno/uploads/audio").mock(
        return_value=Response(200, json={"code": "success", "data": {"id": "upload-1", "url": "https://s3.test/upload", "fields": {"key": "k"}}})
    )
    respx.post("https://s3.test/upload").mock(return_value=Response(204, text=""))
    respx.post(f"{provider_base}/suno/uploads/audio/upload-1/upload-finish").mock(
        return_value=Response(200, json={"code": "success", "data": {"status": "processing"}})
    )
    respx.get(f"{provider_base}/suno/uploads/audio/upload-1").mock(
        return_value=Response(200, json={"code": "success", "data": {"status": "complete", "image_url": "https://i.test/c.jpg"}})
    )
    respx.post(f"{provider_base}/suno/uploads/audio/upload-1/initialize-clip").mock(
        return_value=Response(200, json={"code": "success", "data": {"clip_id": "clip-1"}})
    )
    audio = tmp_path / "a.mp3"
    audio.write_bytes(b"audio")

    with audio.open("rb") as file_obj:
        response = client.post(
            "/api/v1/suno/upload/full",
            headers=auth_headers,
            data={"wait_complete": "true", "poll_interval_seconds": "0", "poll_timeout_seconds": "5"},
            files={"file": ("a.mp3", file_obj, "audio/mpeg")},
        )

    body = response.json()
    assert body["success"] is True
    assert body["upload_id"] == "upload-1"
    assert body["clip_id"] == "clip-1"
    assert "provider_response" not in body
    assert "data" not in body


@respx.mock
def test_fetch_one(client, auth_headers, provider_base):
    respx.get(f"{provider_base}/suno/fetch/task-1").mock(return_value=Response(200, json={"code": "success", "data": {"id": "task-1"}}))

    response = client.get("/api/v1/suno/tasks/task-1", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["task_id"] == "task-1"


@respx.mock
def test_wav(client, auth_headers, provider_base):
    respx.get(f"{provider_base}/suno/act/wav/clip-1").mock(
        return_value=Response(200, json={"code": "success", "data": {"wav_url": "https://a.test/a.wav"}})
    )

    response = client.get("/api/v1/suno/clips/clip-1/wav", headers=auth_headers)

    assert response.json()["wav_url"] == "https://a.test/a.wav"


@respx.mock
def test_timing(client, auth_headers, provider_base):
    respx.get(f"{provider_base}/suno/act/timing/timing-1").mock(return_value=Response(200, json={"code": "success", "timing": []}))

    response = client.get("/api/v1/suno/timing/timing-1", headers=auth_headers)

    assert response.status_code == 200
    assert "provider_response" not in response.json()
    assert response.json()["timing"] == []


def test_raw_rejects_full_url(client, auth_headers):
    response = client.post(
        "/api/v1/suno/raw",
        headers=auth_headers,
        json={"method": "POST", "path": "https://evil.test/suno/fetch", "body": {}},
    )

    assert response.status_code == 422
    assert response.json()["success"] is False


@respx.mock
def test_raw_allows_suno_path(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/suno/submit/music").mock(return_value=Response(200, json={"code": "success"}))

    response = client.post(
        "/api/v1/suno/raw",
        headers=auth_headers,
        json={"method": "POST", "path": "/suno/submit/music", "body": {"prompt": "x"}},
    )

    assert response.status_code == 200
    assert route.called


@pytest.mark.skipif(__import__("os").environ.get("RUN_LIVE_TESTS") != "1", reason="live provider tests are disabled by default")
def test_live_health_only(client):
    response = client.get("/health")
    assert response.status_code == 200
