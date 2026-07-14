import asyncio
from dataclasses import replace

from app.config import (
    GROK_MODEL,
    GROK_TOKEN_GROUP,
    GROK_TOKEN_NAME,
    Settings,
    get_settings,
    strip_claude_group_suffix,
)
from app.main import (
    attach_allowed_models_metadata,
    build_direct_task,
    provision_key_profiles,
    submit_workspace_task,
    user_for_mode,
    user_for_request,
)
from app.models import WorkspaceRunRequest
from app.new_api_client import NewApiAuthError, NewApiClient
from app.model_access import IMAGE_BENEFIT_MODEL, split_visible_models
from app.security import UserContext


def test_split_visible_models_uses_runtime_user_models_for_all_modes() -> None:
    settings = Settings()

    result = split_visible_models(
        settings,
        [
            "gpt-5.5",
            "gpt-5.4-mini",
            GROK_MODEL,
            "claude-opus-4-8",
            "gpt-image-2-4K",
            "geek2api-image-2",
            "banana-2",
            "seedance-2.0-ld-17",
            "seedance-2.0-cl-mini",
            IMAGE_BENEFIT_MODEL,
        ],
        include_image_benefit=True,
    )

    assert result["codex"] == ("gpt-5.5", "gpt-5.4-mini", GROK_MODEL)
    assert result["claude"] == ("claude-opus-4-8",)
    assert result["image"] == ("gpt-image-2-4K", "geek2api-image-2", "banana-2", IMAGE_BENEFIT_MODEL)
    assert result["video"] == ("seedance-2.0-ld-17", "seedance-2.0-cl-mini")


def test_strip_claude_group_suffix_keeps_media_fast_models() -> None:
    assert strip_claude_group_suffix("claude-sonnet-4-5-20250929-fast") == "claude-sonnet-4-5-20250929"
    assert strip_claude_group_suffix("claude-sonnet-4-5-20250929-full") == "claude-sonnet-4-5-20250929"
    assert strip_claude_group_suffix("seedance-2.0-dj-fast") == "seedance-2.0-dj-fast"


def test_claude_allowed_models_env_hides_group_suffixes(monkeypatch) -> None:
    monkeypatch.setenv(
        "CLAUDE_ALLOWED_MODELS",
        "claude-sonnet-4-5-20250929-fast,claude-sonnet-4-5-20250929-full,claude-opus-4-6-full",
    )

    settings = get_settings()

    assert settings.claude_allowed_models == (
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-6",
    )


def test_grok_profile_settings_support_production_env_names(monkeypatch) -> None:
    monkeypatch.setenv("GROK_ALLOWED_MODELS", GROK_MODEL)
    monkeypatch.setenv("GROK_TOKEN_NAME", GROK_TOKEN_NAME)

    settings = get_settings()

    assert settings.grok_allowed_models == (GROK_MODEL,)
    assert settings.grok_token_name == GROK_TOKEN_NAME


def test_effective_mode_models_preserves_explicit_empty_permissions() -> None:
    client = NewApiClient(Settings())

    result = client._effective_mode_models(
        {
            "codex": (),
            "claude": ("claude-opus-4-8",),
            "image": (),
            "video": ("seedance-2.0",),
        }
    )

    assert result["codex"] == ()
    assert result["grok"] == ()
    assert result["claude"] == ("claude-opus-4-8",)
    assert result["image"] == ()
    assert result["video"] == ("seedance-2.0",)


def test_resolve_mode_models_keeps_empty_visible_models_when_endpoint_succeeds() -> None:
    client = NewApiClient(Settings())

    async def run() -> dict[str, tuple[str, ...]]:
        client._load_visible_models = lambda *_args, **_kwargs: asyncio.sleep(0, result=())  # type: ignore[method-assign]
        client._has_image_benefit_access = lambda *_args, **_kwargs: asyncio.sleep(0, result=False)  # type: ignore[method-assign]
        return await client.resolve_mode_models(object(), {}, "user-1", {"metadata": {}})  # type: ignore[arg-type]

    result = asyncio.run(run())

    assert result["codex"] == ()
    assert result["claude"] == ()
    assert result["image"] == ()
    assert result["video"] == ()


