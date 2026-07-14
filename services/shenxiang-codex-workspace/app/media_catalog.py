from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class PublicMediaModel:
    name: str
    model: str
    price: str
    mode: str


PUBLIC_MEDIA_MODELS = (
    PublicMediaModel("GPT Image 2", "gpt-image-2-4K", "¥0.108/张", "image"),
    PublicMediaModel("特价 image-2", "geek2api-image-2", "1K ¥0.03 / 2K ¥0.06 / 4K ¥0.10/张", "image"),
    PublicMediaModel("Banana 2", "banana-2", "¥0.162/张", "image"),
    PublicMediaModel("Gemini 3 Pro Image", "gemini-3-pro-image-preview", "¥0.238/张", "image"),
    PublicMediaModel("image 2电商商品图快速通道(1.5K)", "image 2电商商品图快速通道(1.5K)", "¥0.055/张", "image"),
    PublicMediaModel("电商特价banana-2", "ecommerce-banana-2", "¥0.085/张", "image"),
    PublicMediaModel("Grok Image Pro", "grok-imagine-image", "¥0.324/张", "image"),
    PublicMediaModel("Seedance 2.0 DJ Fast", "seedance-2.0-dj-fast", "¥0.162/秒", "video"),
    PublicMediaModel("Seedance 2.0 CL Mini", "seedance-2.0-cl-mini", "输入含视频 ¥12.852/1M｜输出 ¥21.114/1M Token", "video"),
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


def available_public_models(mode: str, allowed_models: Iterable[str]) -> tuple[PublicMediaModel, ...]:
    allowed = set(str(model or "").strip() for model in allowed_models)
    return tuple(item for item in public_models_for_mode(mode) if item.model in allowed or item.name in allowed)
