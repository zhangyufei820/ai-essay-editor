import base64
import asyncio
import hashlib
import json
from dataclasses import replace

import pytest
from fastapi import HTTPException

from app.agent_mcp import (
    AgentAuthorizationStore,
    _is_safe_redirect_uri,
    _pkce_valid,
    authorization_page,
    call_agent_tool,
    codex_connection_page,
    live_media_models,
    media_models_message,
    mcp_tools,
    resolved_media_model,
    safe_mcp_error,
)
from app.media_catalog import PUBLIC_MEDIA_MODELS, canonical_allowed_media_models
from app.config import Settings
from app import main
from app.main import is_allowed_browser_origin
from app.media_tools import MediaResult
from app.mcp_media_async import McpMediaSubmission, McpMediaSubmissionUncertain, McpMediaTaskResult, McpMediaTaskState
from app.models import WorkspaceRunRequest
from app.security import UserContext
from app.task_store import TaskStore


class FakeRedis:
    def __init__(self):
        self.data = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, ex, nx=False):
        if nx and key in self.data:
            return False
        self.data[key] = value.encode() if isinstance(value, str) else value
        return True

    def delete(self, key):
        self.data.pop(key, None)

    def eval(self, _script, _keys, key, value):
        if self.get(key) != value and self.get(key) != value.encode():
            return 0
        self.delete(key)
        return 1


class InMemoryMediaTaskStore:
    def __init__(self):
        self.records = {}
        self.secrets = {}

    def create(self, task):
        self.records[task["task_id"]] = json.loads(json.dumps(task))

    def get(self, task_id):
        return self.records.get(task_id)

    def update(self, task_id, **fields):
        task = self.records.get(task_id)
        if task is None:
            return None
        task.update(fields)
        return task

    def put_task_secret(self, task_id, value):
        self.secrets[task_id] = value

    def get_task_secret(self, task_id):
        return self.secrets.get(task_id, "")

    def delete_task_secret(self, task_id):
        self.secrets.pop(task_id, None)

    def delete(self, task_id):
        self.records.pop(task_id, None)

    def reserve_media_request(self, fingerprint, task_id, _ttl_seconds):
        key = f"active:{fingerprint}"
        existing = self.records.get(key)
        if existing:
            return existing["task_id"]
        self.records[key] = {"task_id": task_id}
        return task_id

    def release_media_request(self, fingerprint, task_id):
        key = f"active:{fingerprint}"
        existing = self.records.get(key)
        if not existing or existing.get("task_id") != task_id:
            return False
        self.records.pop(key, None)
        return True


def verifier_and_challenge():
    verifier = "a" * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def test_media_request_reservation_is_atomic_and_owner_scoped():
    store = TaskStore(FakeRedis(), Settings())

    assert store.reserve_media_request("fingerprint", "mcp_first", 60) == "mcp_first"
    assert store.reserve_media_request("fingerprint", "mcp_second", 60) == "mcp_first"
    assert store.release_media_request("fingerprint", "mcp_second") is False
    assert store.reserve_media_request("fingerprint", "mcp_second", 60) == "mcp_first"
    assert store.release_media_request("fingerprint", "mcp_first") is True
    assert store.reserve_media_request("fingerprint", "mcp_second", 60) == "mcp_second"


def test_only_safe_redirect_uris_are_accepted():
    assert _is_safe_redirect_uri("https://agent.example/callback")
    assert _is_safe_redirect_uri("http://127.0.0.1:4567/callback")
    assert not _is_safe_redirect_uri("http://agent.example/callback")
    assert not _is_safe_redirect_uri("javascript:alert(1)")


