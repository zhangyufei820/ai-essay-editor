from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

import httpx

from app.config import Settings
from app.media_catalog import public_request_model_name
from app.media_tools import (
    GROK15_VIDEO_MODEL,
    MOONAPIX_SEEDANCE_VIDEO_MODELS,
    OFFICIAL_SEEDANCE_REFERENCE_MODELS,
    SD2_FAST_VIDEO_MODEL,
    MEDIA_ERROR_RESULT_UNAVAILABLE,
    MEDIA_ERROR_SERVICE_UNAVAILABLE,
    MediaGenerationError,
    MediaResult,
    auth_headers,
    build_mcp_image_payload,
    build_mcp_video_payload,
    dedupe,
    extract_media_urls,
    moonapix_seedance_duration,
    moonapix_seedance_references,
    moonapix_seedance_resolution,
    new_catalog_video_request,
    official_seedance_duration,
    official_seedance_references,
    selected_media_model,
    upstream_error,
    video_ratio_from_request,
    video_task_id,
)
from app.models import WorkspaceRunRequest
from app.security import UserContext


class McpMediaTaskState(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class McpMediaSubmissionUncertain(MediaGenerationError):
    pass


@dataclass(frozen=True)
class McpMediaSubmission:
    remote_task_id: str
    state: McpMediaTaskState
    media: MediaResult | None = None


@dataclass(frozen=True)
class McpMediaTaskResult:
    state: McpMediaTaskState
    media: MediaResult | None = None
    message: str = ""


REMOTE_TASK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,180}$")
SUBMISSION_TIMEOUT = httpx.Timeout(20.0, connect=8.0, read=15.0, write=15.0)
QUERY_TIMEOUT = httpx.Timeout(20.0, connect=8.0, read=15.0, write=15.0)
PENDING_TASK_STATUSES = frozenset({"", "queued", "pending", "submitted", "processing", "in_progress", "running"})
SUCCESS_TASK_STATUSES = frozenset({"success", "succeeded", "completed", "done"})
FAILED_TASK_STATUSES = frozenset({"failed", "failure", "error", "cancelled", "canceled"})


async def submit_mcp_media_task(
    settings: Settings,
    request: WorkspaceRunRequest,
    user: UserContext,
    media_type: str,
) -> McpMediaSubmission:
    video_files: list[tuple[str, tuple[str, bytes, str]]] = []
    model = selected_media_model(settings, request, media_type)
    if media_type == "image":
        endpoint = f"{settings.new_api_base_url}/images/generations?async=true"
        payload = build_mcp_image_payload(request, model)
        payload["model"] = public_request_model_name(model, "image")
    elif media_type == "video":
        endpoint = f"{settings.new_api_base_url}/videos"
        if model in {SD2_FAST_VIDEO_MODEL, GROK15_VIDEO_MODEL}:
            payload, video_files = new_catalog_video_request(request, model)
        else:
            payload = _mcp_video_submission_payload(request, model)
    else:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE)

    try:
        async with httpx.AsyncClient(timeout=SUBMISSION_TIMEOUT) as client:
            if video_files:
                data = {
                    key: str(value).lower() if isinstance(value, bool) else str(value)
                    for key, value in payload.items()
                    if value is not None
                }
                response = await client.post(
                    endpoint,
                    headers=auth_headers(user.api_key, None),
                    data=data,
                    files=video_files,
                )
            else:
                response = await client.post(endpoint, headers=auth_headers(user.api_key), json=payload)
    except httpx.HTTPError as exc:
        raise McpMediaSubmissionUncertain(MEDIA_ERROR_SERVICE_UNAVAILABLE) from exc
    if response.status_code >= 400:
        if response.status_code >= 500:
            raise McpMediaSubmissionUncertain(MEDIA_ERROR_SERVICE_UNAVAILABLE)
        raise MediaGenerationError(upstream_error(settings, user.api_key, response))
    try:
        body = response.json()
    except ValueError as exc:
        raise McpMediaSubmissionUncertain(MEDIA_ERROR_RESULT_UNAVAILABLE) from exc
    if not isinstance(body, dict):
        raise McpMediaSubmissionUncertain(MEDIA_ERROR_RESULT_UNAVAILABLE)

    urls = dedupe(extract_media_urls(body, media_type))
    if urls:
        return McpMediaSubmission(
            remote_task_id="",
            state=McpMediaTaskState.COMPLETED,
            media=MediaResult(media_type=media_type, model=model, prompt=request.user_query, urls=urls),
        )
    remote_task_id = video_task_id(body)
    if not _is_safe_remote_task_id(remote_task_id):
        raise McpMediaSubmissionUncertain(MEDIA_ERROR_RESULT_UNAVAILABLE)
    return McpMediaSubmission(remote_task_id=remote_task_id, state=McpMediaTaskState.PENDING)


