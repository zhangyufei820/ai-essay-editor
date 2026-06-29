import json

import respx
from httpx import Response

from app.relaydance_client import request_diagnostic_summary


def test_missing_gateway_key_returns_401(client):
    response = client.post("/api/v1/video/create", json={"prompt": "test"})

    assert response.status_code == 401
    body = response.json()
    assert body["success"] is False
    assert body["error"]["message"] == "未授权"


def test_authorization_bearer_gateway_key_is_accepted(client):
    response = client.post(
        "/api/v1/video/create",
        headers={"Authorization": "Bearer gateway-secret"},
        json={"prompt": "test"},
    )

    assert response.status_code != 401


def test_create_video_rejects_image_generation_intent(client, auth_headers):
    response = client.post(
        "/api/v1/video/create",
        headers=auth_headers,
        json={"prompt": "生成图片：一张温暖的数学教学海报"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["provider_code"] == "validation_error"
    assert body["message"] == "参数格式错误，请检查后重试。"


def test_video_request_diagnostic_summary_redacts_prompt_and_image_url():
    summary = request_diagnostic_summary(
        "/v1/video/generations",
        {
            "model": "dreamina-seedance-2-0-260128",
            "prompt": "sensitive prompt text",
            "seconds": "4",
            "first_frame_url": "https://cdn.example.test/private/path/first.png?token=secret",
            "metadata": {
                "ratio": "9:16",
                "resolution": "720p",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": "https://cdn.example.test/private/path/source.png?token=secret"},
                        "role": "first_frame",
                    }
                ],
            },
        },
    )

    assert summary["prompt_length"] == len("sensitive prompt text")
    assert "sensitive prompt text" not in json.dumps(summary)
    assert "private/path" not in json.dumps(summary)
    assert "secret" not in json.dumps(summary)
    assert summary["first_frame_url"] == {
        "host": "cdn.example.test",
        "sha256_12": summary["first_frame_url"]["sha256_12"],
    }
    assert len(summary["first_frame_url"]["sha256_12"]) == 12
    assert summary["image_urls"] == [{"host": "cdn.example.test", "sha256_12": summary["image_urls"][0]["sha256_12"]}]
    assert len(summary["image_urls"][0]["sha256_12"]) == 12


@respx.mock
def test_authorization_bearer_auto_prefix(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-1"}),
    )

    response = client.post(
        "/api/v1/video/generations",
        headers=auth_headers,
        json={
            "model": "doubao-seedance-2-0-720p",
            "prompt": "A cinematic test video",
            "seconds": "5",
            "metadata": {"ratio": "16:9", "resolution": "720p"},
        },
    )

    assert response.status_code == 200
    assert response.json()["task_id"] == "task-1"
    assert route.calls.last.request.headers["Authorization"] == "Bearer test-token"
    sent = json.loads(route.calls.last.request.content)
    assert sent["seconds"] == "5"


@respx.mock
def test_video_generation_accepts_official_seedance_2_min_duration(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-4s"}),
    )

    response = client.post(
        "/api/v1/video/generations",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw",
            "prompt": "A neutral studio product shot.",
            "seconds": 4,
            "metadata": {"ratio": "16:9", "resolution": "720p"},
        },
    )

    assert response.status_code == 200
    assert response.json()["task_id"] == "task-4s"
    sent = json.loads(route.calls.last.request.content)
    assert sent["model"] == "seedance-nsfw"
    assert sent["seconds"] == "4"


@respx.mock
def test_private_seedance_generation_does_not_forward_default_generate_audio(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-private"}),
    )

    response = client.post(
        "/api/v1/video/generations",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw",
            "prompt": "@image1 follow this reference.",
            "seconds": "4",
            "metadata": {
                "ratio": "9:16",
                "resolution": "720p",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": "https://cdn.test/reference.png"},
                        "role": "reference_image",
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    sent = json.loads(route.calls.last.request.content)
    assert sent["model"] == "seedance-nsfw"
    assert sent["prompt"] == "@image1 follow this reference."
    assert sent["first_frame_url"] == "https://cdn.test/reference.png"
    assert sent["image_urls"] == ["https://cdn.test/reference.png"]
    assert sent["metadata"]["content"][0]["image_url"]["url"] == "https://cdn.test/reference.png"
    assert "generate_audio" not in sent["metadata"]


@respx.mock
def test_private_seedance_generation_reconstructs_metadata_content_from_top_level_reference(
    client, auth_headers, provider_base
):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-reconstructed"}),
    )

    response = client.post(
        "/api/v1/video/generations",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw",
            "prompt": "A neutral studio product shot.",
            "seconds": "4",
            "first_frame_url": "https://cdn.test/reference.png",
            "metadata": {"ratio": "9:16", "resolution": "720p"},
        },
    )

    assert response.status_code == 200
    sent = json.loads(route.calls.last.request.content)
    assert sent["first_frame_url"] == "https://cdn.test/reference.png"
    assert sent["metadata"]["content"][0]["image_url"]["url"] == "https://cdn.test/reference.png"
    assert sent["metadata"]["content"][0]["role"] == "first_frame"

    summary = request_diagnostic_summary("/v1/video/generations", sent)
    assert summary["content_count"] == 1
    assert summary["metadata_keys"] == ["content", "ratio", "resolution"]


