from __future__ import annotations

import base64
import binascii
import asyncio
import ipaddress
import json
import re
import socket
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from uuid import uuid4

import httpx

from app.config import Settings
from app.media_catalog import public_request_model_name
from app.model_access import mode_models_payload_from_metadata
from app.models import WorkspaceRunRequest
from app.security import UserContext


IMAGE_INTENT_KEYWORDS = (
    "生成图片",
    "生成图像",
    "生图",
    "画一张",
    "画张",
    "画图",
    "出图",
    "图片生成",
    "图像生成",
    "海报",
    "封面",
    "插画",
    "头像",
    "视觉图",
    "产品图",
    "image",
    "poster",
    "illustration",
    "draw",
    "render an image",
)

VIDEO_INTENT_KEYWORDS = (
    "生成视频",
    "做视频",
    "视频生成",
    "图生视频",
    "文生视频",
    "短片",
    "短视频",
    "分镜视频",
    "首帧",
    "尾帧",
    "运镜",
    "镜头",
    "video",
    "clip",
    "image to video",
    "text to video",
)

NEGATION_HINTS = ("不要生成图片", "不用生成图片", "不要出图", "不需要图片", "不要生成视频", "不需要视频")

VIDEO_URL_RE = re.compile(r"https?://[^\s\"'<>]+?\.(?:mp4|webm|mov|m4v)(?:\?[^\s\"'<>]+)?", re.IGNORECASE)
IMAGE_URL_RE = re.compile(r"https?://[^\s\"'<>]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s\"'<>]+)?", re.IGNORECASE)
OFFICIAL_SEEDANCE_REFERENCE_MODELS = {"seedance-2.0-dj-fast", "seedance-2.0-ld-17"}
MOONAPIX_SEEDANCE_VIDEO_MODELS = {
    "seedance-2.0-kz-fast",
    "seedance-2.0-cl-fast",
    "seedance-2.0-cl",
    "seedance-2.0-cl-mini",
}
MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024
MAX_REMOTE_VIDEO_BYTES = 120 * 1024 * 1024
MAX_MEDIA_REDIRECTS = 3

MEDIA_ERROR_MODEL_UNAVAILABLE = "该模型暂时无法使用，请刷新模型列表后选择其他模型。"
MEDIA_ERROR_SPEC_UNSUPPORTED = "该模型不支持当前画面规格。请选择模型列表中标注的规格后重试。"
MEDIA_ERROR_INPUT_UNSUPPORTED = "当前素材或参数暂不支持，请调整后重试。"
MEDIA_ERROR_SERVICE_UNAVAILABLE = "生成服务暂时繁忙，未开始生成，请稍后重试。"
MEDIA_ERROR_RESULT_UNAVAILABLE = "生成结果暂时无法展示，请稍后重试。"
MEDIA_ERROR_TIMEOUT = "生成等待超时，请稍后重试。"

SAFE_MEDIA_ERROR_MESSAGES = frozenset(
    {
        MEDIA_ERROR_MODEL_UNAVAILABLE,
        MEDIA_ERROR_SPEC_UNSUPPORTED,
        MEDIA_ERROR_INPUT_UNSUPPORTED,
        MEDIA_ERROR_SERVICE_UNAVAILABLE,
        MEDIA_ERROR_RESULT_UNAVAILABLE,
        MEDIA_ERROR_TIMEOUT,
    }
)

UNPUBLISHED_MCP_IMAGE_PARAMETERS = frozenset(
    {
        "input_fidelity",
        "moderation",
        "negative_prompt",
        "style",
    }
)

GPT_IMAGE_SIZE_BY_RESOLUTION = {
    "1K": {
        "1:1": "1024x1024",
        "1:3": "512x1536",
        "3:1": "1536x512",
        "2:3": "1024x1536",
        "3:2": "1536x1024",
        "3:4": "1008x1344",
        "4:3": "1344x1008",
        "4:5": "1024x1280",
        "5:4": "1280x1024",
        "16:9": "1536x864",
        "9:16": "864x1536",
        "9:21": "672x1568",
        "21:9": "1568x672",
    },
    "2K": {
        "1:1": "2048x2048",
        "1:3": "688x2064",
        "3:1": "2064x688",
        "2:3": "1376x2064",
        "3:2": "2064x1376",
        "3:4": "1536x2048",
        "4:3": "2048x1536",
        "4:5": "1664x2080",
        "5:4": "2080x1664",
        "16:9": "2048x1152",
        "9:16": "1152x2048",
        "9:21": "912x2128",
        "21:9": "2128x912",
    },
    "4K": {
        "1:1": "2880x2880",
        "1:3": "1280x3840",
        "3:1": "3840x1280",
        "2:3": "2176x3264",
        "3:2": "3264x2176",
        "3:4": "2160x2880",
        "4:3": "2880x2160",
        "4:5": "2304x2880",
        "5:4": "2880x2304",
        "16:9": "3840x2160",
        "9:16": "2160x3840",
        "9:21": "1632x3808",
        "21:9": "3808x1632",
    },
}
GPT_IMAGE_SIZE_TO_SELECTION = {
    size: (resolution, aspect_ratio)
    for resolution, sizes in GPT_IMAGE_SIZE_BY_RESOLUTION.items()
    for aspect_ratio, size in sizes.items()
}
GOOGLE_IMAGE_ASPECT_RATIOS = (
    "1:1",
    "1:4",
    "1:8",
    "2:3",
    "3:2",
    "3:4",
    "4:1",
    "4:3",
    "4:5",
    "5:4",
    "8:1",
    "9:16",
    "16:9",
    "21:9",
)
COMMON_IMAGE_SIZE_TO_ASPECT_RATIO = {
    **{size: aspect_ratio for size, (_, aspect_ratio) in GPT_IMAGE_SIZE_TO_SELECTION.items()},
}
VIDEO_SIZE_TO_ASPECT_RATIO = {
    "1280x720": "16:9",
    "720x1280": "9:16",
    "1024x1024": "1:1",
}


