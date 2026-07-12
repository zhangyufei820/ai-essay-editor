import asyncio
import hashlib

import httpx
import pytest

from app.config import (
    GROK_MODEL,
    GROK_TOKEN_GROUP,
    GROK_TOKEN_NAME,
    Settings,
    get_settings,
    strip_claude_group_suffix,
)
from app.main import attach_allowed_models_metadata, provision_key_profiles, user_for_mode, user_for_request
from app.models import WorkspaceRunRequest
from app.new_api_client import NewApiAuthError, NewApiClient
from app.model_access import (
    IMAGE_BENEFIT_MODEL,
    PUBLIC_DISCOUNT_IMAGE_MODEL,
    SERVER_ALLOWED_MODELS_METADATA_KEY,
    mode_models_payload_from_metadata,
    split_visible_models,
)
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
    assert result["image"] == ("gpt-image-2-4K", PUBLIC_DISCOUNT_IMAGE_MODEL, "banana-2", IMAGE_BENEFIT_MODEL)
    assert result["video"] == ("seedance-2.0-ld-17", "seedance-2.0-cl-mini")


def test_model_metadata_rewrites_legacy_supplier_model_to_public_alias() -> None:
    result = mode_models_payload_from_metadata(
        {SERVER_ALLOWED_MODELS_METADATA_KEY: {"image": ["geek2api-image-2"]}}
    )

    assert result["image"] == (PUBLIC_DISCOUNT_IMAGE_MODEL,)
    assert "geek2api" not in str(result).lower()


def test_default_provision_profiles_do_not_expose_supplier_model_names() -> None:
    profiles = provision_key_profiles({"image": "sk-image"})

    public_copy = str(profiles).lower()
    assert PUBLIC_DISCOUNT_IMAGE_MODEL in str(profiles)
    assert "geek2api" not in public_copy


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
            "grok": (),
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
        async def fake_get_json(_client, path, _headers):
            assert path == "/api/user/models"
            return {"success": True, "data": []}

        client._get_json = fake_get_json  # type: ignore[method-assign]
        client._has_image_benefit_access = lambda *_args, **_kwargs: asyncio.sleep(0, result=False)  # type: ignore[method-assign]
        return await client.resolve_mode_models(object(), {}, "user-1", {"metadata": {}})  # type: ignore[arg-type]

    result = asyncio.run(run())

    assert result["codex"] == ()
    assert result["grok"] == ()
    assert result["claude"] == ()
    assert result["image"] == ()
    assert result["video"] == ()


def test_effective_mode_models_does_not_derive_grok_entitlement_from_codex_models() -> None:
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
    assert result["grok"] == ()


def test_effective_mode_models_preserves_explicit_grok_entitlement() -> None:
    client = NewApiClient(Settings())

    result = client._effective_mode_models(
        {
            "codex": ("gpt-5.5", GROK_MODEL),
            "grok": (GROK_MODEL,),
            "claude": (),
            "image": (),
            "video": (),
        }
    )

    assert result["codex"] == ("gpt-5.5", GROK_MODEL)
    assert result["grok"] == (GROK_MODEL,)


def test_resolve_mode_models_creates_explicit_grok_entitlement_from_visible_models() -> None:
    client = NewApiClient(Settings())

    async def run() -> dict[str, tuple[str, ...]]:
        client._load_visible_models = lambda *_args, **_kwargs: asyncio.sleep(  # type: ignore[method-assign]
            0,
            result=("gpt-5.5", GROK_MODEL),
        )
        client._has_image_benefit_access = lambda *_args, **_kwargs: asyncio.sleep(0, result=False)  # type: ignore[method-assign]
        return await client.resolve_mode_models(object(), {}, "user-1", {"metadata": {}})  # type: ignore[arg-type]

    result = asyncio.run(run())

    assert result["codex"] == ("gpt-5.5", GROK_MODEL)
    assert result["grok"] == (GROK_MODEL,)


