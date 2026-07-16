import asyncio

import httpx
import pytest

from app.config import Settings
from app.media_catalog import public_models_for_mode
from app.media_tools import (
    IMAGE_MODEL_CAPABILITIES,
    MEDIA_ERROR_INPUT_UNSUPPORTED,
    MEDIA_ERROR_MODEL_UNAVAILABLE,
    MEDIA_ERROR_RESULT_UNAVAILABLE,
    MEDIA_ERROR_SERVICE_UNAVAILABLE,
    MEDIA_ERROR_SPEC_UNSUPPORTED,
    VIDEO_MODEL_CAPABILITIES,
    MediaGenerationError,
    MediaResult,
    build_mcp_image_payload,
    build_mcp_video_payload,
    detect_media_kind,
    generate_image,
    generate_video,
    fetch_limited_media,
    normalize_mcp_media_request,
    new_catalog_video_request,
    persist_remote_media,
    upstream_error,
)
from app.models import WorkspaceFile, WorkspaceRunRequest
from app.security import UserContext


class FakeImageEditResponse:
    status_code = 503
    text = '{"error":{"message":"temporary upstream failure"}}'

    def json(self):
        return {"error": {"message": "temporary upstream failure"}}


class FakeAsyncClient:
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.calls.append({"url": url, "kwargs": kwargs})
        return FakeImageEditResponse()


class FakeImageSuccessResponse:
    status_code = 200
    text = "{}"

    def json(self):
        return {"data": [{"url": "https://cdn.test/geek2api-image.png"}]}


class FakeImageSuccessAsyncClient:
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.calls.append({"url": url, "kwargs": kwargs})
        return FakeImageSuccessResponse()


class FakeVideoResponse:
    status_code = 200
    text = "{}"

    def __init__(self, body):
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


class FakeVideoAsyncClient:
    calls = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, **kwargs):
        self.calls.append({"method": "POST", "url": url, "kwargs": kwargs})
        return FakeVideoResponse({"task_id": "task_123", "status": "queued"})

    async def get(self, url, **kwargs):
        self.calls.append({"method": "GET", "url": url, "kwargs": kwargs})
        return FakeVideoResponse({"task_id": "task_123", "status": "succeeded", "video_url": "https://cdn.test/out.mp4"})


async def no_sleep(*_args, **_kwargs):
    return None


def test_new_video_payloads_match_public_contracts():
    sd_request = WorkspaceRunRequest(
        user_query="纸船穿过雨夜。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-sd2-fast-720p"},
        params={"duration": 15, "ratio": "9:16"},
    )
    assert build_mcp_video_payload(sd_request, "seedance-sd2-fast-720p") == {
        "model": "seedance-sd2-fast-720p",
        "prompt": "纸船穿过雨夜。",
        "duration": 15,
        "ratio": "9:16",
        "quality": "hd",
        "async": True,
    }

    grok_request = WorkspaceRunRequest(
        user_query="让人物缓慢转身。",
        model_role="video_generation",
        model_config={"video_generation": "grok-video-1.5"},
        params={"seconds": 10, "size": "720x1280"},
        files=[WorkspaceFile(path="reference.png", content="data:image/png;base64,iVBORw0KGgo=")],
    )
    payload, files = new_catalog_video_request(grok_request, "grok-video-1.5")
    assert payload == {
        "model": "grok-video-1.5",
        "prompt": "让人物缓慢转身。",
        "seconds": 10,
        "size": "720x1280",
    }
    assert len(files) == 1
    assert files[0][0] == "input_reference"


def test_grok15_video_requires_exactly_one_uploaded_image():
    request = WorkspaceRunRequest(
        user_query="让人物缓慢转身。",
        model_role="video_generation",
        model_config={"video_generation": "grok-video-1.5"},
        params={"seconds": 6, "size": "1280x720"},
    )
    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_INPUT_UNSUPPORTED):
        new_catalog_video_request(request, "grok-video-1.5")