@dataclass(frozen=True)
class ImageModelCapability:
    family: str
    aspect_ratios: tuple[str, ...]
    resolutions: tuple[str, ...]
    default_aspect_ratio: str
    default_resolution: str
    qualities: tuple[str, ...] = ()
    output_formats: tuple[str, ...] = ("url",)
    backgrounds: tuple[str, ...] = ()
    max_count: int = 1
    allow_output_compression: bool = False


@dataclass(frozen=True)
class VideoModelCapability:
    durations: tuple[int, ...]
    aspect_ratios: tuple[str, ...]
    resolutions: tuple[str, ...]
    default_duration: int
    default_aspect_ratio: str
    default_resolution: str
    sizes: tuple[str, ...]
    allow_seed: bool = False
    allow_watermark: bool = False


_GPT_IMAGE_CAPABILITY = ImageModelCapability(
    family="gpt_image",
    aspect_ratios=tuple(GPT_IMAGE_SIZE_BY_RESOLUTION["1K"]),
    resolutions=("1K", "2K", "4K"),
    default_aspect_ratio="1:1",
    default_resolution="1K",
    qualities=("auto", "low", "medium", "high"),
    output_formats=("url", "png", "jpeg", "webp"),
    backgrounds=("auto", "opaque"),
    max_count=4,
    allow_output_compression=True,
)
_DISCOUNT_IMAGE_CAPABILITY = ImageModelCapability(
    family="discount_image",
    aspect_ratios=tuple(GPT_IMAGE_SIZE_BY_RESOLUTION["1K"]),
    resolutions=("1K", "2K", "4K"),
    default_aspect_ratio="1:1",
    default_resolution="1K",
    qualities=("auto", "low", "medium", "high"),
    output_formats=("url", "png", "jpeg", "webp"),
    backgrounds=("auto", "opaque"),
    max_count=4,
    allow_output_compression=True,
)
_ECOMMERCE_IMAGE_CAPABILITY = ImageModelCapability(
    family="ecommerce_image",
    aspect_ratios=tuple(GPT_IMAGE_SIZE_BY_RESOLUTION["1K"]),
    resolutions=("auto",),
    default_aspect_ratio="1:1",
    default_resolution="auto",
    max_count=4,
)
_BANANA_IMAGE_CAPABILITY = ImageModelCapability(
    family="gemini_image",
    aspect_ratios=GOOGLE_IMAGE_ASPECT_RATIOS,
    resolutions=("512", "1K", "2K", "4K"),
    default_aspect_ratio="16:9",
    default_resolution="2K",
    output_formats=(),
)
_GEMINI_IMAGE_CAPABILITY = ImageModelCapability(
    family="gemini_image",
    aspect_ratios=("1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"),
    resolutions=("1K", "2K", "4K"),
    default_aspect_ratio="16:9",
    default_resolution="4K",
    output_formats=(),
)
_GROK_IMAGE_CAPABILITY = ImageModelCapability(
    family="grok_image",
    aspect_ratios=(
        "1:1",
        "3:4",
        "4:3",
        "9:16",
        "16:9",
        "2:3",
        "3:2",
        "9:19.5",
        "19.5:9",
        "9:20",
        "20:9",
        "1:2",
        "2:1",
    ),
    resolutions=("1k", "2k"),
    default_aspect_ratio="1:1",
    default_resolution="2k",
    output_formats=(),
    max_count=4,
)
_ECOMMERCE_BANANA_IMAGE_CAPABILITY = ImageModelCapability(
    family="gemini_image",
    aspect_ratios=GOOGLE_IMAGE_ASPECT_RATIOS,
    resolutions=("1K",),
    default_aspect_ratio="1:1",
    default_resolution="1K",
    output_formats=(),
)

IMAGE_MODEL_CAPABILITIES = {
    "gpt-image-2-4K": _GPT_IMAGE_CAPABILITY,
    "geek2api-image-2": _DISCOUNT_IMAGE_CAPABILITY,
    "grok-imagine-image": _GROK_IMAGE_CAPABILITY,
    "banana-2": _BANANA_IMAGE_CAPABILITY,
    "gemini-3-pro-image-preview": _GEMINI_IMAGE_CAPABILITY,
    "image 2电商商品图快速通道(1.5K)": _ECOMMERCE_IMAGE_CAPABILITY,
    "ecommerce-banana-2": _ECOMMERCE_BANANA_IMAGE_CAPABILITY,
}

VIDEO_MODEL_CAPABILITIES = {
    "seedance-2.0-dj-fast": VideoModelCapability(
        durations=(5, 10, 15),
        aspect_ratios=("16:9", "9:16"),
        resolutions=("720P",),
        default_duration=10,
        default_aspect_ratio="16:9",
        default_resolution="720P",
        sizes=("1280x720", "720x1280"),
    ),
    "seedance-2.0-cl-mini": VideoModelCapability(
        durations=tuple(range(4, 16)),
        aspect_ratios=("16:9", "9:16", "1:1", "4:3", "3:4"),
        resolutions=("480p", "720p"),
        default_duration=8,
        default_aspect_ratio="16:9",
        default_resolution="720p",
        sizes=("1280x720", "720x1280", "1024x1024"),
        allow_seed=True,
        allow_watermark=True,
    ),
}


def _media_params(request: WorkspaceRunRequest) -> dict[str, Any]:
    return request.params if isinstance(request.params, dict) else {}


