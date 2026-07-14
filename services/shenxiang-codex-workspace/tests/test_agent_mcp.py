import base64
import hashlib
import json
from dataclasses import replace

import pytest
from fastapi import HTTPException

from app.agent_mcp import AgentAuthorizationStore, _is_safe_redirect_uri, _pkce_valid, authorization_page, codex_connection_page, mcp_tools, safe_mcp_error
from app.config import Settings
from app.main import is_allowed_browser_origin
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
        "xingren_ask",
        "xingren_generate_image",
        "xingren_generate_video",
    ]
    visible = json.dumps(safe_mcp_error("https://private.invalid/error"), ensure_ascii=False)
    assert "供应商" not in visible
    assert "private.invalid" not in visible


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