def test_authorization_code_requires_pkce_and_is_single_use():
    store = AgentAuthorizationStore(FakeRedis(), Settings())
    client = store.register_client({"client_name": "Test Agent", "redirect_uris": ["http://127.0.0.1:4567/callback"]})
    verifier, challenge = verifier_and_challenge()
    request_id = store.start_authorization({"response_type": "code", "client_id": client["client_id"], "redirect_uri": "http://127.0.0.1:4567/callback", "code_challenge": challenge, "code_challenge_method": "S256"})
    redirect = store.approve_authorization(request_id, UserContext(api_key="sk-never-return-this", user_id="user-1", key_hint="agent", api_keys={"codex": "sk-text", "image": "sk-image"}))
    code = redirect.headers["location"].split("code=")[1]
    tokens = store.exchange_code(code, verifier, client["client_id"], "http://127.0.0.1:4567/callback")
    assert tokens["access_token"] != "sk-text"
    assert tokens["refresh_token"] != "sk-image"
    assert store.access_user(tokens["access_token"]).api_keys == {"codex": "sk-text", "image": "sk-image"}
    with pytest.raises(HTTPException):
        store.exchange_code(code, verifier, client["client_id"], "http://127.0.0.1:4567/callback")


def test_pkce_and_public_tool_contract_are_strict():
    verifier, challenge = verifier_and_challenge()
    assert _pkce_valid(verifier, challenge)
    assert not _pkce_valid("wrong", challenge)
    assert [tool["name"] for tool in mcp_tools()] == [
        "xingren_connection_status",
        "xingren_list_media_models",
        "xingren_ask",
        "xingren_generate_image",
        "xingren_generate_video",
        "xingren_get_media_result",
    ]
    visible = json.dumps(safe_mcp_error("https://private.invalid/error"), ensure_ascii=False)
    assert "供应商" not in visible
    assert "private.invalid" not in visible
    image_tool = next(tool for tool in mcp_tools() if tool["name"] == "xingren_generate_image")
    video_tool = next(tool for tool in mcp_tools() if tool["name"] == "xingren_generate_video")
    assert {"aspect_ratio", "resolution", "quality", "output_format", "output_compression", "background"} <= set(image_tool["inputSchema"]["properties"])
    assert "negative_prompt" not in image_tool["inputSchema"]["properties"]
    assert "size" not in image_tool["inputSchema"]["properties"]
    assert {"duration_seconds", "aspect_ratio", "resolution", "size"} <= set(video_tool["inputSchema"]["properties"])
    assert image_tool["inputSchema"]["properties"]["n"]["maximum"] == 4
    assert video_tool["inputSchema"]["properties"]["seed"]["minimum"] == 0


def test_media_model_list_uses_website_names_and_prices_without_internal_names():
    assert [(item.name, item.price, item.mode) for item in PUBLIC_MEDIA_MODELS] == [
        ("GPT Image 2", "¥0.108/张", "image"),
        ("特价 image-2", "1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10/张", "image"),
        ("Grok Image Pro", "¥0.324/张", "image"),
        ("Banana 2", "¥0.162/张", "image"),
        ("Gemini 3 Pro Image", "¥0.238/张", "image"),
        ("image 2电商商品图快速通道(1.5K)", "¥0.055/张", "image"),
        ("电商特价banana-2", "¥0.085/张", "image"),
        ("Seedance 2.0 DJ Fast", "¥0.162/秒", "video"),
        ("Seedance 2.0 CL Mini", "输入含视频 ¥12.852/1M｜输出 ¥21.114/1M Token", "video"),
    ]
    message = media_models_message(
        (
            "gpt-image-2-4K",
            "geek2api-image-2",
            "grok-imagine-image",
            "banana-2",
            "gemini-3-pro-image-preview",
            "image 2电商商品图快速通道(1.5K)",
            "ecommerce-banana-2",
        ),
        ("seedance-2.0-dj-fast", "seedance-2.0-cl-mini"),
    )

    assert "GPT Image 2（¥0.108/张）" in message
    assert "特价 image-2（1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10/张）" in message
    assert "Grok Image Pro（¥0.324/张）" in message
    assert "Banana 2（¥0.162/张）" in message
    assert "Gemini 3 Pro Image（¥0.238/张）" in message
    assert "image 2电商商品图快速通道(1.5K)（¥0.055/张）；规格：自动；张数：1–4" in message
    assert "电商特价banana-2（¥0.085/张）" in message
    assert "Seedance 2.0 DJ Fast（¥0.162/秒）" in message
    assert "Seedance 2.0 CL Mini（输入含视频 ¥12.852/1M｜输出 ¥21.114/1M Token）" in message
    assert "张数：1–4" in message
    assert "质量：auto、low、medium、high" in message
    assert "输出压缩：0–100" in message
    assert "尺寸：1280x720、720x1280、1024x1024" in message
    assert "可选：随机种子、水印" in message
    assert "这里只显示已接通的模型" in message
    assert "geek2api" not in message
    assert "grok-imagine-image" not in message