def _string_param(params: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = params.get(key)
        if value is None:
            continue
        normalized = str(value).strip()
        if normalized:
            return normalized
    return ""


def _canonical_option(value: str, allowed: tuple[str, ...]) -> str:
    lookup = {item.casefold(): item for item in allowed}
    return lookup.get(value.casefold(), "")


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return int(parsed) if parsed.is_integer() else None


def _boolean_value(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().casefold()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return None


def _unsupported_media_spec() -> None:
    raise MediaGenerationError(MEDIA_ERROR_SPEC_UNSUPPORTED)


def _image_ratio_from_size(size: str) -> tuple[str, str]:
    normalized = size.replace(" ", "").casefold()
    if normalized in {ratio.casefold() for ratio in GOOGLE_IMAGE_ASPECT_RATIOS}:
        return next(ratio for ratio in GOOGLE_IMAGE_ASPECT_RATIOS if ratio.casefold() == normalized), ""
    for image_size, selection in GPT_IMAGE_SIZE_TO_SELECTION.items():
        if image_size.casefold() == normalized:
            return selection[1], selection[0]
    return "", ""


def _image_options(request: WorkspaceRunRequest, capability: ImageModelCapability) -> tuple[str, str]:
    params = _media_params(request)
    explicit_size = _string_param(params, "size")
    if capability.family == "ecommerce_image" and explicit_size.casefold() == "auto":
        explicit_size = ""
    size_ratio, size_resolution = _image_ratio_from_size(explicit_size) if explicit_size else ("", "")
    if explicit_size and not size_ratio:
        _unsupported_media_spec()

    requested_ratio = _string_param(params, "aspect_ratio", "ratio")
    if requested_ratio:
        aspect_ratio = _canonical_option(requested_ratio, capability.aspect_ratios)
        if not aspect_ratio:
            _unsupported_media_spec()
        if size_ratio and size_ratio != aspect_ratio:
            _unsupported_media_spec()
    else:
        aspect_ratio = size_ratio or capability.default_aspect_ratio

    requested_resolution = _string_param(params, "resolution", "image_size")
    if requested_resolution:
        resolution = _canonical_option(requested_resolution, capability.resolutions)
        if not resolution:
            _unsupported_media_spec()
        if size_resolution and size_resolution != resolution:
            _unsupported_media_spec()
    elif size_resolution and size_resolution in capability.resolutions:
        resolution = size_resolution
    else:
        resolution = capability.default_resolution

    return aspect_ratio, resolution


def _image_pixel_size(capability: ImageModelCapability, aspect_ratio: str, resolution: str) -> str:
    if capability.family == "ecommerce_image" and resolution == "auto":
        return "auto"
    if capability.family == "grok_image":
        return ""
    source_resolution = resolution if resolution in GPT_IMAGE_SIZE_BY_RESOLUTION else "1K"
    return GPT_IMAGE_SIZE_BY_RESOLUTION[source_resolution].get(aspect_ratio, "")


def _mcp_image_count(params: dict[str, Any], capability: ImageModelCapability) -> int:
    raw_count = params.get("n", 1)
    count = _positive_int(raw_count)
    if count is None or count < 1 or count > capability.max_count:
        _unsupported_media_spec()
    return count


def _mcp_image_option(
    params: dict[str, Any],
    key: str,
    allowed: tuple[str, ...],
) -> str:
    value = _string_param(params, key)
    if not value:
        return ""
    normalized = _canonical_option(value, allowed)
    if not normalized:
        _unsupported_media_spec()
    return normalized


def _mcp_output_compression(params: dict[str, Any], capability: ImageModelCapability) -> int | None:
    if "output_compression" not in params or params["output_compression"] is None:
        return None
    if not capability.allow_output_compression:
        _unsupported_media_spec()
    compression = _positive_int(params["output_compression"])
    if compression is None or compression < 0 or compression > 100:
        _unsupported_media_spec()
    return compression


def _ecommerce_image_payload(request: WorkspaceRunRequest, model: str, capability: ImageModelCapability) -> dict[str, Any]:
    params = _media_params(request)
    explicit_size = _string_param(params, "size")
    if explicit_size and explicit_size.casefold() != "auto":
        _unsupported_media_spec()
    if _string_param(params, "aspect_ratio", "ratio"):
        _unsupported_media_spec()
    requested_resolution = _string_param(params, "resolution", "image_size")
    if requested_resolution and requested_resolution.casefold() != "auto":
        _unsupported_media_spec()
    return {
        "model": model,
        "prompt": request.user_query,
        "n": _mcp_image_count(params, capability),
        "size": "auto",
    }


def build_mcp_image_payload(request: WorkspaceRunRequest, model: str) -> dict[str, Any]:
    capability = IMAGE_MODEL_CAPABILITIES.get(model)
    if capability is None:
        raise MediaGenerationError(MEDIA_ERROR_MODEL_UNAVAILABLE)

    params = _media_params(request)
    if UNPUBLISHED_MCP_IMAGE_PARAMETERS.intersection(params):
        _unsupported_media_spec()
    if capability.family == "ecommerce_image":
        payload = _ecommerce_image_payload(request, model, capability)
    else:
        aspect_ratio, resolution = _image_options(request, capability)
        payload = {
            "model": model,
            "prompt": request.user_query,
            "n": _mcp_image_count(params, capability),
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
        }

        pixel_size = _image_pixel_size(capability, aspect_ratio, resolution)
        if capability.family == "gemini_image":
            payload["size"] = aspect_ratio
            payload["image_size"] = resolution
            image_config = {"aspectRatio": aspect_ratio, "imageSize": resolution}
            payload["responseFormat"] = {"image": image_config}
            payload["generationConfig"] = {"imageConfig": image_config}
            payload["extra_body"] = {
                "google": {"image_config": {"aspect_ratio": aspect_ratio, "image_size": resolution}}
            }
        elif pixel_size:
            payload["size"] = pixel_size
        elif capability.family != "grok_image":
            _unsupported_media_spec()

    quality = _mcp_image_option(params, "quality", capability.qualities)
    if quality:
        payload["quality"] = quality
    output_format = _mcp_image_option(params, "output_format", capability.output_formats)
    if not output_format:
        output_format = _mcp_image_option(params, "response_format", capability.output_formats)
    if output_format:
        payload["output_format"] = output_format
    background = _mcp_image_option(params, "background", capability.backgrounds)
    if background:
        payload["background"] = background
    output_compression = _mcp_output_compression(params, capability)
    if output_compression is not None:
        payload["output_compression"] = output_compression

    return payload


def _video_options(request: WorkspaceRunRequest, capability: VideoModelCapability) -> tuple[int, str, str]:
    params = _media_params(request)
    raw_duration = _string_param(params, "duration", "duration_seconds", "seconds")
    if raw_duration:
        duration = _positive_int(raw_duration)
        if duration is None or duration not in capability.durations:
            _unsupported_media_spec()
    else:
        duration = capability.default_duration

    raw_size = _string_param(params, "size")
    size_ratio = VIDEO_SIZE_TO_ASPECT_RATIO.get(raw_size.casefold(), "") if raw_size else ""
    if raw_size and not size_ratio and not _canonical_option(raw_size, capability.resolutions):
        _unsupported_media_spec()
    raw_ratio = _string_param(params, "ratio", "aspect_ratio")
    if raw_ratio:
        aspect_ratio = _canonical_option(raw_ratio, capability.aspect_ratios)
        if not aspect_ratio or (size_ratio and aspect_ratio != size_ratio):
            _unsupported_media_spec()
    else:
        aspect_ratio = size_ratio or capability.default_aspect_ratio

    raw_resolution = _string_param(params, "resolution") or (raw_size if raw_size and not size_ratio else "")
    if raw_resolution:
        resolution = _canonical_option(raw_resolution, capability.resolutions)
        if not resolution:
            _unsupported_media_spec()
    else:
        resolution = capability.default_resolution
    return duration, aspect_ratio, resolution


def build_mcp_video_payload(request: WorkspaceRunRequest, model: str) -> dict[str, Any]:
    capability = VIDEO_MODEL_CAPABILITIES.get(model)
    if capability is None:
        raise MediaGenerationError(MEDIA_ERROR_MODEL_UNAVAILABLE)

    params = _media_params(request)
    duration, aspect_ratio, resolution = _video_options(request, capability)
    payload: dict[str, Any] = {
        "model": model,
        "prompt": request.user_query,
        "duration": duration,
        "duration_seconds": duration,
        "ratio": aspect_ratio,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }
    if "seed" in params and params["seed"] is not None:
        seed = _positive_int(params["seed"])
        if not capability.allow_seed or seed is None or seed < 0:
            _unsupported_media_spec()
        payload["seed"] = seed
    if "watermark" in params and params["watermark"] is not None:
        watermark = _boolean_value(params["watermark"])
        if not capability.allow_watermark or watermark is None:
            _unsupported_media_spec()
        payload["watermark"] = watermark
    return payload


def normalize_mcp_media_request(
    request: WorkspaceRunRequest,
    media_type: str,
    model: str,
) -> WorkspaceRunRequest:
    if media_type == "image":
        payload = build_mcp_image_payload(request, model)
    elif media_type == "video":
        payload = build_mcp_video_payload(request, model)
    else:
        raise MediaGenerationError(MEDIA_ERROR_MODEL_UNAVAILABLE)

    params = {key: value for key, value in payload.items() if key not in {"model", "prompt"}}
    return request.model_copy(update={"params": params})


@dataclass
class MediaResult:
    media_type: str
    model: str
    prompt: str
    urls: list[str] = field(default_factory=list)
    local_urls: list[str] = field(default_factory=list)
    raw_text: str = ""
    task_id: str = ""
    duration_ms: int = 0

    def markdown(self) -> str:
        label = "图像" if self.media_type == "image" else "视频"
        lines = [
            f"### {label}生成完成",
            "",
        ]
        if self.media_type == "image":
            for index, url in enumerate(self.local_urls, start=1):
                lines.append(f"![生成图片 {index}]({url})")
        else:
            for index, url in enumerate(self.local_urls, start=1):
                lines.append(f"[生成视频 {index}]({url})")
        return "\n".join(lines).strip()


def detect_media_kind(request: WorkspaceRunRequest) -> str | None:
    explicit = request.model_role
    if explicit == "image_generation":
        return "image"
    if explicit == "video_generation":
        return "video"
    mode = str(request.metadata.get("mode") or request.metadata.get("model_mode") or "").strip()
    if mode not in {"image", "video"}:
        return None
    text = normalize_intent_text(request.user_query)
    if not text:
        return None
    if any(hint in text for hint in NEGATION_HINTS):
        return None
    if mode == "video":
        return "video" if any(keyword in text for keyword in VIDEO_INTENT_KEYWORDS) else None
    if mode == "image":
        return "image" if any(keyword in text for keyword in IMAGE_INTENT_KEYWORDS) else None
    return None


def normalize_intent_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def selected_media_model(settings: Settings, request: WorkspaceRunRequest, media_type: str) -> str:
    role = "image_generation" if media_type == "image" else "video_generation"
    config = request.model_roles.model_dump()
    candidate = str(config.get(role) or "").strip()
    metadata = request.metadata if isinstance(request.metadata, dict) else {}
    mode_key = "image" if media_type == "image" else "video"
    configured_by_mode = mode_models_payload_from_metadata(metadata)
    if mode_key in configured_by_mode:
        allowed = configured_by_mode[mode_key]
    else:
        allowed = settings.image_allowed_models if media_type == "image" else settings.video_allowed_models
    if not allowed:
        raise MediaGenerationError(MEDIA_ERROR_MODEL_UNAVAILABLE)
    if candidate in allowed:
        return candidate
    default_model = settings.default_image_model if media_type == "image" else settings.default_video_model
    if default_model in allowed:
        return default_model
    return allowed[0]


async def generate_media(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    task: dict[str, Any],
    media_type: str,
) -> MediaResult:
    started = time.monotonic()
    model = selected_media_model(settings, request, media_type)
    workspace = Path(str(task["workspace"]))
    workspace.mkdir(parents=True, exist_ok=True)
    output_dir = workspace / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    if media_type == "image":
        result = await generate_image(settings, request, user, model)
    else:
        result = await generate_video(settings, request, user, model)
    result.duration_ms = int((time.monotonic() - started) * 1000)
    result.local_urls = await persist_remote_media(settings, user, task, output_dir, result)
    if not result.local_urls:
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE)
    return result


async def generate_image(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
    if request.task_type == "agent_image":
        payload = build_mcp_image_payload(request, model)
    else:
        payload: dict[str, Any] = {
            "model": model,
            "prompt": request.user_query,
            "n": int(request.params.get("n") or 1),
            "size": str(request.params.get("size") or request.params.get("resolution") or "1024x1024"),
        }
        for key in ("quality", "style", "response_format", "background", "moderation"):
            value = request.params.get(key)
            if value is not None and str(value):
                payload[key] = value
    payload["model"] = public_request_model_name(model, "image")
    image_inputs, mask_input = split_image_inputs_from_files(request)
    endpoint = f"{settings.new_api_base_url}/images/generations"
    if mask_input and not image_inputs:
        raise MediaGenerationError(MEDIA_ERROR_INPUT_UNSUPPORTED)
    if image_inputs:
        endpoint = f"{settings.new_api_base_url}/images/edits"
    timeout = httpx.Timeout(240.0, connect=10.0, read=240.0, write=30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if image_inputs:
                response = await post_image_edit(client, endpoint, user.api_key, payload, image_inputs, mask_input)
            else:
                response = await client.post(endpoint, headers=auth_headers(user.api_key), json=payload)
    except httpx.HTTPError as exc:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE) from exc
    if response.status_code >= 400:
        raise MediaGenerationError(upstream_error(settings, user.api_key, response))
    try:
        body = response.json()
    except ValueError as exc:
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE) from exc
    urls = extract_media_urls(body, "image")
    if not urls:
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE)
    return MediaResult(media_type="image", model=model, prompt=request.user_query, urls=urls, raw_text=json.dumps(body, ensure_ascii=False)[:4000])