def test_effective_mode_models_derives_grok_credential_profile_without_hiding_text_model() -> None:
    client = NewApiClient(Settings())

    result = client._effective_mode_models(
        {
            "codex": ("gpt-5.5", GROK_MODEL),
            "claude": (),
            "image": (),
            "video": (),
        }
    )

    assert result["codex"] == ("gpt-5.5", GROK_MODEL)
    assert result["grok"] == (GROK_MODEL,)


def test_ensure_mode_tokens_separates_grok_from_general_codex_token() -> None:
    client = NewApiClient(Settings())
    calls: dict[str, tuple[str, tuple[str, ...], str | None]] = {}

    async def run() -> dict[str, str]:
        async def fake_list_tokens(*_args, **_kwargs):
            return []

        async def fake_ensure_named_token(
            _client,
            _user_id,
            _headers,
            _user,
            _tokens,
            token_name,
            models,
            *,
            token_group=None,
        ):
            mode = "grok" if token_name == GROK_TOKEN_NAME else token_name
            calls[mode] = (token_name, models, token_group)
            return f"sk-{mode}"

        client._list_tokens = fake_list_tokens  # type: ignore[method-assign]
        client._ensure_named_token = fake_ensure_named_token  # type: ignore[method-assign]
        return await client.ensure_mode_tokens(
            object(),  # type: ignore[arg-type]
            "user-1",
            {},
            {"group": "default"},
            {
                "codex": ("gpt-5.5", GROK_MODEL),
                "claude": (),
                "image": (),
                "video": (),
            },
        )

    result = asyncio.run(run())

    assert calls["星人 Codex 文本令牌"][1] == ("gpt-5.5",)
    assert calls["grok"] == (GROK_TOKEN_NAME, (GROK_MODEL,), GROK_TOKEN_GROUP)
    assert result["grok"] == "sk-grok"


def test_create_grok_token_uses_exact_model_and_dedicated_group() -> None:
    client = NewApiClient(Settings())
    captured: dict[str, object] = {}

    async def run() -> int:
        async def fake_post_json(_client, path, _headers, payload):
            assert path == "/api/token/"
            captured.update(payload)
            return {"success": True}

        async def fake_list_tokens(*_args, **_kwargs):
            return [
                {
                    "id": 45,
                    "name": GROK_TOKEN_NAME,
                    "status": 1,
                    "model_limits_enabled": True,
                    "model_limits": GROK_MODEL,
                }
            ]

        client._post_json = fake_post_json  # type: ignore[method-assign]
        client._list_tokens = fake_list_tokens  # type: ignore[method-assign]
        return await client._create_codex_token(
            object(),  # type: ignore[arg-type]
            {},
            {"group": "default"},
            GROK_TOKEN_NAME,
            (GROK_MODEL,),
            token_group=GROK_TOKEN_GROUP,
        )

    assert asyncio.run(run()) == 45
    assert captured["model_limits"] == GROK_MODEL
    assert captured["group"] == GROK_TOKEN_GROUP
    assert captured["model_limits_enabled"] is True
    assert captured["cross_group_retry"] is False


def test_create_general_token_normalizes_nonpublic_user_group() -> None:
    client = NewApiClient(Settings())
    captured: dict[str, object] = {}

    async def run() -> int:
        async def fake_post_json(_client, path, _headers, payload):
            assert path == "/api/token/"
            captured.update(payload)
            return {"success": True}

        async def fake_list_tokens(*_args, **_kwargs):
            return [
                {
                    "id": 46,
                    "name": "星人 Codex 文本令牌",
                    "status": 1,
                    "model_limits_enabled": True,
                    "model_limits": "gpt-5.5",
                }
            ]

        client._post_json = fake_post_json  # type: ignore[method-assign]
        client._list_tokens = fake_list_tokens  # type: ignore[method-assign]
        return await client._create_codex_token(
            object(),  # type: ignore[arg-type]
            {},
            {"group": "monthly"},
            "星人 Codex 文本令牌",
            ("gpt-5.5",),
        )

    assert asyncio.run(run()) == 46
    assert captured["group"] == "default"
    assert captured["cross_group_retry"] is True


