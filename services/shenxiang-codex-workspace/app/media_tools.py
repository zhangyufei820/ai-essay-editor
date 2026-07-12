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
from urllib.parse import urljoin, urlsplit, urlunsplit
from uuid import uuid4

import httpx

from app.config import Settings, secret_values_for_redaction
from app.model_access import mode_models_from_metadata, mode_models_payload_from_metadata
from app.models import WorkspaceRunRequest
from app.security import UserContext, redact


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
MAX_REMOTE_MEDIA_REDIRECTS = 3
REMOTE_MEDIA_DNS_TIMEOUT_SECONDS = 5.0


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
            for index, url in enumerate(self.local_urls or self.urls, start=1):
                lines.append(f"![生成图片 {index}]({url})")
        else:
            for index, url in enumerate(self.local_urls or self.urls, start=1):
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
    configured = mode_models_from_metadata(metadata, "image" if media_type == "image" else "video")
    allowed = set(configured or (settings.image_allowed_models if media_type == "image" else settings.video_allowed_models))
    mode_key = "image" if media_type == "image" else "video"
    if mode_key in mode_models_payload_from_metadata(metadata) and not allowed:
        raise MediaGenerationError(f"当前账号没有可用的{ '图像' if media_type == 'image' else '视频' }模型权限。")
    if candidate in allowed:
        return candidate
    default_model = settings.default_image_model if media_type == "image" else settings.default_video_model
    if default_model in allowed:
        return default_model
    return next(iter(allowed), default_model)


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
    result.urls = list(result.local_urls)
    if not result.urls:
        raise MediaGenerationError("媒体结果未通过安全下载校验，请稍后重试。")
    return result