async def generate_video(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
    mcp_payload: dict[str, Any] | None = None
    if request.task_type == "agent_video":
        request = normalize_mcp_media_request(request, "video", model)
        mcp_payload = build_mcp_video_payload(request, model)
    if model in OFFICIAL_SEEDANCE_REFERENCE_MODELS:
        return await generate_official_seedance_video(settings, request, user, model)
    if model in MOONAPIX_SEEDANCE_VIDEO_MODELS:
        return await generate_moonapix_seedance_video(settings, request, user, model)

    headers = auth_headers(user.api_key)
    content: list[dict[str, Any]] = [{"type": "text", "text": request.user_query}]
    for file in request.files[:10]:
        if file.content.startswith("data:image/"):
            content.append({"type": "image_url", "image_url": {"url": file.content}})
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": content if len(content) > 1 else request.user_query,
            }
        ],
        "stream": False,
    }
    if mcp_payload is not None:
        payload.update({key: value for key, value in mcp_payload.items() if key not in {"model", "prompt"}})
    else:
        for key in ("duration", "duration_seconds", "size", "ratio", "resolution", "quality", "fps"):
            value = request.params.get(key)
            if value is not None and str(value):
                payload[key] = value
    timeout = httpx.Timeout(480.0, connect=10.0, read=480.0, write=30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{settings.new_api_base_url}/chat/completions", headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE) from exc
    if response.status_code >= 400:
        raise MediaGenerationError(upstream_error(settings, user.api_key, response))
    text = ""
    try:
        body = response.json()
        text = extract_text_response(body) or json.dumps(body, ensure_ascii=False)[:4000]
        urls = extract_media_urls(body, "video") or VIDEO_URL_RE.findall(text)
    except ValueError:
        text = ""
        urls = []
    if not urls:
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE)
    return MediaResult(media_type="video", model=model, prompt=request.user_query, urls=dedupe(urls), raw_text=text)