def test_general_token_keeps_discount_group() -> None:
    client = NewApiClient(Settings())

    assert client._token_group_for_profile({"group": "discount"}, None) == "discount"
    assert client._token_group_for_profile({"group": "monthly"}, None) == "default"
    assert client._token_group_for_profile({"group": "discount"}, GROK_TOKEN_GROUP) == GROK_TOKEN_GROUP


def test_existing_general_token_moves_nonpublic_group_to_default() -> None:
    client = NewApiClient(Settings())
    captured: dict[str, object] = {}

    async def run() -> None:
        async def fake_put_json(_client, path, _headers, payload):
            assert path == "/api/token/"
            captured.update(payload)
            return {"success": True}

        client._put_json = fake_put_json  # type: ignore[method-assign]
        await client._relax_existing_token_if_needed(
            object(),  # type: ignore[arg-type]
            {},
            {
                "id": 46,
                "name": "星人 Codex 文本令牌",
                "status": 1,
                "unlimited_quota": True,
                "model_limits_enabled": True,
                "model_limits": "gpt-5.5",
                "group": "monthly",
                "cross_group_retry": True,
            },
            {"id": "user-1", "group": "monthly"},
            "星人 Codex 文本令牌",
            ("gpt-5.5",),
        )

    asyncio.run(run())

    assert captured["group"] == "default"
    assert captured["cross_group_retry"] is True


def test_existing_grok_token_is_moved_to_dedicated_group() -> None:
    client = NewApiClient(Settings())
    captured: dict[str, object] = {}

    async def run() -> None:
        async def fake_put_json(_client, path, _headers, payload):
            assert path == "/api/token/"
            captured.update(payload)
            return {"success": True}

        client._put_json = fake_put_json  # type: ignore[method-assign]
        await client._relax_existing_token_if_needed(
            object(),  # type: ignore[arg-type]
            {},
            {
                "id": 45,
                "name": GROK_TOKEN_NAME,
                "status": 1,
                "unlimited_quota": True,
                "model_limits_enabled": True,
                "model_limits": GROK_MODEL,
                "group": "default",
                "expired_time": 123,
                "allow_ips": "127.0.0.1",
            },
            {"id": "user-1", "group": "default"},
            GROK_TOKEN_NAME,
            (GROK_MODEL,),
            token_group=GROK_TOKEN_GROUP,
        )

    asyncio.run(run())

    assert captured["model_limits"] == GROK_MODEL
    assert captured["group"] == GROK_TOKEN_GROUP
    assert captured["cross_group_retry"] is False
    assert captured["expired_time"] == -1
    assert captured["allow_ips"] == ""


def test_existing_grok_token_disables_cross_group_retry() -> None:
    client = NewApiClient(Settings())
    captured: dict[str, object] = {}

    async def run() -> None:
        async def fake_put_json(_client, path, _headers, payload):
            assert path == "/api/token/"
            captured.update(payload)
            return {"success": True}

        client._put_json = fake_put_json  # type: ignore[method-assign]
        await client._relax_existing_token_if_needed(
            object(),  # type: ignore[arg-type]
            {},
            {
                "id": 45,
                "name": GROK_TOKEN_NAME,
                "status": 1,
                "unlimited_quota": True,
                "model_limits_enabled": True,
                "model_limits": GROK_MODEL,
                "group": GROK_TOKEN_GROUP,
                "cross_group_retry": True,
            },
            {"id": "user-1", "group": "default"},
            GROK_TOKEN_NAME,
            (GROK_MODEL,),
            token_group=GROK_TOKEN_GROUP,
        )

    asyncio.run(run())

    assert captured["group"] == GROK_TOKEN_GROUP
    assert captured["cross_group_retry"] is False


