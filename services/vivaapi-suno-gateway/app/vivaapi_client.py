import asyncio
import json
import logging
import time
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.schemas import ALLOWED_MODELS, GatewayResponse

logger = logging.getLogger("vivaapi_suno_gateway")

SENSITIVE_KEYS = {"authorization", "token", "signature", "policy", "x-gateway-key"}
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


def validate_mv(body: dict[str, Any], settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    mv = body.get("mv")
    if mv is None:
        return
    if not isinstance(mv, str) or not mv.strip():
        raise ValueError("mv must be a non-empty string")
    if settings.strict_model_validation and mv not in ALLOWED_MODELS:
        allowed = ", ".join(sorted(ALLOWED_MODELS))
        raise ValueError(f"mv must be one of: {allowed}")


def provider_code_from_payload(payload: Any, status_code: int) -> str:
    if isinstance(payload, dict):
        for key in ("code", "provider_code", "status_code", "status"):
            value = payload.get(key)
            if value is not None:
                return str(value)
    return "success" if 200 <= status_code < 300 else "provider_error"


def message_from_payload(payload: Any) -> str:
    if isinstance(payload, dict):
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
) -> GatewayResponse:
    provider_response = payload if isinstance(payload, dict) else {"raw": payload}
    provider_code = provider_code_from_payload(payload, status_code)
    success = 200 <= status_code < 300 and provider_code.lower() in {
        "success",
        "ok",
        "200",
        "0",
        "complete",
        "completed",
        "submitted",
        "created",
    }
    if 200 <= status_code < 300 and provider_code.lower() not in {
        "provider_error",
        "error",
        "failed",
        "fail",
    }:
        success = True

    return GatewayResponse(
        success=success,
        status_code=status_code,
        provider_code=provider_code,
        message=message_from_payload(payload),
        task_id=str(find_first(payload, {"task_id", "taskId", "id"}) or ""),
        clip_id=str(find_first(payload, {"clip_id", "clipId", "clipIdStr"}) or ""),
        upload_id=str(find_first(payload, {"upload_id", "uploadId", "id"}) or ""),
        status=str(find_first(payload, {"status", "state"}) or ""),
        audio_urls=collect_values(payload, {"audio_url", "audioUrl", "stream_audio_url", "streamAudioUrl"}),
        image_urls=collect_values(payload, {"image_url", "imageUrl", "cover_url", "coverUrl"}),
        video_urls=collect_values(payload, {"video_url", "videoUrl"}),
        wav_url=str(find_first(payload, {"wav_url", "wavUrl"}) or ""),
        timing=find_first(payload, {"timing"}),
        data=payload.get("data") if isinstance(payload, dict) else payload,
        provider_response=provider_response,
        error=error,
    )


class VivaAPIClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    def headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.settings.viva_authorization:
            headers["Authorization"] = self.settings.viva_authorization
        return headers

    async def request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
        retry: bool = False,
    ) -> GatewayResponse:
        url = f"{self.settings.viva_base_url}{path}"
        headers = self.headers()
        if method.upper() == "POST":
            headers["Content-Type"] = "application/json"

        last_error: Exception | None = None
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
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                return normalize_provider_response(payload, response.status_code)
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning("provider request failed: %s", redact({"path": path, "error": str(exc)}))
                if attempt < attempts - 1:
                    await asyncio.sleep(0.5 * (2**attempt))
                    continue
                return normalize_provider_response(
                    {"provider_error_text": str(exc)},
                    502,
                    error={"code": "provider_request_failed", "message": "Provider request failed"},
                )
        return normalize_provider_response(
            {"provider_error_text": str(last_error) if last_error else "unknown error"},
            502,
            error={"code": "provider_request_failed", "message": "Provider request failed"},
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

    async def s3_upload(
        self,
        *,
        url: str,
        fields: dict[str, Any] | None,
        file_path: Path,
        filename: str,
        content_type: str | None,
    ) -> GatewayResponse:
        safe_headers: dict[str, str] = {}
        if self.settings.s3_send_auth and self.settings.viva_authorization:
            safe_headers["Authorization"] = self.settings.viva_authorization

        async with httpx.AsyncClient(timeout=self.settings.request_timeout_seconds) as client:
            if fields:
                form_data = {key: str(value) for key, value in fields.items() if value is not None}
                upload_content_type = str(fields.get("Content-Type") or content_type or "application/octet-stream")
                with file_path.open("rb") as file_obj:
                    response = await client.post(
                        url,
                        data=form_data,
                        files={"file": (filename, file_obj, upload_content_type)},
                        headers=safe_headers,
                    )
            else:
                with file_path.open("rb") as file_obj:
                    response = await client.put(
                        url,
                        content=file_obj,
                        headers={**safe_headers, "Content-Type": content_type or "application/octet-stream"},
                    )
        text = response.text
        payload = {
            "s3_status_code": response.status_code,
            "s3_response_text": text[:2000],
        }
        return normalize_provider_response(payload, response.status_code)


async def poll_until_complete(
    client: VivaAPIClient,
    upload_id: str,
    *,
    interval_seconds: float,
    timeout_seconds: float,
) -> GatewayResponse:
    started = time.monotonic()
    last_response: GatewayResponse | None = None
    while time.monotonic() - started <= timeout_seconds:
        last_response = await client.request("GET", f"/suno/uploads/audio/{upload_id}", retry=True)
        status = last_response.status.lower()
        if status in {"complete", "completed"}:
            return last_response
        await asyncio.sleep(interval_seconds)
    timeout_payload = {
        "message": "upload status timeout",
        "last_response": last_response.model_dump() if last_response else None,
    }
    return normalize_provider_response(
        timeout_payload,
        504,
        error={"code": "upload_status_timeout", "message": "Upload status timeout"},
    )