async def generate_moonapix_seedance_video(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
    payload: dict[str, Any] = {
        "model": model,
        "prompt": request.user_query,
        "duration": moonapix_seedance_duration(request.params),
        "ratio": video_ratio_from_request(request),
        "resolution": moonapix_seedance_resolution(model, request.params),
    }
    validate_moonapix_seedance_reference_inputs(model, request)
    references = moonapix_seedance_references(model, request)
    if references:
        payload["references"] = references
        image_urls = [item["url"] for item in references if item["media_type"] == "image"]
        video_urls = [item["url"] for item in references if item["media_type"] == "video"]
        if image_urls:
            payload["images"] = [{"url": url, "role": "first_frame" if index == 0 else "reference_image"} for index, url in enumerate(image_urls)]
            payload["image_url"] = image_urls[0]
            payload["first_frame_url"] = image_urls[0]
        if video_urls:
            payload["video_url"] = video_urls[0]
            payload["reference_video_url"] = video_urls[0]
    for key in ("watermark", "seed", "callback_url"):
        value = request.params.get(key)
        if value is not None and str(value):
            payload[key] = value
    timeout = httpx.Timeout(480.0, connect=10.0, read=480.0, write=30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{settings.new_api_base_url}/videos",
                headers=auth_headers(user.api_key),
                json=payload,
            )
            if response.status_code >= 400:
                raise MediaGenerationError(upstream_error(settings, user.api_key, response))
            try:
                body = response.json()
            except ValueError as exc:
                raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE) from exc
            urls = extract_media_urls(body, "video")
            task_id = video_task_id(body)
            if not urls and task_id:
                body = await poll_official_seedance_video(client, settings, user, task_id)
                urls = extract_media_urls(body, "video")
            text = json.dumps(body, ensure_ascii=False)[:4000]
    except httpx.HTTPError as exc:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE) from exc
    if not urls:
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE)
    return MediaResult(media_type="video", model=model, prompt=request.user_query, urls=dedupe(urls), raw_text=text, task_id=task_id)