@respx.mock
def test_private_seedance_generation_reconstructs_metadata_content_from_image_roles(
    client, auth_headers, provider_base
):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-roles"}),
    )

    response = client.post(
        "/api/v1/video/generations",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw",
            "prompt": "A neutral studio product shot.",
            "seconds": "4",
            "image_with_roles": [{"url": "https://cdn.test/reference.png", "role": "first_frame"}],
            "metadata": {"ratio": "9:16", "resolution": "720p"},
        },
    )

    assert response.status_code == 200
    sent = json.loads(route.calls.last.request.content)
    assert sent["metadata"]["content"][0]["image_url"]["url"] == "https://cdn.test/reference.png"
    assert sent["metadata"]["content"][0]["role"] == "first_frame"


@respx.mock
def test_seedance_2_generation_only_forwards_generate_audio_when_true(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-audio"}),
    )

    response = client.post(
        "/api/v1/video/generations",
        headers=auth_headers,
        json={
            "model": "doubao-seedance-2-0-720p",
            "prompt": "A calm product demo shot.",
            "seconds": "5",
            "metadata": {"ratio": "16:9", "resolution": "720p", "generate_audio": True},
        },
    )

    assert response.status_code == 200
    sent = json.loads(route.calls.last.request.content)
    assert sent["metadata"]["generate_audio"] is True


