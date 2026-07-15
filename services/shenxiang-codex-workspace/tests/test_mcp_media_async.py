import asyncio

import httpx
import pytest

from app.config import Settings
from app.agent_mcp import mcp_tools
from app.mcp_media_async import McpMediaSubmissionUncertain, McpMediaTaskState, fetch_mcp_media_task, submit_mcp_media_task
from app.models import WorkspaceRunRequest
from app.security import UserContext


class FakeResponse:
    def __init__(self, body: dict, status_code: int = 200) -> None:
        self._body = body
        self.status_code = status_code
        self.text = str(body)

    def json(self) -> dict:
        return self._body


class FakeAsyncClient:
    calls: list[dict] = []
    post_body: dict = {"task_id": "remote_image_123", "status": "submitted"}
    get_body: dict = {}

    def __init__(self, *args, **kwargs) -> None:
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> bool:
        return False

    async def post(self, url: str, **kwargs):
        self.calls.append({"method": "POST", "url": url, "kwargs": kwargs})
        return FakeResponse(self.post_body)

    async def get(self, url: str, **kwargs):
        self.calls.append({"method": "GET", "url": url, "kwargs": kwargs})
        return FakeResponse(self.get_body)


def image_request() -> WorkspaceRunRequest:
    return WorkspaceRunRequest(
        user_query="生成一张竖版海报。",
        task_type="agent_image",
        model_role="image_generation",
        model_config={"image_generation": "gpt-image-2-4K"},
        params={"aspect_ratio": "9:16", "resolution": "2K", "n": 1},
    )


def video_request() -> WorkspaceRunRequest:
    return WorkspaceRunRequest(
        user_query="生成一段竖版短片。",
        task_type="agent_video",
        model_role="video_generation",
        model_config={"video_generation": "seedance-2.0-cl-mini"},
        params={"duration_seconds": 4, "aspect_ratio": "9:16", "resolution": "720p", "seed": 0},
    )


def test_mcp_image_submission_uses_short_native_task_endpoint(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.post_body = {"task_id": "remote_image_123", "status": "submitted"}
    monkeypatch.setattr("app.mcp_media_async.httpx.AsyncClient", FakeAsyncClient)

    submission = asyncio.run(
        submit_mcp_media_task(
            Settings(new_api_base_url="https://api.example.test/v1"),
            image_request(),
            UserContext(api_key="sk-image", user_id="u-1", key_hint="key"),
            "image",
        )
    )

    assert submission.remote_task_id == "remote_image_123"
    assert FakeAsyncClient.calls == [
        {
            "method": "POST",
            "url": "https://api.example.test/v1/images/generations?async=true",
            "kwargs": {
                "headers": {"Authorization": "Bearer sk-image", "Content-Type": "application/json"},
                "json": {
                    "model": "gpt-image-2-4K",
                    "prompt": "生成一张竖版海报。",
                    "n": 1,
                    "aspect_ratio": "9:16",
                    "resolution": "2K",
                    "size": "1152x2048",
                },
            },
        }
    ]


def test_mcp_submission_keeps_unknown_transport_outcomes_distinct(monkeypatch):
    class TransportFailureClient(FakeAsyncClient):
        async def post(self, url: str, **kwargs):
            raise httpx.ReadTimeout("response lost", request=httpx.Request("POST", url))

    monkeypatch.setattr("app.mcp_media_async.httpx.AsyncClient", TransportFailureClient)

    with pytest.raises(McpMediaSubmissionUncertain):
        asyncio.run(
            submit_mcp_media_task(
                Settings(new_api_base_url="https://api.example.test/v1"),
                image_request(),
                UserContext(api_key="sk-image", user_id="u-1", key_hint="key"),
                "image",
            )
        )


def test_mcp_video_submission_and_query_use_same_remote_task(monkeypatch):
    FakeAsyncClient.calls = []
    FakeAsyncClient.post_body = {"task_id": "remote_video_123", "status": "submitted"}
    FakeAsyncClient.get_body = {"task_id": "remote_video_123", "status": "success", "video_url": "https://cdn.example.test/result.mp4?private=1"}
    monkeypatch.setattr("app.mcp_media_async.httpx.AsyncClient", FakeAsyncClient)
    settings = Settings(new_api_base_url="https://api.example.test/v1")
    user = UserContext(api_key="sk-video", user_id="u-1", key_hint="key")

    submission = asyncio.run(submit_mcp_media_task(settings, video_request(), user, "video"))
    result = asyncio.run(fetch_mcp_media_task(settings, user, "video", submission.remote_task_id))

    assert submission.remote_task_id == "remote_video_123"
    assert result.state is McpMediaTaskState.COMPLETED
    assert result.media is not None
    assert result.media.urls == ["https://cdn.example.test/result.mp4?private=1"]
    assert FakeAsyncClient.calls == [
        {
            "method": "POST",
            "url": "https://api.example.test/v1/videos",
            "kwargs": {
                "headers": {"Authorization": "Bearer sk-video", "Content-Type": "application/json"},
                "json": {
                    "model": "seedance-2.0-cl-mini",
                    "prompt": "生成一段竖版短片。",
                    "duration": 4,
                    "ratio": "9:16",
                    "resolution": "720p",
                    "seed": 0,
                },
            },
        },
        {
            "method": "GET",
            "url": "https://api.example.test/v1/videos/remote_video_123",
            "kwargs": {"headers": {"Authorization": "Bearer sk-video", "Content-Type": "application/json"}},
        },
    ]


def test_media_tool_contract_forbids_duplicate_requests_and_speculation():
    tools = {item["name"]: item for item in mcp_tools()}
    description = tools["xingren_get_media_result"]["description"]

    assert "不能重新生成" in description
    assert "换模型" in description
    assert "自动重试" in description
    assert "参数不支持" in description
    assert "不得猜测" in description


@pytest.mark.parametrize(
    ("body", "state"),
    [
        ({"task_id": "remote_image_123", "status": "submitted"}, McpMediaTaskState.PENDING),
        ({"task_id": "remote_image_123", "status": "in_progress"}, McpMediaTaskState.PENDING),
        (
            {
                "task_id": "remote_image_123",
                "status": "success",
                "data": {"data": [{"url": "https://cdn.example.test/result.png?private=1"}]},
            },
            McpMediaTaskState.COMPLETED,
        ),
        ({"task_id": "remote_image_123", "status": "failure", "fail_reason": "hidden details"}, McpMediaTaskState.FAILED),
    ],
)
def test_mcp_image_task_query_classifies_state_without_exposing_remote_error(monkeypatch, body, state):
    FakeAsyncClient.calls = []
    FakeAsyncClient.get_body = body
    monkeypatch.setattr("app.mcp_media_async.httpx.AsyncClient", FakeAsyncClient)

    result = asyncio.run(
        fetch_mcp_media_task(
            Settings(new_api_base_url="https://api.example.test/v1"),
            UserContext(api_key="sk-image", user_id="u-1", key_hint="key"),
            "image",
            "remote_image_123",
        )
    )

    assert result.state is state
    assert FakeAsyncClient.calls[0]["url"] == "https://api.example.test/v1/images/tasks/remote_image_123"
    if state is McpMediaTaskState.COMPLETED:
        assert result.media is not None
        assert result.media.urls == ["https://cdn.example.test/result.png?private=1"]
    else:
        assert result.media is None
        assert "hidden details" not in result.message