async def generate_official_seedance_video(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
    payload: dict[str, Any] = {
        "model": model,
        "prompt": request.user_query,
        "duration": official_seedance_duration(model, request.params),
        "ratio": video_ratio_from_request(request),
    }
    if model == "seedance-2.0-dj-fast":
        payload["resolution"] = "720P"
    references = official_seedance_references(model, request)
    if references:
        payload["references"] = references
    timeout = httpx.Timeout(480.0, connect=10.0, read=480.0, write=30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{settings.new_api_base_url}/videos",
                headers=auth_headers(user.api_key),
                json=payload,
            )
            if response.status_code >= 400:
                raise MediaGenerationError(upstream_error(settings, user.api_key, response))
            try:
                body = response.json()
            except ValueError as exc:
                raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE) from exc
            urls = extract_media_urls(body, "video")
            task_id = video_task_id(body)
            if not urls and task_id:
                body = await poll_official_seedance_video(client, settings, user, task_id)
                urls = extract_media_urls(body, "video")
            text = json.dumps(body, ensure_ascii=False)[:4000]
    except httpx.HTTPError as exc:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE) from exc
    if not urls:
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE)
    return MediaResult(media_type="video", model=model, prompt=request.user_query, urls=dedupe(urls), raw_text=text, task_id=task_id)


async def poll_official_seedance_video(
    client: httpx.AsyncClient,
    settings: Settings,
    user: UserContext,
    task_id: str,
) -> dict[str, Any]:
    deadline = time.monotonic() + 480
    interval = 3.0
    last_body: dict[str, Any] = {}
    while time.monotonic() < deadline:
        await asyncio.sleep(interval)
        try:
            response = await client.get(
                f"{settings.new_api_base_url}/videos/{task_id}",
                headers=auth_headers(user.api_key),
            )
        except httpx.HTTPError as exc:
            raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE) from exc
        if response.status_code >= 400:
            raise MediaGenerationError(upstream_error(settings, user.api_key, response))
        try:
            body = response.json()
        except ValueError:
            last_body = {"raw": response.text[:4000]}
            continue
        last_body = body
        status = str(body.get("status") or body.get("data", {}).get("status") or "").lower()
        if extract_media_urls(body, "video"):
            return body
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise MediaGenerationError(video_failure_reason(body))
        if interval < 8:
            interval += 1
    if last_body:
        return last_body
    raise MediaGenerationError(MEDIA_ERROR_TIMEOUT)


def official_seedance_duration(model: str, params: dict[str, Any]) -> int:
    raw = params.get("duration") or params.get("duration_seconds") or params.get("seconds")
    try:
        value = int(float(str(raw)))
    except (TypeError, ValueError):
        value = 10 if model == "seedance-2.0-dj-fast" else 8
    if model == "seedance-2.0-dj-fast":
        if value <= 5:
            return 5
        if value <= 10:
            return 10
        return 15
    return max(5, min(15, value))


def moonapix_seedance_duration(params: dict[str, Any]) -> int:
    raw = params.get("duration") or params.get("duration_seconds") or params.get("seconds")
    try:
        value = int(float(str(raw)))
    except (TypeError, ValueError):
        value = 4
    return max(4, min(15, value))


def moonapix_seedance_resolution(model: str, params: dict[str, Any]) -> str:
    value = str(params.get("resolution") or params.get("size") or "").strip().lower()
    if model in {"seedance-2.0-cl-fast", "seedance-2.0-cl", "seedance-2.0-cl-mini"}:
        return "480p" if value == "480p" else "720p"
    return "720p"


def video_ratio_from_request(request: WorkspaceRunRequest) -> str:
    ratio = str(request.params.get("ratio") or request.params.get("aspect_ratio") or "").strip()
    if ratio in {"16:9", "9:16", "1:1", "4:3", "3:4"}:
        return ratio
    size = str(request.params.get("size") or "").strip().lower()
    if size in {"720x1280", "1080x1920"}:
        return "9:16"
    return "16:9"


def official_seedance_references(model: str, request: WorkspaceRunRequest) -> list[dict[str, str]]:
    limits = {"image": 10, "video": 0, "audio": 0}
    if model == "seedance-2.0-ld-17":
        limits = {"image": 9, "video": 3, "audio": 3}
    counts = {"image": 0, "video": 0, "audio": 0}
    references: list[dict[str, str]] = []
    for file in request.files:
        media_type = workspace_file_media_type(file)
        if media_type not in limits or limits[media_type] <= 0:
            continue
        if counts[media_type] >= limits[media_type]:
            continue
        if media_type == "audio" and model != "seedance-2.0-ld-17":
            continue
        counts[media_type] += 1
        role = {
            "image": "first_frame" if counts[media_type] == 1 else "reference_image",
            "video": "reference_video",
            "audio": "reference_audio",
        }[media_type]
        references.append(
            {
                "media_type": media_type,
                "role": role,
                "url": file.content,
                "alias": f"{media_type}{counts[media_type]}",
            }
        )
    if counts["audio"] and not (counts["image"] or counts["video"]):
        return [item for item in references if item["media_type"] != "audio"]
    return references