def test_grok15_video_posts_multipart_without_provider_fields(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    monkeypatch.setattr("app.media_tools.asyncio.sleep", no_sleep)
    request = WorkspaceRunRequest(
        user_query="让人物缓慢转身。",
        model_role="video_generation",
        model_config={"video_generation": "grok-video-1.5"},
        params={"seconds": 6, "size": "1280x720"},
        files=[WorkspaceFile(path="reference.png", content="data:image/png;base64,iVBORw0KGgo=")],
    )

    result = asyncio.run(
        generate_video(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "grok-video-1.5",
        )
    )

    post = FakeVideoAsyncClient.calls[0]
    assert post["url"] == "https://api.example.test/v1/videos"
    assert "json" not in post["kwargs"]
    assert post["kwargs"]["data"] == {
        "model": "grok-video-1.5",
        "prompt": "让人物缓慢转身。",
        "seconds": "6",
        "size": "1280x720",
    }
    assert post["kwargs"]["files"][0][0] == "input_reference"
    assert result.urls == ["https://cdn.test/out.mp4"]


def test_prompt_design_request_in_text_mode_does_not_trigger_video_generation():
    request = WorkspaceRunRequest(
        user_query=(
            "你是世界top10的提示词设计大师。帮我设计一个指令，能根据提供的图片细致分析人物的提示词，"
            "并优化为专供 GPT Image2 的版本。要求包含镜头语言、微表情、CG 角色设计和视频分镜参考。"
        ),
        model_role="chat_main",
        model_config={"chat_main": "gpt-5.4-mini"},
        metadata={"mode": "codex"},
    )

    assert detect_media_kind(request) is None


def test_prompt_design_request_in_claude_mode_does_not_trigger_video_generation():
    request = WorkspaceRunRequest(
        user_query="请推演一套视频生成提示词，不要真的生成视频，只输出可复制的 prompt。",
        model_role="web_search",
        model_config={"web_search": "claude-opus-4-6-full"},
        metadata={"mode": "claude"},
    )

    assert detect_media_kind(request) is None


def test_video_mode_with_video_intent_still_triggers_video_generation():
    request = WorkspaceRunRequest(
        user_query="生成视频：一只发光的纸船穿过雨夜街道。",
        model_role="chat_main",
        model_config={"video_generation": "seedance-2.0"},
        metadata={"mode": "video"},
    )

    assert detect_media_kind(request) == "video"


def test_explicit_video_role_still_triggers_video_generation():
    request = WorkspaceRunRequest(
        user_query="一只发光的纸船穿过雨夜街道。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0"},
        metadata={"mode": "codex"},
    )

    assert detect_media_kind(request) == "video"


def test_image_mode_with_image_intent_still_triggers_image_generation():
    request = WorkspaceRunRequest(
        user_query="生成图片：一张黑白肖像海报。",
        model_role="chat_main",
        model_config={"image_generation": "gpt-image-2-4K"},
        metadata={"mode": "image"},
    )

    assert detect_media_kind(request) == "image"


def test_image_edit_does_not_fallback_to_grok_on_image2_failure(monkeypatch):
    FakeAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeAsyncClient)

    request = WorkspaceRunRequest(
        user_query="把背景改成白色",
        model_role="image_generation",
        model_config={"image_generation": "gpt-image-2-4K"},
        files=[
            WorkspaceFile(
                path="source.png",
                content="data:image/png;base64,iVBORw0KGgo=",
            )
        ],
    )

    with pytest.raises(MediaGenerationError):
        asyncio.run(
            generate_image(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "gpt-image-2-4K",
            )
        )

    assert len(FakeAsyncClient.calls) == 1
    assert FakeAsyncClient.calls[0]["kwargs"]["data"]["model"] == "gpt-image-2-4K"


def test_discount_image2_agent_generation_uses_public_model_alias_and_requested_size(monkeypatch):
    FakeImageSuccessAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeImageSuccessAsyncClient)

    request = WorkspaceRunRequest(
        user_query="生成图片：一个白底红色立方体。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "geek2api-image-2"},
        params={"n": 1, "size": "1024x1024", "quality": "low", "output_compression": 80},
    )

    result = asyncio.run(
        generate_image(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "geek2api-image-2",
        )
    )

    call = FakeImageSuccessAsyncClient.calls[0]
    payload = call["kwargs"]["json"]
    assert call["url"] == "https://api.example.test/v1/images/generations"
    assert payload["model"] == "特价 image-2"
    assert payload["size"] == "1024x1024"
    assert payload["quality"] == "low"
    assert payload["output_compression"] == 80
    assert result.urls == ["https://cdn.test/geek2api-image.png"]