@pytest.mark.parametrize("entrypoint", ["bootstrap_user", "ensure_current_user_tokens"])
@pytest.mark.parametrize(
    "models_payload",
    [
        {"success": False, "message": "temporarily unavailable"},
        {"success": True, "data": {}},
        {"success": True, "data": [{"id": "gpt-5.5"}]},
    ],
)
def test_account_sync_fails_closed_before_token_mutation_when_model_contract_is_unavailable(
    entrypoint: str,
    models_payload: dict[str, object],
) -> None:
    client = NewApiClient(Settings())
    token_mutations: list[str] = []

    async def run() -> None:
        async def fake_get_json(_client, path, _headers):
            if path == "/api/user/self":
                return {
                    "success": True,
                    "data": {
                        "id": "user-1",
                        "group": "default",
                        "metadata": {
                            SERVER_ALLOWED_MODELS_METADATA_KEY: {
                                "codex": ["gpt-5.5", GROK_MODEL],
                                "grok": [GROK_MODEL],
                                "claude": ["claude-opus-4-8"],
                                "image": [PUBLIC_DISCOUNT_IMAGE_MODEL],
                                "video": ["seedance-2.0"],
                            }
                        },
                    },
                }
            if path == "/api/user/models":
                return models_payload
            raise AssertionError(f"unexpected GET after model permission failure: {path}")

        async def fake_create(*_args, **_kwargs):
            token_mutations.append("create")
            return 1

        async def fake_update(*_args, **_kwargs):
            token_mutations.append("update")

        client._get_json = fake_get_json  # type: ignore[method-assign]
        client._create_codex_token = fake_create  # type: ignore[method-assign]
        client._relax_existing_token_if_needed = fake_update  # type: ignore[method-assign]
        await getattr(client, entrypoint)("user-1", "session=test")

    with pytest.raises(NewApiAuthError, match="模型权限"):
        asyncio.run(run())

    assert token_mutations == []


def test_load_visible_models_fails_closed_on_transport_error() -> None:
    client = NewApiClient(Settings())

    async def run() -> None:
        async def fake_get_json(*_args, **_kwargs):
            raise httpx.ConnectError("connection failed")

        client._get_json = fake_get_json  # type: ignore[method-assign]
        await client._load_visible_models(object(), {})  # type: ignore[arg-type]

    with pytest.raises(NewApiAuthError, match="模型权限"):
        asyncio.run(run())


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
                "grok": (GROK_MODEL,),
                "claude": (),
                "image": (),
                "video": (),
            },
        )

    result = asyncio.run(run())

    assert calls["星人 Codex 文本令牌"][1] == ("gpt-5.5",)
    assert calls["grok"] == (GROK_TOKEN_NAME, (GROK_MODEL,), GROK_TOKEN_GROUP)
    assert result["grok"] == "sk-grok"


def test_ensure_mode_tokens_skips_unentitled_grok_and_excludes_it_from_codex_token() -> None:
    client = NewApiClient(Settings())
    calls: dict[str, tuple[tuple[str, ...], str | None]] = {}

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
            calls[token_name] = (models, token_group)
            return f"sk-{token_name}"

        client._list_tokens = fake_list_tokens  # type: ignore[method-assign]
        client._ensure_named_token = fake_ensure_named_token  # type: ignore[method-assign]
        return await client.ensure_mode_tokens(
            object(),  # type: ignore[arg-type]
            "user-1",
            {},
            {"group": "default"},
            {
                "codex": ("gpt-5.5", GROK_MODEL),
                "grok": (),
                "claude": (),
                "image": (),
                "video": (),
            },
        )

    result = asyncio.run(run())

    assert calls[client.settings.auto_token_name] == (("gpt-5.5",), None)
    assert client.settings.grok_token_name not in calls
    assert "grok" not in result