def moonapix_seedance_references(model: str, request: WorkspaceRunRequest) -> list[dict[str, str]]:
    allow_video = model == "seedance-2.0-cl-mini"
    counts = {"image": 0, "video": 0}
    references: list[dict[str, str]] = []
    for file in request.files:
        media_type = workspace_file_media_type(file)
        if media_type not in counts:
            continue
        if media_type == "video" and not allow_video:
            continue
        if media_type == "image" and counts[media_type] >= 10:
            continue
        if media_type == "video" and counts[media_type] >= 1:
            continue
        url = public_media_reference_url(file)
        if not url:
            continue
        counts[media_type] += 1
        role = {
            "image": "first_frame" if counts[media_type] == 1 else "reference_image",
            "video": "reference_video",
        }[media_type]
        references.append(
            {
                "media_type": media_type,
                "role": role,
                "url": url,
                "alias": f"{media_type}{counts[media_type]}",
            }
        )
    return references


def validate_moonapix_seedance_reference_inputs(model: str, request: WorkspaceRunRequest) -> None:
    unsupported_local: list[str] = []
    unsupported_audio: list[str] = []
    unsupported_video: list[str] = []
    for file in request.files:
        media_type = workspace_file_media_type(file)
        if media_type not in {"image", "video", "audio"}:
            continue
        if media_type == "audio":
            unsupported_audio.append(file.path)
            continue
        if not public_media_reference_url(file):
            unsupported_local.append(file.path)
            continue
        if media_type == "video" and model != "seedance-2.0-cl-mini":
            unsupported_video.append(file.path)
    if unsupported_local:
        raise MediaGenerationError(MEDIA_ERROR_INPUT_UNSUPPORTED)
    if unsupported_audio:
        raise MediaGenerationError(MEDIA_ERROR_INPUT_UNSUPPORTED)
    if unsupported_video:
        raise MediaGenerationError(MEDIA_ERROR_INPUT_UNSUPPORTED)


def public_media_reference_url(file: Any) -> str:
    content = str(getattr(file, "content", "") or "").strip()
    if content.startswith("Asset://"):
        return content
    if is_public_http_url(content):
        return content
    return ""


def workspace_file_media_type(file: Any) -> str:
    content = str(getattr(file, "content", "") or "").lower()
    path = str(getattr(file, "path", "") or "").lower()
    if content.startswith("data:image/") or re.search(r"\.(png|jpe?g|webp|gif)$", path) or IMAGE_URL_RE.match(content):
        return "image"
    if content.startswith("data:video/") or re.search(r"\.(mp4|webm|mov|m4v)$", path) or VIDEO_URL_RE.match(content):
        return "video"
    if content.startswith("data:audio/") or re.search(r"\.(mp3|m4a|aac|wav)$", path):
        return "audio"
    return "unknown"


def video_task_id(body: dict[str, Any]) -> str:
    for key in ("task_id", "id"):
        value = body.get(key)
        if isinstance(value, str) and value:
            return value
    data = body.get("data")
    if isinstance(data, dict):
        for key in ("task_id", "id"):
            value = data.get(key)
            if isinstance(value, str) and value:
                return value
    return ""


def video_failure_reason(body: dict[str, Any]) -> str:
    _ = body
    return MEDIA_ERROR_SERVICE_UNAVAILABLE


