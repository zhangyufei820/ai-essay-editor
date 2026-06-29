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