def test_create_grok_token_uses_custom_name_and_fixed_security_contract() -> None:
    custom_name = "自定义 Grok 令牌名称"
    client = NewApiClient(Settings(grok_token_name=custom_name))
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
                    "name": custom_name,
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
            custom_name,
            ("gpt-5.5",),
            token_group=GROK_TOKEN_GROUP,
        )

    assert asyncio.run(run()) == 45
    assert captured == {
        "name": custom_name,
        "remain_quota": 0,
        "expired_time": -1,
        "unlimited_quota": True,
        "model_limits_enabled": True,
        "model_limits": GROK_MODEL,
        "allow_ips": "",
        "group": GROK_TOKEN_GROUP,
        "cross_group_retry": False,
    }


def test_existing_grok_token_is_repaired_to_fixed_security_contract() -> None:
    custom_name = "自定义 Grok 令牌名称"
    client = NewApiClient(Settings(grok_token_name=custom_name))
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
                "name": custom_name,
                "status": 1,
                "remain_quota": 999,
                "expired_time": 2_000_000_000,
                "unlimited_quota": True,
                "model_limits_enabled": True,
                "model_limits": GROK_MODEL,
                "allow_ips": "10.0.0.1",
                "group": GROK_TOKEN_GROUP,
                "cross_group_retry": True,
            },
            {"id": "user-1", "group": "default"},
            custom_name,
            ("gpt-5.5",),
            token_group=GROK_TOKEN_GROUP,
        )

    asyncio.run(run())

    assert captured == {
        "id": 45,
        "name": custom_name,
        "remain_quota": 0,
        "expired_time": -1,
        "unlimited_quota": True,
        "model_limits_enabled": True,
        "model_limits": GROK_MODEL,
        "allow_ips": "",
        "group": GROK_TOKEN_GROUP,
        "cross_group_retry": False,
    }


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


def test_existing_general_token_repair_fails_closed() -> None:
    client = NewApiClient(Settings())

    async def run() -> None:
        async def fake_put_json(*_args, **_kwargs):
            return {"success": False, "message": "general update rejected"}

        client._put_json = fake_put_json  # type: ignore[method-assign]
        await client._relax_existing_token_if_needed(
            object(),  # type: ignore[arg-type]
            {},
            {
                "id": 46,
                "name": client.settings.auto_token_name,
                "status": 1,
                "unlimited_quota": True,
                "model_limits_enabled": True,
                "model_limits": "gpt-5.5,gpt-5.4-mini",
                "group": "default",
            },
            {"id": "user-1", "group": "default"},
            client.settings.auto_token_name,
            ("gpt-5.5",),
        )

    try:
        asyncio.run(run())
    except NewApiAuthError as exc:
        assert "general update rejected" in str(exc)
    else:
        raise AssertionError("general token repair failure was ignored")


