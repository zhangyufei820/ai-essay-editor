from time import time
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, Response
import re

from app.config import Settings, get_settings
from app.relaydance_client import RelayDanceClient, normalize_video_provider_body, public_body, validate_model, video_generation_body
from app.schemas import (
    AssetCreateRequest,
    DifyVideoCreateRequest,
    GatewayResponse,
    GenerationMetadata,
    ImageUrl,
    RawRequest,
    UploadUrlRequest,
    VideoContentItem,
    VideoGenerationRequest,
    canonical_model,
)

router = APIRouter(prefix="/api/v1", tags=["video"])
compat_router = APIRouter(prefix="/v1", tags=["openai-video-compatible"])

IMAGE_INTENT_PATTERNS = (
    re.compile(r"生成(?:图片|图像|图)(?!.*(?:视频|短片|影片|mp4))", re.IGNORECASE),
    re.compile(r"(?:^|[\s，。,.；;、])(?:画|绘制)(?:一张|一幅|一个|张|个|幅|图|图片|图像|海报|插图|头像|logo|图标)", re.IGNORECASE),
    re.compile(r"(?:海报|封面图|配图|插图|头像|logo|图标|壁纸|表情包)", re.IGNORECASE),
    re.compile(r"\b(?:generate|create|make)\s+(?:an?\s+)?(?:image|picture|poster|illustration|cover|logo|icon)\b", re.IGNORECASE),
)

VIDEO_INTENT_PATTERNS = (
    re.compile(r"(?:生成|制作|合成|创建).*(?:视频|短片|影片|mp4)", re.IGNORECASE),
    re.compile(r"(?:图片|图像|首帧|尾帧).*(?:转视频|生成视频|视频)", re.IGNORECASE),
    re.compile(r"(?:图生视频|文生视频|首尾帧|视频生成|短视频|运镜|镜头生成)", re.IGNORECASE),
    re.compile(r"\b(?:video|mp4|image-to-video|text-to-video|short film|clip)\b", re.IGNORECASE),
)


def looks_like_image_request(prompt: str) -> bool:
    if any(pattern.search(prompt) for pattern in VIDEO_INTENT_PATTERNS):
        return False
    return any(pattern.search(prompt) for pattern in IMAGE_INTENT_PATTERNS)


def client_dep(settings: Settings = Depends(get_settings)) -> RelayDanceClient:
    return RelayDanceClient(settings)


def build_generation_from_dify(body: DifyVideoCreateRequest, settings: Settings) -> tuple[VideoGenerationRequest, list[str]]:
    warnings: list[str] = []
    if looks_like_image_request(body.prompt):
        raise ValueError("这看起来是图片生成请求，请改用图片生成功能。")
    content: list[VideoContentItem] = []
    if body.first_frame_url:
        content.append(VideoContentItem(image_url=ImageUrl(url=body.first_frame_url), role="first_frame"))
    if body.last_frame_url:
        if settings.enable_last_frame:
            content.append(VideoContentItem(image_url=ImageUrl(url=body.last_frame_url), role="last_frame"))
        else:
            warnings.append("当前视频服务暂不支持尾帧参数，已自动忽略。")

    metadata = GenerationMetadata(
        ratio=body.ratio,
        resolution=body.resolution,
        generate_audio=body.generate_audio,
        watermark=body.watermark,
        content=content or None,
    )
    return VideoGenerationRequest(
        model=body.model,
        prompt=body.prompt,
        seconds=body.seconds,
        metadata=metadata,
    ), warnings


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else ""


def _ratio_from_size(size: Any, width: Any = None, height: Any = None) -> str:
    if isinstance(size, str) and "x" in size.lower():
        left, right = size.lower().split("x", 1)
        try:
            width_value = int(left)
            height_value = int(right)
        except ValueError:
            width_value = height_value = 0
    else:
        try:
            width_value = int(width or 0)
            height_value = int(height or 0)
        except (TypeError, ValueError):
            width_value = height_value = 0

    if width_value <= 0 or height_value <= 0:
        return "16:9"
    if width_value == height_value:
        return "1:1"
    return "16:9" if width_value > height_value else "9:16"


def _resolution_from_model(model: str, metadata: dict[str, Any], body: dict[str, Any]) -> str:
    explicit = _as_text(metadata.get("resolution")) or _as_text(body.get("resolution"))
    if explicit:
        return explicit
    if model.endswith("-1080p"):
        return "1080p"
    return "720p"