def test_media_model_selection_accepts_only_public_website_names():
    assert resolved_media_model("特价 image-2", "image") == "geek2api-image-2"
    assert resolved_media_model("Grok Image Pro", "image") == "grok-imagine-image"
    assert resolved_media_model("Seedance 2.0 CL Mini", "video") == "seedance-2.0-cl-mini"
    assert resolved_media_model("geek2api-image-2", "image") is None
    assert resolved_media_model("grok-imagine-image", "image") is None


def test_public_media_permission_name_is_normalized_for_generation():
    assert canonical_allowed_media_models("image", ("特价 image-2",)) == ("geek2api-image-2",)


def test_async_media_submission_persists_only_safe_task_state(monkeypatch, tmp_path):
    captured = {}
    task_store = InMemoryMediaTaskStore()
    settings = replace(Settings(), runs_dir=tmp_path)
    authorization_store = AgentAuthorizationStore(FakeRedis(), settings)
    user = UserContext(
        api_key="sk-text",
        user_id="user-1",
        key_hint="agent",
        api_keys={"codex": "sk-text", "image": "secret-image-key"},
    )

    async def fake_live_media_models(_settings, api_key, mode):
        captured["probe"] = (api_key, mode)
        return ("geek2api-image-2",)

    async def fake_submit(_settings, request, media_user, media_type):
        captured["request"] = request
        captured["media_user"] = media_user
        captured["media_type"] = media_type
        return McpMediaSubmission("remote-image-123", McpMediaTaskState.PENDING)

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)
    monkeypatch.setattr("app.agent_mcp.submit_mcp_media_task", fake_submit)

    response = asyncio.run(
        call_agent_tool(
            settings,
            user,
            "xingren_generate_image",
            {"prompt": "生成一张竖版海报", "model": "特价 image-2", "aspect_ratio": "9:16", "resolution": "2K", "n": 2},
            authorization_store,
        )
    )

    task_id = response["content"][0]["text"].rsplit("：", 1)[1].strip()
    task = task_store.get(task_id)
    serialized = json.dumps(task, ensure_ascii=False)

    assert task_id.startswith("mcp_")
    assert captured["probe"] == ("secret-image-key", "image")
    assert captured["media_user"].api_key == "secret-image-key"
    assert captured["media_type"] == "image"
    assert captured["request"].model_roles.image_generation == "geek2api-image-2"
    assert captured["request"].params["size"] == "1152x2048"
    assert set(task) == {"task_id", "user_id", "task_type", "media_type", "status", "remote_task_id", "credential_ref", "active_request_fingerprint", "created_at", "updated_at", "expires_at"}
    assert task["status"] == "running"
    assert task["remote_task_id"] == "remote-image-123"
    assert len(task["active_request_fingerprint"]) == 64
    assert "secret-image-key" not in serialized
    assert "sk-text" not in serialized
    assert "https://" not in serialized
    assert "media_request" not in serialized