def test_stale_grok_contract_cache_does_not_bypass_token_repair() -> None:
    client = NewApiClient(Settings())
    old_digest = hashlib.sha256(f"{GROK_MODEL}\n{GROK_TOKEN_GROUP}".encode("utf-8")).hexdigest()[:24]
    old_cache_key = f"codex:auto-token:user-1:{GROK_TOKEN_NAME}:{old_digest}"
    cache_reads: list[str] = []
    cache_writes: list[tuple[str, str]] = []
    put_payloads: list[dict[str, object]] = []

    async def run() -> str:
        def fake_cache_get(key: str) -> str | None:
            cache_reads.append(key)
            return "stale-cached-key" if key == old_cache_key else None

        async def fake_put_json(_client, path, _headers, payload):
            assert path == "/api/token/"
            put_payloads.append(dict(payload))
            return {"success": True}

        async def fake_fetch_token_key(*_args, **_kwargs):
            return "repaired-token-key"

        client._cache_get = fake_cache_get  # type: ignore[method-assign]
        client._cache_set = lambda key, value: cache_writes.append((key, value))  # type: ignore[method-assign]
        client._put_json = fake_put_json  # type: ignore[method-assign]
        client._fetch_token_key = fake_fetch_token_key  # type: ignore[method-assign]
        return await client._ensure_named_token(
            object(),  # type: ignore[arg-type]
            "user-1",
            {},
            {"id": "user-1", "group": "default"},
            [
                {
                    "id": 45,
                    "name": GROK_TOKEN_NAME,
                    "status": 1,
                    "remain_quota": 0,
                    "expired_time": -1,
                    "unlimited_quota": True,
                    "model_limits_enabled": True,
                    "model_limits": GROK_MODEL,
                    "allow_ips": "",
                    "group": GROK_TOKEN_GROUP,
                    "cross_group_retry": True,
                }
            ],
            GROK_TOKEN_NAME,
            (GROK_MODEL,),
            token_group=GROK_TOKEN_GROUP,
        )

    assert asyncio.run(run()) == "repaired-token-key"
    assert cache_reads and cache_reads[0] != old_cache_key
    assert put_payloads and put_payloads[0]["cross_group_retry"] is False
    assert cache_writes == [(cache_reads[0], "repaired-token-key")]


def test_codex_text_key_selection_uses_dedicated_grok_profile() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "grok": "sk-grok"},
        allowed_models_by_mode={"codex": ("gpt-5.5", GROK_MODEL), "grok": (GROK_MODEL,)},
    )

    assert user_for_mode(user, "codex", GROK_MODEL).api_key == "sk-grok"
    assert user_for_mode(user, "codex", "gpt-5.5").api_key == "sk-codex"

    direct_bearer = UserContext(api_key="sk-direct", user_id="direct", key_hint="sk-direct")
    assert user_for_mode(direct_bearer, "codex", GROK_MODEL).api_key == "sk-direct"


def test_unentitled_grok_model_does_not_select_dedicated_key() -> None:
    user = UserContext(
        api_key="sk-primary",
        user_id="user-1",
        key_hint="sk-primary",
        api_keys={"codex": "sk-codex", "grok": "sk-grok"},
        allowed_models_by_mode={"codex": ("gpt-5.5", GROK_MODEL), "grok": ()},
    )

    assert user_for_mode(user, "codex", GROK_MODEL).api_key == "sk-codex"


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


def test_unentitled_grok_request_uses_resolved_codex_fallback_key() -> None:
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

    assert user_for_request(user, request).api_key == "sk-codex"
    assert request.metadata["server_allowed_models_by_mode"]["codex"] == ["gpt-5.5"]


def test_provision_profiles_hide_grok_key_without_explicit_entitlement() -> None:
    profiles = provision_key_profiles({"codex": "sk-codex", "grok": "sk-grok"})

    assert all(profile["mode"] != "grok" for profile in profiles)


def test_provision_profiles_hide_grok_key_for_explicit_empty_entitlement() -> None:
    profiles = provision_key_profiles(
        {"codex": "sk-codex", "grok": "sk-grok"},
        {"codex": ("gpt-5.5", GROK_MODEL), "grok": ()},
    )

    assert all(profile["mode"] != "grok" for profile in profiles)


def test_provision_profiles_expose_grok_key_for_explicit_entitlement() -> None:
    profiles = provision_key_profiles(
        {"codex": "sk-codex", "grok": "sk-grok"},
        {"codex": ("gpt-5.5", GROK_MODEL), "grok": (GROK_MODEL,)},
    )

    grok = next(profile for profile in profiles if profile["mode"] == "grok")
    assert grok["name"] == GROK_TOKEN_NAME
    assert grok["models"] == [GROK_MODEL]
    assert grok["key"] == "sk-grok"
    assert grok["endpoint"] == "/v1/chat/completions"
    public_copy = str(grok).lower()
    for supplier_marker in ("geek2api", "moonapix", "dragtokens", "relaydance"):
        assert supplier_marker not in public_copy
