import asyncio

import pytest

from app.config import Settings
from app import media_tools
from app.media_tools import (
    MediaGenerationError,
    MediaResult,
    detect_media_kind,
    fetch_limited_media,
    generate_image,
    generate_video,
    persist_remote_media,
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


class FakeMediaStreamResponse:
    def __init__(self, status_code=200, *, headers=None, chunks=None):
        self.status_code = status_code
        self.headers = headers or {}
        self._chunks = list(chunks or [])

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def aiter_bytes(self):
        for chunk in self._chunks:
            yield chunk


class FakeMediaStreamClient:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def stream(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, "kwargs": kwargs})
        if not self.responses:
            raise AssertionError("unexpected media request")
        return self.responses.pop(0)


VALID_PNG = b"\x89PNG\r\n\x1a\n" + b"safe-image"
VALID_MP4 = b"\x00\x00\x00\x18ftypisom" + b"safe-video"


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


def test_geek2api_image2_generation_uses_requested_model_and_size(monkeypatch):
    FakeImageSuccessAsyncClient.calls = []
    monkeypatch.setattr("app.media_tools.httpx.AsyncClient", FakeImageSuccessAsyncClient)

    request = WorkspaceRunRequest(
        user_query="生成图片：一个白底红色立方体。",
        model_role="image_generation",
        model_config={"image_generation": "geek2api-image-2"},
        params={"n": 1, "size": "1024x1024", "quality": "low"},
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
    assert payload["model"] == "geek2api-image-2"
    assert payload["size"] == "1024x1024"
    assert payload["quality"] == "low"
    assert result.urls == ["https://cdn.test/geek2api-image.png"]


def test_media_result_markdown_is_preview_first_and_hides_internal_model_name():
    result = MediaResult(
        media_type="image",
        model="geek2api-image-2",
        prompt="生成图片",
        urls=["https://cdn.test/image.png"],
        raw_text='{"error":"should not be shown"}',
    )

    markdown = result.markdown()

    assert "图像生成完成" in markdown
    assert "![生成图片 1](https://cdn.test/image.png)" in markdown
    assert "geek2api" not in markdown.lower()
    assert "下载" not in markdown
    assert "raw_text" not in markdown


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

    with pytest.raises(MediaGenerationError, match="可展示结果"):
        asyncio.run(
            generate_image(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "geek2api-image-2",
            )
        )


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

    with pytest.raises(MediaGenerationError, match="只支持图片参考"):
        asyncio.run(
            generate_video(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "seedance-2.0-cl-fast",
            )
        )

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

    with pytest.raises(MediaGenerationError, match="公网 URL"):
        asyncio.run(
            generate_video(
                Settings(new_api_base_url="https://api.example.test/v1"),
                request,
                UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
                "seedance-2.0-cl-fast",
            )
        )

    assert FakeVideoAsyncClient.calls == []


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/private.png",
        "http://10.0.0.8/private.png",
        "http://169.254.169.254/latest/meta-data.png",
        "http://[::1]/private.png",
        "http://[fe80::1]/private.png",
    ],
)
def test_remote_media_fetch_rejects_literal_private_link_local_and_metadata_addresses(url):
    client = FakeMediaStreamClient(
        FakeMediaStreamResponse(
            headers={"content-type": "image/png"},
            chunks=[VALID_PNG],
        )
    )

    with pytest.raises(MediaGenerationError, match="公网|安全"):
        asyncio.run(fetch_limited_media(client, url, "image"))

    assert client.calls == []


def test_remote_media_fetch_rejects_mixed_public_and_private_dns(monkeypatch):
    async def mixed_dns(_host, _port):
        return ("93.184.216.34", "10.0.0.8")

    monkeypatch.setattr(media_tools, "_resolve_host_addresses", mixed_dns, raising=False)
    client = FakeMediaStreamClient(
        FakeMediaStreamResponse(headers={"content-type": "image/png"}, chunks=[VALID_PNG])
    )

    with pytest.raises(MediaGenerationError, match="公网|安全"):
        asyncio.run(fetch_limited_media(client, "https://mixed.test/image.png", "image"))

    assert client.calls == []


def test_remote_media_fetch_pins_validated_dns_and_preserves_host_and_sni(monkeypatch):
    resolutions = []

    async def rebinding_dns(host, port):
        resolutions.append((host, port))
        if len(resolutions) == 1:
            return ("93.184.216.34",)
        return ("127.0.0.1",)

    monkeypatch.setattr(media_tools, "_resolve_host_addresses", rebinding_dns, raising=False)
    client = FakeMediaStreamClient(
        FakeMediaStreamResponse(headers={"content-type": "image/png"}, chunks=[VALID_PNG])
    )

    content = asyncio.run(fetch_limited_media(client, "https://cdn.test/image.png", "image"))

    assert content == VALID_PNG
    assert resolutions == [("cdn.test", 443)]
    assert client.calls[0]["url"] == "https://93.184.216.34/image.png"
    assert client.calls[0]["kwargs"]["headers"]["Host"] == "cdn.test"
    assert client.calls[0]["kwargs"]["extensions"]["sni_hostname"] == "cdn.test"