def test_pending_media_poll_reuses_the_same_remote_task_without_resubmission(monkeypatch, tmp_path):
    task_store = InMemoryMediaTaskStore()
    settings = replace(Settings(), runs_dir=tmp_path)
    authorization_store = AgentAuthorizationStore(FakeRedis(), settings)
    user = UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "secret-image-key"})
    submissions = []
    fetches = []

    async def fake_live_media_models(_settings, _api_key, _mode):
        return ("gpt-image-2-4K",)

    async def fake_submit(_settings, _request, _media_user, _media_type):
        submissions.append(True)
        return McpMediaSubmission("remote-image-123", McpMediaTaskState.PENDING)

    async def fake_fetch(_settings, media_user, media_type, remote_task_id):
        fetches.append((media_user.api_key, media_type, remote_task_id))
        return McpMediaTaskResult(McpMediaTaskState.PENDING)

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)
    monkeypatch.setattr("app.agent_mcp.submit_mcp_media_task", fake_submit)
    monkeypatch.setattr("app.agent_mcp.fetch_mcp_media_task", fake_fetch)

    started = asyncio.run(call_agent_tool(settings, user, "xingren_generate_image", {"prompt": "生成一张海报"}, authorization_store))
    task_id = started["content"][0]["text"].rsplit("：", 1)[1].strip()
    duplicate = asyncio.run(call_agent_tool(settings, user, "xingren_generate_image", {"prompt": "生成一张海报"}, authorization_store))
    response = asyncio.run(call_agent_tool(settings, user, "xingren_get_media_result", {"task_id": task_id}, authorization_store))

    assert len(submissions) == 1
    assert duplicate["content"][0]["text"].endswith(task_id)
    assert fetches == [("secret-image-key", "image", "remote-image-123")]
    assert "同一个任务编号" in response["content"][0]["text"]
    assert "重新提交" not in response["content"][0]["text"]


def test_uncertain_media_submission_keeps_the_same_task_for_confirmation(monkeypatch, tmp_path):
    task_store = InMemoryMediaTaskStore()
    settings = replace(Settings(), runs_dir=tmp_path)
    authorization_store = AgentAuthorizationStore(FakeRedis(), settings)
    user = UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "secret-image-key"})

    async def fake_live_media_models(_settings, _api_key, _mode):
        return ("gpt-image-2-4K",)

    async def uncertain_submit(*_args, **_kwargs):
        raise McpMediaSubmissionUncertain("hidden upstream condition")

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)
    monkeypatch.setattr("app.agent_mcp.submit_mcp_media_task", uncertain_submit)

    response = asyncio.run(call_agent_tool(settings, user, "xingren_generate_image", {"prompt": "生成一张海报"}, authorization_store))
    text = response["content"][0]["text"]
    task_id = text.rsplit("：", 1)[1].strip()
    task = task_store.get(task_id)

    assert response.get("isError") is not True
    assert task["status"] == "submitting"
    assert "不要重新提交" in text
    assert "hidden upstream condition" not in text
    assert task_store.get_task_secret(task_id) == "secret-image-key"


def test_immediate_media_result_without_safe_preview_is_not_left_polling(monkeypatch, tmp_path):
    task_store = InMemoryMediaTaskStore()
    settings = replace(Settings(), runs_dir=tmp_path)
    authorization_store = AgentAuthorizationStore(FakeRedis(), settings)
    user = UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "secret-image-key"})

    async def fake_live_media_models(_settings, _api_key, _mode):
        return ("gpt-image-2-4K",)

    async def fake_submit(*_args, **_kwargs):
        return McpMediaSubmission(
            "",
            McpMediaTaskState.COMPLETED,
            MediaResult(
                media_type="image",
                model="ignored",
                prompt="ignored",
                urls=["https://supplier.example/result.png?private-token"],
            ),
        )

    async def fake_persist(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)
    monkeypatch.setattr("app.agent_mcp.submit_mcp_media_task", fake_submit)
    monkeypatch.setattr("app.agent_mcp.persist_remote_media", fake_persist)

    response = asyncio.run(call_agent_tool(settings, user, "xingren_generate_image", {"prompt": "生成一张海报"}, authorization_store))
    task_id = next(key for key in task_store.records if key.startswith("mcp_"))
    serialized = json.dumps({"task": task_store.get(task_id), "response": response}, ensure_ascii=False)

    assert response["isError"] is True
    assert task_store.get(task_id)["status"] == "unconfirmed"
    assert task_store.get_task_secret(task_id) == ""
    assert "supplier.example" not in serialized
    assert "private-token" not in serialized