async def fetch_mcp_media_task(
    settings: Settings,
    user: UserContext,
    media_type: str,
    remote_task_id: str,
) -> McpMediaTaskResult:
    if not _is_safe_remote_task_id(remote_task_id):
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE)
    if media_type == "image":
        endpoint = f"{settings.new_api_base_url}/images/tasks/{remote_task_id}"
    elif media_type == "video":
        endpoint = f"{settings.new_api_base_url}/videos/{remote_task_id}"
    else:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE)

    try:
        async with httpx.AsyncClient(timeout=QUERY_TIMEOUT) as client:
            response = await client.get(endpoint, headers=auth_headers(user.api_key))
    except httpx.HTTPError as exc:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE) from exc
    if response.status_code >= 400:
        raise MediaGenerationError(MEDIA_ERROR_SERVICE_UNAVAILABLE)
    try:
        body = response.json()
    except ValueError as exc:
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE) from exc
    if not isinstance(body, dict):
        raise MediaGenerationError(MEDIA_ERROR_RESULT_UNAVAILABLE)

    urls = dedupe(extract_media_urls(body, media_type))
    if urls:
        return McpMediaTaskResult(
            state=McpMediaTaskState.COMPLETED,
            media=MediaResult(media_type=media_type, model="", prompt="", urls=urls),
        )
    task_status = _task_status(body)
    if task_status in FAILED_TASK_STATUSES:
        return McpMediaTaskResult(state=McpMediaTaskState.FAILED, message=MEDIA_ERROR_SERVICE_UNAVAILABLE)
    if task_status in SUCCESS_TASK_STATUSES:
        return McpMediaTaskResult(state=McpMediaTaskState.FAILED, message=MEDIA_ERROR_RESULT_UNAVAILABLE)
    if task_status in PENDING_TASK_STATUSES:
        return McpMediaTaskResult(state=McpMediaTaskState.PENDING)
    return McpMediaTaskResult(state=McpMediaTaskState.PENDING)


def _mcp_video_submission_payload(request: WorkspaceRunRequest, model: str) -> dict[str, object]:
    mcp_payload = build_mcp_video_payload(request, model)
    if model in {SD2_FAST_VIDEO_MODEL, GROK15_VIDEO_MODEL}:
        return mcp_payload
    if model in OFFICIAL_SEEDANCE_REFERENCE_MODELS:
        payload: dict[str, object] = {
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
        return payload
    if model in MOONAPIX_SEEDANCE_VIDEO_MODELS:
        payload = {
            "model": model,
            "prompt": request.user_query,
            "duration": moonapix_seedance_duration(request.params),
            "ratio": video_ratio_from_request(request),
            "resolution": moonapix_seedance_resolution(model, request.params),
        }
        references = moonapix_seedance_references(model, request)
        if references:
            payload["references"] = references
        for key in ("watermark", "seed"):
            if key in mcp_payload:
                payload[key] = mcp_payload[key]
        return payload
    return {
        "model": model,
        "prompt": request.user_query,
        "duration": mcp_payload["duration"],
        "ratio": mcp_payload["ratio"],
        "resolution": mcp_payload["resolution"],
    }


def _task_status(body: dict[str, object]) -> str:
    candidates: list[object] = [body.get("status"), body.get("task_status")]
    data = body.get("data")
    if isinstance(data, dict):
        candidates.extend((data.get("status"), data.get("task_status")))
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip().casefold()
    return ""


def _is_safe_remote_task_id(value: str) -> bool:
    return bool(REMOTE_TASK_ID_PATTERN.fullmatch(value.strip()))
