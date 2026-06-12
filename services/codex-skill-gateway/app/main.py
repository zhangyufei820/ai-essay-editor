from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import AsyncIterator, Any
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from redis import Redis

from app import __version__
from app.config import ensure_codex_config, ensure_directories, get_settings
from app.models import AdminRunRequest, ChatCompletionsRequest, CreateSkillRequest, ImageGenerationRequest, RunRequest
from app.queue import RedisTaskQueue
from app.registry import get_skill, list_public_skills, load_registry, validate_public_skill
from app.security import (
    assert_safe_skill_file_path,
    contains_admin_intent,
    contains_forbidden_runtime_action,
    redact,
    require_admin_bearer,
    require_bearer,
    safe_error,
)
from app.task_store import TaskStore, now_iso

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Codex Skill Gateway", version=__version__)


def redis_client() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=False)


def task_store() -> TaskStore:
    return TaskStore(redis_client(), settings)


def task_queue() -> RedisTaskQueue:
    return RedisTaskQueue(redis_client())


@app.on_event("startup")
def startup() -> None:
    ensure_directories(settings)
    ensure_codex_config(settings)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": settings.version}


@app.get("/skills", dependencies=[Depends(require_bearer)])
def skills() -> dict[str, object]:
    return {"skills": list_public_skills(settings)}


@app.post("/run", dependencies=[Depends(require_bearer)])
async def run_skill(request: RunRequest) -> dict[str, object]:
    return await submit_task(request)


@app.post("/admin/run", dependencies=[Depends(require_admin_bearer)])
async def admin_run_skill(request: AdminRunRequest) -> dict[str, object]:
    logger.warning(
        "admin run requested skill=%s reason_len=%s",
        request.skill_name,
        len(request.admin_reason),
    )
    return await submit_task(request, allow_admin_intent=True)


@app.post("/skills/custom", dependencies=[Depends(require_bearer)])
def create_custom_skill(request: CreateSkillRequest) -> dict[str, object]:
    return create_skill_submission(request, actor="user", approved=False)


@app.post("/admin/skills/custom", dependencies=[Depends(require_admin_bearer)])
def admin_create_custom_skill(request: CreateSkillRequest) -> dict[str, object]:
    return create_skill_submission(request, actor="admin", approved=True)


@app.get("/tasks/{task_id}", dependencies=[Depends(require_bearer)])
def get_task(task_id: str) -> dict[str, object]:
    store = task_store()
    task = store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return public_task_response(task)


@app.get("/tasks/{task_id}/files/{file_path:path}", dependencies=[Depends(require_bearer)])
def get_task_file(task_id: str, file_path: str) -> FileResponse:
    store = task_store()
    task = store.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    workspace = settings.runs_dir / task_id
    workspace_root = workspace.resolve()
    requested = (workspace / file_path).resolve()
    if not str(requested).startswith(str(workspace_root) + "/"):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not requested.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(requested), filename=requested.name)


@app.get("/v1/models", dependencies=[Depends(require_bearer)])
def models() -> dict[str, object]:
    data = [
        {
            "id": "codex-skill-gateway",
            "object": "model",
            "created": 0,
            "owned_by": "shenxiang.school",
        }
    ]
    for skill in load_registry(settings).values():
        if skill.enabled and skill.public:
            data.append(
                {
                    "id": f"codex-skill-{skill.name}",
                    "object": "model",
                    "created": 0,
                    "owned_by": "shenxiang.school",
                }
            )
    if image_provider_ready():
        data.append(
            {
                "id": settings.image_model,
                "object": "model",
                "created": 0,
                "owned_by": "shenxiang.school",
            }
        )
    return {"object": "list", "data": data}