def test_existing_grok_token_repair_fails_closed() -> None:
    client = NewApiClient(Settings())

    async def run() -> None:
        async def fake_put_json(*_args, **_kwargs):
            return {"success": False, "message": "update rejected"}

        client._put_json = fake_put_json  # type: ignore[method-assign]
        await client._relax_existing_token_if_needed(
            object(),  # type: ignore[arg-type]
            {},
            {
                "id": 45,
                "name": GROK_TOKEN_NAME,
                "status": 1,
                "unlimited_quota": True,
                "model_limits_enabled": True,
                "model_limits": "gpt-5.5",
                "group": "default",
            },
            {"id": "user-1", "group": "default"},
            GROK_TOKEN_NAME,
            (GROK_MODEL,),
            token_group=GROK_TOKEN_GROUP,
        )

    try:
        asyncio.run(run())
    except NewApiAuthError as exc:
        assert "update rejected" in str(exc)
    else:
        raise AssertionError("dedicated token repair failure was ignored")


def test_codex_text_key_selection_uses_dedicated_grok_profile() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "grok": "sk-grok"},
    )

    assert user_for_mode(user, "codex", GROK_MODEL).api_key == "sk-grok"
    assert user_for_mode(user, "codex", "gpt-5.5").api_key == "sk-codex"

    direct_bearer = UserContext(api_key="sk-direct", user_id="direct", key_hint="sk-direct")
    assert user_for_mode(direct_bearer, "codex", GROK_MODEL).api_key == "sk-direct"


def test_grok_request_uses_dedicated_key_and_narrows_worker_entitlements() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "grok": "sk-grok"},
        allowed_models_by_mode={
            "codex": ("gpt-5.5", GROK_MODEL),
            "grok": (GROK_MODEL,),
            "claude": (),
            "image": (),
            "video": (),
        },
    )
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": GROK_MODEL},
        metadata={"mode": "codex"},
    )

    attach_allowed_models_metadata(request, user)
    selected_user = user_for_request(user, request)

    assert selected_user.api_key == "sk-grok"
    assert request.metadata["server_allowed_models_by_mode"]["codex"] == [GROK_MODEL]
    assert request.metadata["server_allowed_models_by_mode"]["grok"] == [GROK_MODEL]


def test_unentitled_grok_request_is_rejected_without_codex_fallback() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "grok": "sk-grok"},
        allowed_models_by_mode={
            "codex": ("gpt-5.5",),
            "grok": (),
            "claude": (),
            "image": (),
            "video": (),
        },
    )
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": GROK_MODEL},
        metadata={"mode": "codex"},
    )

    attach_allowed_models_metadata(request, user)

    try:
        user_for_request(user, request)
    except PermissionError as exc:
        assert "尚未开通" in str(exc)
    else:
        raise AssertionError("unentitled Grok request unexpectedly selected a fallback key")
    assert request.metadata["server_allowed_models_by_mode"]["codex"] == ["gpt-5.5"]

    rejected = build_direct_task(request, user)
    assert rejected["success"] is False
    assert rejected["status"] == "failed"
    assert rejected["error"]["code"] == "ACCESS_DENIED"
    assert "尚未开通" in rejected["error"]["message"]


def test_entitled_grok_request_requires_dedicated_key() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex"},
        allowed_models_by_mode={
            "codex": ("gpt-5.5", GROK_MODEL),
            "grok": (GROK_MODEL,),
            "claude": (),
            "image": (),
            "video": (),
        },
    )
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": GROK_MODEL},
        metadata={"mode": "codex"},
    )

    rejected = build_direct_task(request, user)

    assert rejected["success"] is False
    assert rejected["status"] == "failed"
    assert rejected["error"]["code"] == "ACCESS_DENIED"


def test_grok_request_rejects_non_codex_mode_without_fallback() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "claude": "sk-claude", "grok": "sk-grok"},
        allowed_models_by_mode={
            "codex": ("gpt-5.5", GROK_MODEL),
            "grok": (GROK_MODEL,),
            "claude": ("claude-opus-4-6",),
            "image": (),
            "video": (),
        },
    )
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": GROK_MODEL},
        metadata={"mode": "claude"},
    )

    rejected = build_direct_task(request, user)

    assert rejected["success"] is False
    assert rejected["error"]["code"] == "ACCESS_DENIED"
    assert "Codex 模式" in rejected["error"]["message"]


