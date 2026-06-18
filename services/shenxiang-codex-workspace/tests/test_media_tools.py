import asyncio

import pytest

from app.config import Settings
from app.media_tools import MediaGenerationError, detect_media_kind, generate_image
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


@pytest.mark.parametrize(
    "query",
    [
        "你是短视频分镜脚本大师，不需要真的生成视频，只需要帮我指出哪些文字适合哪些空镜。",
        "请输出图像提示词和视频提示词，不要生成视频。",
        "帮我做 AI 故事板和分镜表，只需要提示词。",
        "给我可用于生成的 prompt，不要出图。",
    ],
)
def test_media_detection_keeps_storyboard_prompt_requests_text_only(query):
    request = WorkspaceRunRequest(
        user_query=query,
        skill_name="storyboard-creator",
        model_role="chat_main",
        model_config={"chat_main": "gpt-5.5", "video_generation": "seedance-2.0"},
    )

    assert detect_media_kind(request) is None


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("确认生成视频，按刚才的视频提示词开始生成。", "video"),
        ("现在生成图片，使用上面的图像提示词。", "image"),
    ],
)
def test_media_detection_requires_clear_generation_confirmation(query, expected):
    request = WorkspaceRunRequest(
        user_query=query,
        skill_name="storyboard-creator",
        model_role="chat_main",
        model_config={"chat_main": "gpt-5.5", "image_generation": "gpt-image-2-4K", "video_generation": "seedance-2.0"},
    )

    assert detect_media_kind(request) == expected


def test_explicit_media_model_role_still_routes_to_media_generation():
    request = WorkspaceRunRequest(
        user_query="生成一个 5 秒片头",
        skill_name="storyboard-creator",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0"},
    )

    assert detect_media_kind(request) == "video"