@app.post("/v1/images/generations", dependencies=[Depends(require_bearer)])
async def image_generations(request: ImageGenerationRequest) -> dict[str, object]:
    if not image_provider_ready():
        raise HTTPException(status_code=503, detail="图像服务暂时不可用，请稍后重试。")

    payload = request.model_dump(exclude_none=True)
    payload["model"] = request.model or settings.image_model
    headers = {
        "Authorization": f"Bearer {image_api_key()}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(180.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(image_generation_url(), headers=headers, json=payload)
        if response.status_code >= 400 and should_retry_image_without_response_format(response, payload):
            retry_payload = dict(payload)
            retry_payload.pop("response_format", None)
            response = await client.post(image_generation_url(), headers=headers, json=retry_payload)
    if response.status_code >= 400:
        logger.warning("image generation request failed status=%s", response.status_code)
        raise HTTPException(
            status_code=502,
            detail="图像服务暂时不可用，请稍后重试。",
        )
    return response.json()


def should_retry_image_without_response_format(response: httpx.Response, payload: dict[str, object]) -> bool:
    if "response_format" not in payload:
        return False
    body = response.text.lower()
    return "response_format" in body and ("unknown parameter" in body or "unsupported" in body)


@app.post("/v1/chat/completions", dependencies=[Depends(require_bearer)])
async def chat_completions(request: ChatCompletionsRequest) -> object:
    user_query = messages_to_text(request.messages)
    skill_name = select_skill(user_query)
    if contains_admin_intent(user_query):
        content = "该操作仅限站长后台执行。"
        completion_id = f"chatcmpl_{uuid4().hex}"
        created = int(time.time())
        if request.stream:
            return StreamingResponse(
                stream_chat_completion(completion_id, created, request.model, content),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
        return chat_completion_response(completion_id, created, request.model, content)

    if is_skill_list_request(user_query):
        content = build_skill_list_markdown()
        completion_id = f"chatcmpl_{uuid4().hex}"
        created = int(time.time())
        if request.stream:
            return StreamingResponse(
                stream_chat_completion(completion_id, created, request.model, content),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )
        return chat_completion_response(completion_id, created, request.model, content)

    if provider_chat_ready():
        return await proxy_chat_completion(request, skill_name)

    completion_id = f"chatcmpl_{uuid4().hex}"
    created = int(time.time())
    run_request = RunRequest(
        skill_name=skill_name,
        task_type=task_type_for_skill(skill_name),
        user_intent="chat_completion",
        user_query=user_query,
        language="zh",
        user_level="未知",
        output_format="structured_markdown",
        mode="sync",
        need_image=skill_name == "image_prompt",
        need_file=False,
        risk_level="normal",
        params={},
        metadata={"source": "openai-compatible", **request.metadata},
    )
    result = await submit_task(run_request)
    content = result.get("result") or result.get("message") or ""
    if not result.get("success"):
        content = "任务执行失败：智能服务暂时不可用，请稍后重试。"

    if request.stream:
        return StreamingResponse(
            stream_chat_completion(completion_id, created, request.model, str(content)),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return chat_completion_response(completion_id, created, request.model, str(content))


def chat_completion_response(completion_id: str, created: int, model: str, content: str) -> dict[str, object]:
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def provider_chat_ready() -> bool:
    return (
        settings.codex_model_provider == "proxy"
        and bool(settings.codex_proxy_base_url)
        and bool(settings.codex_model)
    )


def image_provider_ready() -> bool:
    return bool(settings.image_api_base_url and settings.image_model and image_api_key())


async def proxy_chat_completion(request: ChatCompletionsRequest, skill_name: str) -> object:
    payload = build_provider_payload(request, skill_name)
    headers = {
        "Authorization": f"Bearer {proxy_api_key()}",
        "Content-Type": "application/json",
    }
    url = provider_chat_url()

    if request.stream:
        return StreamingResponse(
            stream_provider_chat(url, headers, payload, request.model),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    timeout = httpx.Timeout(190.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=payload)
    if response.status_code >= 400:
        logger.warning("skill gateway chat request failed status=%s", response.status_code)
        raise HTTPException(
            status_code=502,
            detail="智能服务暂时不可用，请稍后重试。",
        )
    return response.json()


def build_provider_payload(request: ChatCompletionsRequest, skill_name: str) -> dict[str, object]:
    payload: dict[str, object] = {
        "model": settings.codex_model,
        "stream": request.stream,
        "messages": [
            {"role": "system", "content": build_skill_system_prompt(skill_name)},
            *messages_to_openai(request.messages),
        ],
    }
    if request.temperature is not None:
        payload["temperature"] = request.temperature
    if request.max_tokens is not None:
        payload["max_tokens"] = request.max_tokens
    return payload


def build_skill_system_prompt(skill_name: str) -> str:
    skill_path = settings.skills_dir / skill_name / "SKILL.md"
    if not skill_path.exists():
        logger.warning("skill file missing skill=%s path=%s", skill_name, skill_path)
        skill_text = "该 Skill 的文件暂时不可用，请按注册表能力说明提供通用帮助。"
    else:
        skill_text = skill_path.read_text(encoding="utf-8")
    return f"""你是 shenxiang.school 的 Codex Skill Gateway 低延迟模型兼容端点。

当前必须使用并遵守 Skill: {skill_name}

以下是该 Skill 的完整规则：
{skill_text}

通用安全要求：
1. 不要编造真实文献、真实数据、真实引用、DOI、作者或期刊。
2. 不要承诺保证通过、保证降重、保证查重或保证分数。
3. 如果信息不足，先给出可用版本，再列出需要补充的信息。
4. 输出内容必须适合直接返回给 shenxiang.school 用户。
5. 不要暴露服务器路径、环境变量、API Key、内部错误堆栈或系统实现细节。
"""


def messages_to_openai(messages: list[object]) -> list[dict[str, str]]:
    converted: list[dict[str, str]] = []
    for message in messages:
        role = getattr(message, "role", "user")
        if role not in {"system", "user", "assistant"}:
            role = "user"
        content = getattr(message, "content", "")
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            text = "\n".join(item.get("text", "") for item in content if isinstance(item, dict))
        else:
            text = str(content)
        if text:
            converted.append({"role": role, "content": text})
    return converted or [{"role": "user", "content": ""}]


async def stream_provider_chat(
    url: str,
    headers: dict[str, str],
    payload: dict[str, object],
    requested_model: str,
) -> AsyncIterator[str]:
    timeout = httpx.Timeout(190.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code >= 400:
                    await response.aread()
                    logger.warning("skill gateway streaming request failed status=%s", response.status_code)
                    async for event in stream_error_message(
                        requested_model,
                        "任务执行失败：智能服务暂时不可用，请稍后重试。",
                    ):
                        yield event
                    return
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data:"):
                        yield f"{line}\n\n"
                    else:
                        yield f"data: {line}\n\n"
    except Exception as exc:
        logger.warning("skill gateway streaming request failed error_type=%s", type(exc).__name__)
        async for event in stream_error_message(
            requested_model,
            "任务执行失败：智能服务暂时不可用，请稍后重试。",
        ):
            yield event


async def stream_error_message(model: str, content: str) -> AsyncIterator[str]:
    completion_id = f"chatcmpl_{uuid4().hex}"
    created = int(time.time())
    first_chunk = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
    }
    yield f"data: {json.dumps(first_chunk, ensure_ascii=False)}\n\n"
    error_chunk = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
    }
    yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"
    final_chunk = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


def provider_chat_url() -> str:
    return f"{settings.codex_proxy_base_url.rstrip('/')}/chat/completions"


def image_generation_url() -> str:
    return f"{settings.image_api_base_url.rstrip('/')}/images/generations"


def proxy_api_key() -> str:
    import os

    return os.getenv(settings.codex_proxy_env_key, "")


def image_api_key() -> str:
    import os

    return os.getenv(settings.image_api_env_key, "")


def secret_values_for_error_redaction() -> list[str]:
    import os

    return [
        value
        for value in (
            settings.gateway_api_key,
            settings.codex_api_key,
            os.getenv("OPENAI_API_KEY", ""),
            os.getenv(settings.codex_proxy_env_key, ""),
            os.getenv(settings.image_api_env_key, ""),
        )
        if value
    ]


async def stream_chat_completion(
    completion_id: str,
    created: int,
    model: str,
    content: str,
):
    first_chunk = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
    }
    yield f"data: {json.dumps(first_chunk, ensure_ascii=False)}\n\n"

    for piece in chunk_text(content, 800):
        chunk = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model,
            "choices": [{"index": 0, "delta": {"content": piece}, "finish_reason": None}],
        }
        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0)

    final_chunk = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