def test_expired_unconfirmed_media_task_never_suggests_resubmission(monkeypatch, tmp_path):
    task_id = "mcp_" + "c" * 32
    task_store = InMemoryMediaTaskStore()
    task_store.create(
        {
            "task_id": task_id,
            "user_id": "user-1",
            "task_type": "mcp_media",
            "media_type": "image",
            "status": "submitting",
            "credential_ref": "task-secret",
            "created_at": "2026-07-15T00:00:00+00:00",
            "updated_at": "2026-07-15T00:00:00+00:00",
            "expires_at": "2000-07-15T00:00:00+00:00",
        }
    )
    task_store.put_task_secret(task_id, "secret-image-key")
    settings = replace(Settings(), runs_dir=tmp_path)
    authorization_store = AgentAuthorizationStore(FakeRedis(), settings)

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    response = asyncio.run(
        call_agent_tool(
            settings,
            UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "secret-image-key"}),
            "xingren_get_media_result",
            {"task_id": task_id},
            authorization_store,
        )
    )
    text = response["content"][0]["text"]

    assert task_store.get(task_id)["status"] == "unconfirmed"
    assert "请勿重新提交" in text
    assert "请重新提交" not in text
    assert task_store.get_task_secret(task_id) == ""


def test_media_stream_uses_public_model_name_and_never_emits_internal_model(monkeypatch, tmp_path):
    class FakeStore:
        def create(self, _task):
            pass

        def update(self, *_args, **_kwargs):
            pass

    async def fake_generate_media(_settings, _request, _user, _task, _media_kind):
        return MediaResult(
            media_type="image",
            model="geek2api-image-2",
            prompt="生成一张海报",
            urls=["https://cdn.test/image.png"],
            local_urls=["https://cdn.test/image.png"],
        )

    real_sleep = asyncio.sleep

    async def no_sleep(_seconds):
        await real_sleep(0)

    monkeypatch.setattr(main, "task_store", lambda: FakeStore())
    monkeypatch.setattr(main, "generate_media", fake_generate_media)
    monkeypatch.setattr(main.asyncio, "sleep", no_sleep)
    request = WorkspaceRunRequest(
        user_query="生成一张海报",
        model_role="image_generation",
        model_config={"image_generation": "geek2api-image-2"},
    )
    user = UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "sk-image"})

    async def collect_events():
        return [event async for event in main.stream_media_generation(request, user, {"task_id": "media-test", "workspace": str(tmp_path)}, "image")]

    events = asyncio.run(collect_events())
    serialized = json.dumps(events, ensure_ascii=False)

    assert "geek2api" not in serialized
    assert events[1]["message"] == "正在连接图像生成服务"
    assert events[-1]["media"]["model"] == "特价 image-2"


def test_media_stream_fails_closed_when_preview_cannot_be_persisted(monkeypatch, tmp_path):
    class FakeStore:
        def create(self, _task):
            pass

        def update(self, *_args, **_kwargs):
            pass

    async def fake_generate_media(_settings, _request, _user, _task, _media_kind):
        return MediaResult(
            media_type="image",
            model="geek2api-image-2",
            prompt="生成一张海报",
            urls=["https://supplier.example/image.png?signature=private"],
        )

    real_sleep = asyncio.sleep

    async def no_sleep(_seconds):
        await real_sleep(0)

    monkeypatch.setattr(main, "task_store", lambda: FakeStore())
    monkeypatch.setattr(main, "generate_media", fake_generate_media)
    monkeypatch.setattr(main.asyncio, "sleep", no_sleep)
    request = WorkspaceRunRequest(
        user_query="生成一张海报",
        model_role="image_generation",
        model_config={"image_generation": "geek2api-image-2"},
    )
    user = UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "sk-image"})

    async def collect_events():
        return [event async for event in main.stream_media_generation(request, user, {"task_id": "media-test", "workspace": str(tmp_path)}, "image")]

    events = asyncio.run(collect_events())
    serialized = json.dumps(events, ensure_ascii=False)

    assert events[-1]["type"] == "error"
    assert events[-1]["message"] == "生成结果暂时无法展示，请稍后重试。"
    assert not any(event["type"] == "complete" for event in events)
    assert "supplier.example" not in serialized
    assert "signature=private" not in serialized
    assert "geek2api" not in serialized