@respx.mock
def test_dify_create_builds_first_frame_payload_and_warns_on_last_frame(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-2"}),
    )

    response = client.post(
        "/api/v1/video/create",
        headers=auth_headers,
        json={
            "prompt": "Slow cinematic dolly-in.",
            "model": "doubao-seedance-2-0-720p",
            "seconds": 5,
            "ratio": "16:9",
            "resolution": "720p",
            "first_frame_url": "https://cdn.test/first.jpg",
            "last_frame_url": "https://cdn.test/last.jpg",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["task_id"] == "task-2"
    assert body["warnings"]
    sent = json.loads(route.calls.last.request.content)
    assert sent["seconds"] == "5"
    assert sent["first_frame_url"] == "https://cdn.test/first.jpg"
    assert sent["image_urls"] == ["https://cdn.test/first.jpg"]
    assert sent["metadata"]["content"][0]["image_url"]["url"] == "https://cdn.test/first.jpg"


@respx.mock
def test_get_video_status_returns_video_url(client, auth_headers, provider_base):
    respx.get(f"{provider_base}/v1/videos/task-1").mock(
        return_value=Response(
            200,
            json={
                "id": "task-1",
                "status": "completed",
                "progress": 100,
                "metadata": {"url": "https://cdn.relaydance.com/result.mp4"},
            },
        ),
    )

    response = client.get("/api/v1/videos/task-1", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["task_id"] == "task-1"
    assert body["status"] == "completed"
    assert body["video_url"] == "https://cdn.relaydance.com/result.mp4"


@respx.mock
def test_upload_url_uses_pay_domain(client, auth_headers):
    route = respx.get("https://pay.relaydance.com/api/upload-url").mock(
        return_value=Response(
            200,
            json={
                "exists": False,
                "upload_url": "https://r2.test/upload",
                "source_url": "https://cdn.relaydance.com/source.jpg",
            },
        ),
    )

    response = client.get(
        "/api/v1/upload-url?ext=jpg&md5=0123456789abcdef0123456789abcdef",
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["upload_url"] == "https://r2.test/upload"
    assert route.calls.last.request.url.host == "pay.relaydance.com"


def test_raw_rejects_full_url(client, auth_headers):
    response = client.post(
        "/api/v1/raw",
        headers=auth_headers,
        json={"method": "POST", "path": "https://evil.test/v1/video/generations", "body": {}},
    )

    assert response.status_code == 422
    assert response.json()["success"] is False


@respx.mock
def test_raw_allows_video_path(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/video/generations").mock(
        return_value=Response(200, json={"task_id": "task-raw"}),
    )

    response = client.post(
        "/api/v1/raw",
        headers=auth_headers,
        json={"method": "POST", "path": "/v1/video/generations", "body": {"model": "x"}},
    )

    assert response.status_code == 200
    assert route.called


@respx.mock
def test_openai_compatible_videos_submit_forwards_to_openai_videos(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/videos").mock(
        return_value=Response(200, json={"id": "rd-task-1", "status": "queued"}),
    )

    response = client.post(
        "/v1/videos",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw",
            "prompt": "A neutral product demo shot.",
            "seconds": "5",
            "size": "1280x720",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "rd-task-1"
    assert body["task_id"] == "rd-task-1"
    assert body["object"] == "video"
    assert body["status"] == "queued"

    sent = json.loads(route.calls.last.request.content)
    assert sent == {
        "model": "seedance-nsfw",
        "prompt": "A neutral product demo shot.",
        "seconds": "5",
        "size": "1280x720",
        "ratio": "16:9",
        "resolution": "720p",
    }


@respx.mock
def test_openai_compatible_videos_duration_is_forwarded_as_seconds(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/videos").mock(
        return_value=Response(200, json={"id": "rd-task-4s", "status": "queued"}),
    )

    response = client.post(
        "/v1/videos",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw",
            "prompt": "A neutral studio product shot.",
            "duration": 4,
            "size": "1280x720",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "rd-task-4s"
    assert body["seconds"] == "4"
    sent = json.loads(route.calls.last.request.content)
    assert sent["seconds"] == "4"
    assert sent["duration"] == 4


@respx.mock
def test_openai_compatible_videos_maps_legacy_nsfw_model(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/videos").mock(
        return_value=Response(200, json={"id": "rd-task-legacy", "status": "queued"}),
    )

    response = client.post(
        "/v1/videos",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw-4k",
            "prompt": "A neutral studio product shot.",
            "seconds": "4",
            "size": "1280x720",
        },
    )

    assert response.status_code == 200
    sent = json.loads(route.calls.last.request.content)
    assert sent["model"] == "seedance-nsfw"


@respx.mock
def test_openai_compatible_videos_extracts_first_frame_from_metadata(client, auth_headers, provider_base):
    route = respx.post(f"{provider_base}/v1/videos").mock(
        return_value=Response(200, json={"id": "rd-task-frame", "status": "queued"}),
    )

    response = client.post(
        "/v1/videos",
        headers=auth_headers,
        json={
            "model": "seedance-nsfw",
            "prompt": "@image1 A neutral studio product shot.",
            "seconds": "4",
            "size": "720x1280",
            "metadata": {
                "ratio": "9:16",
                "resolution": "720p",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": "https://cdn.test/reference.png"},
                        "role": "reference_image",
                    }
                ],
                "generate_audio": True,
            },
        },
    )

    assert response.status_code == 200
    sent = json.loads(route.calls.last.request.content)
    assert sent["model"] == "seedance-nsfw"
    assert sent["prompt"] == "@image1 A neutral studio product shot."
    assert sent["first_frame_url"] == "https://cdn.test/reference.png"
    assert sent["image_urls"] == ["https://cdn.test/reference.png"]
    assert sent["metadata"]["content"][0]["image_url"]["url"] == "https://cdn.test/reference.png"
    assert "generate_audio" not in sent["metadata"]


@respx.mock
def test_openai_compatible_videos_status_exposes_metadata_url(client, auth_headers, provider_base):
    respx.get(f"{provider_base}/v1/videos/rd-task-1").mock(
        return_value=Response(
            200,
            json={
                "id": "rd-task-1",
                "status": "completed",
                "progress": 100,
                "metadata": {"url": "https://cdn.relaydance.com/result.mp4"},
            },
        ),
    )

    response = client.get("/v1/videos/rd-task-1", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "rd-task-1"
    assert body["status"] == "completed"
    assert body["progress"] == 100
    assert body["metadata"]["url"] == "https://cdn.relaydance.com/result.mp4"


@respx.mock
def test_openai_compatible_status_recovers_when_content_exists(client, auth_headers, provider_base):
    respx.get(f"{provider_base}/v1/videos/rd-task-content-only").mock(
        return_value=Response(
            403,
            json={"error": {"code": "", "message": "This token has no access to model"}},
        ),
    )
    respx.get(f"{provider_base}/v1/videos/rd-task-content-only/content").mock(
        return_value=Response(
            200,
            headers={"content-type": "video/mp4"},
            content=b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00fake-video",
        ),
    )

    response = client.get("/v1/videos/rd-task-content-only", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "rd-task-content-only"
    assert body["status"] == "completed"
    assert body["progress"] == 100
    assert body["metadata"]["url"] == "/v1/videos/rd-task-content-only/content"


@respx.mock
def test_openai_compatible_status_keeps_polling_when_status_forbidden_and_content_not_ready(
    client, auth_headers, provider_base
):
    respx.get(f"{provider_base}/v1/videos/rd-task-pending").mock(
        return_value=Response(
            403,
            json={"error": {"code": "service_error", "message": "Service unavailable"}},
        ),
    )
    respx.get(f"{provider_base}/v1/videos/rd-task-pending/content").mock(
        return_value=Response(400, json={"error": {"code": "service_error"}}),
    )

    response = client.get("/v1/videos/rd-task-pending", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "rd-task-pending"
    assert body["status"] == "queued"
    assert body["progress"] == 0
    assert "error" not in body
