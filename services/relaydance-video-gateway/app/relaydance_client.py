import asyncio
import hashlib
import json
import logging
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import Settings, get_settings
from app.schemas import ALLOWED_MODELS, GatewayResponse, canonical_model

logger = logging.getLogger("relaydance_video_gateway")

SENSITIVE_KEYS = {"authorization", "token", "signature", "policy", "x-gateway-key", "relaydance_api_token"}
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}
DIAGNOSTIC_VIDEO_PATHS = {"/v1/video/generations", "/v1/videos"}
PRIVATE_SEEDANCE_MODELS = {"seedance-nsfw", "seedance-nsfw-4k"}


def redact(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): "[REDACTED]" if str(key).lower() in SENSITIVE_KEYS else redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


def public_body(model: Any) -> dict[str, Any]:
    return model.model_dump(exclude_none=True) if hasattr(model, "model_dump") else dict(model)


def video_generation_body(model: Any) -> dict[str, Any]:
    body = public_body(model)
    return normalize_video_provider_body(body)


def normalize_video_provider_body(body: Mapping[str, Any]) -> dict[str, Any]:
    body = dict(body)
    body["model"] = canonical_model(str(body.get("model") or ""))
    is_private_seedance = _is_private_seedance_model(str(body.get("model") or ""))
    metadata = body.get("metadata")
    if not isinstance(metadata, Mapping):
        if is_private_seedance:
            body.pop("generate_audio", None)
        return body

    cleaned_metadata = dict(metadata)
    content_items = _metadata_content_items(cleaned_metadata)
    if not content_items:
        content_items = _content_items_from_body(body)
        if content_items and not is_private_seedance:
            cleaned_metadata["content"] = content_items
    first_frame_url = _first_frame_url_from_metadata(cleaned_metadata)
    if not first_frame_url and content_items:
        first_frame_url = _first_frame_url_from_content_items(content_items)
    if first_frame_url and not body.get("first_frame_url"):
        body["first_frame_url"] = first_frame_url
    if content_items:
        if not body.get("image_with_roles") and _has_last_frame(content_items):
            body["image_with_roles"] = _image_with_roles(content_items)
        if not body.get("image_urls") and not body.get("image_with_roles"):
            body["image_urls"] = _image_urls_from_content(content_items)
    generate_audio = cleaned_metadata.get("generate_audio")
    if is_private_seedance or generate_audio is not True:
        cleaned_metadata.pop("generate_audio", None)
    if is_private_seedance:
        cleaned_metadata.pop("content", None)
    body["metadata"] = cleaned_metadata
    if is_private_seedance:
        body.pop("generate_audio", None)
    return body


def _is_private_seedance_model(model: str) -> bool:
    return model in PRIVATE_SEEDANCE_MODELS or canonical_model(model) in PRIVATE_SEEDANCE_MODELS


def _first_frame_url_from_metadata(metadata: Mapping[str, Any]) -> str:
    return _first_frame_url_from_content_items(_metadata_content_items(metadata))


def _first_frame_url_from_content_items(content_items: list[Any]) -> str:
    for item in content_items:
        if isinstance(item, Mapping) and str(item.get("role") or "").lower() == "first_frame":
            url = _image_url_from_content_item(item)
            if url:
                return url
    for item in content_items:
        url = _image_url_from_content_item(item)
        if url:
            return url
    return ""


def _metadata_content_items(metadata: Mapping[str, Any]) -> list[Any]:
    content = metadata.get("content")
    return content if isinstance(content, list) else []


