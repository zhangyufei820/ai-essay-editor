import asyncio

from app.config import Settings, get_settings, strip_claude_group_suffix
from app.new_api_client import NewApiClient
from app.model_access import IMAGE_BENEFIT_MODEL, split_visible_models


def test_split_visible_models_uses_runtime_user_models_for_all_modes() -> None:
    settings = Settings()

    result = split_visible_models(
        settings,
        [
            "gpt-5.5",
            "gpt-5.4-mini",
            "claude-opus-4-8",
            "gpt-image-2-4K",
            "banana-2",
            "seedance-2.0-ld-17",
            IMAGE_BENEFIT_MODEL,
        ],
        include_image_benefit=True,
    )

    assert result["codex"] == ("gpt-5.5", "gpt-5.4-mini")
    assert result["claude"] == ("claude-opus-4-8",)
    assert result["image"] == ("gpt-image-2-4K", "banana-2", IMAGE_BENEFIT_MODEL)
    assert result["video"] == ("seedance-2.0-ld-17",)


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
