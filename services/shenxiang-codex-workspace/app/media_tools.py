from __future__ import annotations

import base64
import binascii
import ipaddress
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx

from app.config import Settings, secret_values_for_redaction
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

IMAGE_CONFIRMATION_KEYWORDS = (
    "确认生成图片",
    "确认生成图像",
    "现在生成图片",
    "现在生成图像",
    "开始生成图片",
    "开始生成图像",
    "请生成图片",
    "请生成图像",
    "帮我生成图片",
    "帮我生成图像",
    "按这些提示词生成图片",
    "按这个提示词生成图片",
    "generate the image",
    "generate images",
    "create the image",
)

VIDEO_CONFIRMATION_KEYWORDS = (
    "确认生成视频",
    "现在生成视频",
    "开始生成视频",
    "请生成视频",
    "帮我生成视频",
    "按这些提示词生成视频",
    "按这个提示词生成视频",
    "generate the video",
    "generate videos",
    "create the video",
)

PROMPT_ONLY_HINTS = (
    "只需要提示词",
    "只输出提示词",
    "输出提示词",
    "生成提示词",
    "图像提示词",
    "图片提示词",
    "视频提示词",
    "分镜脚本",
    "分镜表",
    "故事板",
    "storyboard",
    "shot list",
    "prompt only",
)

VIDEO_URL_RE = re.compile(r"https?://[^\s\"'<>]+?\.(?:mp4|webm|mov|m4v)(?:\?[^\s\"'<>]+)?", re.IGNORECASE)
IMAGE_URL_RE = re.compile(r"https?://[^\s\"'<>]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s\"'<>]+)?", re.IGNORECASE)
MAX_REMOTE_IMAGE_BYTES = 20 * 1024 * 1024
MAX_REMOTE_VIDEO_BYTES = 120 * 1024 * 1024


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
        lines = [
            f"### {self.model} 生成完成",
            "",
            "生成结果已在页面内预览。",
            "",
        ]
        if self.media_type == "image":
            for index, url in enumerate(self.local_urls or self.urls, start=1):
                lines.append(f"![生成图片 {index}]({url})")
        else:
            for index, url in enumerate(self.local_urls or self.urls, start=1):
                lines.append(f"[生成视频 {index}]({url})")
        if not self.urls and self.raw_text:
            lines.extend(["", "```text", self.raw_text[:4000], "```"])
        return "\n".join(lines).strip()


def detect_media_kind(request: WorkspaceRunRequest) -> str | None:
    explicit = request.model_role
    if explicit == "image_generation":
        return "image"
    if explicit == "video_generation":
        return "video"
    text = normalize_intent_text(request.user_query)
    if not text:
        return None
    if any(hint in text for hint in NEGATION_HINTS):
        return None
    if is_confirmed_video_generation(text):
        return "video"
    if is_confirmed_image_generation(text):
        return "image"
    if any(hint in text for hint in PROMPT_ONLY_HINTS):
        return None
    return None


def normalize_intent_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def is_confirmed_image_generation(text: str) -> bool:
    return any(keyword in text for keyword in IMAGE_CONFIRMATION_KEYWORDS)


def is_confirmed_video_generation(text: str) -> bool:
    return any(keyword in text for keyword in VIDEO_CONFIRMATION_KEYWORDS)


def selected_media_model(settings: Settings, request: WorkspaceRunRequest, media_type: str) -> str:
    role = "image_generation" if media_type == "image" else "video_generation"
    config = request.model_roles.model_dump()
    candidate = str(config.get(role) or "").strip()
    allowed = set(settings.image_allowed_models if media_type == "image" else settings.video_allowed_models)
    if candidate in allowed:
        return candidate
    return settings.default_image_model if media_type == "image" else settings.default_video_model


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
    return result


async def generate_image(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
    is_ecommerce_banana = model == "ecommerce-banana-2"
    payload: dict[str, Any] = {
        "model": model,
        "prompt": request.user_query,
        "n": 1 if is_ecommerce_banana else int(request.params.get("n") or 1),
        "size": "1024x1024"
        if is_ecommerce_banana
        else str(request.params.get("size") or request.params.get("resolution") or "1024x1024"),
    }
    for key in ("quality", "style", "response_format", "background", "moderation"):
        value = request.params.get(key)
        if not is_ecommerce_banana and value is not None and str(value):
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
    return MediaResult(media_type="image", model=model, prompt=request.user_query, urls=urls, raw_text=json.dumps(body, ensure_ascii=False)[:4000])


async def generate_video(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    model: str,
) -> MediaResult:
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
    return MediaResult(media_type="video", model=model, prompt=request.user_query, urls=dedupe(urls), raw_text=text)


async def persist_remote_media(
    settings: Settings,
    user: UserContext,
    task: dict[str, Any],
    output_dir: Path,
    result: MediaResult,
) -> list[str]:
    local_urls: list[str] = []
    timeout = httpx.Timeout(90.0, connect=10.0, read=90.0, write=20.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for index, url in enumerate(result.urls[:4], start=1):
            if url.startswith("data:image/"):
                target = output_dir / f"{result.media_type}-{index}-{uuid4().hex[:8]}.png"
                try:
                    header, encoded = url.split(",", 1)
                    target.write_bytes(base64.b64decode(encoded))
                    local_urls.append(
                        f"{settings.public_base_url}/api/tasks/{task['task_id']}/files/outputs/{target.name}"
                    )
                    continue
                except Exception:
                    local_urls.append(url)
                    continue
            if not is_public_http_url(url):
                local_urls.append(url)
                continue
            suffix = suffix_for_url(url, result.media_type)
            target = output_dir / f"{result.media_type}-{index}-{uuid4().hex[:8]}{suffix}"
            try:
                content = await fetch_limited_media(client, url, result.media_type)
            except Exception:
                local_urls.append(url)
                continue
            if not content:
                local_urls.append(url)
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


def suffix_for_url(url: str, media_type: str) -> str:
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix.lower()
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"} if media_type == "image" else {".mp4", ".webm", ".mov", ".m4v"}
    if suffix in allowed:
        return suffix
    return ".png" if media_type == "image" else ".mp4"


def is_public_http_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    host = (parsed.hostname or "").strip().lower()
    if not host or host in {"localhost", "0.0.0.0"} or host.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return True
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


async def fetch_limited_media(client: httpx.AsyncClient, url: str, media_type: str) -> bytes:
    limit = MAX_REMOTE_IMAGE_BYTES if media_type == "image" else MAX_REMOTE_VIDEO_BYTES
    chunks: list[bytes] = []
    total = 0
    async with client.stream("GET", url) as response:
        if response.status_code >= 400:
            return b""
        declared = response.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            return b""
        async for chunk in response.aiter_bytes():
            total += len(chunk)
            if total > limit:
                return b""
            chunks.append(chunk)
    return b"".join(chunks)


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