def _content_items_from_body(body: Mapping[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: dict[str, int] = {}

    def append_reference(role: Any, url: Any) -> None:
        text = str(url or "").strip() if isinstance(url, str) or url is None else ""
        if not text:
            return
        normalized_role = _normalized_frame_role(role)
        existing_index = seen.get(text)
        if existing_index is not None:
            if normalized_role == "first_frame" and items[existing_index]["role"] != "first_frame":
                items[existing_index]["role"] = "first_frame"
            return
        seen[text] = len(items)
        items.append(
            {
                "type": "image_url",
                "image_url": {"url": text},
                "role": normalized_role,
            }
        )

    first_frame_url = body.get("first_frame_url") or body.get("image")
    append_reference("first_frame", first_frame_url)

    image_with_roles = body.get("image_with_roles")
    if isinstance(image_with_roles, list) and image_with_roles:
        for item in image_with_roles:
            if not isinstance(item, Mapping):
                continue
            append_reference(item.get("role"), _image_url_from_content_item(item))
        return items

    image_urls = body.get("image_urls")
    if isinstance(image_urls, list):
        for index, url in enumerate(image_urls):
            append_reference("first_frame" if index == 0 else "reference_image", url)
    return items


def _normalized_frame_role(value: Any) -> str:
    text = str(value or "").lower().strip()
    if text in {"first_frame", "start_frame", "source_image"}:
        return "first_frame"
    if text in {"last_frame", "end_frame"}:
        return "last_frame"
    return "reference_image"


def _has_last_frame(content_items: list[Any]) -> bool:
    return any(
        isinstance(item, Mapping) and _normalized_frame_role(item.get("role")) == "last_frame"
        for item in content_items
    )


def _image_urls_from_content(content_items: list[Any]) -> list[str]:
    urls: list[str] = []
    for item in content_items:
        url = _image_url_from_content_item(item)
        if url and url not in urls:
            urls.append(url)
    return urls


def _image_with_roles(content_items: list[Any]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in content_items:
        if not isinstance(item, Mapping):
            continue
        url = _image_url_from_content_item(item)
        if not url:
            continue
        role = _normalized_frame_role(item.get("role"))
        key = (url, role)
        if key in seen:
            continue
        seen.add(key)
        items.append({"url": url, "role": role})
    return items


def validate_model(model: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if settings.strict_model_validation and canonical_model(model) not in ALLOWED_MODELS:
        raise ValueError("requested model is not available")


def _public_url_summary(value: Any) -> dict[str, str]:
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        return {}
    parsed = urlparse(text)
    host = parsed.netloc.lower()
    if "@" in host:
        host = host.rsplit("@", 1)[-1]
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
    return {"host": host, "sha256_12": digest}


def _image_url_from_content_item(item: Any) -> str:
    if not isinstance(item, Mapping):
        return ""
    for key in ("url", "src"):
        value = item.get(key)
        if isinstance(value, str):
            return value
    image_url = item.get("image_url")
    if isinstance(image_url, str):
        return image_url
    if isinstance(image_url, Mapping):
        value = image_url.get("url") or image_url.get("src")
        return value if isinstance(value, str) else ""
    return ""


def request_diagnostic_summary(path: str, body: dict[str, Any] | None) -> dict[str, Any]:
    body = body or {}
    metadata = body.get("metadata") if isinstance(body.get("metadata"), Mapping) else {}
    content = metadata.get("content") if isinstance(metadata, Mapping) else None
    content_items = content if isinstance(content, list) else []

    image_summaries: list[dict[str, str]] = []
    roles: list[str] = []
    for item in content_items:
        if isinstance(item, Mapping):
            role = item.get("role")
            if isinstance(role, str) and role:
                roles.append(role)
            image_summary = _public_url_summary(_image_url_from_content_item(item))
            if image_summary:
                image_summaries.append(image_summary)
    first_frame_summary = _public_url_summary(body.get("first_frame_url"))

    return {
        "path": path,
        "model": body.get("model"),
        "seconds": str(body.get("seconds", "")) if body.get("seconds") is not None else "",
        "prompt_length": len(body.get("prompt", "")) if isinstance(body.get("prompt"), str) else 0,
        "metadata_keys": sorted(str(key) for key in metadata.keys()) if isinstance(metadata, Mapping) else [],
        "ratio": metadata.get("ratio") if isinstance(metadata, Mapping) else None,
        "resolution": metadata.get("resolution") if isinstance(metadata, Mapping) else None,
        "content_count": len(content_items),
        "content_roles": roles,
        "first_frame_url": first_frame_summary or None,
        "image_urls": image_summaries,
    }


def provider_payload_diagnostic_summary(payload: Any, status_code: int) -> dict[str, Any]:
    message = message_from_payload(payload)
    return {
        "payload_keys": sorted(str(key) for key in payload.keys()) if isinstance(payload, Mapping) else [],
        "provider_code": public_provider_code(provider_code_from_payload(payload, status_code), status_code),
        "message_length": len(message),
    }


def provider_code_from_payload(payload: Any, status_code: int) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            code = error.get("code")
            if code is not None:
                return str(code)
        for key in ("code", "provider_code", "status_code", "status"):
            value = payload.get(key)
            if value is not None:
                return str(value)
    return "success" if 200 <= status_code < 300 else "service_error"


def public_provider_code(code: str, status_code: int) -> str:
    text = str(code or "").lower()
    if 200 <= status_code < 300:
        return "success"
    if "validation" in text:
        return "validation_error"
    if status_code in {408, 504, 524} or "timeout" in text:
        return "service_timeout"
    return "service_error"


def message_from_payload(payload: Any) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"]
        for key in ("message", "msg", "error_message", "detail"):
            value = payload.get(key)
            if isinstance(value, str):
                return value
    return ""


def error_payload_from_content(content: bytes, content_type: str = "") -> Any:
    lowered = content_type.lower()
    if "json" not in lowered and not content.lstrip().startswith((b"{", b"[")):
        return None
    try:
        return json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def content_failure_message(payload: Any) -> str:
    message = message_from_payload(payload)
    if not message:
        return ""
    lowered = message.lower()
    if "current status:" in lowered and any(
        marker in lowered for marker in ("failure", "failed", "error", "cancelled", "canceled")
    ):
        return message
    if "output audio may contain sensitive information" in lowered:
        return message
    return ""


def content_failure_code(payload: Any, status_code: int) -> str:
    code = provider_code_from_payload(payload, status_code).strip().lower()
    if code in {"", "service_error", "provider_error", "error"}:
        return "task_failed"
    return code


def find_first(payload: Any, keys: set[str]) -> Any:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in keys and value not in (None, ""):
                return value
        for value in payload.values():
            found = find_first(value, keys)
            if found not in (None, ""):
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = find_first(item, keys)
            if found not in (None, ""):
                return found
    return None


def collect_values(payload: Any, keys: set[str]) -> list[str]:
    values: list[str] = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in keys:
                if isinstance(value, str) and value:
                    values.append(value)
                elif isinstance(value, list):
                    values.extend([item for item in value if isinstance(item, str) and item])
            values.extend(collect_values(value, keys))
    elif isinstance(payload, list):
        for item in payload:
            values.extend(collect_values(item, keys))
    return list(dict.fromkeys(values))


def normalize_provider_response(
    payload: Any,
    status_code: int,
    error: Any = None,
    warnings: list[str] | None = None,
) -> GatewayResponse:
    provider_response = payload if isinstance(payload, dict) else {"raw": payload}
    raw_provider_code = provider_code_from_payload(payload, status_code)
    status = str(find_first(payload, {"status", "state"}) or "")
    task_id = str(find_first(payload, {"task_id", "taskId", "id"}) or "")
    video_url = str(find_first(payload, {"url", "video_url", "videoUrl"}) or "")
    video_urls = collect_values(payload, {"url", "video_url", "videoUrl"})
    upload_url = str(find_first(payload, {"upload_url", "uploadUrl"}) or "")
    source_url = str(find_first(payload, {"source_url", "sourceUrl"}) or "")
    asset_id = str(find_first(payload, {"asset_id", "assetId", "id"}) or "")
    progress_value = find_first(payload, {"progress"})
    progress = progress_value if isinstance(progress_value, int) else None
    provider_code_lower = raw_provider_code.lower()
    message = message_from_payload(payload)
    status_lower = status.lower()
    success = 200 <= status_code < 300 and provider_code_lower not in {"service_error", "provider_error", "error", "failed", "failure"}

    return GatewayResponse(
        success=success,
        status_code=status_code,
        provider_code=public_provider_code(raw_provider_code, status_code),
        message=message if success and status_lower in {"failed", "failure", "error", "cancelled", "canceled"} else ("" if success else "服务暂时不可用，请稍后重试。"),
        task_id=task_id,
        status=status,
        progress=progress,
        video_url=video_url,
        video_urls=video_urls,
        upload_url=upload_url,
        source_url=source_url,
        asset_id=asset_id,
        warnings=warnings or [],
        data=payload.get("data") if isinstance(payload, dict) else payload,
        provider_response=provider_response,
        error=error,
    )


class RelayDanceClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    def headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.settings.relaydance_authorization:
            headers["Authorization"] = self.settings.relaydance_authorization
        return headers

    async def request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
        retry: bool = False,
        base_url: str | None = None,
        warnings: list[str] | None = None,
    ) -> GatewayResponse:
        url = f"{base_url or self.settings.relaydance_base_url}{path}"
        headers = self.headers()
        if method.upper() == "POST":
            headers["Content-Type"] = "application/json"
        diagnostic_summary = (
            request_diagnostic_summary(path, json_body)
            if method.upper() == "POST" and path in DIAGNOSTIC_VIDEO_PATHS
            else None
        )

        attempts = 3 if retry else 1
        for attempt in range(attempts):
            try:
                if diagnostic_summary is not None:
                    logger.info(
                        "video submit request summary: %s",
                        redact({"attempt": attempt + 1, **diagnostic_summary}),
                    )
                async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                    response = await client.request(
                        method.upper(),
                        url,
                        headers=headers,
                        json=json_body if method.upper() == "POST" else None,
                        params=query,
                    )
                payload = await self._response_payload(response)
                if diagnostic_summary is not None and response.status_code >= 400:
                    logger.warning(
                        "video provider rejected request: %s",
                        redact(
                            {
                                "status_code": response.status_code,
                                "request": diagnostic_summary,
                                "response": provider_payload_diagnostic_summary(payload, response.status_code),
                            }
                        ),
                    )
                if response.status_code in RETRY_STATUS_CODES and retry and attempt < attempts - 1:
                    retry_after = response.headers.get("retry-after")
                    sleep_seconds = float(retry_after) if retry_after and retry_after.isdigit() else 0.5 * (2**attempt)
                    await asyncio.sleep(min(sleep_seconds, 5))
                    continue
                return normalize_provider_response(payload, response.status_code, warnings=warnings)
            except httpx.HTTPError as exc:
                logger.warning("provider request failed: %s", redact({"path": path, "error": str(exc)}))
                if attempt < attempts - 1:
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                return normalize_provider_response(
                    {"service_error": "request_failed"},
                    502,
                    error={"code": "service_request_failed", "message": "服务暂时不可用，请稍后重试。"},
                    warnings=warnings,
                )
        return normalize_provider_response(
            {"service_error": "request_failed"},
            502,
            error={"code": "service_request_failed", "message": "服务暂时不可用，请稍后重试。"},
            warnings=warnings,
        )

    async def _response_payload(self, response: httpx.Response) -> Any:
        content_type = response.headers.get("content-type", "")
        if "application/json" in content_type:
            return response.json()
        text = response.text
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"service_error" if response.is_error else "text": text}

    async def content(self, task_id: str) -> tuple[int, str, bytes, dict[str, str]]:
        url = f"{self.settings.relaydance_base_url}/v1/videos/{task_id}/content"
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.get(url, headers=self.headers())
        headers = {
            "content-type": response.headers.get("content-type", "video/mp4"),
            "cache-control": "private, no-store",
        }
        return response.status_code, response.headers.get("content-type", "video/mp4"), response.content, headers

    async def video_status(self, task_id: str) -> GatewayResponse:
        response = await self.request("GET", f"/v1/videos/{task_id}", retry=True)
        if response.success:
            return response

        content_status, content_type, content, _headers = await self.content(task_id)
        if content_status == 200 and _looks_like_video_content(content_type, content):
            return normalize_provider_response(
                {
                    "id": task_id,
                    "task_id": task_id,
                    "status": "completed",
                    "progress": 100,
                    "metadata": {"url": f"/v1/videos/{task_id}/content"},
                },
                200,
                warnings=["status endpoint failed but video content is available"],
            )
        failure_payload = error_payload_from_content(content, content_type)
        failure_message = content_failure_message(failure_payload)
        if failure_message:
            return normalize_provider_response(
                {
                    "id": task_id,
                    "task_id": task_id,
                    "status": "failed",
                    "progress": 100,
                    "error": {
                        "code": content_failure_code(failure_payload, content_status),
                        "message": failure_message,
                    },
                },
                200,
                warnings=["content endpoint reported terminal task failure"],
            )
        if response.status_code in {400, 403, 404} and content_status in {400, 403, 404}:
            return normalize_provider_response(
                {
                    "id": task_id,
                    "task_id": task_id,
                    "status": "queued",
                    "progress": 0,
                },
                200,
                warnings=["status endpoint is temporarily unavailable and video content is not ready"],
            )
        return response


def _looks_like_video_content(content_type: str, content: bytes) -> bool:
    lowered = content_type.lower()
    if lowered.startswith("video/"):
        return True
    if len(content) < 12:
        return False
    return b"ftyp" in content[:16]