def test_media_task_query_rejects_a_different_user_without_fetching(monkeypatch, tmp_path):
    task_id = "mcp_" + "a" * 32
    task_store = InMemoryMediaTaskStore()
    task_store.create(
        {
            "task_id": task_id,
            "user_id": "user-1",
            "task_type": "mcp_media",
            "media_type": "image",
            "status": "running",
            "remote_task_id": "remote-image-123",
            "credential_ref": "task-secret",
            "created_at": "2026-07-15T00:00:00+00:00",
            "updated_at": "2026-07-15T00:00:00+00:00",
            "expires_at": "2099-07-15T00:00:00+00:00",
        }
    )
    authorization_store = AgentAuthorizationStore(FakeRedis(), replace(Settings(), runs_dir=tmp_path))

    async def fail_if_called(*_args, **_kwargs):
        raise AssertionError("other users must never query a media task")

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    monkeypatch.setattr("app.agent_mcp.fetch_mcp_media_task", fail_if_called)

    response = asyncio.run(
        call_agent_tool(
            replace(Settings(), runs_dir=tmp_path),
            UserContext(api_key="sk-other", user_id="user-2", key_hint="other", api_keys={"image": "other-image-key"}),
            "xingren_get_media_result",
            {"task_id": task_id},
            authorization_store,
        )
    )

    assert response["isError"] is True
    assert "找不到这次生成任务" in response["content"][0]["text"]
    assert "remote-image-123" not in json.dumps(response, ensure_ascii=False)


def test_live_media_models_queries_the_dedicated_key_and_filters_to_public_catalog(monkeypatch):
    calls = []

    class Response:
        status_code = 200

        def json(self):
            return {"data": [{"id": "gpt-image-2-4K"}, {"id": "not-a-public-media-model"}]}

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, **kwargs):
            calls.append((url, kwargs))
            return Response()

    monkeypatch.setattr("app.agent_mcp.httpx.AsyncClient", Client)

    models = asyncio.run(live_media_models(Settings(new_api_base_url="https://api.example.test/v1"), "sk-image", "image"))

    assert models == ("gpt-image-2-4K",)
    assert calls == [
        (
            "https://api.example.test/v1/models",
            {"headers": {"Authorization": "Bearer sk-image", "Content-Type": "application/json"}},
        )
    ]


def test_media_list_uses_the_live_directory_instead_of_saved_model_permissions(monkeypatch):
    async def fake_live_media_models(_settings, api_key, mode):
        assert api_key == ("sk-image" if mode == "image" else "sk-video")
        return ("gpt-image-2-4K",) if mode == "image" else ()

    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)
    response = asyncio.run(
        call_agent_tool(
            Settings(),
            UserContext(
                api_key="sk-text",
                user_id="user-1",
                key_hint="agent",
                api_keys={"codex": "sk-text", "image": "sk-image", "video": "sk-video"},
                allowed_models_by_mode={"image": ("特价 image-2",), "video": ("Seedance 2.0 DJ Fast",)},
            ),
            "xingren_list_media_models",
            {},
            object(),
        )
    )

    text = response["content"][0]["text"]
    assert "GPT Image 2" in text
    assert "特价 image-2" not in text
    assert "可用视频模型：\n暂无" in text


