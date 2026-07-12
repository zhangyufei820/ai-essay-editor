from __future__ import annotations

from typing import Any, Iterable

from app.config import Settings


SERVER_ALLOWED_MODELS_METADATA_KEY = "server_allowed_models_by_mode"
IMAGE_BENEFIT_MODEL = "image 2电商商品图快速通道(1.5K)"
INTERNAL_DISCOUNT_IMAGE_MODEL = "geek2api-image-2"
PUBLIC_DISCOUNT_IMAGE_MODEL = "特价 image-2"
EXTRA_IMAGE_MODELS = (
    INTERNAL_DISCOUNT_IMAGE_MODEL,
    "banana-2",
    "gemini-3-pro-image-preview",
)
MEDIA_HINTS = ("image", "imagine", "video", "seedance", "sora", "veo")


def dedupe_models(models: Iterable[str]) -> tuple[str, ...]:
    values = [str(model or "").strip() for model in models]
    return tuple(dict.fromkeys(value for value in values if value))


def public_model_name(model: str) -> str:
    name = str(model or "").strip()
    if name.casefold() == INTERNAL_DISCOUNT_IMAGE_MODEL.casefold():
        return PUBLIC_DISCOUNT_IMAGE_MODEL
    return name


def public_image_models(models: Iterable[str]) -> tuple[str, ...]:
    return dedupe_models(public_model_name(model) for model in models)


def default_mode_models(settings: Settings) -> dict[str, tuple[str, ...]]:
    return {
        "codex": tuple(settings.codex_allowed_models),
        "claude": tuple(settings.claude_allowed_models),
        "image": public_image_models(settings.image_allowed_models),
        "video": tuple(settings.video_allowed_models),
    }


def supported_image_models(settings: Settings) -> tuple[str, ...]:
    return public_image_models((*settings.image_allowed_models, *EXTRA_IMAGE_MODELS))


def supported_video_models(settings: Settings) -> tuple[str, ...]:
    return dedupe_models(settings.video_allowed_models)


def is_claude_model(model: str) -> bool:
    name = str(model or "").strip().lower()
    return bool(name) and (name.startswith("claude") or name.startswith("cc-"))


def is_image_model(settings: Settings, model: str) -> bool:
    name = str(model or "").strip()
    lower = name.lower()
    if not lower:
        return False
    if name == IMAGE_BENEFIT_MODEL:
        return True
    if public_model_name(name) in supported_image_models(settings):
        return True
    if any(hint in lower for hint in ("image", "imagine")):
        return True
    return lower.startswith("banana-") or lower.startswith("gemini-")


def is_video_model(settings: Settings, model: str) -> bool:
    name = str(model or "").strip()
    lower = name.lower()
    if not lower:
        return False
    if name in supported_video_models(settings):
        return True
    return any(hint in lower for hint in ("video", "seedance", "sora", "veo"))


def is_text_model(settings: Settings, model: str) -> bool:
    name = str(model or "").strip().lower()
    if not name:
        return False
    if is_image_model(settings, model) or is_video_model(settings, model):
        return False
    return not any(hint in name for hint in MEDIA_HINTS)


def split_visible_models(
    settings: Settings,
    visible_models: Iterable[str],
    *,
    include_image_benefit: bool = False,
) -> dict[str, tuple[str, ...]]:
    codex: list[str] = []
    claude: list[str] = []
    image: list[str] = []
    video: list[str] = []

    for model in dedupe_models(visible_models):
        if is_claude_model(model):
            claude.append(model)
            continue
        if is_image_model(settings, model):
            if include_image_benefit or model != IMAGE_BENEFIT_MODEL:
                image.append(public_model_name(model))
            continue
        if is_video_model(settings, model):
            video.append(model)
            continue
        if is_text_model(settings, model):
            codex.append(model)

    return {
        "codex": tuple(codex),
        "claude": tuple(claude),
        "image": tuple(image),
        "video": tuple(video),
    }


def normalize_mode_models_payload(raw: Any) -> dict[str, tuple[str, ...]]:
    if not isinstance(raw, dict):
        return {}
    result: dict[str, tuple[str, ...]] = {}
    for mode in ("codex", "claude", "image", "video"):
        values = raw.get(mode)
        if isinstance(values, (list, tuple)):
            normalized = dedupe_models(str(item or "").strip() for item in values)
            result[mode] = public_image_models(normalized) if mode == "image" else normalized
    return result


def mode_models_payload_from_metadata(metadata: dict[str, Any] | None) -> dict[str, tuple[str, ...]]:
    if not isinstance(metadata, dict):
        return {}
    return normalize_mode_models_payload(metadata.get(SERVER_ALLOWED_MODELS_METADATA_KEY))


def mode_models_from_metadata(metadata: dict[str, Any] | None, mode: str) -> tuple[str, ...]:
    models = mode_models_payload_from_metadata(metadata)
    return models.get(mode, ())