def test_media_result_markdown_is_preview_first_and_hides_internal_model_name():
    result = MediaResult(
        media_type="image",
        model="geek2api-image-2",
        prompt="生成图片",
        urls=["https://supplier.example/image.png?signature=private"],
        local_urls=["https://api.example.test/codex/api/tasks/task-1/files/outputs/image.png"],
        raw_text='{"error":"should not be shown"}',
    )

    markdown = result.markdown()

    assert "图像生成完成" in markdown
    assert "![生成图片 1](https://api.example.test/codex/api/tasks/task-1/files/outputs/image.png)" in markdown
    assert "geek2api" not in markdown.lower()
    assert "supplier.example" not in markdown
    assert "signature=private" not in markdown
    assert "下载" not in markdown
    assert "raw_text" not in markdown


def test_media_result_markdown_never_falls_back_to_remote_urls():
    result = MediaResult(
        media_type="image",
        model="gpt-image-2-4K",
        prompt="生成图片",
        urls=["https://supplier.example/image.png?signature=private"],
    )

    markdown = result.markdown()

    assert "supplier.example" not in markdown
    assert "signature=private" not in markdown
    assert "![生成图片" not in markdown


def test_persist_remote_media_never_returns_remote_url_when_download_fails(monkeypatch, tmp_path):
    async def fail_fetch(*_args, **_kwargs):
        raise RuntimeError("remote download failed")

    monkeypatch.setattr("app.media_tools.fetch_limited_media", fail_fetch)
    result = MediaResult(
        media_type="image",
        model="gpt-image-2-4K",
        prompt="生成图片",
        urls=["https://supplier.example/image.png?signature=private"],
    )

    local_urls = asyncio.run(
        persist_remote_media(
            Settings(public_base_url="https://api.example.test/codex"),
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            {"task_id": "task-1"},
            tmp_path,
            result,
        )
    )

    assert local_urls == []


def test_persist_remote_media_stops_at_the_shared_preview_deadline(monkeypatch, tmp_path):
    calls: list[str] = []

    async def slow_fetch(_client, url, _media_type):
        calls.append(url)
        await asyncio.sleep(1.5)
        return b""

    monkeypatch.setattr("app.media_tools.fetch_limited_media", slow_fetch)
    result = MediaResult(
        media_type="image",
        model="gpt-image-2-4K",
        prompt="生成图片",
        urls=["https://cdn.example.test/one.png", "https://cdn.example.test/two.png"],
    )

    local_urls = asyncio.run(
        persist_remote_media(
            Settings(public_base_url="https://api.example.test/codex"),
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            {"task_id": "task-1"},
            tmp_path,
            result,
            timeout_seconds=1,
        )
    )

    assert local_urls == []
    assert calls == ["https://cdn.example.test/one.png"]


def test_media_download_does_not_follow_private_redirects(monkeypatch):
    visited: list[str] = []

    async def resolve_public_media_host(host: str, _port: int) -> tuple[str, ...]:
        assert host == "cdn.example.test"
        return ("8.8.8.8",)

    monkeypatch.setattr("app.media_tools.resolve_public_media_host", resolve_public_media_host, raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        visited.append(str(request.url))
        if request.headers["host"] == "cdn.example.test":
            return httpx.Response(302, headers={"location": "http://127.0.0.1/private"}, request=request)
        return httpx.Response(200, content=b"private", request=request)

    async def fetch() -> bytes:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True) as client:
            return await fetch_limited_media(client, "https://cdn.example.test/output.png", "image")

    assert asyncio.run(fetch()) == b""
    assert all("127.0.0.1" not in url for url in visited)