def test_completed_media_poll_persists_and_returns_all_local_image_artifacts(monkeypatch, tmp_path):
    task_id = "mcp_" + "b" * 32
    task_store = InMemoryMediaTaskStore()
    settings = replace(Settings(public_base_url="https://api.example.test/codex"), runs_dir=tmp_path)
    authorization_store = AgentAuthorizationStore(FakeRedis(), settings)
    user = UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "secret-image-key"})
    task_store.create(
        {
            "task_id": task_id,
            "user_id": user.user_id,
            "task_type": "mcp_media",
            "media_type": "image",
            "status": "running",
            "remote_task_id": "remote-image-123",
            "credential_ref": "task-secret",
            "created_at": "2026-07-15T00:00:00+00:00",
            "updated_at": "2026-07-15T00:00:00+00:00",
            "expires_at": "2099-07-15T00:00:00+00:00",
        }
    )
    task_store.put_task_secret(task_id, "secret-image-key")
    fetches = []

    async def fake_fetch(_settings, media_user, media_type, remote_task_id):
        fetches.append((media_user.api_key, media_type, remote_task_id))
        return McpMediaTaskResult(
            McpMediaTaskState.COMPLETED,
            MediaResult(
                media_type="image",
                model="ignored",
                prompt="ignored",
                urls=["https://supplier.example/first.png?token=private", "https://supplier.example/second.png?token=private"],
            ),
        )

    preview_waits = []

    async def fake_persist(_settings, _media_user, _task, output_dir, _media, *, timeout_seconds=None):
        preview_waits.append(timeout_seconds)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "image-1.png").write_bytes(b"\x89PNG\r\n\x1a\nfirst")
        (output_dir / "image-2.png").write_bytes(b"\x89PNG\r\n\x1a\nsecond")
        return []

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    monkeypatch.setattr("app.agent_mcp.fetch_mcp_media_task", fake_fetch)
    monkeypatch.setattr("app.agent_mcp.persist_remote_media", fake_persist)

    response = asyncio.run(call_agent_tool(settings, user, "xingren_get_media_result", {"task_id": task_id}, authorization_store))
    resource_links = [item for item in response["content"] if item["type"] == "resource_link"]
    serialized = json.dumps({"task": task_store.get(task_id), "response": response}, ensure_ascii=False)

    assert fetches == [("secret-image-key", "image", "remote-image-123")]
    assert len(resource_links) == 2
    assert all(item["uri"].startswith("https://api.example.test/codex/agent/artifacts/") for item in resource_links)
    assert task_store.get(task_id)["status"] == "completed"
    assert task_store.get(task_id)["media_file_names"] == ["image-1.png", "image-2.png"]
    assert "supplier.example" not in serialized
    assert "token=private" not in serialized
    assert "secret-image-key" not in serialized
    assert preview_waits == [60]

    second_response = asyncio.run(call_agent_tool(settings, user, "xingren_get_media_result", {"task_id": task_id}, authorization_store))

    assert len([item for item in second_response["content"] if item["type"] == "resource_link"]) == 2
    assert len(fetches) == 1


@pytest.mark.parametrize("result_kind", ["failed", "invalid_output"])
def test_media_poll_failure_paths_are_generic_and_do_not_leak_sensitive_values(monkeypatch, tmp_path, result_kind):
    task_id = "mcp_" + "c" * 31 + ("1" if result_kind == "failed" else "2")
    task_store = InMemoryMediaTaskStore()
    settings = replace(Settings(), runs_dir=tmp_path)
    authorization_store = AgentAuthorizationStore(FakeRedis(), settings)
    user = UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "secret-image-key"})
    task_store.create(
        {
            "task_id": task_id,
            "user_id": user.user_id,
            "task_type": "mcp_media",
            "media_type": "image",
            "status": "running",
            "remote_task_id": "remote-image-123",
            "credential_ref": "task-secret",
            "created_at": "2026-07-15T00:00:00+00:00",
            "updated_at": "2026-07-15T00:00:00+00:00",
            "expires_at": "2099-07-15T00:00:00+00:00",
        }
    )
    task_store.put_task_secret(task_id, "secret-image-key")

    async def fake_fetch(*_args, **_kwargs):
        if result_kind == "failed":
            return McpMediaTaskResult(McpMediaTaskState.FAILED, message="supplier.example private-token")
        return McpMediaTaskResult(
            McpMediaTaskState.COMPLETED,
            MediaResult(media_type="image", model="ignored", prompt="ignored", urls=["https://supplier.example/result.png?private-token"]),
        )

    preview_waits = []

    async def fake_persist(_settings, _media_user, _task, output_dir, _media, *, timeout_seconds=None):
        preview_waits.append(timeout_seconds)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "not-an-image.txt").write_bytes(b"private-token")
        return []

    monkeypatch.setattr("app.agent_mcp.media_task_store", lambda _store: task_store)
    monkeypatch.setattr("app.agent_mcp.fetch_mcp_media_task", fake_fetch)
    monkeypatch.setattr("app.agent_mcp.persist_remote_media", fake_persist)

    response = asyncio.run(call_agent_tool(settings, user, "xingren_get_media_result", {"task_id": task_id}, authorization_store))
    serialized = json.dumps({"task": task_store.get(task_id), "response": response}, ensure_ascii=False)

    if result_kind == "failed":
        assert response["isError"] is True
        assert task_store.get(task_id)["status"] == "failed"
    else:
        assert response.get("isError") is not True
        assert task_store.get(task_id)["status"] == "preparing"
    assert "supplier.example" not in serialized
    assert "private-token" not in serialized
    assert "secret-image-key" not in serialized
    if result_kind == "invalid_output":
        assert preview_waits == [60]