async def persist_remote_media(
    settings: Settings,
    user: UserContext,
    task: dict[str, Any],
    output_dir: Path,
    result: MediaResult,
    *,
    timeout_seconds: float | None = None,
) -> list[str]:
    local_urls: list[str] = []
    deadline = time.monotonic() + timeout_seconds if timeout_seconds is not None and timeout_seconds > 0 else None
    timeout = httpx.Timeout(90.0, connect=10.0, read=90.0, write=20.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        for index, url in enumerate(result.urls[:4], start=1):
            remaining_seconds = None if deadline is None else deadline - time.monotonic()
            if remaining_seconds is not None and remaining_seconds <= 0:
                break
            if url.startswith("data:image/"):
                target = output_dir / f"{result.media_type}-{index}-{uuid4().hex[:8]}.png"
                try:
                    header, encoded = url.split(",", 1)
                    target.write_bytes(base64.b64decode(encoded, validate=True))
                    local_urls.append(
                        f"{settings.public_base_url}/api/tasks/{task['task_id']}/files/outputs/{target.name}"
                    )
                    continue
                except Exception:
                    continue
            if not is_public_http_url(url):
                continue
            suffix = suffix_for_url(url, result.media_type)
            target = output_dir / f"{result.media_type}-{index}-{uuid4().hex[:8]}{suffix}"
            try:
                if remaining_seconds is None:
                    content = await fetch_limited_media(client, url, result.media_type)
                else:
                    content = await asyncio.wait_for(
                        fetch_limited_media(client, url, result.media_type),
                        timeout=remaining_seconds,
                    )
            except TimeoutError:
                break
            except Exception:
                continue
            if not content:
                continue
            target.write_bytes(content)
            local_urls.append(
                f"{settings.public_base_url}/api/tasks/{task['task_id']}/files/outputs/{target.name}"
            )
    return local_urls


def auth_headers(api_key: str, content_type: str | None = "application/json") -> dict[str, str]:
    if content_type is None:
        return {"Authorization": f"Bearer {api_key}"}
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


async def post_image_edit(
    client: httpx.AsyncClient,
    endpoint: str,
    api_key: str,
    payload: dict[str, Any],
    image_inputs: list[str],
    mask_input: str,
) -> httpx.Response:
    data = {
        key: json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
        for key, value in payload.items()
        if value is not None
    }
    files: list[tuple[str, tuple[str, bytes, str]]] = []
    for index, item in enumerate(image_inputs[:10], start=1):
        decoded = decode_data_url_image(item)
        if not decoded:
            continue
        mime, content = decoded
        files.append(("image", (f"image-{index}{image_suffix_for_mime(mime)}", content, mime)))
    if mask_input:
        decoded_mask = decode_data_url_image(mask_input)
        if decoded_mask:
            mime, content = decoded_mask
            files.append(("mask", (f"mask{image_suffix_for_mime(mime)}", content, mime)))
    if not files:
        return await client.post(endpoint, headers=auth_headers(api_key), json=payload)
    return await client.post(endpoint, headers=auth_headers(api_key, None), data=data, files=files)


def split_image_inputs_from_files(request: WorkspaceRunRequest) -> tuple[list[str], str]:
    values: list[str] = []
    mask = ""
    for file in request.files:
        if file.content.startswith("data:image/"):
            path = str(file.path or "").lower()
            if is_mask_file_path(path):
                if not mask:
                    mask = file.content
                continue
            values.append(file.content)
    return values[:10], mask


def is_mask_file_path(path: str) -> bool:
    return path.startswith("__mask__/") or "mask" in path or "蒙版" in path


def decode_data_url_image(value: str) -> tuple[str, bytes] | None:
    if not value.startswith("data:image/") or "," not in value:
        return None
    header, encoded = value.split(",", 1)
    mime = header.removeprefix("data:").split(";", 1)[0].strip().lower() or "image/png"
    try:
        return mime, base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        return None


def image_suffix_for_mime(mime: str) -> str:
    if "jpeg" in mime or "jpg" in mime:
        return ".jpg"
    if "webp" in mime:
        return ".webp"
    return ".png"


def extract_media_urls(payload: Any, media_type: str) -> list[str]:
    urls: list[str] = []
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            for item in data:
                urls.extend(extract_media_urls(item, media_type))
        for key in ("url", "image_url", "video_url", "output_url", "download_url"):
            value = payload.get(key)
            if isinstance(value, str) and value.startswith("http"):
                urls.append(value)
        b64 = payload.get("b64_json")
        if media_type == "image" and isinstance(b64, str) and b64:
            urls.append(f"data:image/png;base64,{b64}")
        for value in payload.values():
            if isinstance(value, (dict, list)):
                urls.extend(extract_media_urls(value, media_type))
            elif isinstance(value, str):
                pattern = VIDEO_URL_RE if media_type == "video" else IMAGE_URL_RE
                urls.extend(pattern.findall(value))
    elif isinstance(payload, list):
        for item in payload:
            urls.extend(extract_media_urls(item, media_type))
    return dedupe(urls)


def extract_text_response(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    choice = choices[0]
    if not isinstance(choice, dict):
        return ""
    message = choice.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "\n".join(str(item.get("text") or item.get("content") or "") for item in content if isinstance(item, dict))
    return str(choice.get("text") or "")


def suffix_for_url(url: str, media_type: str) -> str:
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"} if media_type == "image" else {".mp4", ".webm", ".mov", ".m4v"}
    if suffix in allowed:
        return suffix
    return ".png" if media_type == "image" else ".mp4"


def is_public_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").strip().lower()
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        return False
    if not host or host in {"localhost", "0.0.0.0"} or host.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return True
    return is_public_media_address(address)


def is_public_media_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return address.is_global and not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


async def resolve_public_media_host(host: str, port: int) -> tuple[str, ...]:
    try:
        addresses = await asyncio.get_running_loop().getaddrinfo(
            host,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except (OSError, ValueError, UnicodeError):
        return ()
    return tuple(dict.fromkeys(str(item[4][0]).split("%", 1)[0] for item in addresses if item[4]))


async def resolve_public_media_target(url: str) -> tuple[httpx.URL, str, str] | None:
    if not is_public_http_url(url):
        return None
    try:
        target = httpx.URL(url)
        host = target.host
    except (httpx.InvalidURL, ValueError):
        return None
    if not host:
        return None
    default_port = 443 if target.scheme == "https" else 80
    port = target.port if target.port is not None else default_port
    if not 1 <= port <= 65535:
        return None
    addresses = await resolve_public_media_host(host, port)
    if not addresses:
        return None
    try:
        parsed_addresses = tuple(ipaddress.ip_address(address) for address in addresses)
    except ValueError:
        return None
    if not all(is_public_media_address(address) for address in parsed_addresses):
        return None
    try:
        connected_url = target.copy_with(host=str(parsed_addresses[0]))
    except (httpx.InvalidURL, ValueError):
        return None
    origin_host = f"[{host}]" if ":" in host else host
    host_header = origin_host if port == default_port else f"{origin_host}:{port}"
    return connected_url, host_header, host


async def fetch_limited_media(client: httpx.AsyncClient, url: str, media_type: str) -> bytes:
    limit = MAX_REMOTE_IMAGE_BYTES if media_type == "image" else MAX_REMOTE_VIDEO_BYTES
    target_url = url
    for _ in range(MAX_MEDIA_REDIRECTS + 1):
        target = await resolve_public_media_target(target_url)
        if target is None:
            return b""
        connected_url, host_header, sni_hostname = target
        try:
            async with client.stream(
                "GET",
                connected_url,
                headers={"Host": host_header},
                extensions={"sni_hostname": sni_hostname},
                follow_redirects=False,
            ) as response:
                if 300 <= response.status_code < 400:
                    location = str(response.headers.get("location") or "").strip()
                    if not location:
                        return b""
                    target_url = urljoin(target_url, location)
                    continue
                if response.status_code >= 400:
                    return b""
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > limit:
                    return b""
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > limit:
                        return b""
                    chunks.append(chunk)
                return b"".join(chunks)
        except (httpx.HTTPError, OSError, ValueError):
            return b""
    return b""


def dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def upstream_error(settings: Settings, api_key: str, response: httpx.Response) -> str:
    _ = settings, api_key
    if response.status_code in {403, 404}:
        return MEDIA_ERROR_MODEL_UNAVAILABLE
    if response.status_code in {400, 413, 415, 422}:
        return MEDIA_ERROR_INPUT_UNSUPPORTED
    if response.status_code in {408, 504}:
        return MEDIA_ERROR_TIMEOUT
    return MEDIA_ERROR_SERVICE_UNAVAILABLE


class MediaGenerationError(Exception):
    pass