def test_remote_media_fetch_revalidates_redirect_targets(monkeypatch):
    async def redirect_dns(host, _port):
        if host == "cdn.test":
            return ("93.184.216.34",)
        if host == "redirect.test":
            return ("169.254.169.254",)
        raise AssertionError(f"unexpected DNS lookup: {host}")

    monkeypatch.setattr(media_tools, "_resolve_host_addresses", redirect_dns, raising=False)
    client = FakeMediaStreamClient(
        FakeMediaStreamResponse(
            status_code=302,
            headers={"location": "http://redirect.test/latest/meta-data.png"},
        )
    )

    with pytest.raises(MediaGenerationError, match="公网|安全"):
        asyncio.run(fetch_limited_media(client, "https://cdn.test/image.png", "image"))

    assert len(client.calls) == 1
    assert client.calls[0]["url"] == "https://93.184.216.34/image.png"


def test_remote_media_fetch_revalidates_and_pins_each_safe_redirect(monkeypatch):
    async def redirect_dns(host, _port):
        return {
            "cdn.test": ("93.184.216.34",),
            "assets.test": ("1.1.1.1",),
        }[host]

    monkeypatch.setattr(media_tools, "_resolve_host_addresses", redirect_dns, raising=False)
    client = FakeMediaStreamClient(
        FakeMediaStreamResponse(status_code=302, headers={"location": "https://assets.test/final.png"}),
        FakeMediaStreamResponse(headers={"content-type": "image/png"}, chunks=[VALID_PNG]),
    )

    content = asyncio.run(fetch_limited_media(client, "https://cdn.test/image.png", "image"))

    assert content == VALID_PNG
    assert [call["url"] for call in client.calls] == [
        "https://93.184.216.34/image.png",
        "https://1.1.1.1/final.png",
    ]
    assert [call["kwargs"]["headers"]["Host"] for call in client.calls] == ["cdn.test", "assets.test"]
    assert [call["kwargs"]["extensions"]["sni_hostname"] for call in client.calls] == ["cdn.test", "assets.test"]


def test_remote_media_client_disables_environment_proxies_and_automatic_redirects(monkeypatch, tmp_path):
    constructor_kwargs = {}

    class RecordingAsyncClient:
        def __init__(self, **kwargs):
            constructor_kwargs.update(kwargs)

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def stream(self, *_args, **_kwargs):
            raise AssertionError("private URLs must be rejected before a request")

    monkeypatch.setattr(media_tools.httpx, "AsyncClient", RecordingAsyncClient)
    result = MediaResult(media_type="image", model="test", prompt="test", urls=["http://127.0.0.1/private.png"])

    urls = asyncio.run(
        persist_remote_media(
            Settings(public_base_url="https://api.example.test/codex"),
            UserContext(api_key="sk-test", user_id="1", key_hint="sk-****"),
            {"task_id": "task_test"},
            tmp_path,
            result,
        )
    )

    assert constructor_kwargs["trust_env"] is False
    assert constructor_kwargs["follow_redirects"] is False
    assert urls == []


@pytest.mark.parametrize(
    ("content_type", "content"),
    [
        ("text/html", b"<html>not media</html>"),
        ("image/png", b"not-a-png"),
        ("image/jpeg", VALID_PNG),
    ],
)
def test_remote_media_fetch_rejects_invalid_mime_or_magic(monkeypatch, content_type, content):
    async def public_dns(_host, _port):
        return ("93.184.216.34",)

    monkeypatch.setattr(media_tools, "_resolve_host_addresses", public_dns, raising=False)
    client = FakeMediaStreamClient(
        FakeMediaStreamResponse(headers={"content-type": content_type}, chunks=[content])
    )

    with pytest.raises(MediaGenerationError, match="媒体|格式|类型"):
        asyncio.run(fetch_limited_media(client, "https://cdn.test/image.png", "image"))


def test_remote_media_fetch_enforces_streamed_byte_limit(monkeypatch):
    async def public_dns(_host, _port):
        return ("93.184.216.34",)

    monkeypatch.setattr(media_tools, "_resolve_host_addresses", public_dns, raising=False)
    monkeypatch.setattr(media_tools, "MAX_REMOTE_IMAGE_BYTES", len(VALID_PNG))
    client = FakeMediaStreamClient(
        FakeMediaStreamResponse(
            headers={"content-type": "image/png"},
            chunks=[VALID_PNG, b"overflow"],
        )
    )

    with pytest.raises(MediaGenerationError, match="大小|上限"):
        asyncio.run(fetch_limited_media(client, "https://cdn.test/image.png", "image"))


def test_remote_video_fetch_requires_video_mime_and_magic(monkeypatch):
    async def public_dns(_host, _port):
        return ("93.184.216.34",)

    monkeypatch.setattr(media_tools, "_resolve_host_addresses", public_dns, raising=False)
    valid_client = FakeMediaStreamClient(
        FakeMediaStreamResponse(headers={"content-type": "video/mp4"}, chunks=[VALID_MP4])
    )
    invalid_client = FakeMediaStreamClient(
        FakeMediaStreamResponse(headers={"content-type": "video/mp4"}, chunks=[VALID_PNG])
    )

    assert asyncio.run(fetch_limited_media(valid_client, "https://cdn.test/video.mp4", "video")) == VALID_MP4
    with pytest.raises(MediaGenerationError, match="媒体|格式|类型"):
        asyncio.run(fetch_limited_media(invalid_client, "https://cdn.test/video.mp4", "video"))
