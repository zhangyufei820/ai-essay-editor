import base64
import asyncio
import hashlib
import json
from dataclasses import replace

import pytest
from fastapi import HTTPException

from app.agent_mcp import AgentAuthorizationStore, _generate_image, _generate_video, _is_safe_redirect_uri, _pkce_valid, authorization_page, call_agent_tool, codex_connection_page, live_media_models, media_models_message, mcp_tools, resolved_media_model, safe_mcp_error
from app.media_catalog import canonical_allowed_media_models
from app.config import Settings
from app import main
from app.main import is_allowed_browser_origin
from app.media_tools import MediaResult
from app.models import WorkspaceRunRequest
from app.security import UserContext


class FakeRedis:
    def __init__(self):
        self.data = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, ex):
        self.data[key] = value.encode() if isinstance(value, str) else value

    def delete(self, key):
        self.data.pop(key, None)


def verifier_and_challenge():
    verifier = "a" * 64
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


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


def test_media_model_list_uses_website_names_and_prices_without_internal_names():
    message = media_models_message(
        ("gpt-image-2-4K", "geek2api-image-2", "banana-2"),
        ("seedance-2.0-dj-fast", "seedance-2.0-cl-mini"),
    )

    assert "GPT Image 2（¥0.108/张）" in message
    assert "特价 image-2（1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10/张）" in message
    assert "Seedance 2.0 DJ Fast（¥0.162/秒）" in message
    assert "张数：1–4" in message
    assert "质量：auto、low、medium、high" in message
    assert "输出压缩：0–100" in message
    assert "尺寸：1280x720、720x1280、1024x1024" in message
    assert "可选：随机种子、水印" in message
    assert "这里只显示已接通的模型" in message
    assert "geek2api" not in message


def test_media_model_selection_accepts_only_public_website_names():
    assert resolved_media_model("特价 image-2", "image") == "geek2api-image-2"
    assert resolved_media_model("Seedance 2.0 CL Mini", "video") == "seedance-2.0-cl-mini"
    assert resolved_media_model("geek2api-image-2", "image") is None


def test_public_media_permission_name_is_normalized_for_generation():
    assert canonical_allowed_media_models("image", ("特价 image-2",)) == ("geek2api-image-2",)


def test_public_model_permission_generates_with_its_canonical_model_and_size(monkeypatch, tmp_path):
    captured = {}

    async def fake_generate_media(_settings, request, _user, task, _media_type):
        captured["request"] = request
        output = tmp_path / "mcp" / "user-1" / task["task_id"] / "outputs"
        output.mkdir(parents=True)
        (output / "image.png").write_bytes(b"png")

    class FakeStore:
        def issue_artifact(self, _user, _path):
            return "artifact-token"

    async def fake_live_media_models(_settings, api_key, mode):
        captured["probe"] = (api_key, mode)
        return ("geek2api-image-2",)

    monkeypatch.setattr("app.agent_mcp.generate_media", fake_generate_media)
    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)
    response = asyncio.run(
        _generate_image(
            replace(Settings(), runs_dir=tmp_path),
            UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"codex": "sk-text", "image": "sk-image"}, allowed_models_by_mode={"image": ("特价 image-2",)}),
            "生成一张竖版海报",
            "",
            "特价 image-2",
            FakeStore(),
            resolution="2K",
            aspect_ratio="9:16",
        )
    )

    request = captured["request"]
    assert request.model_roles.image_generation == "geek2api-image-2"
    assert request.metadata["server_allowed_models_by_mode"]["image"] == ["geek2api-image-2"]
    assert request.params["size"] == "1152x2048"
    assert captured["probe"] == ("sk-image", "image")
    assert response["content"][0]["type"] == "resource_link"
    assert any("![生成的图片]" in item.get("text", "") for item in response["content"])


def test_public_model_forwards_supported_output_compression(monkeypatch, tmp_path):
    captured = {}

    async def fake_generate_media(_settings, request, _user, task, _media_type):
        captured["request"] = request
        output = tmp_path / "mcp" / "user-1" / task["task_id"] / "outputs"
        output.mkdir(parents=True)
        (output / "image.png").write_bytes(b"png")

    class FakeStore:
        def issue_artifact(self, _user, _path):
            return "artifact-token"

    async def fake_live_media_models(_settings, _api_key, _mode):
        return ("gpt-image-2-4K",)

    monkeypatch.setattr("app.agent_mcp.generate_media", fake_generate_media)
    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)

    asyncio.run(
        _generate_image(
            replace(Settings(), runs_dir=tmp_path),
            UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"image": "sk-image"}),
            "生成一张海报",
            "",
            "GPT Image 2",
            FakeStore(),
            output_compression=80,
        )
    )

    assert captured["request"].params["output_compression"] == 80


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


def test_media_generation_never_falls_back_to_the_text_key(monkeypatch, tmp_path):
    called = False

    async def fake_generate_media(*_args, **_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr("app.agent_mcp.generate_media", fake_generate_media)
    response = asyncio.run(
        _generate_image(
            replace(Settings(), runs_dir=tmp_path),
            UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"codex": "sk-text"}),
            "生成一张海报",
            "",
            "GPT Image 2",
            object(),
        )
    )

    assert response["isError"] is True
    assert called is False


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


def test_video_generation_forwards_model_specific_options_and_a_preview_link(monkeypatch, tmp_path):
    captured = {}

    async def fake_live_media_models(_settings, api_key, mode):
        captured["probe"] = (api_key, mode)
        return ("seedance-2.0-cl-mini",)

    async def fake_generate_media(_settings, request, user, task, _media_type):
        captured["request"] = request
        captured["key"] = user.api_key
        output = tmp_path / "mcp" / "user-1" / task["task_id"] / "outputs"
        output.mkdir(parents=True)
        (output / "video.mp4").write_bytes(b"video")

    class FakeStore:
        def issue_artifact(self, _user, _path):
            return "artifact-token"

    monkeypatch.setattr("app.agent_mcp.live_media_models", fake_live_media_models)
    monkeypatch.setattr("app.agent_mcp.generate_media", fake_generate_media)
    response = asyncio.run(
        _generate_video(
            replace(Settings(), runs_dir=tmp_path),
            UserContext(api_key="sk-text", user_id="user-1", key_hint="agent", api_keys={"codex": "sk-text", "video": "sk-video"}),
            "生成一段竖版短片",
            {"model": "Seedance 2.0 CL Mini", "duration_seconds": 8, "resolution": "480p", "size": "720x1280"},
            FakeStore(),
        )
    )

    assert captured["probe"] == ("sk-video", "video")
    assert captured["key"] == "sk-video"
    assert captured["request"].params["duration_seconds"] == 8
    assert captured["request"].params["aspect_ratio"] == "9:16"
    assert captured["request"].params["resolution"] == "480p"
    assert captured["request"].params["ratio"] == "9:16"
    assert any("[预览或下载生成的视频]" in item.get("text", "") for item in response["content"])


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