@pytest.mark.parametrize(
    "unsafe_address",
    (
        "127.0.0.1",
        "10.0.0.1",
        "169.254.10.10",
        "0.0.0.0",
        "224.0.0.1",
        "240.0.0.1",
        "::1",
        "fc00::1",
        "fe80::1",
        "ff00::1",
    ),
)
def test_media_download_rejects_non_public_dns_answers(monkeypatch, unsafe_address):
    visited: list[str] = []

    async def resolve_public_media_host(host: str, _port: int) -> tuple[str, ...]:
        assert host == "cdn.example.test"
        return (unsafe_address,)

    monkeypatch.setattr("app.media_tools.resolve_public_media_host", resolve_public_media_host, raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        visited.append(str(request.url))
        return httpx.Response(200, content=b"unexpected", request=request)

    async def fetch() -> bytes:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_limited_media(client, "https://cdn.example.test/output.png", "image")

    assert asyncio.run(fetch()) == b""
    assert visited == []


def test_media_download_rejects_mixed_public_and_private_dns_answers(monkeypatch):
    visited: list[str] = []

    async def resolve_public_media_host(_host: str, _port: int) -> tuple[str, ...]:
        return ("8.8.8.8", "127.0.0.1")

    monkeypatch.setattr("app.media_tools.resolve_public_media_host", resolve_public_media_host, raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        visited.append(str(request.url))
        return httpx.Response(200, content=b"unexpected", request=request)

    async def fetch() -> bytes:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_limited_media(client, "https://cdn.example.test/output.png", "image")

    assert asyncio.run(fetch()) == b""
    assert visited == []


def test_media_download_pins_validated_dns_address_and_preserves_origin(monkeypatch):
    observed: list[httpx.Request] = []

    async def resolve_public_media_host(host: str, port: int) -> tuple[str, ...]:
        assert (host, port) == ("cdn.example.test", 443)
        return ("8.8.8.8",)

    monkeypatch.setattr("app.media_tools.resolve_public_media_host", resolve_public_media_host, raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        observed.append(request)
        return httpx.Response(200, content=b"image", request=request)

    async def fetch() -> bytes:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_limited_media(client, "https://cdn.example.test/output.png", "image")

    assert asyncio.run(fetch()) == b"image"
    assert len(observed) == 1
    assert observed[0].url.host == "8.8.8.8"
    assert observed[0].headers["host"] == "cdn.example.test"
    assert observed[0].extensions["sni_hostname"] == "cdn.example.test"


def test_media_download_validates_every_redirect_destination(monkeypatch):
    visited: list[str] = []

    async def resolve_public_media_host(host: str, _port: int) -> tuple[str, ...]:
        if host == "cdn.example.test":
            return ("8.8.8.8",)
        if host == "redirect.example.test":
            return ("127.0.0.1",)
        raise AssertionError("unexpected redirect host")

    monkeypatch.setattr("app.media_tools.resolve_public_media_host", resolve_public_media_host, raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        visited.append(str(request.url))
        return httpx.Response(
            302,
            headers={"location": "https://redirect.example.test/private.png"},
            request=request,
        )

    async def fetch() -> bytes:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_limited_media(client, "https://cdn.example.test/output.png", "image")

    assert asyncio.run(fetch()) == b""
    assert visited == ["https://8.8.8.8/output.png"]


def test_image_generation_without_renderable_url_fails(monkeypatch):
    class EmptyImageResponse:
        status_code = 200
        text = '{"data":[{"revised_prompt":"ok"}]}'

        def json(self):
            return {"data": [{"revised_prompt": "ok"}]}

    class EmptyImageAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, **kwargs):
            return EmptyImageResponse()

    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", EmptyImageAsyncClient)
    request = WorkspaceRunRequest(
        user_query="生成图片：一个白底红色立方体。",
        model_role="image_generation",
        model_config={"image_generation": "geek2api-image-2"},
    )

    with pytest.raises(MediaGenerationError) as error:
        asyncio.run(
            generate_image(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "geek2api-image-2",
            )
        )
    assert str(error.value) == MEDIA_ERROR_RESULT_UNAVAILABLE


def test_seedance_dj_fast_uses_videos_endpoint_with_image_references(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    monkeypatch.setattr("app.media_tools.asyncio.sleep", no_sleep)

    request = WorkspaceRunRequest(
        user_query="生成视频：产品图做一个 15 秒广告短片。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-dj-fast"},
        params={"duration": 12, "size": "720x1280"},
        files=[
            WorkspaceFile(path="product.png", content="data:image/png;base64,iVBORw0KGgo="),
            WorkspaceFile(path="voice.mp3", content="data:audio/mpeg;base64,AAAA"),
        ],
    )

    result = asyncio.run(
        generate_video(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "seedance-2.0-dj-fast",
        )
    )

    post_call = FakeVideoAsyncClient.calls[0]
    payload = post_call["kwargs"]["json"]
    assert post_call["url"] == "https://api.example.test/v1/videos"
    assert payload["duration"] == 15
    assert payload["ratio"] == "9:16"
    assert payload["resolution"] == "720P"
    assert payload["references"] == [
        {
            "media_type": "image",
            "role": "first_frame",
            "url": "data:image/png;base64,iVBORw0KGgo=",
            "alias": "image1",
        }
    ]
    assert result.urls == ["https://cdn.test/out.mp4"]


def test_seedance_ld17_keeps_mixed_references(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    monkeypatch.setattr("app.media_tools.asyncio.sleep", no_sleep)

    request = WorkspaceRunRequest(
        user_query="生成视频：用 @image1 @video1 @audio1 做 8 秒混剪。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-ld-17"},
        params={"duration": 8, "ratio": "16:9"},
        files=[
            WorkspaceFile(path="hero.png", content="data:image/png;base64,iVBORw0KGgo="),
            WorkspaceFile(path="clip.mp4", content="data:video/mp4;base64,AAAA"),
            WorkspaceFile(path="voice.mp3", content="data:audio/mpeg;base64,BBBB"),
        ],
    )

    asyncio.run(
        generate_video(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "seedance-2.0-ld-17",
        )
    )

    payload = FakeVideoAsyncClient.calls[0]["kwargs"]["json"]
    assert payload["duration"] == 8
    assert payload["ratio"] == "16:9"
    assert "resolution" not in payload
    assert payload["references"] == [
        {
            "media_type": "image",
            "role": "first_frame",
            "url": "data:image/png;base64,iVBORw0KGgo=",
            "alias": "image1",
        },
        {
            "media_type": "video",
            "role": "reference_video",
            "url": "data:video/mp4;base64,AAAA",
            "alias": "video1",
        },
        {
            "media_type": "audio",
            "role": "reference_audio",
            "url": "data:audio/mpeg;base64,BBBB",
            "alias": "audio1",
        },
    ]


def test_moonapix_cl_mini_uses_videos_endpoint_with_public_references(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    monkeypatch.setattr("app.media_tools.asyncio.sleep", no_sleep)

    request = WorkspaceRunRequest(
        user_query="生成视频：保留 @image1 的角色，用 @video1 的镜头节奏。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-mini"},
        params={"duration": 2, "ratio": "9:16", "resolution": "480p"},
        files=[
            WorkspaceFile(path="hero.png", content="https://cdn.test/hero.png"),
            WorkspaceFile(path="clip.mp4", content="Asset://asset_video_xxx"),
        ],
    )

    result = asyncio.run(
        generate_video(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "seedance-2.0-cl-mini",
        )
    )

    post_call = FakeVideoAsyncClient.calls[0]
    payload = post_call["kwargs"]["json"]
    assert post_call["url"] == "https://api.example.test/v1/videos"
    assert payload["duration"] == 4
    assert payload["ratio"] == "9:16"
    assert payload["resolution"] == "480p"
    assert payload["image_url"] == "https://cdn.test/hero.png"
    assert payload["video_url"] == "Asset://asset_video_xxx"
    assert payload["references"] == [
        {
            "media_type": "image",
            "role": "first_frame",
            "url": "https://cdn.test/hero.png",
            "alias": "image1",
        },
        {
            "media_type": "video",
            "role": "reference_video",
            "url": "Asset://asset_video_xxx",
            "alias": "video1",
        },
    ]
    assert result.urls == ["https://cdn.test/out.mp4"]


def test_moonapix_non_mini_rejects_video_reference(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    monkeypatch.setattr("app.media_tools.asyncio.sleep", no_sleep)

    request = WorkspaceRunRequest(
        user_query="生成视频：用参考图做产品展示。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-fast"},
        params={"duration": 30, "resolution": "1080p"},
        files=[
            WorkspaceFile(path="hero.png", content="https://cdn.test/hero.png"),
            WorkspaceFile(path="clip.mp4", content="https://cdn.test/skip.mp4"),
        ],
    )

    with pytest.raises(MediaGenerationError) as error:
        asyncio.run(
            generate_video(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "seedance-2.0-cl-fast",
            )
        )
    assert str(error.value) == MEDIA_ERROR_INPUT_UNSUPPORTED

    assert FakeVideoAsyncClient.calls == []


def test_moonapix_cl_fast_accepts_public_image_reference(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    monkeypatch.setattr("app.media_tools.asyncio.sleep", no_sleep)

    request = WorkspaceRunRequest(
        user_query="生成视频：用参考图做产品展示。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-fast"},
        params={"duration": 30, "resolution": "1080p"},
        files=[
            WorkspaceFile(path="hero.png", content="https://cdn.test/hero.png"),
        ],
    )

    asyncio.run(
        generate_video(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "seedance-2.0-cl-fast",
        )
    )

    payload = FakeVideoAsyncClient.calls[0]["kwargs"]["json"]
    assert payload["duration"] == 15
    assert payload["resolution"] == "720p"
    assert payload["references"] == [
        {
            "media_type": "image",
            "role": "first_frame",
            "url": "https://cdn.test/hero.png",
            "alias": "image1",
        }
    ]
    assert "video_url" not in payload


def test_moonapix_rejects_local_data_url_reference(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)

    request = WorkspaceRunRequest(
        user_query="生成视频：用本地上传图做参考。",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-fast"},
        files=[
            WorkspaceFile(path="local.png", content="data:image/png;base64,iVBORw0KGgo="),
        ],
    )

    with pytest.raises(MediaGenerationError) as error:
        asyncio.run(
            generate_video(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "seedance-2.0-cl-fast",
            )
        )
    assert str(error.value) == MEDIA_ERROR_INPUT_UNSUPPORTED

    assert FakeVideoAsyncClient.calls == []


def test_all_public_media_models_have_mcp_capability_profiles():
    assert {item.model for item in public_models_for_mode("image")} <= set(IMAGE_MODEL_CAPABILITIES)
    assert {item.model for item in public_models_for_mode("video")} <= set(VIDEO_MODEL_CAPABILITIES)
    assert "grok-imagine-image" in {item.model for item in public_models_for_mode("image")}


@pytest.mark.parametrize("status_code", [403, 404])
def test_model_access_failures_have_a_safe_public_message(status_code):
    response = type("Response", (), {"status_code": status_code})()

    assert upstream_error(Settings(), "sk-test", response) == MEDIA_ERROR_MODEL_UNAVAILABLE


def test_mcp_gpt_image_payload_forwards_validated_vertical_2k_options():
    request = WorkspaceRunRequest(
        user_query="生成一张竖版海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "gpt-image-2-4K"},
        params={
            "aspect_ratio": "9:16",
            "resolution": "2K",
            "quality": "high",
            "output_format": "webp",
            "output_compression": 80,
            "background": "opaque",
        },
    )

    payload = build_mcp_image_payload(request, "gpt-image-2-4K")

    assert payload["size"] == "1152x2048"
    assert payload["resolution"] == "2K"
    assert payload["quality"] == "high"
    assert payload["output_format"] == "webp"
    assert payload["output_compression"] == 80
    assert payload["background"] == "opaque"


def test_mcp_grok_image_payload_uses_verified_ratio_and_resolution_without_extra_options():
    request = WorkspaceRunRequest(
        user_query="生成一张竖版人物海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "grok-imagine-image"},
        params={"aspect_ratio": "9:16", "resolution": "2K"},
    )

    payload = build_mcp_image_payload(request, "grok-imagine-image")

    assert payload == {
        "model": "grok-imagine-image",
        "prompt": "生成一张竖版人物海报。",
        "n": 1,
        "aspect_ratio": "9:16",
        "resolution": "2k",
    }


def test_mcp_grok_image_accepts_up_to_four_images():
    request = WorkspaceRunRequest(
        user_query="生成四张竖版人物海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "grok-imagine-image"},
        params={"aspect_ratio": "9:16", "resolution": "2K", "n": 4},
    )

    payload = build_mcp_image_payload(request, "grok-imagine-image")

    assert payload["n"] == 4


def test_mcp_grok_image_rejects_more_than_four_images():
    request = WorkspaceRunRequest(
        user_query="生成五张竖版人物海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "grok-imagine-image"},
        params={"n": 5},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_image_payload(request, "grok-imagine-image")


def test_grok_image_generation_forwards_only_verified_payload(monkeypatch):
    FakeImageSuccessAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeImageSuccessAsyncClient)
    request = WorkspaceRunRequest(
        user_query="生成一张竖版人物海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "grok-imagine-image"},
        params={"aspect_ratio": "9:16", "resolution": "2K"},
    )

    asyncio.run(
        generate_image(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "grok-imagine-image",
        )
    )

    assert FakeImageSuccessAsyncClient.calls[0]["kwargs"]["json"] == {
        "model": "grok-imagine-image",
        "prompt": "生成一张竖版人物海报。",
        "n": 1,
        "aspect_ratio": "9:16",
        "resolution": "2k",
    }


def test_mcp_grok_image_rejects_unverified_output_compression_before_network():
    request = WorkspaceRunRequest(
        user_query="生成一张人物海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "grok-imagine-image"},
        params={"output_compression": 80},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_image_payload(request, "grok-imagine-image")


def test_mcp_image_rejects_invalid_output_compression():
    request = WorkspaceRunRequest(
        user_query="生成一张海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "gpt-image-2-4K"},
        params={"output_compression": 101},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_image_payload(request, "gpt-image-2-4K")


def test_mcp_image_rejects_unverified_ecommerce_output_compression():
    request = WorkspaceRunRequest(
        user_query="生成一张商品主图。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "image 2电商商品图快速通道(1.5K)"},
        params={"output_compression": 80},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_image_payload(request, "image 2电商商品图快速通道(1.5K)")


def test_mcp_image_payload_forwards_nested_image_configuration():
    request = WorkspaceRunRequest(
        user_query="生成一张竖版商品图。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "banana-2"},
        params={"aspect_ratio": "9:16", "resolution": "2K"},
    )

    payload = build_mcp_image_payload(request, "banana-2")

    assert payload["aspect_ratio"] == "9:16"
    assert payload["resolution"] == "2K"
    assert payload["image_size"] == "2K"
    assert payload["responseFormat"]["image"] == {"aspectRatio": "9:16", "imageSize": "2K"}
    assert payload["generationConfig"]["imageConfig"] == {"aspectRatio": "9:16", "imageSize": "2K"}
    assert payload["extra_body"]["google"]["image_config"] == {"aspect_ratio": "9:16", "image_size": "2K"}


def test_mcp_image_rejects_unpublished_negative_prompt():
    request = WorkspaceRunRequest(
        user_query="生成一张竖版商品图。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "banana-2"},
        params={"negative_prompt": "不要文字"},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_image_payload(request, "banana-2")


@pytest.mark.parametrize("parameter", ["input_fidelity", "moderation", "style"])
def test_mcp_image_rejects_other_unpublished_parameters(parameter):
    request = WorkspaceRunRequest(
        user_query="生成一张商品图。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "gpt-image-2-4K"},
        params={parameter: "enabled"},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_image_payload(request, "gpt-image-2-4K")


def test_mcp_ecommerce_uses_only_verified_automatic_size_payload():
    request = WorkspaceRunRequest(
        user_query="生成一张商品主图。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "image 2电商商品图快速通道(1.5K)"},
    )

    normalized = normalize_mcp_media_request(
        request,
        "image",
        "image 2电商商品图快速通道(1.5K)",
    )
    payload = build_mcp_image_payload(normalized, "image 2电商商品图快速通道(1.5K)")

    assert payload == {
        "model": "image 2电商商品图快速通道(1.5K)",
        "prompt": "生成一张商品主图。",
        "n": 1,
        "size": "auto",
    }


def test_mcp_ecommerce_rejects_unverified_manual_image_specification():
    request = WorkspaceRunRequest(
        user_query="生成一张竖版商品主图。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "image 2电商商品图快速通道(1.5K)"},
        params={"aspect_ratio": "9:16"},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_image_payload(request, "image 2电商商品图快速通道(1.5K)")


def test_mcp_image_rejects_unsupported_specification_before_network(monkeypatch):
    FakeImageSuccessAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeImageSuccessAsyncClient)
    request = WorkspaceRunRequest(
        user_query="生成一张商品图。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "ecommerce-banana-2"},
        params={"aspect_ratio": "9:16", "resolution": "2K"},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        asyncio.run(
            generate_image(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "ecommerce-banana-2",
            )
        )

    assert FakeImageSuccessAsyncClient.calls == []


def test_mcp_video_forwards_validated_duration_ratio_and_resolution(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    monkeypatch.setattr("app.media_tools.asyncio.sleep", no_sleep)
    request = WorkspaceRunRequest(
        user_query="生成一段竖版短片。",
        task_type="agent_video",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-mini"},
        params={
            "duration_seconds": 8,
            "aspect_ratio": "9:16",
            "resolution": "480p",
            "watermark": True,
            "seed": 7,
        },
    )

    asyncio.run(
        generate_video(
            Settings(new_api_base_url="https://api.example.test/v1"),
            request,
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            "seedance-2.0-cl-mini",
        )
    )

    payload = FakeVideoAsyncClient.calls[0]["kwargs"]["json"]
    assert payload["duration"] == 8
    assert payload["ratio"] == "9:16"
    assert payload["resolution"] == "480p"
    assert payload["watermark"] is True
    assert payload["seed"] == 7


def test_mcp_video_accepts_zero_seed():
    request = WorkspaceRunRequest(
        user_query="生成一段竖版短片。",
        task_type="agent_video",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-mini"},
        params={"seed": 0},
    )

    payload = build_mcp_video_payload(request, "seedance-2.0-cl-mini")

    assert payload["seed"] == 0


def test_mcp_video_rejects_negative_seed():
    request = WorkspaceRunRequest(
        user_query="生成一段竖版短片。",
        task_type="agent_video",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-mini"},
        params={"seed": -1},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        build_mcp_video_payload(request, "seedance-2.0-cl-mini")


def test_mcp_video_rejects_unsupported_duration_before_network(monkeypatch):
    FakeVideoAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeVideoAsyncClient)
    request = WorkspaceRunRequest(
        user_query="生成一段短片。",
        task_type="agent_video",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-dj-fast"},
        params={"duration_seconds": 8, "aspect_ratio": "9:16", "resolution": "720P"},
    )

    with pytest.raises(MediaGenerationError, match=MEDIA_ERROR_SPEC_UNSUPPORTED):
        asyncio.run(
            generate_video(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "seedance-2.0-dj-fast",
            )
        )

    assert FakeVideoAsyncClient.calls == []


def test_media_errors_never_return_raw_transport_or_request_details(monkeypatch):
    class FailingResponse:
        status_code = 403
        text = '{"error":{"message":"HTTP 403 request_id=req-private authorization=Bearer secret-token"}}'

        def json(self):
            return {"error": {"message": "HTTP 403 request_id=req-private authorization=Bearer secret-token"}}

    class FailingClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, **kwargs):
            return FailingResponse()

    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FailingClient)
    request = WorkspaceRunRequest(
        user_query="生成一张图片。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "gpt-image-2-4K"},
        params={"aspect_ratio": "1:1", "resolution": "1K"},
    )

    with pytest.raises(MediaGenerationError) as error:
        asyncio.run(
            generate_image(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "gpt-image-2-4K",
            )
        )

    assert str(error.value) == MEDIA_ERROR_MODEL_UNAVAILABLE
    assert "403" not in str(error.value)
    assert "request" not in str(error.value)
    assert "secret" not in str(error.value)