def chunk_text(text: str, size: int) -> list[str]:
    if not text:
        return [""]
    return [text[index : index + size] for index in range(0, len(text), size)]


async def submit_task(request: RunRequest, allow_admin_intent: bool = False) -> dict[str, object]:
    task_id = f"task_{uuid4().hex[:16]}"
    skill = get_skill(settings, request.skill_name)
    if skill is None:
        return failed_response(
            task_id,
            "SKILL_NOT_FOUND",
            "Requested skill is not available.",
            request.skill_name,
        )
    is_allowed, error_code, error_message = validate_public_skill(skill)
    if not is_allowed:
        return failed_response(task_id, error_code, error_message, request.skill_name)
    if request.risk_level == "unsafe":
        return failed_response(
            task_id,
            "UNSAFE_REQUEST",
            "This request was classified as unsafe and was not executed.",
            request.skill_name,
        )
    if contains_forbidden_runtime_action(
        {
            "user_query": request.user_query,
            "params": request.params,
            "metadata": request.metadata,
        }
    ):
        return failed_response(
            task_id,
            "FORBIDDEN_RUNTIME_ACTION",
            "This request asks for forbidden file, server, or destructive operations.",
            request.skill_name,
        )
    if not allow_admin_intent and contains_admin_intent(
        {
            "user_query": request.user_query,
            "params": request.params,
            "metadata": request.metadata,
        }
    ):
        return rejected_admin_response(task_id, request.skill_name)

    workspace = settings.runs_dir / task_id
    task = {
        "task_id": task_id,
        "skill_name": request.skill_name,
        "status": "queued",
        "mode": request.mode,
        "queue": skill.queue,
        "workspace": str(workspace),
        "request": request.model_dump(),
        "skill": skill.task_dict(),
        "result_type": None,
        "cost_points": skill.cost_points,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    store = task_store()
    queue = task_queue()
    store.create(task)
    store.write_status_file(task)
    queue.enqueue(skill.queue, task_id)
    logger.info("queued task_id=%s skill=%s queue=%s mode=%s", task_id, request.skill_name, skill.queue, request.mode)

    if should_return_async(request, skill.queue):
        return queued_response(task_id, request.skill_name, "async", "queued")

    waited = await wait_for_completion(store, task_id, sync_wait_seconds(request, skill.timeout))
    if waited is None:
        return queued_response(task_id, request.skill_name, "async", "queued", "任务已进入队列")
    response = public_task_response(waited, preferred_mode="sync")
    return response


def create_skill_submission(request: CreateSkillRequest, actor: str, approved: bool) -> dict[str, object]:
    skill_root = settings.user_skills_dir / ("approved" if approved else "pending") / request.name
    skill_root_resolved = skill_root.resolve()
    user_skills_root = settings.user_skills_dir.resolve()
    if not str(skill_root_resolved).startswith(str(user_skills_root) + "/"):
        raise HTTPException(status_code=400, detail="Invalid skill path")
    if skill_root.exists():
        raise HTTPException(status_code=409, detail="Skill submission already exists")

    files = request.files or [
        {
            "path": "SKILL.md",
            "content": default_skill_content(request),
        }
    ]
    has_skill_md = False
    for file in files:
        path_text = file.path if hasattr(file, "path") else str(file["path"])
        content = file.content if hasattr(file, "content") else str(file["content"])
        if path_text == "SKILL.md":
            has_skill_md = True
        if contains_forbidden_runtime_action({"path": path_text, "content": content}):
            raise HTTPException(status_code=422, detail="Skill file contains forbidden server or destructive operations")
        try:
            safe_path = assert_safe_skill_file_path(path_text)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        target = (skill_root / safe_path).resolve()
        if not str(target).startswith(str(skill_root_resolved) + "/"):
            raise HTTPException(status_code=400, detail="Invalid skill file path")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    if not has_skill_md:
        raise HTTPException(status_code=422, detail="SKILL.md is required")

    manifest = {
        "name": request.name,
        "display_name": request.display_name or request.name,
        "description": request.description,
        "status": "approved" if approved else "pending_review",
        "actor": actor,
        "created_at": now_iso(),
        "delete_allowed": False,
    }
    (skill_root / "submission.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("skill submission created name=%s actor=%s approved=%s", request.name, actor, approved)
    return {
        "success": True,
        "name": request.name,
        "status": manifest["status"],
        "path": str(skill_root),
        "message": "Skill submitted for review." if not approved else "Admin skill submission created.",
    }


def default_skill_content(request: CreateSkillRequest) -> str:
    description = request.description or "User-created skill pending review."
    display_name = request.display_name or request.name
    return f"""---
name: {request.name}
description: {description}
---

# {display_name}

{description}

This skill is pending administrator review before production use.
"""


def should_return_async(request: RunRequest, queue_name: str) -> bool:
    if request.mode == "async":
        return True
    if request.mode == "auto" and queue_name not in {"fast", "image"}:
        return True
    return False


def sync_wait_seconds(request: RunRequest, skill_timeout: int) -> int:
    if request.mode == "sync":
        return min(skill_timeout + 10, settings.sync_wait_seconds)
    return min(skill_timeout + 10, settings.sync_wait_seconds)


async def wait_for_completion(store: TaskStore, task_id: str, wait_seconds: int) -> dict[str, object] | None:
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        task = store.get(task_id)
        if task and task.get("status") in {"completed", "failed"}:
            return task
        await asyncio.sleep(1)
    return store.get(task_id)


def public_task_response(task: dict[str, object], preferred_mode: str | None = None) -> dict[str, object]:
    status = str(task.get("status"))
    mode = preferred_mode or str(task.get("mode", "async"))
    if status == "completed":
        return {
            "success": True,
            "mode": mode,
            "task_id": task["task_id"],
            "skill_name": task["skill_name"],
            "status": "completed",
            "result_type": task.get("result_type") or "markdown",
            "result": task.get("result", ""),
            "usage": {
                "duration_ms": task.get("duration_ms", 0),
                "cost_points": task.get("cost_points", 0),
            },
        }
    if status == "failed":
        error = task.get("error") or safe_error("TASK_FAILED", "Task failed.")
        return {
            "success": False,
            "task_id": task["task_id"],
            "skill_name": task["skill_name"],
            "status": "failed",
            "error": error,
        }
    return queued_response(
        str(task["task_id"]),
        str(task["skill_name"]),
        "async",
        status,
        "任务已进入队列" if status == "queued" else "任务正在执行",
    )


def queued_response(
    task_id: str,
    skill_name: str,
    mode: str,
    status: str,
    message: str = "任务已进入队列",
) -> dict[str, object]:
    return {
        "success": True,
        "mode": mode,
        "task_id": task_id,
        "skill_name": skill_name,
        "status": status,
        "message": message,
    }


def failed_response(task_id: str, code: str, message: str, skill_name: str) -> dict[str, object]:
    return {
        "success": False,
        "task_id": task_id,
        "skill_name": skill_name,
        "status": "failed",
        "error": safe_error(code, message),
    }


def rejected_admin_response(task_id: str, skill_name: str) -> dict[str, object]:
    return {
        "success": False,
        "task_id": task_id,
        "skill_name": skill_name,
        "status": "rejected",
        "error": safe_error("ADMIN_ACTION_NOT_ALLOWED", "该操作仅限站长后台执行。"),
    }


def messages_to_text(messages: list[object]) -> str:
    parts: list[str] = []
    for message in messages:
        content = getattr(message, "content", "")
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            text_items = [item.get("text", "") for item in content if isinstance(item, dict)]
            parts.append("\n".join(text_items))
    return "\n".join(part for part in parts if part).strip()


def is_skill_list_request(text: str) -> bool:
    compact = "".join(text.lower().split())
    needles = (
        "列出技能",
        "列出你安装的技能",
        "列出已安装技能",
        "列举技能",
        "列举你安装的技能",
        "列举已安装技能",
        "你安装的技能",
        "安装的技能",
        "查看技能",
        "查看已安装技能",
        "可用技能",
        "可用技能列表",
        "启用的技能",
        "所有技能",
        "全部技能",
        "安装了哪些技能",
        "有哪些技能",
        "what skills",
        "list skills",
        "installed skills",
        "available skills",
    )
    return any(needle.replace(" ", "") in compact for needle in needles)


def build_skill_list_markdown() -> str:
    public_skills = list_public_skills(settings)
    if not public_skills:
        return "当前没有可用技能。"

    lines = ["当前已启用的 Codex 技能如下：", ""]
    for index, skill in enumerate(public_skills, start=1):
        lines.append(
            f"{index}. **{skill['display_name']}** (`{skill['name']}`)：{skill['description']}"
        )
    lines.extend(
        [
            "",
            "使用时可以直接描述任务，也可以明确写出技能英文标识，例如：`使用 paper_outline 生成论文大纲`。",
        ]
    )
    return "\n".join(lines)


def select_skill(text: str) -> str:
    lowered = text.lower()
    for skill in load_registry(settings).values():
        if skill.enabled and skill.public and (
            skill.name.lower() in lowered or skill.display_name.lower() in lowered
        ):
            return skill.name

    rules = [
        ("storyboard-creator", ["故事板", "分镜", "分镜表", "脚本转视频", "视频脚本", "视频提示词", "镜头列表", "剧组通告", "拍摄工作单", "首尾帧", "图片转视频", "图生视频", "shot list", "shot list sheet", "storyboard"]),
        ("shenxiang_image_gen", ["数学动画", "manim", "函数动画", "可视化动画", "生成图片", "生图", "画图", "gpt-image"]),
        ("literature_review", ["文献综述", "研究现状", "检索关键词", "doi", "literature"]),
        ("paper_polish", ["润色", "降口语化", "摘要润色", "polish"]),
        ("image_prompt", ["图片提示词", "midjourney", "封面图", "配图", "插图"]),
        ("teacher_lesson_plan", ["教案", "教学设计", "课堂活动", "lesson plan"]),
        ("study_plan", ["学习计划", "提分", "复习规划", "study plan"]),
        ("paper_outline", ["论文大纲", "开题", "论文结构", "选题", "outline"]),
    ]
    for skill, keywords in rules:
        if any(keyword in lowered for keyword in keywords):
            return skill
    return "study_plan"


def task_type_for_skill(skill_name: str) -> str:
    return {
        "paper_outline": "academic_writing",
        "paper_polish": "academic_writing",
        "literature_review": "academic_writing",
        "image_prompt": "image_prompt",
        "teacher_lesson_plan": "teacher_resource",
        "study_plan": "study_planning",
        "shenxiang_image_gen": "image_generation",
        "storyboard-creator": "video_storyboard",
    }.get(skill_name, "general_chat")
