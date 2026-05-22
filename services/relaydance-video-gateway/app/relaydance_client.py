import asyncio
import json
import logging
from collections.abc import Mapping
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.schemas import ALLOWED_MODELS, GatewayResponse

logger = logging.getLogger("relaydance_video_gateway")

SENSITIVE_KEYS = {"authorization", "token", "signature", "policy", "x-gateway-key", "relaydance_api_token"}
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


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


def validate_model(model: str, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    if settings.strict_model_validation and model not in ALLOWED_MODELS:
        allowed = ", ".join(sorted(ALLOWED_MODELS))
        raise ValueError(f"model must be one of: {allowed}")


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
    return "success" if 200 <= status_code < 300 else "provider_error"


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
    provider_code = provider_code_from_payload(payload, status_code)
    status = str(find_first(payload, {"status", "state"}) or "")
    task_id = str(find_first(payload, {"task_id", "taskId", "id"}) or "")
    video_url = str(find_first(payload, {"url", "video_url", "videoUrl"}) or "")
    video_urls = collect_values(payload, {"url", "video_url", "videoUrl"})
    upload_url = str(find_first(payload, {"upload_url", "uploadUrl"}) or "")
    source_url = str(find_first(payload, {"source_url", "sourceUrl"}) or "")
    asset_id = str(find_first(payload, {"asset_id", "assetId", "id"}) or "")
    progress_value = find_first(payload, {"progress"})
    progress = progress_value if isinstance(progress_value, int) else None
    provider_code_lower = provider_code.lower()
    success = 200 <= status_code < 300 and provider_code_lower not in {"provider_error", "error", "failed", "failure"}

    return GatewayResponse(
        success=success,
        status_code=status_code,
        provider_code=provider_code,
        message=message_from_payload(payload),
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

        attempts = 3 if retry else 1
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
                    response = await client.request(
                        method.upper(),
                        url,
                        headers=headers,
                        json=json_body if method.upper() == "POST" else None,
                        params=query,
                    )
                payload = await self._response_payload(response)
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
                    {"provider_error_text": str(exc)},
                    502,
                    error={"code": "provider_request_failed", "message": "Provider request failed"},
                    warnings=warnings,
                )
        return normalize_provider_response(
            {"provider_error_text": "unknown provider error"},
            502,
            error={"code": "provider_request_failed", "message": "Provider request failed"},
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
            return {"provider_error_text" if response.is_error else "text": text}

    async def content(self, task_id: str) -> tuple[int, str, bytes, dict[str, str]]:
        url = f"{self.settings.relaydance_base_url}/v1/videos/{task_id}/content"
        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            response = await client.get(url, headers=self.headers())
        headers = {
            "content-type": response.headers.get("content-type", "video/mp4"),
            "cache-control": "private, no-store",
        }
        return response.status_code, response.headers.get("content-type", "video/mp4"), response.content, headers