def build_openai_provider_body(body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    metadata = _as_dict(body.get("metadata"))
    model = canonical_model(_as_text(body.get("model")) or "seedance-nsfw")
    seconds = str(body.get("seconds") or body.get("duration") or "5")
    size = _as_text(body.get("size")) or "1280x720"
    provider_body = dict(body)
    provider_body["model"] = model
    provider_body["prompt"] = _as_text(body.get("prompt"))
    provider_body["seconds"] = seconds
    if size:
        provider_body["size"] = size
    if not provider_body.get("ratio"):
        provider_body["ratio"] = _as_text(metadata.get("ratio")) or _ratio_from_size(
            size,
            body.get("width"),
            body.get("height"),
        )
    if not provider_body.get("resolution"):
        provider_body["resolution"] = _resolution_from_model(model, metadata, body)
    provider_body = normalize_video_provider_body(provider_body)
    return provider_body, {
        "model": model,
        "seconds": seconds,
        "size": size,
    }


def _compatible_status(status: str, success: bool = True) -> str:
    text = (status or "").lower()
    if text in {"completed", "succeeded", "success", "done"}:
        return "completed"
    if text in {"failed", "failure", "error", "cancelled"}:
        return "failed"
    if text in {"processing", "running", "in_progress"}:
        return "in_progress"
    if text in {"queued", "pending", "submitted"}:
        return "queued"
    return "queued" if success else "failed"


def _compatible_video_response(
    payload: GatewayResponse,
    *,
    task_id: str = "",
    model: str = "",
    seconds: str = "",
    size: str = "",
) -> dict[str, Any]:
    resolved_task_id = task_id or payload.task_id
    status = _compatible_status(payload.status, payload.success)
    progress = payload.progress
    if progress is None:
        progress = 100 if status == "completed" else 0

    body: dict[str, Any] = {
        "id": resolved_task_id,
        "task_id": resolved_task_id,
        "object": "video",
        "model": model,
        "status": status,
        "progress": progress,
        "created_at": int(time()),
    }
    if seconds:
        body["seconds"] = seconds
    if size:
        body["size"] = size
    if payload.video_url:
        body["metadata"] = {"url": payload.video_url}
    if status == "failed":
        body["error"] = {
            "message": payload.message or "视频任务失败。",
            "code": payload.provider_code or "service_error",
        }
    return body


def _provider_error_response(payload: GatewayResponse) -> JSONResponse:
    status_code = payload.status_code if payload.status_code >= 400 else 502
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "message": payload.message or "服务暂时不可用，请稍后重试。",
                "code": payload.provider_code or "service_error",
            }
        },
    )


@router.post("/video/generations", response_model=GatewayResponse)
async def submit_generation(
    body: VideoGenerationRequest,
    client: RelayDanceClient = Depends(client_dep),
    settings: Settings = Depends(get_settings),
) -> GatewayResponse:
    validate_model(body.model, settings)
    return await client.request(
        "POST",
        "/v1/video/generations",
        json_body=video_generation_body(body),
    )


@compat_router.post("/videos", response_model=None)
async def submit_openai_compatible_video(
    body: dict[str, Any],
    client: RelayDanceClient = Depends(client_dep),
    settings: Settings = Depends(get_settings),
) -> Any:
    provider_body, response_meta = build_openai_provider_body(body)
    validate_model(response_meta["model"], settings)
    response = await client.request(
        "POST",
        "/v1/videos",
        json_body=provider_body,
    )
    if not response.success or not response.task_id:
        return _provider_error_response(response)
    return _compatible_video_response(response, **response_meta)


@router.post("/video/create", response_model=GatewayResponse)
async def create_video(
    body: DifyVideoCreateRequest,
    client: RelayDanceClient = Depends(client_dep),
    settings: Settings = Depends(get_settings),
) -> GatewayResponse:
    generation, warnings = build_generation_from_dify(body, settings)
    validate_model(generation.model, settings)
    return await client.request(
        "POST",
        "/v1/video/generations",
        json_body=video_generation_body(generation),
        warnings=warnings,
    )


@router.get("/videos/{task_id}", response_model=GatewayResponse)
async def get_video_task(
    task_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    return await client.video_status(task_id)


@compat_router.get("/videos/{task_id}", response_model=None)
async def get_openai_compatible_video_task(
    task_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> Any:
    response = await client.video_status(task_id)
    if not response.success:
        return _provider_error_response(response)
    return _compatible_video_response(response, task_id=task_id)


@router.get("/videos/{task_id}/content")
async def get_video_content(
    task_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> Response:
    status_code, content_type, content, headers = await client.content(task_id)
    return Response(content=content, status_code=status_code, media_type=content_type, headers=headers)


@compat_router.get("/videos/{task_id}/content")
async def get_openai_compatible_video_content(
    task_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> Response:
    status_code, content_type, content, headers = await client.content(task_id)
    return Response(content=content, status_code=status_code, media_type=content_type, headers=headers)


@router.get("/upload-url", response_model=GatewayResponse)
async def get_upload_url(
    ext: str,
    md5: str,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    request = UploadUrlRequest(ext=ext, md5=md5)
    return await client.request(
        "GET",
        "/api/upload-url",
        query=public_body(request),
        base_url="https://pay.relaydance.com",
    )


@router.post("/assets/virtual/create", response_model=GatewayResponse)
async def create_asset(
    body: AssetCreateRequest,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    return await client.request(
        "POST",
        "/api/assets/virtual/create",
        json_body=public_body(body),
        base_url="https://pay.relaydance.com",
    )


@router.get("/assets/{asset_id}/status", response_model=GatewayResponse)
async def get_asset_status(
    asset_id: str,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    return await client.request(
        "GET",
        f"/api/assets/{asset_id}/status",
        base_url="https://pay.relaydance.com",
        retry=True,
    )


@router.post("/raw", response_model=GatewayResponse)
async def raw(
    body: RawRequest,
    client: RelayDanceClient = Depends(client_dep),
) -> GatewayResponse:
    base_url = "https://pay.relaydance.com" if body.path.startswith("/api/") else None
    return await client.request(
        body.method.value,
        body.path,
        json_body=body.body,
        query=body.query,
        base_url=base_url,
    )