def test_authorization_page_escapes_client_values():
    page = authorization_page("request-1", "<Agent>", "https://agent.example/callback").body.decode()
    assert "&lt;Agent&gt;" in page
    assert "<Agent>" not in page
    assert "agent.example" in page


def test_video_artifacts_use_an_opaque_expiring_reference(tmp_path):
    settings = replace(Settings(), runs_dir=tmp_path)
    store = AgentAuthorizationStore(FakeRedis(), settings)
    user = UserContext(api_key="sk-test", user_id="user-1", key_hint="agent")
    artifact = tmp_path / "mcp" / "user-1" / "task-1" / "outputs" / "video.mp4"
    artifact.parent.mkdir(parents=True)
    artifact.write_bytes(b"video")

    token = store.issue_artifact(user, artifact)

    assert store.artifact_path(token) == artifact
    assert store.artifact_path("invalid") is None


def test_image_artifact_response_uses_its_actual_media_type(monkeypatch, tmp_path):
    image = tmp_path / "generated.png"
    image.write_bytes(b"png")

    class FakeStore:
        def artifact_path(self, token):
            return image if token == "artifact-token" else None

    monkeypatch.setattr(main, "agent_authorization_store", lambda: FakeStore())

    response = asyncio.run(main.agent_artifact("artifact-token"))

    assert response.media_type == "image/png"
    assert response.headers["content-disposition"] == 'inline; filename="generated.png"'


def test_codex_connection_code_is_rotated_and_revocable():
    store = AgentAuthorizationStore(FakeRedis(), Settings())
    user = UserContext(api_key="sk-test", user_id="user-1", key_hint="agent", api_keys={"codex": "sk-text", "image": "sk-image"})

    first_code = store.issue_codex_connection_code(user)
    assert first_code.startswith("xrc_")
    assert store.access_user(first_code).api_keys == {"codex": "sk-text", "image": "sk-image"}

    second_code = store.issue_codex_connection_code(user)
    assert store.access_user(first_code) is None
    assert store.access_user(second_code).user_id == "user-1"

    store.revoke_codex_connection_code(user)
    assert store.access_user(second_code) is None


def test_codex_connection_code_does_not_promote_the_text_key_to_media_access():
    store = AgentAuthorizationStore(FakeRedis(), Settings())
    user = UserContext(
        api_key="sk-text",
        user_id="user-1",
        key_hint="agent",
        api_keys={"codex": "sk-text", "image": "sk-text", "video": "sk-text"},
    )

    code = store.issue_codex_connection_code(user)

    assert store.access_user(code).api_keys == {"codex": "sk-text"}


def test_codex_connection_page_uses_the_public_connection_code_endpoint():
    page = codex_connection_page().body.decode()

    assert 'fetch("/codex/agent/codex/connection-code"' in page
    assert "fetch('./connection-code'" not in page
    assert "打开 Codex 的设置" in page
    assert "https://api.aiphui.top/codex/mcp" in page
    assert "Authorization" in page
    assert "不要填写 Bearer 令牌环境变量" in page
    assert "复制填写值" in page
    assert "已经显示的那一行标头" in page
    assert "不要点击“添加标头”" in page
    assert "Bearer ${data.connection_code}" in page
    assert "插件 → MCP → 添加服务器 → 连接至自定义 MCP" in page
    assert "xingren-media" in page
    assert "radial-gradient" in page


def test_connection_code_allows_only_the_public_site_origin():
    settings = Settings(public_base_url="https://api.aiphui.top/codex")

    assert is_allowed_browser_origin("https://api.aiphui.top", settings)
    assert is_allowed_browser_origin("https://api.aiphui.top/codex", settings)
    assert not is_allowed_browser_origin("https://other.example", settings)