def test_direct_bearer_cannot_forge_grok_entitlement_metadata() -> None:
    user = UserContext(api_key="sk-direct", user_id="direct", key_hint="sk-direct")
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": GROK_MODEL},
        metadata={
            "mode": "codex",
            "server_allowed_models_by_mode": {
                "codex": [GROK_MODEL],
                "grok": [GROK_MODEL],
            },
        },
    )

    rejected = build_direct_task(request, user)

    assert rejected["success"] is False
    assert rejected["error"]["code"] == "ACCESS_DENIED"
    assert "server_allowed_models_by_mode" not in request.metadata


def test_implicit_only_grok_model_requires_dedicated_key() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex"},
        allowed_models_by_mode={
            "codex": (GROK_MODEL,),
            "grok": (GROK_MODEL,),
            "claude": (),
            "image": (),
            "video": (),
        },
    )
    request = WorkspaceRunRequest(user_query="test", metadata={"mode": "codex"})

    rejected = build_direct_task(request, user)

    assert rejected["success"] is False
    assert rejected["error"]["code"] == "ACCESS_DENIED"


def test_implicit_grok_model_rejects_stale_key_without_entitlement() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "grok": "sk-stale-grok"},
        allowed_models_by_mode={
            "codex": (GROK_MODEL,),
            "grok": (),
            "claude": (),
            "image": (),
            "video": (),
        },
    )
    request = WorkspaceRunRequest(user_query="test", metadata={"mode": "codex"})

    rejected = build_direct_task(request, user)

    assert rejected["success"] is False
    assert rejected["error"]["code"] == "ACCESS_DENIED"
    assert "尚未开通" in rejected["error"]["message"]


def test_async_unentitled_grok_rejects_before_task_creation() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "grok": "sk-grok"},
        allowed_models_by_mode={
            "codex": ("gpt-5.5",),
            "grok": (),
            "claude": (),
            "image": (),
            "video": (),
        },
    )
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": GROK_MODEL},
        metadata={"mode": "codex"},
    )

    rejected = asyncio.run(submit_workspace_task(request, user))

    assert rejected["success"] is False
    assert rejected["error"]["code"] == "ACCESS_DENIED"


def test_provision_profiles_hide_grok_without_visible_entitlement() -> None:
    profiles = provision_key_profiles({"codex": "sk-codex", "grok": "sk-grok"})

    assert all(profile["mode"] != "grok" for profile in profiles)


def test_provision_profiles_never_expose_an_internal_service_address(monkeypatch) -> None:
    import app.main as workspace_main

    monkeypatch.setattr(
        workspace_main,
        "settings",
        replace(Settings(), new_api_base_url="http://internal-service:3000/v1", public_base_url="https://api.aiphui.top/codex"),
    )

    profiles = workspace_main.provision_key_profiles({"codex": "sk-codex", "image": "sk-image", "video": "sk-video"})

    assert all(profile["base_url"] != "http://internal-service:3000/v1" for profile in profiles)
    assert {profile["base_url"] for profile in profiles if profile["mode"] != "claude"} == {"https://api.aiphui.top/v1"}


def test_provision_profiles_expose_dedicated_grok_key_when_entitled() -> None:
    profiles = provision_key_profiles(
        {"codex": "sk-codex", "grok": "sk-grok"},
        {
            "codex": ("gpt-5.5", GROK_MODEL),
            "grok": (GROK_MODEL,),
            "claude": (),
            "image": (),
            "video": (),
        },
    )

    grok = next(profile for profile in profiles if profile["mode"] == "grok")
    assert grok["name"] == GROK_TOKEN_NAME
    assert grok["models"] == [GROK_MODEL]
    assert grok["key"] == "sk-grok"
    assert grok["endpoint"] == "/v1/chat/completions"
    public_copy = str(grok).lower()
    for supplier_marker in ("geek2api", "moonapix", "dragtokens", "relaydance"):
        assert supplier_marker not in public_copy
