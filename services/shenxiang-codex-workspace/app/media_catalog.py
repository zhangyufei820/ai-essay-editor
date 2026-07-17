from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class PublicMediaModel:
    name: str
    model: str
    price: str
    mode: str
    request_name: str = ""
    details: str = ""


PUBLIC_MEDIA_MODELS = (
    PublicMediaModel("GPT Image 2", "gpt-image-2-4K", "¥0.108/张", "image"),
    PublicMediaModel("特价 image-2", "geek2api-image-2", "1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10/张", "image", "特价 image-2"),
    PublicMediaModel("官转image 2稳定", "internal-image2-stable-v1", "¥0.135/张", "image", "官转image 2稳定"),
    PublicMediaModel("Grok Image Pro", "grok-imagine-image", "¥0.324/张", "image"),
    PublicMediaModel("Banana 2", "banana-2", "¥0.162/张", "image"),
    PublicMediaModel("Gemini 3 Pro Image", "gemini-3-pro-image-preview", "¥0.238/张", "image"),
    PublicMediaModel("image 2电商商品图快速通道(1.5K)", "image 2电商商品图快速通道(1.5K)", "¥0.055/张", "image"),
    PublicMediaModel("电商特价banana-2", "ecommerce-banana-2", "¥0.085/张", "image"),
    PublicMediaModel("Grok Video", "grok-video-super-720p", "¥6.50/次", "video", details="固定 720P；5/10/15 秒；支持图片参考，不支持视频或音频；人脸能力未承诺，不保证"),
    PublicMediaModel("Seedance 2.0 LD-17", "seedance-2.0-ld-17", "¥6.48/次", "video", details="固定 720P；5–15 秒；最多 9 张图片、3 个视频、3 个音频；支持人脸"),
    PublicMediaModel("Seedance SD Fast 720P", "seedance-sd2-fast-720p", "¥0.25/秒", "video", details="固定 720P；5/10/15 秒；支持文生视频和图生视频，可上传图片（单个本地文件最大 20MB），不支持视频或音频；人脸能力未承诺，不保证"),
    PublicMediaModel("Grok Video 1.5", "grok-video-1.5", "¥0.20/次", "video", details="固定 720P；仅支持 6/10 秒图生视频；必须上传 1 张图片（最大 20MB），不支持文生视频、视频或音频；人脸能力未承诺，不保证"),
)


def public_models_for_mode(mode: str) -> tuple[PublicMediaModel, ...]:
    return tuple(item for item in PUBLIC_MEDIA_MODELS if item.mode == mode)


def supported_internal_models(mode: str) -> tuple[str, ...]:
    return tuple(item.model for item in public_models_for_mode(mode))


def resolve_public_media_model(name: str, mode: str) -> str | None:
    selected = str(name or "").strip()
    if not selected:
        return ""
    for item in public_models_for_mode(mode):
        if item.name == selected:
            return item.model
    return None


def public_request_model_name(model: str, mode: str) -> str:
    selected = str(model or "").strip()
    for item in public_models_for_mode(mode):
        if item.model == selected:
            return item.request_name or item.model
    return selected


def public_display_model_name(model: str, mode: str) -> str:
    selected = str(model or "").strip()
    for item in public_models_for_mode(mode):
        if item.model == selected or item.name == selected:
            return item.name
    return ""


def public_display_model_names(mode: str, models: Iterable[str]) -> tuple[str, ...]:
    visible: list[str] = []
    for model in models:
        name = public_display_model_name(str(model or ""), mode)
        if name and name not in visible:
            visible.append(name)
    return tuple(visible)


def canonical_allowed_media_models(mode: str, allowed_models: Iterable[str]) -> tuple[str, ...]:
    allowed = set(str(model or "").strip() for model in allowed_models)
    return tuple(item.model for item in public_models_for_mode(mode) if item.model in allowed or item.name in allowed)


def available_public_models(mode: str, allowed_models: Iterable[str]) -> tuple[PublicMediaModel, ...]:
    allowed = set(str(model or "").strip() for model in allowed_models)
    return tuple(item for item in public_models_for_mode(mode) if item.model in allowed or item.name in allowed)