async def generate_image(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
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
    image_inputs, mask_input = split_image_inputs_from_files(request)
    endpoint = f"{settings.new_api_base_url}/images/generations"
    if mask_input and not image_inputs:
        raise MediaGenerationError("局部编辑需要同时上传原图和 mask 蒙版 PNG。mask 必须和原图尺寸完全一致。")
    if image_inputs:
        endpoint = f"{settings.new_api_base_url}/images/edits"
    timeout = httpx.Timeout(240.0, connect=10.0, read=240.0, write=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        if image_inputs:
            response = await post_image_edit(client, endpoint, user.api_key, payload, image_inputs, mask_input)
        else:
            response = await client.post(endpoint, headers=auth_headers(user.api_key), json=payload)
    if response.status_code >= 400:
        raise MediaGenerationError(upstream_error(settings, user.api_key, response))
    try:
        body = response.json()
    except ValueError as exc:
        raise MediaGenerationError("图像服务没有返回有效结果。") from exc
    urls = extract_media_urls(body, "image")
    if not urls:
        raise MediaGenerationError("图像服务没有返回可展示结果，请重试或更换图像模型。")
    return MediaResult(media_type="image", model=model, prompt=request.user_query, urls=urls, raw_text=json.dumps(body, ensure_ascii=False)[:4000])


async def generate_video(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
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
    for key in ("duration", "duration_seconds", "size", "ratio", "resolution", "quality", "fps"):
        value = request.params.get(key)
        if value is not None and str(value):
            payload[key] = value
    timeout = httpx.Timeout(480.0, connect=10.0, read=480.0, write=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{settings.new_api_base_url}/chat/completions", headers=headers, json=payload)
    if response.status_code >= 400:
        raise MediaGenerationError(upstream_error(settings, user.api_key, response))
    text = ""
    try:
        body = response.json()
        text = extract_text_response(body) or json.dumps(body, ensure_ascii=False)[:4000]
        urls = extract_media_urls(body, "video") or VIDEO_URL_RE.findall(text)
    except ValueError:
        text = response.text[:4000]
        urls = VIDEO_URL_RE.findall(text)
    if not urls:
        raise MediaGenerationError("视频服务没有返回可展示结果，请重试或更换视频模型。")
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
            raise MediaGenerationError("视频服务没有返回有效任务。") from exc
        urls = extract_media_urls(body, "video")
        task_id = video_task_id(body)
        if not urls and task_id:
            body = await poll_official_seedance_video(client, settings, user, task_id)
            urls = extract_media_urls(body, "video")
        text = json.dumps(body, ensure_ascii=False)[:4000]
    if not urls:
        raise MediaGenerationError("视频服务没有返回可展示结果，请重试或更换视频模型。")
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
            raise MediaGenerationError("视频服务没有返回有效任务。") from exc
        urls = extract_media_urls(body, "video")
        task_id = video_task_id(body)
        if not urls and task_id:
            body = await poll_official_seedance_video(client, settings, user, task_id)
            urls = extract_media_urls(body, "video")
        text = json.dumps(body, ensure_ascii=False)[:4000]
    if not urls:
        raise MediaGenerationError("视频服务没有返回可展示结果，请重试或更换视频模型。")
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
        response = await client.get(
            f"{settings.new_api_base_url}/videos/{task_id}",
            headers=auth_headers(user.api_key),
        )
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
            raise MediaGenerationError(video_failure_reason(body) or "视频任务失败。")
        if interval < 8:
            interval += 1
    if last_body:
        return last_body
    raise MediaGenerationError("视频生成等待超时，请稍后到任务日志查看结果。")


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
        raise MediaGenerationError(
            "视频参考素材需要公网 URL 或 Asset:// 引用；云端 Codex 暂不能把本地上传文件直接作为参考素材。"
        )
    if unsupported_audio:
        raise MediaGenerationError("该视频模型暂不接收音频参考，请移除音频素材。")
    if unsupported_video:
        raise MediaGenerationError("当前视频模型只支持图片参考，请移除视频素材或切换到 CL Mini。")


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
    for key in ("error", "message", "fail_reason"):
        value = body.get(key)
        if isinstance(value, str) and value:
            return value
        if isinstance(value, dict):
            message = value.get("message")
            if isinstance(message, str) and message:
                return message
    data = body.get("data")
    if isinstance(data, dict):
        return video_failure_reason(data)
    return ""


async def persist_remote_media(
    settings: Settings,
    user: UserContext,
    task: dict[str, Any],
    output_dir: Path,
    result: MediaResult,
) -> list[str]:
    local_urls: list[str] = []
    timeout = httpx.Timeout(90.0, connect=10.0, read=90.0, write=20.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False) as client:
        for index, url in enumerate(result.urls[:4], start=1):
            if url.startswith("data:image/"):
                try:
                    header, encoded = url.split(",", 1)
                    if len(encoded) > ((MAX_REMOTE_IMAGE_BYTES + 2) // 3) * 4:
                        raise MediaGenerationError("远程媒体大小超过安全上限。")
                    content = base64.b64decode(encoded, validate=True)
                    media_format = validate_media_content(
                        content,
                        "image",
                        header.removeprefix("data:").split(";", 1)[0],
                    )
                    target = output_dir / f"{result.media_type}-{index}-{uuid4().hex[:8]}.{media_format}"
                    target.write_bytes(content)
                    local_urls.append(
                        f"{settings.public_base_url}/api/tasks/{task['task_id']}/files/outputs/{target.name}"
                    )
                    continue
                except Exception:
                    continue
            try:
                content = await fetch_limited_media(client, url, result.media_type)
            except Exception:
                continue
            media_format = detect_media_format(content, result.media_type)
            target = output_dir / f"{result.media_type}-{index}-{uuid4().hex[:8]}.{media_format}"
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
    data = {key: str(value) for key, value in payload.items() if value is not None}
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


def is_public_http_url(url: str) -> bool:
    try:
        parsed = urlsplit(str(url or "").strip())
        port = parsed.port
    except ValueError:
        return False
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return False
    if parsed.username is not None or parsed.password is not None:
        return False
    host = (parsed.hostname or "").strip().rstrip(".").lower()
    if not host or port == 0 or host == "localhost" or host.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return True
    return is_public_address(address)


async def fetch_limited_media(client: httpx.AsyncClient, url: str, media_type: str) -> bytes:
    current_url = str(url or "").strip()
    visited: set[str] = set()

    for redirect_count in range(MAX_REMOTE_MEDIA_REDIRECTS + 1):
        target = await resolve_public_media_target(current_url)
        if target.original_url in visited:
            raise MediaGenerationError("远程媒体重定向循环，已停止安全下载。")
        visited.add(target.original_url)
        redirect_location = ""
        last_request_error: Exception | None = None

        for address in target.addresses:
            try:
                async with client.stream(
                    "GET",
                    target.pinned_url(address),
                    headers={
                        "Host": target.host_header,
                        "Accept": "image/*" if media_type == "image" else "video/*",
                        "Accept-Encoding": "identity",
                    },
                    extensions={"sni_hostname": target.hostname} if target.scheme == "https" else {},
                ) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        redirect_location = str(response.headers.get("location") or "").strip()
                        if not redirect_location:
                            raise MediaGenerationError("远程媒体重定向缺少目标地址。")
                        break
                    if response.status_code < 200 or response.status_code >= 300:
                        raise MediaGenerationError("远程媒体下载失败。")
                    return await read_validated_media_response(response, media_type)
            except httpx.RequestError as exc:
                last_request_error = exc

        if redirect_location:
            if redirect_count >= MAX_REMOTE_MEDIA_REDIRECTS:
                raise MediaGenerationError("远程媒体重定向次数超过安全上限。")
            current_url = urljoin(target.original_url, redirect_location)
            continue
        raise MediaGenerationError("远程媒体连接失败。") from last_request_error

    raise MediaGenerationError("远程媒体重定向次数超过安全上限。")


@dataclass(frozen=True)
class ResolvedMediaTarget:
    original_url: str
    scheme: str
    hostname: str
    port: int
    explicit_port: bool
    path: str
    query: str
    addresses: tuple[str, ...]

    @property
    def host_header(self) -> str:
        host = f"[{self.hostname}]" if ":" in self.hostname else self.hostname
        default_port = 443 if self.scheme == "https" else 80
        if self.explicit_port or self.port != default_port:
            return f"{host}:{self.port}"
        return host

    def pinned_url(self, address: str) -> str:
        parsed_address = ipaddress.ip_address(address)
        host = f"[{parsed_address.compressed}]" if parsed_address.version == 6 else parsed_address.compressed
        default_port = 443 if self.scheme == "https" else 80
        if self.explicit_port or self.port != default_port:
            host = f"{host}:{self.port}"
        return urlunsplit((self.scheme, host, self.path, self.query, ""))


async def resolve_public_media_target(url: str) -> ResolvedMediaTarget:
    try:
        parsed = urlsplit(str(url or "").strip())
        parsed_port = parsed.port
    except ValueError as exc:
        raise MediaGenerationError("远程媒体地址格式不安全。") from exc
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"} or not parsed.netloc:
        raise MediaGenerationError("远程媒体必须使用 HTTP 或 HTTPS 公网地址。")
    if parsed.username is not None or parsed.password is not None:
        raise MediaGenerationError("远程媒体地址不得包含凭据。")
    raw_hostname = (parsed.hostname or "").strip().rstrip(".")
    if not raw_hostname or raw_hostname.lower() == "localhost" or raw_hostname.lower().endswith(".local"):
        raise MediaGenerationError("远程媒体必须使用安全的公网地址。")
    try:
        hostname = raw_hostname.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise MediaGenerationError("远程媒体域名格式不安全。") from exc
    port = parsed_port or (443 if scheme == "https" else 80)
    if port < 1 or port > 65535:
        raise MediaGenerationError("远程媒体端口无效。")

    try:
        literal_address = ipaddress.ip_address(hostname)
    except ValueError:
        addresses = await _resolve_host_addresses(hostname, port)
    else:
        addresses = (literal_address.compressed,)
    validated_addresses = validate_public_addresses(addresses)
    host_header = f"[{hostname}]" if ":" in hostname else hostname
    if parsed_port is not None:
        host_header = f"{host_header}:{port}"
    original_url = urlunsplit((scheme, host_header, parsed.path or "/", parsed.query, ""))
    return ResolvedMediaTarget(
        original_url=original_url,
        scheme=scheme,
        hostname=hostname,
        port=port,
        explicit_port=parsed_port is not None,
        path=parsed.path or "/",
        query=parsed.query,
        addresses=validated_addresses,
    )


async def _resolve_host_addresses(hostname: str, port: int) -> tuple[str, ...]:
    loop = asyncio.get_running_loop()
    try:
        records = await asyncio.wait_for(
            loop.getaddrinfo(
                hostname,
                port,
                family=socket.AF_UNSPEC,
                type=socket.SOCK_STREAM,
                proto=socket.IPPROTO_TCP,
            ),
            timeout=REMOTE_MEDIA_DNS_TIMEOUT_SECONDS,
        )
    except (TimeoutError, OSError, socket.gaierror) as exc:
        raise MediaGenerationError("远程媒体域名解析失败。") from exc
    return tuple(str(record[4][0]) for record in records if record[0] in {socket.AF_INET, socket.AF_INET6})


def validate_public_addresses(addresses: tuple[str, ...]) -> tuple[str, ...]:
    validated: list[str] = []
    for value in addresses:
        try:
            address = ipaddress.ip_address(str(value).split("%", 1)[0])
        except ValueError as exc:
            raise MediaGenerationError("远程媒体域名解析结果不安全。") from exc
        if not is_public_address(address):
            raise MediaGenerationError("远程媒体域名包含非公网地址，已停止安全下载。")
        normalized = address.compressed
        if normalized not in validated:
            validated.append(normalized)
    if not validated:
        raise MediaGenerationError("远程媒体域名没有可用的公网地址。")
    return tuple(validated)


def is_public_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    mapped = getattr(address, "ipv4_mapped", None)
    if mapped is not None:
        address = mapped
    return bool(
        address.is_global
        and not address.is_private
        and not address.is_loopback
        and not address.is_link_local
        and not address.is_multicast
        and not address.is_reserved
        and not address.is_unspecified
    )


async def read_validated_media_response(response: httpx.Response, media_type: str) -> bytes:
    limit = MAX_REMOTE_IMAGE_BYTES if media_type == "image" else MAX_REMOTE_VIDEO_BYTES
    content_encoding = str(response.headers.get("content-encoding") or "").strip().lower()
    if content_encoding and content_encoding != "identity":
        raise MediaGenerationError("远程媒体使用了不支持的内容编码。")
    declared = str(response.headers.get("content-length") or "").strip()
    if declared:
        try:
            declared_bytes = int(declared)
        except ValueError as exc:
            raise MediaGenerationError("远程媒体大小声明无效。") from exc
        if declared_bytes < 0 or declared_bytes > limit:
            raise MediaGenerationError("远程媒体大小超过安全上限。")

    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > limit:
            raise MediaGenerationError("远程媒体大小超过安全上限。")
        chunks.append(chunk)
    content = b"".join(chunks)
    validate_media_content(content, media_type, str(response.headers.get("content-type") or ""))
    return content


def validate_media_content(content: bytes, media_type: str, content_type: str) -> str:
    media_format = detect_media_format(content, media_type)
    normalized_type = str(content_type or "").split(";", 1)[0].strip().lower()
    generic_types = {"", "application/octet-stream", "binary/octet-stream"}
    allowed_types = {
        "image": {
            "png": {"image/png"},
            "jpg": {"image/jpeg", "image/jpg"},
            "gif": {"image/gif"},
            "webp": {"image/webp"},
        },
        "video": {
            "mp4": {"video/mp4", "video/quicktime", "video/x-m4v"},
            "webm": {"video/webm"},
        },
    }
    if normalized_type not in generic_types and normalized_type not in allowed_types[media_type][media_format]:
        raise MediaGenerationError("远程媒体声明类型与文件格式不一致。")
    return media_format


def detect_media_format(content: bytes, media_type: str) -> str:
    if media_type == "image":
        if content.startswith(b"\x89PNG\r\n\x1a\n"):
            return "png"
        if content.startswith(b"\xff\xd8\xff"):
            return "jpg"
        if content.startswith((b"GIF87a", b"GIF89a")):
            return "gif"
        if len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP":
            return "webp"
    elif media_type == "video":
        if len(content) >= 12 and content[4:8] == b"ftyp":
            return "mp4"
        if content.startswith(b"\x1a\x45\xdf\xa3"):
            return "webm"
    else:
        raise MediaGenerationError("远程媒体类型无效。")
    raise MediaGenerationError("远程媒体文件格式无效。")


def dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def upstream_error(settings: Settings, api_key: str, response: httpx.Response) -> str:
    body = redact(response.text[:800], secret_values_for_redaction(settings, api_key))
    try:
        payload = json.loads(body)
    except ValueError:
        payload = {}
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            body = str(error["message"])
        elif payload.get("message"):
            body = str(payload["message"])
    return f"媒体服务暂时异常 HTTP {response.status_code}: {body or '没有错误详情'}"


class MediaGenerationError(Exception):
    pass
