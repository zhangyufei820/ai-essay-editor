from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import re
import shutil
import time
from pathlib import Path
from typing import Any, AsyncIterator
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, HTTPException, Header, Request
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from redis import ConnectionPool, Redis

from app import __version__
from app.config import ensure_codex_config, ensure_directories, get_settings, secret_values_for_redaction
from app.codex_runner import CodexRunner
from app.models import (
    AdminRunRequest,
    CreateSkillRequest,
    ModelRoleConfig,
    RunRequest,
    SkillMarkdownImportRequest,
    UserSkillCreateRequest,
    WorkspaceRunRequest,
)
from app.media_tools import MediaGenerationError, detect_media_kind, generate_media, selected_media_model
from app.model_access import (
    SERVER_ALLOWED_MODELS_METADATA_KEY,
    default_mode_models,
    is_claude_model,
    is_image_model as is_supported_image_model,
    is_text_model as is_supported_text_model,
    is_video_model as is_supported_video_model,
    mode_models_payload_from_metadata,
    mode_models_from_metadata,
    supported_image_models,
    supported_video_models,
)
from app.new_api_client import NewApiAuthError, NewApiClient, safe_json_dumps
from app.queue import RedisTaskQueue
from app.registry import (
    community_skills_root,
    get_skill,
    invalidate_skill_caches,
    publish_user_skill_to_community,
    list_community_skills,
    list_user_installed_skills,
    list_public_skills,
    promote_runtime_installed_skills,
    load_registry,
    skill_from_community_dir,
    skill_from_user_dir,
    user_installed_skills_root,
    validate_public_skill,
    warm_skill_caches,
)
from app.security import (
    UserContext,
    assert_safe_skill_file_path,
    assert_safe_workspace_file_path,
    contains_admin_intent,
    contains_destructive_action,
    contains_forbidden_runtime_action,
    contains_protected_path_reference,
    redact,
    require_admin_bearer,
    require_new_api_user,
    optional_new_api_user,
    public_error_code,
    public_error_message,
    safe_error,
    safe_user_path,
)
from app.task_store import TaskStore, now_iso

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Shenxiang Codex Workspace", version=__version__)
_model_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_skill_markdown_cache: dict[str, tuple[int, int, str]] = {}
_redis_pool: ConnectionPool | None = None

FAST_CHAT_HISTORY_LIMIT = 4
FAST_CHAT_HISTORY_CHARS = 1200
FAST_SKILL_HISTORY_LIMIT = 4
FAST_SKILL_HISTORY_CHARS = 1200
FAST_SKILL_MARKDOWN_CHAR_LIMIT = 12000
INTERNAL_TASK_FILE_NAMES = {
    "AGENTS.md",
    "prompt.txt",
    "stdout.txt",
    "stderr.txt",
}
INTERNAL_TASK_FILE_PARTS = {
    ".agents",
    "bin",
    "__pycache__",
}


class FastPathFallback(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class FastPathUpstreamError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

FAST_CHAT_SYSTEM_PROMPT = """你是星人 Codex 云端助手。
你运行在星人的 New API 网关之上，面向普通用户提供清晰、自然、专业的帮助。
如果用户只是日常问答、解释概念、写作或轻量建议，请直接回答，保持简洁但有质感。
不要声称你已经读取、修改、运行了服务器文件或命令。
如果用户请求代码执行、文件处理、项目修改、部署或终端命令，请提醒将切换到 Codex 工作区处理。"""

FAST_CHAT_EXECUTION_HINTS = (
    "运行",
    "执行",
    "终端",
    "命令",
    "shell",
    "bash",
    "zsh",
    "powershell",
    "docker",
    "nginx",
    "openresty",
    "部署",
    "重启",
    "日志",
    "报错",
    "修复代码",
    "修改代码",
    "改代码",
    "写入文件",
    "创建文件",
    "读取文件",
    "删除文件",
    "分析文件",
    "上传",
    "仓库",
    "项目",
    "代码库",
    "git",
    "commit",
    "diff",
    "npm",
    "pnpm",
    "yarn",
    "pip",
    "构建",
    "编译",
    "测试",
    "单元测试",
    "数据库",
    "sql",
    "api key",
    "环境变量",
    "run ",
    "execute",
    "terminal",
    "command",
    "fix the code",
    "modify",
    "edit file",
    "read file",
    "repository",
    "workspace",
    "deploy",
    "build",
    "test",
    "stack trace",
)

MEDIA_MODEL_HINTS = ("image", "imagine", "video", "seedance", "sora", "veo")
FAST_SKILL_BLOCKING_HINTS = (
    "终端",
    "命令",
    "shell",
    "bash",
    "zsh",
    "powershell",
    "docker",
    "nginx",
    "openresty",
    "部署",
    "重启",
    "日志",
    "报错",
    "修复代码",
    "修改代码",
    "改代码",
    "写入文件",
    "创建文件",
    "读取文件",
    "删除文件",
    "分析文件",
    "上传",
    "附件",
    "仓库",
    "项目",
    "代码库",
    "git",
    "commit",
    "diff",
    "npm",
    "pnpm",
    "yarn",
    "pip",
    "构建",
    "编译",
    "数据库",
    "sql",
    "api key",
    "环境变量",
    "run ",
    "terminal",
    "execute command",
    "fix the code",
    "modify file",
    "edit file",
    "read file",
    "repository",
    "workspace",
    "deploy",
    "build",
    "stack trace",
)
XINGREN_API_ONBOARDING_FAST_PROMPT = """你是星人 API 接入老师，只负责帮用户把星人 API 配到用户自己的本机客户端。
不要把当前云端 Codex 工作区当成目标环境；云端有系统配置不代表用户电脑已经配置好。
严禁回答“云端 Codex 已配置好所以不用配置”“当前环境变量可用就完成了”。

回答规则：
1. 先说明目标是配置用户自己的电脑或第三方客户端。
2. 一次只给一个可复制步骤，优先给终端/PowerShell 命令，不让小白手工改 JSON/TOML/YAML。
3. 引导用户到 https://api.aiphui.top/codex/ 的“第三方接入”复制对应专用 key。
4. OpenAI 兼容客户端使用 Base URL: https://api.aiphui.top/v1。
5. Claude Code 使用 Base URL: https://api.aiphui.top/claude。
6. 图像生成使用 /v1/images/generations；不要让用户用 /v1/chat/completions 生成图片。
7. 如果用户没说系统，先给 macOS/Linux 和 Windows 的识别命令，让用户回传结果。
8. 如果用户贴出完整 key，只在当前步骤使用；总结时必须脱敏。
9. 最后要求用户把终端最后几行结果发回来，再继续下一步。

语气：耐心、具体、一步一步，不要声称已经替用户在本机执行。"""
SKILL_FRONT_MATTER_RE = re.compile(r"^---\s*\n(?P<body>[\s\S]{0,4000}?)\n---\s*", re.MULTILINE)
SAFE_SKILL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]{2,80}$")

web_dir = Path(__file__).resolve().parents[1] / "web"


class NoCacheStaticFiles(StaticFiles):
    def file_response(self, *args: Any, **kwargs: Any) -> FileResponse:
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response


if web_dir.is_dir():
    app.mount("/assets", NoCacheStaticFiles(directory=str(web_dir / "assets")), name="assets")
    app.mount("/codex/assets", NoCacheStaticFiles(directory=str(web_dir / "assets")), name="codex-assets")


def redis_client() -> Redis:
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = ConnectionPool.from_url(settings.redis_url, decode_responses=False)
    return Redis(connection_pool=_redis_pool)


def task_store() -> TaskStore:
    return TaskStore(redis_client(), settings)


def task_queue() -> RedisTaskQueue:
    return RedisTaskQueue(redis_client())


async def require_codex_user(
    request: Request,
    credentials=Depends(optional_new_api_user),
    new_api_user: str = Header(default="", alias="X-New-Api-User"),
) -> UserContext:
    if credentials is not None:
        return credentials
    user_id = new_api_user or request.headers.get("New-Api-User", "")
    cookie_header = request.headers.get("cookie", "")
    try:
        data = await NewApiClient(settings, redis_client()).bootstrap_user(user_id.strip(), cookie_header)
    except NewApiAuthError as exc:
        raise HTTPException(status_code=401, detail=public_error_message(str(exc), "登录态无效，请重新登录。")) from exc
    user = data.get("user") if isinstance(data.get("user"), dict) else {}
    allowed_models_by_mode = normalize_user_allowed_models(user)
    metadata = user.get("metadata") if isinstance(user.get("metadata"), dict) else {}
    return UserContext(
        api_key=str(data["api_key"]),
        api_keys=data.get("api_keys") if isinstance(data.get("api_keys"), dict) else None,
        user_id=str(user.get("id") or user_id),
        key_hint=str(data.get("key_hint") or "sk-****"),
        username=str(user.get("username") or user.get("display_name") or ""),
        group=str(user.get("group") or ""),
        quota=user.get("quota"),
        used_quota=user.get("used_quota"),
        request_count=user.get("request_count"),
        allowed_models_by_mode=allowed_models_by_mode if SERVER_ALLOWED_MODELS_METADATA_KEY in metadata else None,
    )


@app.on_event("startup")
def startup() -> None:
    ensure_directories(settings)
    ensure_codex_config(settings)
    try:
        warm_skill_caches(settings)
    except Exception as exc:
        logger.warning("skill cache warmup failed: %s", safe_error("SKILL_CACHE_WARMUP_FAILED", str(exc)))


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    index_path = web_dir / "index.html"
    if not index_path.exists():
        return HTMLResponse("<h1>Shenxiang Codex Workspace</h1>")
    return HTMLResponse(index_path.read_text(encoding="utf-8"))


@app.head("/")
def index_head() -> None:
    return None


@app.get("/codex", response_class=HTMLResponse)
@app.get("/codex/", response_class=HTMLResponse)
def codex_index() -> HTMLResponse:
    return index()


@app.head("/codex")
@app.head("/codex/")
def codex_head() -> None:
    return None


@app.get("/docs/third-party-api-keys", response_class=HTMLResponse)
@app.get("/codex/docs/third-party-api-keys", response_class=HTMLResponse)
def third_party_api_keys_doc() -> HTMLResponse:
    doc_path = Path(__file__).resolve().parents[1] / "docs" / "third_party_api_keys.md"
    if not doc_path.exists():
        return HTMLResponse("<h1>第三方接入教程</h1><p>文档暂未发布。</p>", status_code=404)
    markdown = doc_path.read_text(encoding="utf-8")
    return HTMLResponse(markdown_document_html("星人 API 第三方客户端接入教程", markdown))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name, "version": settings.version}


@app.get("/api/bootstrap", dependencies=[Depends(require_codex_user)])
@app.get("/codex/api/bootstrap", dependencies=[Depends(require_codex_user)])
async def bootstrap(user: UserContext = Depends(require_codex_user)) -> dict[str, Any]:
    mode_models = user_mode_models(user)
    return {
        "user": {
            "id": user.user_id,
            "key_hint": user.key_hint,
            "username": user.username,
            "quota": user.quota,
            "used_quota": user.used_quota,
            "request_count": user.request_count,
        },
        "defaults": default_model_config().model_dump(),
        "suggestions": model_suggestions(),
        "skills": list_user_visible_skills(user),
        "models": fast_models_payload(user),
        "allowed_models": list(mode_models["codex"]),
        "model_modes": model_modes(user),
        "limits": {
            "max_files_per_task": settings.max_files_per_task,
            "max_file_bytes": settings.max_file_bytes,
            "task_retention_seconds": settings.task_retention_seconds,
        },
    }


@app.post("/api/provision")
@app.post("/codex/api/provision")
async def provision_account_keys(
    request: Request,
    credentials=Depends(optional_new_api_user),
    new_api_user: str = Header(default="", alias="X-New-Api-User"),
) -> dict[str, Any]:
    if credentials is not None:
        return {
            "success": False,
            "message": "请使用网页登录态打开星人控制台；第三方 Bearer Key 不会再自动创建新的系统 Key。",
            "keys": [],
        }
    user_id = (new_api_user or request.headers.get("New-Api-User", "")).strip()
    cookie_header = request.headers.get("cookie", "")
    try:
        data = await NewApiClient(settings, redis_client()).ensure_current_user_tokens(user_id, cookie_header)
    except NewApiAuthError as exc:
        raise HTTPException(status_code=401, detail=public_error_message(str(exc), "登录态无效，请重新登录。")) from exc
    user = data.get("user") if isinstance(data.get("user"), dict) else {}
    key_map = data.get("api_keys") if isinstance(data.get("api_keys"), dict) else {}
    mode_models = normalize_user_allowed_models(user)
    return {
        "success": True,
        "user": {
            "id": str(user.get("id") or user_id),
            "username": str(user.get("username") or user.get("display_name") or ""),
        },
        "keys": provision_key_profiles(key_map, mode_models),
        "notes": [
            "系统 Key 会自动创建并维护模型权限。",
            "Codex、Claude、图像工坊、视频工坊会自动选择对应 Key。",
            "把 Key 接入第三方客户端时，请只复制对应用途的 Key，不要发送给他人。",
        ],
    }


@app.get("/api/models", dependencies=[Depends(require_codex_user)])
@app.get("/codex/api/models", dependencies=[Depends(require_codex_user)])
async def models(user: UserContext = Depends(require_codex_user)) -> dict[str, Any]:
    return await fetch_new_api_models(user)


@app.get("/api/skills", dependencies=[Depends(require_codex_user)])
@app.get("/codex/api/skills", dependencies=[Depends(require_codex_user)])
def skills(user: UserContext = Depends(require_codex_user)) -> dict[str, Any]:
    return {"skills": list_user_visible_skills(user)}


@app.post("/api/skills", dependencies=[Depends(require_codex_user)])
@app.post("/codex/api/skills", dependencies=[Depends(require_codex_user)])
def create_user_skill(
    request: UserSkillCreateRequest,
    user: UserContext = Depends(require_codex_user),
) -> dict[str, Any]:
    return create_skill_submission(request, user)


@app.post("/api/skills/import-markdown", dependencies=[Depends(require_codex_user)])
@app.post("/codex/api/skills/import-markdown", dependencies=[Depends(require_codex_user)])
def import_markdown_skill(
    request: SkillMarkdownImportRequest,
    user: UserContext = Depends(require_codex_user),
) -> dict[str, Any]:
    skill_request = skill_request_from_markdown(request)
    return create_skill_submission(skill_request, user)


@app.post("/api/skills/{skill_name}/publish-community", dependencies=[Depends(require_codex_user)])
@app.post("/codex/api/skills/{skill_name}/publish-community", dependencies=[Depends(require_codex_user)])
def publish_skill_to_community(
    skill_name: str,
    user: UserContext = Depends(require_codex_user),
) -> dict[str, Any]:
    if not SAFE_SKILL_NAME_RE.match(skill_name):
        raise HTTPException(status_code=422, detail="Invalid skill name")
    try:
        result = publish_user_skill_to_community(settings, user.user_id, skill_name, user.username)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Personal skill not found") from exc
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc) or "Community skill already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    logger.info("user skill submitted for community review name=%s user=%s", skill_name, user.key_hint)
    return {
        "success": True,
        "name": result.get("name", skill_name),
        "status": "pending_review",
        "message": "Skill 已提交社区审核，通过后才会对所有用户可见。",
        "skill": result,
    }


@app.post("/api/run", dependencies=[Depends(require_codex_user)])
@app.post("/codex/api/run", dependencies=[Depends(require_codex_user)])
async def workspace_run(
    request: WorkspaceRunRequest,
    user: UserContext = Depends(require_codex_user),
) -> dict[str, Any]:
    return await submit_workspace_task(request, user)


@app.post("/api/chat/stream", dependencies=[Depends(require_codex_user)])
@app.post("/codex/api/chat/stream", dependencies=[Depends(require_codex_user)])
async def chat_stream(
    request: WorkspaceRunRequest,
    user: UserContext = Depends(require_codex_user),
) -> StreamingResponse:
    task_or_error = build_direct_task(request, user)
    if task_or_error.get("status") == "failed":
        async def error_stream():
            yield sse_event(task_or_error)
        return StreamingResponse(error_stream(), media_type="text/event-stream")
    media_kind = detect_media_kind(request)
    if media_kind:
        async def media_event_stream():
            async for event in stream_media_generation(request, user, task_or_error, media_kind):
                yield sse_event(event)

        return StreamingResponse(
            media_event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    if should_use_fast_chat(request):
        async def fast_event_stream():
            async for event in stream_fast_chat(request, user, task_or_error):
                yield sse_event(event)

        return StreamingResponse(
            fast_event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    if should_use_fast_skill(request, task_or_error):
        async def fast_skill_event_stream():
            async for event in stream_fast_skill(request, user, task_or_error):
                yield sse_event(event)

        return StreamingResponse(
            fast_skill_event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    runner = CodexRunner(settings)

    async def event_stream():
        yield sse_event({"type": "status", "message": "已同步账户", "task_id": task_or_error["task_id"]})
        async for event in runner.stream(task_or_error):
            yield sse_event(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/tasks/{task_id}", dependencies=[Depends(require_codex_user)])
@app.get("/codex/api/tasks/{task_id}", dependencies=[Depends(require_codex_user)])
def get_task(task_id: str, user: UserContext = Depends(require_codex_user)) -> dict[str, Any]:
    store = task_store()
    task = store.get(task_id)
    if task is None or task.get("user_id") != user.user_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return public_task_response(task)


@app.get("/api/tasks/{task_id}/files/{file_path:path}", dependencies=[Depends(require_codex_user)])
@app.get("/codex/api/tasks/{task_id}/files/{file_path:path}", dependencies=[Depends(require_codex_user)])
def get_task_file(
    task_id: str,
    file_path: str,
    user: UserContext = Depends(require_codex_user),
) -> FileResponse:
    store = task_store()
    task = store.get(task_id)
    if task is None or task.get("user_id") != user.user_id:
        raise HTTPException(status_code=404, detail="Task not found")
    workspace = Path(str(task["workspace"]))
    workspace_root = workspace.resolve()
    requested = (workspace / file_path).resolve()
    if requested != workspace_root and not str(requested).startswith(str(workspace_root) + "/"):
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not requested.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    normalized_parts = set(Path(file_path).parts)
    if Path(file_path).name in INTERNAL_TASK_FILE_NAMES or normalized_parts.intersection(INTERNAL_TASK_FILE_PARTS):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(requested), filename=requested.name)


@app.post("/admin/run", dependencies=[Depends(require_admin_bearer)])
async def admin_run_skill(request: AdminRunRequest) -> dict[str, object]:
    logger.warning("admin run requested skill=%s reason_len=%s", request.skill_name, len(request.admin_reason))
    pseudo_user = UserContext(api_key="", user_id="admin", key_hint="admin")
    workspace_request = WorkspaceRunRequest(
        user_query=request.user_query,
        skill_name=request.skill_name,
        task_type=request.task_type,
        user_intent=request.user_intent,
        output_format=request.output_format,
        mode=request.mode,
        risk_level=request.risk_level,
        params=request.params,
        metadata=request.metadata,
    )
    return await submit_workspace_task(workspace_request, pseudo_user, allow_admin_intent=True)


@app.post("/admin/cleanup", dependencies=[Depends(require_admin_bearer)])
def admin_cleanup() -> dict[str, Any]:
    return cleanup_expired_runs()


async def fetch_new_api_models(user: UserContext) -> dict[str, Any]:
    cached = get_cached_models(user.api_key)
    if cached is not None:
        return cached
    headers = {"Authorization": f"Bearer {user.api_key}"}
    url = f"{settings.new_api_base_url}/models"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0)) as client:
            response = await client.get(url, headers=headers)
    except Exception as exc:
        logger.warning("model list request failed error_type=%s", type(exc).__name__)
        return {"ok": False, "models": [], "error": "模型列表暂时不可用，请稍后重试。"}
    if response.status_code >= 400:
        logger.warning("model list request failed status=%s", response.status_code)
        return {"ok": False, "models": [], "status": response.status_code, "error": "模型列表暂时不可用，请稍后重试。"}
    try:
        payload = response.json()
    except ValueError:
        return {"ok": False, "models": [], "error": "模型列表暂时不可用，请稍后重试。"}
    models = [item.get("id", "") for item in payload.get("data", []) if isinstance(item, dict) and item.get("id")]
    allowed = set(user_mode_models(user)["codex"])
    visible_models = sorted(model for model in set(models) if model in allowed)
    result = {"ok": True, "models": visible_models, "raw_count": len(models)}
    set_cached_models(user.api_key, result)
    return copy.deepcopy(result)


def fast_models_payload(user: UserContext | None = None) -> dict[str, Any]:
    mode_models = user_mode_models(user)
    return {
        "ok": True,
        "models": list(mode_models["codex"]),
        "raw_count": len(mode_models["codex"]),
        "source": "configured",
    }


def get_cached_models(api_key: str) -> dict[str, Any] | None:
    cache_key = model_cache_key(api_key)
    cached = _model_cache.get(cache_key)
    if cached is None:
        return None
    expires_at, payload = cached
    if expires_at <= time.monotonic():
        _model_cache.pop(cache_key, None)
        return None
    return copy.deepcopy(payload)


def set_cached_models(api_key: str, payload: dict[str, Any]) -> None:
    ttl = max(1, int(settings.models_cache_seconds or 300))
    _model_cache[model_cache_key(api_key)] = (time.monotonic() + ttl, copy.deepcopy(payload))


def model_cache_key(api_key: str) -> str:
    return hashlib.sha256(str(api_key or "").encode("utf-8")).hexdigest()


def default_model_config() -> ModelRoleConfig:
    return ModelRoleConfig(
        chat_main=settings.default_chat_model,
        small_fast=settings.default_small_fast_model,
        web_search=settings.default_web_search_model,
        image_generation=settings.default_image_model,
        video_generation=settings.default_video_model,
        code_review=settings.default_code_model,
    )


def model_suggestions() -> dict[str, Any]:
    return {
        "chat_main": {
            "label": "对话主模型",
            "description": "日常问答、长任务规划、综合写作，默认走低延迟文本模型。",
            "recommended": settings.default_chat_model,
        },
        "small_fast": {
            "label": "小模型/快速响应",
            "description": "标题、改写、短问答、低成本任务，适合做默认快速模型。",
            "recommended": settings.default_small_fast_model,
        },
        "web_search": {
            "label": "联网检索",
            "description": "需要资料整理、搜索摘要、信息核对时使用。若后台没有检索模型，可先用主模型。",
            "recommended": settings.default_web_search_model,
        },
        "image_generation": {
            "label": "图像生成",
            "description": "生成图片、封面、视觉草图时使用。只有当你的 New API Key 对该模型有权限时可用。",
            "recommended": settings.default_image_model,
        },
        "video_generation": {
            "label": "视频生成",
            "description": "生成短视频、图生视频、首尾帧任务时使用。建议只给付费用户开放。",
            "recommended": settings.default_video_model,
        },
        "code_review": {
            "label": "代码审查",
            "description": "代码解释、审查、自动修改建议，默认先走快速文本模型。",
            "recommended": settings.default_code_model,
        },
    }


def model_modes(user: UserContext | None = None) -> dict[str, Any]:
    mode_models = user_mode_models(user)
    return {
        "codex": {
            "label": "对话 / 代码",
            "description": "普通对话、代码审查、文件分析和 Skill 工作区。",
            "models": ordered_codex_models(user),
            "token_name": settings.auto_token_name,
            "billing": "按文本 Token 计费，适合日常任务和代码任务。",
        },
        "claude": {
            "label": "Claude 高阶",
            "description": "高质量长文、剧本、复杂推理和高级创作。",
            "models": list(mode_models["claude"]),
            "token_name": settings.claude_token_name,
            "billing": "按 Claude 高阶模型输入/输出 Token 计费，价格高于普通对话。",
        },
        "image": {
            "label": "图像生成",
            "description": "Image 2 和 Grok 图像是独立模型，请按任务明确选择。",
            "models": list(mode_models["image"]),
            "token_name": settings.image_token_name,
            "billing": "按张计费。系统不会在 Image 2 与 Grok 图像之间自动切换。",
        },
        "video": {
            "label": "视频生成",
            "description": "Seedance / Grok 文生视频、图生视频。",
            "models": list(mode_models["video"]),
            "token_name": settings.video_token_name,
            "billing": "按秒或按次计费。Seedance 2.0 当前展示价 ¥6/15秒，生成后请立即下载。",
        },
    }


def provision_key_profiles(key_map: dict[str, str], mode_models: dict[str, tuple[str, ...]] | None = None) -> list[dict[str, Any]]:
    pseudo_user = None
    if mode_models:
        pseudo_user = UserContext(api_key="", user_id="", key_hint="sk-****", allowed_models_by_mode=mode_models)
    modes = model_modes(pseudo_user)
    public_root = settings.public_base_url.removesuffix("/codex").rstrip("/")
    claude_base_url = f"{public_root}/claude"
    profiles = [
        {
            "mode": "codex",
            "usage": "对话、代码、普通 OpenAI-compatible 客户端",
            "base_url": f"{settings.new_api_base_url}",
            "endpoint": "/v1/chat/completions",
        },
        {
            "mode": "claude",
            "usage": "Claude Code / Claude 原生协议客户端",
            "base_url": claude_base_url,
            "endpoint": "/v1/messages",
        },
        {
            "mode": "image",
            "usage": "图像生成、图像编辑、第三方生图客户端",
            "base_url": f"{settings.new_api_base_url}",
            "endpoint": "/v1/images/generations 或 /v1/images/edits",
        },
        {
            "mode": "video",
            "usage": "视频生成、图生视频、第三方视频工作流",
            "base_url": f"{settings.new_api_base_url}",
            "endpoint": "按模型文档使用视频生成接口",
        },
    ]
    result: list[dict[str, Any]] = []
    for profile in profiles:
        mode = profile["mode"]
        key = str(key_map.get(mode) or "")
        config = modes.get(mode, {})
        result.append(
            {
                **profile,
                "name": config.get("token_name", ""),
                "label": config.get("label", mode),
                "billing": config.get("billing", ""),
                "models": config.get("models", []),
                "key": key,
                "key_hint": key_hint(key) if key else "未创建",
            }
        )
    return result


async def submit_workspace_task(
    request: WorkspaceRunRequest,
    user: UserContext,
    allow_admin_intent: bool = False,
) -> dict[str, Any]:
    attach_allowed_models_metadata(request, user)
    if request.risk_level == "unsafe":
        return failed_response("task_rejected", "UNSAFE_REQUEST", "This request was classified as unsafe.", request.skill_name)
    if len(request.files) > settings.max_files_per_task:
        return failed_response("task_rejected", "TOO_MANY_FILES", "Too many files in this task.", request.skill_name)
    for file in request.files:
        try:
            assert_safe_workspace_file_path(file.path)
        except ValueError as exc:
            return failed_response("task_rejected", "INVALID_FILE_PATH", str(exc), request.skill_name)
        if file.content.startswith("data:image/"):
            if len(file.content.encode("utf-8")) > int(settings.max_image_bytes * 1.4):
                return failed_response("task_rejected", "IMAGE_TOO_LARGE", f"Image {file.path} is too large.", request.skill_name)
        elif len(file.content.encode("utf-8")) > settings.max_file_bytes:
            return failed_response("task_rejected", "FILE_TOO_LARGE", f"File {file.path} is too large.", request.skill_name)
    if contains_forbidden_runtime_action(runtime_guard_payload(request)):
        return failed_response(
            "task_rejected",
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
        return rejected_admin_response("task_rejected", request.skill_name)

    skill = find_user_or_public_skill(user, request.skill_name)
    if skill is None:
        return failed_response("task_rejected", "SKILL_NOT_FOUND", "Requested skill is not available.", request.skill_name)
    is_allowed, error_code, error_message = validate_public_skill(skill)
    if not is_allowed:
        return failed_response("task_rejected", error_code, error_message, request.skill_name)

    task_id = f"task_{uuid4().hex[:16]}"
    workspace = safe_user_path(settings.runs_dir, user.user_id, task_id)
    task = {
        "task_id": task_id,
        "user_id": user.user_id,
        "key_hint": user.key_hint,
        "credential_ref": f"redis:codex:task-secret:{task_id}",
        "skill_name": request.skill_name,
        "status": "queued",
        "mode": request.mode,
        "queue": skill.queue,
        "workspace": str(workspace),
        "request": request.model_dump(exclude={"files"}),
        "files": [item.model_dump() for item in request.files],
        "model_config": request.model_roles.model_dump(),
        "model_role": request.model_role,
        "skill": skill.task_dict(),
        "result_type": None,
        "cost_points": skill.cost_points,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    store = task_store()
    queue = task_queue()
    task_user = user_for_mode(user, request_mode(request))
    store.put_task_secret(task_id, task_user.api_key)
    task["key_hint"] = task_user.key_hint
    store.create(task)
    store.write_status_file(task)
    queue.enqueue(skill.queue, task_id)
    logger.info(
        "queued task_id=%s user=%s skill=%s queue=%s mode=%s",
        task_id,
        user.key_hint,
        request.skill_name,
        skill.queue,
        request.mode,
    )

    if should_return_async(request.mode, skill.queue):
        return queued_response(task_id, request.skill_name, "async", "queued")

    waited = await wait_for_completion(store, task_id, sync_wait_seconds(request.mode, skill.timeout))
    if waited is None or waited.get("status") not in {"completed", "failed"}:
        return queued_response(task_id, request.skill_name, "async", "queued", "任务已进入队列")
    return public_task_response(waited, preferred_mode="sync")


def build_direct_task(request: WorkspaceRunRequest, user: UserContext) -> dict[str, Any]:
    attach_allowed_models_metadata(request, user)
    rejection = validate_workspace_request(request)
    if rejection:
        return rejection
    if contains_admin_intent(
        {
            "user_query": request.user_query,
            "params": request.params,
            "metadata": request.metadata,
        }
    ):
        return rejected_admin_response("task_rejected", request.skill_name)
    skill = find_user_or_public_skill(user, request.skill_name)
    if skill is None:
        return failed_response("task_rejected", "SKILL_NOT_FOUND", "Requested skill is not available.", request.skill_name)
    is_allowed, error_code, error_message = validate_public_skill(skill)
    if not is_allowed:
        return failed_response("task_rejected", error_code, error_message, request.skill_name)
    task_id = f"stream_{uuid4().hex[:16]}"
    workspace = safe_user_path(settings.runs_dir, user.user_id, task_id)
    return {
        "task_id": task_id,
        "user_id": user.user_id,
        "key_hint": user.key_hint,
        "skill_name": request.skill_name,
        "status": "running",
        "mode": "stream",
        "queue": skill.queue,
        "workspace": str(workspace),
        "request": request.model_dump(exclude={"files"}),
        "files": [item.model_dump() for item in request.files],
        "model_config": request.model_roles.model_dump(),
        "model_role": request.model_role,
        "skill": skill.task_dict(),
        "result_type": None,
        "cost_points": skill.cost_points,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "_user_api_key": user_for_mode(user, request_mode(request)).api_key,
    }


def validate_workspace_request(request: WorkspaceRunRequest) -> dict[str, Any] | None:
    if request.risk_level == "unsafe":
        return failed_response("task_rejected", "UNSAFE_REQUEST", "This request was classified as unsafe.", request.skill_name)
    if len(request.files) > settings.max_files_per_task:
        return failed_response("task_rejected", "TOO_MANY_FILES", "Too many files in this task.", request.skill_name)
    for file in request.files:
        try:
            assert_safe_workspace_file_path(file.path)
        except ValueError as exc:
            return failed_response("task_rejected", "INVALID_FILE_PATH", str(exc), request.skill_name)
        if file.content.startswith("data:image/"):
            if len(file.content.encode("utf-8")) > int(settings.max_image_bytes * 1.4):
                return failed_response("task_rejected", "IMAGE_TOO_LARGE", f"Image {file.path} is too large.", request.skill_name)
        elif len(file.content.encode("utf-8")) > settings.max_file_bytes:
            return failed_response("task_rejected", "FILE_TOO_LARGE", f"File {file.path} is too large.", request.skill_name)
    if contains_forbidden_runtime_action(runtime_guard_payload(request)):
        return failed_response(
            "task_rejected",
            "FORBIDDEN_RUNTIME_ACTION",
            "This request asks for forbidden file, server, or destructive operations.",
            request.skill_name,
        )
    return None


def runtime_guard_payload(request: WorkspaceRunRequest) -> dict[str, Any]:
    """Scan current intent and upload paths without treating docs as commands.

    User-created SKILL.md files legitimately describe reading uploaded files,
    creating workspace files, and installing skills. Those documents are checked
    during installation for protected paths and destructive operations, so the
    runtime guard should not rescan their full text and reject normal skills.
    """
    return {
        "user_query": request.user_query,
        "params": request.params,
        "metadata": request.metadata,
        "files": [
            {
                "path": item.path,
                "kind": "image" if item.content.startswith("data:image/") else "text",
                "bytes": len(item.content.encode("utf-8")),
            }
            for item in request.files
        ],
    }


def sse_event(payload: dict[str, Any]) -> str:
    return f"data: {safe_json_dumps(payload)}\n\n"


def should_use_fast_chat(request: WorkspaceRunRequest) -> bool:
    if request.files:
        return False
    if request.skill_name != "codex_workspace":
        return False
    if request_mode(request) == "claude":
        return True
    if request.model_role not in {"chat_main", "small_fast"}:
        return False
    if request.risk_level != "normal":
        return False
    query = normalize_for_intent_match(request.user_query)
    if not query:
        return False
    if any(hint in query for hint in FAST_CHAT_EXECUTION_HINTS):
        return False
    # Plain Q&A, greetings, writing and explanation tasks do not need a fresh
    # Codex CLI workspace. Keeping them on the API stream avoids cold-start cost.
    return True


def normalize_for_intent_match(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


async def stream_media_generation(
    request: WorkspaceRunRequest,
    user: UserContext,
    task: dict[str, Any],
    media_kind: str,
) -> AsyncIterator[dict[str, Any]]:
    task_id = str(task.get("task_id") or f"media_{uuid4().hex[:16]}")
    store = task_store()
    store.create({key: value for key, value in task.items() if not str(key).startswith("_")})
    model = selected_media_model(settings, request, media_kind)
    label = "图像" if media_kind == "image" else "视频"
    yield {
        "type": "status",
        "message": f"已识别为{label}生成任务",
        "mode": "media_generation",
        "task_id": task_id,
    }
    yield {
        "type": "status",
        "message": f"正在连接 {model}",
        "mode": "media_generation",
        "task_id": task_id,
    }
    try:
        generation_task = asyncio.create_task(generate_media(settings, request, user_for_mode(user, media_kind), task, media_kind))
        heartbeat = 0
        while not generation_task.done():
            await asyncio.sleep(10)
            if generation_task.done():
                break
            heartbeat += 1
            elapsed = heartbeat * 10
            yield {
                "type": "status",
                "message": f"{label}生成中，已等待 {elapsed}s，请保持页面打开",
                "mode": "media_generation",
                "task_id": task_id,
            }
        result = await generation_task
    except MediaGenerationError as exc:
        store.update(
            task_id,
            status="failed",
            result_type=media_kind,
            error=safe_error("MEDIA_GENERATION_FAILED", redact(str(exc), secret_values_for_redaction(settings, user.api_key))),
        )
        yield {
            "type": "error",
            "code": "MEDIA_GENERATION_FAILED",
            "message": public_error_message(
                redact(str(exc), secret_values_for_redaction(settings, user.api_key)),
                "媒体服务暂时不可用，请稍后重试。",
            ),
            "task_id": task_id,
        }
        return
    except Exception as exc:
        store.update(
            task_id,
            status="failed",
            result_type=media_kind,
            error=safe_error("MEDIA_REQUEST_FAILED", redact(str(exc), secret_values_for_redaction(settings, user.api_key))),
        )
        yield {
            "type": "error",
            "code": "MEDIA_REQUEST_FAILED",
            "message": public_error_message(
                redact(str(exc), secret_values_for_redaction(settings, user.api_key)),
                "媒体服务暂时不可用，请稍后重试。",
            ),
            "task_id": task_id,
        }
        return
    yield {
        "type": "status",
        "message": f"{label}已生成，正在准备预览",
        "mode": "media_generation",
        "task_id": task_id,
    }
    markdown = result.markdown()
    store.update(
        task_id,
        status="completed",
        result_type=result.media_type,
        result=markdown,
        duration_ms=result.duration_ms,
        finished_at=now_iso(),
    )
    logger.info(
        "media_generation completed task_id=%s user=%s model=%s type=%s duration_ms=%s assets=%s",
        task_id,
        user.key_hint,
        result.model,
        result.media_type,
        result.duration_ms,
        len(result.urls),
    )
    yield {
        "type": "complete",
        "status": "completed",
        "result": markdown,
        "result_type": result.media_type,
        "duration_ms": result.duration_ms,
        "mode": "media_generation",
        "task_id": task_id,
        "media": {
            "type": result.media_type,
            "model": result.model,
            "urls": result.local_urls or result.urls,
        },
    }


async def stream_fast_chat(
    request: WorkspaceRunRequest,
    user: UserContext,
    task: dict[str, Any],
) -> AsyncIterator[dict[str, Any]]:
    task_id = str(task.get("task_id") or f"fast_{uuid4().hex[:16]}")
    started = time.monotonic()
    mode = request_mode(request)
    mode_user = user_for_mode(user, mode)
    model = selected_fast_text_model(request)
    headers = {
        "Authorization": f"Bearer {mode_user.api_key}",
        "Content-Type": "application/json",
    }
    responses_payload = fast_chat_responses_payload(request, model)
    chat_payload = {
        "model": model,
        "messages": fast_chat_messages(request),
        "stream": True,
        "max_tokens": settings.fast_path_max_output_tokens,
    }
    final_text = ""
    first_delta_ms: int | None = None
    protocol = "responses"
    yield {
        "type": "status",
        "message": "快速会话已接入",
        "mode": "fast_chat",
        "task_id": task_id,
    }
    yield {
        "type": "status",
        "message": f"{model} 正在流式响应",
        "mode": "fast_chat",
        "task_id": task_id,
    }
    try:
        timeout = httpx.Timeout(120.0, connect=8.0, read=120.0, write=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async for delta in stream_responses_deltas(client, headers, responses_payload):
                    if first_delta_ms is None:
                        first_delta_ms = int((time.monotonic() - started) * 1000)
                    final_text += delta
                    yield {"type": "delta", "text": delta, "event": "fast_chat.delta", "mode": "fast_chat"}
            except FastPathFallback as fallback:
                protocol = "chat_completions"
                logger.warning(
                    "fast_chat responses fallback task_id=%s user=%s model=%s reason=%s",
                    task_id,
                    mode_user.key_hint,
                    model,
                    fallback.reason,
                )
                yield {
                    "type": "status",
                    "message": "正在切换备用流式通道",
                    "mode": "fast_chat",
                    "task_id": task_id,
                }
                async for delta in stream_chat_completion_deltas(client, headers, chat_payload, mode_user.api_key):
                    if first_delta_ms is None:
                        first_delta_ms = int((time.monotonic() - started) * 1000)
                    final_text += delta
                    yield {"type": "delta", "text": delta, "event": "fast_chat.delta", "mode": "fast_chat"}
    except Exception as exc:
        if isinstance(exc, FastPathUpstreamError):
            yield {
                "type": "error",
                "code": public_error_code(exc.code),
                "message": public_error_message(
                    redact(exc.message, secret_values_for_redaction(settings, mode_user.api_key)),
                    "智能服务暂时不可用，请稍后重试。",
                ),
            }
            return
        yield {
            "type": "error",
            "code": public_error_code("FAST_CHAT_REQUEST_FAILED"),
            "message": public_error_message(
                redact(str(exc), secret_values_for_redaction(settings, mode_user.api_key)),
                "智能服务暂时不可用，请稍后重试。",
            ),
        }
        return

    logger.info(
        "fast_chat completed task_id=%s user=%s model=%s protocol=%s first_delta_ms=%s duration_ms=%s chars=%s",
        task_id,
        mode_user.key_hint,
        model,
        protocol,
        first_delta_ms,
        int((time.monotonic() - started) * 1000),
        len(final_text),
    )
    yield {
        "type": "complete",
        "status": "completed",
        "result": final_text.strip() or "已完成。",
        "result_type": "text",
        "duration_ms": int((time.monotonic() - started) * 1000),
        "mode": "fast_chat",
        "task_id": task_id,
    }


def should_use_fast_skill(request: WorkspaceRunRequest, task: dict[str, Any]) -> bool:
    if request.files:
        return False
    if request.skill_name == "codex_workspace":
        return False
    if task.get("queue") != "fast":
        return False
    skill = task.get("skill") if isinstance(task.get("skill"), dict) else {}
    if skill.get("sandbox") != "read-only":
        return False
    if request.risk_level != "normal":
        return False
    if request.model_role not in {"chat_main", "small_fast"}:
        return False
    if request_mode(request) != "codex":
        return False
    if bool(request.params.get("force_workspace") or request.metadata.get("force_workspace")):
        return False
    query = normalize_for_intent_match(request.user_query)
    if not query:
        return False
    return not has_fast_skill_blocking_intent(query, request.skill_name)


def has_fast_skill_blocking_intent(query: str, skill_name: str = "") -> bool:
    if skill_name == "xingren-api-onboarding":
        return False
    return any(hint in query for hint in FAST_SKILL_BLOCKING_HINTS)


async def stream_fast_skill(
    request: WorkspaceRunRequest,
    user: UserContext,
    task: dict[str, Any],
) -> AsyncIterator[dict[str, Any]]:
    task_id = str(task.get("task_id") or f"skill_{uuid4().hex[:16]}")
    started = time.monotonic()
    mode_user = user_for_mode(user, "codex")
    model = selected_fast_text_model(request)
    try:
        skill_markdown = load_fast_skill_markdown(user, request.skill_name)
    except (OSError, ValueError) as exc:
        yield {
            "type": "error",
            "code": "FAST_SKILL_LOAD_FAILED",
            "message": safe_error("FAST_SKILL_LOAD_FAILED", str(exc)).get("message", "技能加载失败。"),
            "task_id": task_id,
        }
        return
    headers = {
        "Authorization": f"Bearer {mode_user.api_key}",
        "Content-Type": "application/json",
    }
    responses_payload = fast_skill_responses_payload(request, skill_markdown, model)
    chat_payload = {
        "model": model,
        "messages": fast_skill_messages(request, skill_markdown),
        "stream": True,
        "max_tokens": settings.fast_path_max_output_tokens,
    }
    final_text = ""
    first_delta_ms: int | None = None
    protocol = "responses"
    display_name = str(task.get("skill", {}).get("display_name") or request.skill_name)
    yield {
        "type": "status",
        "message": f"已加载 {display_name}",
        "mode": "fast_skill",
        "task_id": task_id,
    }
    yield {
        "type": "status",
        "message": f"{model} 正在按 Skill 流式响应",
        "mode": "fast_skill",
        "task_id": task_id,
    }
    try:
        timeout = httpx.Timeout(120.0, connect=8.0, read=120.0, write=20.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async for delta in stream_responses_deltas(client, headers, responses_payload):
                    if first_delta_ms is None:
                        first_delta_ms = int((time.monotonic() - started) * 1000)
                    final_text += delta
                    yield {
                        "type": "delta",
                        "text": delta,
                        "event": "fast_skill.delta",
                        "mode": "fast_skill",
                        "task_id": task_id,
                    }
            except FastPathFallback as fallback:
                protocol = "chat_completions"
                logger.warning(
                    "fast_skill responses fallback task_id=%s user=%s skill=%s model=%s reason=%s",
                    task_id,
                    mode_user.key_hint,
                    request.skill_name,
                    model,
                    fallback.reason,
                )
                yield {
                    "type": "status",
                    "message": "正在切换备用流式通道",
                    "mode": "fast_skill",
                    "task_id": task_id,
                }
                async for delta in stream_chat_completion_deltas(client, headers, chat_payload, mode_user.api_key):
                    if first_delta_ms is None:
                        first_delta_ms = int((time.monotonic() - started) * 1000)
                    final_text += delta
                    yield {
                        "type": "delta",
                        "text": delta,
                        "event": "fast_skill.delta",
                        "mode": "fast_skill",
                        "task_id": task_id,
                    }
    except Exception as exc:
        if isinstance(exc, FastPathUpstreamError):
            yield {
                "type": "error",
                "code": public_error_code(exc.code),
                "message": public_error_message(
                    redact(exc.message, secret_values_for_redaction(settings, mode_user.api_key)),
                    "智能服务暂时不可用，请稍后重试。",
                ),
                "task_id": task_id,
            }
            return
        yield {
            "type": "error",
            "code": public_error_code("FAST_SKILL_REQUEST_FAILED"),
            "message": public_error_message(
                redact(str(exc), secret_values_for_redaction(settings, mode_user.api_key)),
                "智能服务暂时不可用，请稍后重试。",
            ),
            "task_id": task_id,
        }
        return

    logger.info(
        "fast_skill completed task_id=%s user=%s skill=%s model=%s protocol=%s first_delta_ms=%s duration_ms=%s chars=%s",
        task_id,
        mode_user.key_hint,
        request.skill_name,
        model,
        protocol,
        first_delta_ms,
        int((time.monotonic() - started) * 1000),
        len(final_text),
    )
    yield {
        "type": "complete",
        "status": "completed",
        "result": final_text.strip() or "已完成。",
        "result_type": "text",
        "duration_ms": int((time.monotonic() - started) * 1000),
        "mode": "fast_skill",
        "task_id": task_id,
    }


async def stream_responses_deltas(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> AsyncIterator[str]:
    first_delta_seen = False
    deadline = time.monotonic() + max(1, settings.fast_path_first_delta_timeout_seconds)
    try:
        async with client.stream(
            "POST",
            f"{settings.new_api_base_url}/responses",
            headers=headers,
            json=payload,
        ) as response:
            if response.status_code >= 400:
                raise FastPathFallback(f"responses_status_{response.status_code}")
            iterator = response.aiter_lines()
            while True:
                timeout_seconds = 90.0
                if not first_delta_seen:
                    timeout_seconds = max(0.1, deadline - time.monotonic())
                try:
                    line = await asyncio.wait_for(iterator.__anext__(), timeout=timeout_seconds)
                except StopAsyncIteration:
                    break
                except asyncio.TimeoutError as exc:
                    if not first_delta_seen:
                        raise FastPathFallback("responses_first_delta_timeout") from exc
                    raise FastPathUpstreamError("FAST_RESPONSES_STREAM_TIMEOUT", "模型响应超时。") from exc
                line = line.strip()
                if not line or line.startswith(":") or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except ValueError:
                    continue
                error = response_error_message(event)
                if error:
                    if not first_delta_seen:
                        raise FastPathFallback("responses_error_event")
                    raise FastPathUpstreamError("FAST_RESPONSES_UPSTREAM_ERROR", error)
                delta = responses_delta_text(event)
                if delta:
                    first_delta_seen = True
                    yield delta
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        if not first_delta_seen:
            raise FastPathFallback(type(exc).__name__) from exc
        raise FastPathUpstreamError("FAST_RESPONSES_REQUEST_FAILED", str(exc)) from exc
    if not first_delta_seen:
        raise FastPathFallback("responses_empty")


async def stream_chat_completion_deltas(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    payload: dict[str, Any],
    api_key: str,
) -> AsyncIterator[str]:
    first_delta_seen = False
    deadline = time.monotonic() + max(1, settings.fast_path_chat_first_delta_timeout_seconds)
    try:
        async with client.stream(
            "POST",
            f"{settings.new_api_base_url}/chat/completions",
            headers=headers,
            json=payload,
        ) as response:
            if response.status_code >= 400:
                body = (await response.aread()).decode("utf-8", errors="replace")
                raise FastPathUpstreamError(
                    "FAST_CHAT_UPSTREAM_FAILED",
                    safe_upstream_error(body, api_key, response.status_code),
                )
            iterator = response.aiter_lines()
            while True:
                timeout_seconds = 90.0
                if not first_delta_seen:
                    timeout_seconds = max(0.1, deadline - time.monotonic())
                try:
                    line = await asyncio.wait_for(iterator.__anext__(), timeout=timeout_seconds)
                except StopAsyncIteration:
                    break
                except asyncio.TimeoutError as exc:
                    if not first_delta_seen:
                        raise FastPathUpstreamError("FAST_CHAT_FIRST_DELTA_TIMEOUT", "备用流式通道首包超时。") from exc
                    raise FastPathUpstreamError("FAST_CHAT_STREAM_TIMEOUT", "备用流式通道响应超时。") from exc
                line = line.strip()
                if not line or line.startswith(":"):
                    continue
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except ValueError:
                    continue
                error = response_error_message(event)
                if error:
                    raise FastPathUpstreamError("FAST_CHAT_UPSTREAM_ERROR", error)
                delta = chat_completion_delta_text(event) or responses_delta_text(event)
                if delta:
                    first_delta_seen = True
                    yield delta
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        if not first_delta_seen:
            raise FastPathUpstreamError("FAST_CHAT_REQUEST_FAILED", "备用流式通道连接失败。") from exc
        raise FastPathUpstreamError("FAST_CHAT_REQUEST_FAILED", str(exc)) from exc
    if not first_delta_seen:
        raise FastPathUpstreamError("FAST_CHAT_EMPTY_STREAM", "备用流式通道没有返回内容。")


def fast_chat_responses_payload(request: WorkspaceRunRequest, model: str) -> dict[str, Any]:
    return {
        "model": model,
        "instructions": FAST_CHAT_SYSTEM_PROMPT,
        "input": fast_chat_input(request),
        "stream": True,
        "max_output_tokens": settings.fast_path_max_output_tokens,
    }


def fast_skill_responses_payload(
    request: WorkspaceRunRequest,
    skill_markdown: str,
    model: str,
) -> dict[str, Any]:
    return {
        "model": model,
        "instructions": fast_skill_system_prompt(request, skill_markdown),
        "input": fast_skill_user_input(request),
        "stream": True,
        "max_output_tokens": settings.fast_path_max_output_tokens,
    }


def fast_chat_input(request: WorkspaceRunRequest) -> str:
    parts = compact_history_parts(request, FAST_CHAT_HISTORY_LIMIT, FAST_CHAT_HISTORY_CHARS)
    parts.append(f"用户当前请求：\n{request.user_query[:8000]}")
    return "\n\n".join(parts)


def fast_skill_user_input(request: WorkspaceRunRequest) -> str:
    parts = compact_history_parts(request, FAST_SKILL_HISTORY_LIMIT, FAST_SKILL_HISTORY_CHARS)
    parts.append(
        "当前任务：\n"
        f"用户意图：{request.user_intent or request.task_type}\n"
        f"输出格式：{request.output_format}\n"
        f"用户请求：\n{request.user_query[:8000]}"
    )
    return "\n\n".join(parts)


def compact_history_parts(request: WorkspaceRunRequest, limit: int, chars: int) -> list[str]:
    history = request.metadata.get("history") if isinstance(request.metadata, dict) else None
    parts: list[str] = []
    if not isinstance(history, list):
        return parts
    for item in history[-limit:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "")
        if role not in {"user", "assistant"}:
            continue
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        label = "用户" if role == "user" else "助手"
        parts.append(f"{label}历史：\n{content[:chars]}")
    return parts


def fast_skill_messages(request: WorkspaceRunRequest, skill_markdown: str) -> list[dict[str, str]]:
    system_prompt = fast_skill_system_prompt(request, skill_markdown)
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    history = request.metadata.get("history") if isinstance(request.metadata, dict) else None
    if isinstance(history, list):
        for item in history[-FAST_SKILL_HISTORY_LIMIT:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "")
            if role not in {"user", "assistant"}:
                continue
            content = str(item.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content[:FAST_SKILL_HISTORY_CHARS]})
    user_prompt = (
        f"用户意图：{request.user_intent or request.task_type}\n"
        f"输出格式：{request.output_format}\n"
        f"用户请求：\n{request.user_query}"
    )
    messages.append({"role": "user", "content": user_prompt})
    return messages


def fast_skill_system_prompt(request: WorkspaceRunRequest, skill_markdown: str) -> str:
    if request.skill_name == "xingren-api-onboarding":
        return XINGREN_API_ONBOARDING_FAST_PROMPT
    compact_markdown = skill_markdown[:FAST_SKILL_MARKDOWN_CHAR_LIMIT]
    return (
        "你是星人 Codex 的快速 Skill 执行器。"
        "当前请求已经加载了下面的 SKILL.md，你必须严格按该 Skill 的角色、规则和输出结构回答。"
        "这是纯文本快速路径：不要声称已经读取、修改、创建或运行了本地文件/命令。"
        "如果 Skill 要求给用户本机提供可复制命令，你可以输出命令，但必须明确这是让用户在自己电脑上执行。"
        "如果用户明确要求处理上传文件、执行命令、修改代码、部署、读取服务器或创建文件，"
        "请简短说明需要切换到 Codex 工作区执行。\n\n"
        "===== 已加载的 SKILL.md =====\n"
        f"{compact_markdown}\n"
        "===== SKILL.md 结束 ====="
    )


def load_fast_skill_markdown(user: UserContext, skill_name: str) -> str:
    skill_root = resolve_skill_root(user, skill_name)
    if skill_root is None:
        raise ValueError("Skill 文件不存在。")
    skill_md = skill_root / "SKILL.md"
    stat = skill_md.stat()
    cache_key = str(skill_md.resolve())
    cached = _skill_markdown_cache.get(cache_key)
    if cached and cached[0] == stat.st_mtime_ns and cached[1] == stat.st_size:
        return cached[2]
    content = skill_md.read_text(encoding="utf-8", errors="replace")
    if not content.strip():
        raise ValueError("Skill 文件为空。")
    if len(content.encode("utf-8")) > 80_000:
        raise ValueError("Skill 文件过大，已切换到标准工作区路径。")
    _skill_markdown_cache[cache_key] = (stat.st_mtime_ns, stat.st_size, content)
    return content


def resolve_skill_root(user: UserContext, skill_name: str) -> Path | None:
    candidates = [
        settings.skills_dir / skill_name,
        community_skills_root(settings) / skill_name,
        user_installed_skills_root(settings, user.user_id) / skill_name,
    ]
    for root in candidates:
        if root.is_dir() and (root / "SKILL.md").is_file():
            return root
    return None


def selected_text_model(request: WorkspaceRunRequest) -> str:
    role = request.model_role
    config = request.model_roles.model_dump()
    candidate = str(config.get(role) or "")
    if is_allowed_model_for_request(candidate, request):
        return candidate
    if role == "web_search":
        claude_models = allowed_models_for_mode(request_mode(request), request.metadata)
        fallback = claude_models[0] if claude_models else settings.default_chat_model
        return fallback if is_allowed_model_for_request(fallback, request) else settings.default_chat_model
    fallback = settings.default_small_fast_model if role == "small_fast" else settings.default_chat_model
    if is_allowed_model_for_request(fallback, request):
        return fallback
    codex_models = allowed_models_for_mode(request_mode(request), request.metadata)
    return codex_models[0] if codex_models else settings.default_small_fast_model


def selected_fast_text_model(request: WorkspaceRunRequest) -> str:
    if request_mode(request) == "codex":
        fast = settings.default_small_fast_model
        if is_allowed_model_for_request(fast, request):
            return fast
    return selected_text_model(request)


def ordered_codex_models(user: UserContext | None = None) -> list[str]:
    allowed_codex_models = user_mode_models(user)["codex"]
    preferred = [
        settings.default_small_fast_model,
        settings.default_chat_model,
        settings.default_web_search_model,
        settings.default_code_model,
    ]
    result: list[str] = []
    for model in [*preferred, *allowed_codex_models]:
        if model and model in allowed_codex_models and model not in result:
            result.append(model)
    return result


def fast_chat_messages(request: WorkspaceRunRequest) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = [{"role": "system", "content": FAST_CHAT_SYSTEM_PROMPT}]
    history = request.metadata.get("history") if isinstance(request.metadata, dict) else None
    if isinstance(history, list):
        for item in history[-FAST_CHAT_HISTORY_LIMIT:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "")
            if role not in {"user", "assistant"}:
                continue
            content = str(item.get("content") or "").strip()
            if not content:
                continue
            messages.append({"role": role, "content": content[:FAST_CHAT_HISTORY_CHARS]})
    messages.append({"role": "user", "content": request.user_query})
    return messages


def is_text_model(model: str) -> bool:
    return is_supported_text_model(settings, model)


def is_codex_allowed_model(model: str) -> bool:
    return is_text_model(model) and str(model or "") in set(settings.codex_allowed_models)


def request_mode(request: WorkspaceRunRequest | str) -> str:
    if isinstance(request, str):
        value = request
    else:
        value = str(request.metadata.get("mode") or request.metadata.get("model_mode") or "")
        if not value:
            if request.model_role == "web_search":
                return "claude"
            if request.model_role == "image_generation":
                return "image"
            if request.model_role == "video_generation":
                return "video"
    if value in {"codex", "claude", "image", "video"}:
        return value
    return "codex"


def allowed_models_for_mode(mode: str, metadata: dict[str, Any] | None = None) -> tuple[str, ...]:
    mode_models = mode_models_payload_from_metadata(metadata)
    if mode in mode_models:
        return mode_models[mode]
    if mode == "claude":
        return settings.claude_allowed_models
    if mode == "image":
        return supported_image_models(settings)
    if mode == "video":
        return supported_video_models(settings)
    return settings.codex_allowed_models


def is_allowed_model_for_request(model: str, request: WorkspaceRunRequest) -> bool:
    mode = request_mode(request)
    allowed = set(allowed_models_for_mode(mode, request.metadata))
    if mode == "claude":
        return is_claude_model(model) and str(model or "") in allowed
    if mode == "image":
        return is_supported_image_model(settings, model) and str(model or "") in allowed
    if mode == "video":
        return is_supported_video_model(settings, model) and str(model or "") in allowed
    return is_text_model(model) and str(model or "") in allowed


def user_for_mode(user: UserContext, mode: str) -> UserContext:
    key_map = user.api_keys or {}
    key = key_map.get(mode) or user.api_key
    return UserContext(
        api_key=key,
        user_id=user.user_id,
        key_hint=key_hint(key),
        username=user.username,
        group=user.group,
        quota=user.quota,
        used_quota=user.used_quota,
        request_count=user.request_count,
        api_keys=user.api_keys,
        allowed_models_by_mode=user.allowed_models_by_mode,
    )


def normalize_user_allowed_models(user: dict[str, Any]) -> dict[str, tuple[str, ...]]:
    metadata = user.get("metadata") if isinstance(user, dict) else None
    return normalize_allowed_models_from_metadata(metadata)


def normalize_allowed_models_from_metadata(metadata: dict[str, Any] | None) -> dict[str, tuple[str, ...]]:
    payload = mode_models_payload_from_metadata(metadata)
    result = {}
    for mode in ("codex", "claude", "image", "video"):
        result[mode] = payload.get(mode, ())
    return result


def attach_allowed_models_metadata(request: WorkspaceRunRequest, user: UserContext) -> None:
    if not user.allowed_models_by_mode:
        return
    request.metadata[SERVER_ALLOWED_MODELS_METADATA_KEY] = {
        mode: list(models)
        for mode, models in user.allowed_models_by_mode.items()
        if models
    }


def user_mode_models(user: UserContext | None) -> dict[str, tuple[str, ...]]:
    defaults = default_mode_models(settings)
    result = {
        "codex": defaults["codex"],
        "claude": defaults["claude"],
        "image": supported_image_models(settings),
        "video": supported_video_models(settings),
    }
    if user is None or not user.allowed_models_by_mode:
        return result
    for mode, values in user.allowed_models_by_mode.items():
        result[mode] = tuple(values)
    return result


def key_hint(key: str) -> str:
    if len(key) <= 12:
        return "sk-****"
    return f"{key[:6]}...{key[-4:]}"


def chat_completion_delta_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    choice = choices[0]
    if not isinstance(choice, dict):
        return ""
    for container_name in ("delta", "message"):
        container = choice.get(container_name)
        text = content_to_text(container.get("content") if isinstance(container, dict) else None)
        if text:
            return text
    text = choice.get("text")
    return str(text) if isinstance(text, str) else ""


def responses_delta_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    event_type = str(payload.get("type") or "")
    delta = payload.get("delta")
    if isinstance(delta, str) and ("output_text" in event_type or event_type.endswith(".delta")):
        return delta
    text = payload.get("text")
    if isinstance(text, str) and event_type in {"response.output_text.delta", "output_text.delta"}:
        return text
    content = content_to_text(payload.get("content"))
    if content and ("output_text" in event_type or event_type.endswith(".delta")):
        return content
    return ""


def response_error_message(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error.get("code") or "模型服务返回错误。")
    if isinstance(error, str):
        return error
    if str(payload.get("type") or "") in {"error", "response.error"}:
        return str(payload.get("message") or "模型服务返回错误。")
    return ""


def content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            if isinstance(item.get("text"), str):
                parts.append(str(item["text"]))
            elif isinstance(item.get("content"), str):
                parts.append(str(item["content"]))
        return "".join(parts)
    return ""


def safe_upstream_error(body: str, api_key: str, status_code: int) -> str:
    safe_body = redact(body[:600], secret_values_for_redaction(settings, api_key))
    try:
        payload = json.loads(safe_body)
    except ValueError:
        payload = {}
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            safe_body = str(error["message"])
        elif payload.get("message"):
            safe_body = str(payload["message"])
    if not safe_body:
        safe_body = "智能服务暂时不可用，请稍后重试。"
    return public_error_message(safe_body, "智能服务暂时不可用，请稍后重试。")


def find_user_or_public_skill(user: UserContext, skill_name: str):
    community_skill = skill_from_community_dir(settings, skill_name)
    if community_skill is not None:
        return community_skill
    user_skill = skill_from_user_dir(settings, user.user_id, skill_name)
    if user_skill is not None:
        return user_skill
    promote_runtime_installed_skills(settings, user.user_id, skill_name)
    user_skill = skill_from_user_dir(settings, user.user_id, skill_name)
    if user_skill is not None:
        return user_skill
    return get_skill(settings, skill_name)


def skill_request_from_markdown(request: SkillMarkdownImportRequest) -> UserSkillCreateRequest:
    filename = Path(request.filename).name
    if not filename.lower().endswith((".md", ".markdown")):
        raise HTTPException(status_code=422, detail="Only .md or .markdown skill files are allowed")
    content = normalize_skill_markdown(request.content)
    if contains_protected_path_reference({"path": filename, "content": content}):
        raise HTTPException(status_code=422, detail="Skill file references protected server paths")
    if contains_destructive_action({"path": filename, "content": content}):
        raise HTTPException(status_code=422, detail="Skill file asks for destructive operations")
    metadata = parse_skill_front_matter(content)
    fallback_name = slug_from_filename(filename)
    name = sanitize_skill_name(request.name or metadata.get("name") or fallback_name)
    if not name:
        raise HTTPException(status_code=422, detail="Skill name is required. Add name to front matter or filename.")
    display_name = (request.display_name or metadata.get("display_name") or metadata.get("title") or name).strip()
    description = (request.description or metadata.get("description") or first_markdown_summary(content)).strip()
    description = description[:500]
    return UserSkillCreateRequest(
        name=name,
        display_name=display_name[:120],
        description=description,
        files=[{"path": "SKILL.md", "content": content}],
        install_immediately=True,
    )


def normalize_skill_markdown(content: str) -> str:
    text = str(content or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Skill markdown is empty")
    if len(text.encode("utf-8")) > 80000:
        raise HTTPException(status_code=413, detail="Skill markdown is too large")
    if "\x00" in text:
        raise HTTPException(status_code=422, detail="Skill markdown contains invalid bytes")
    return text + "\n"


def parse_skill_front_matter(content: str) -> dict[str, str]:
    match = SKILL_FRONT_MATTER_RE.match(content)
    if not match:
        return {}
    metadata: dict[str, str] = {}
    for raw_line in match.group("body").splitlines():
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip().lower()
        value = value.strip().strip("\"'")
        if key in {"name", "display_name", "title", "description"} and value:
            metadata[key] = value[:500]
    return metadata


def slug_from_filename(filename: str) -> str:
    stem = Path(filename).stem
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "_", stem).strip("_-").lower()
    return normalized[:80]


def sanitize_skill_name(name: str) -> str:
    candidate = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(name or "").strip()).strip("_-")
    if not candidate:
        return ""
    if not SAFE_SKILL_NAME_RE.match(candidate):
        raise HTTPException(status_code=422, detail="Skill name must be 2-80 chars and only use letters, numbers, _ or -")
    if get_skill(settings, candidate) is not None:
        raise HTTPException(status_code=409, detail="Cannot overwrite a system skill")
    return candidate


def first_markdown_summary(content: str) -> str:
    for line in content.splitlines():
        text = line.strip()
        if not text or text == "---" or text.startswith("name:") or text.startswith("description:"):
            continue
        text = re.sub(r"^#{1,6}\s+", "", text)
        if text:
            return text[:500]
    return "用户上传的社区共享 Codex Skill。"


def create_skill_submission(request: UserSkillCreateRequest, user: UserContext) -> dict[str, Any]:
    installed_root = user_installed_skills_root(settings, user.user_id)
    installed_root.mkdir(parents=True, exist_ok=True)
    existing = [item for item in installed_root.iterdir() if item.is_dir()] if installed_root.exists() else []
    if len(existing) >= settings.max_user_skills:
        raise HTTPException(status_code=429, detail="Too many community skills")

    skill_root = (installed_root / request.name).resolve()
    if not str(skill_root).startswith(str(installed_root.resolve()) + "/"):
        raise HTTPException(status_code=400, detail="Invalid skill path")
    if skill_root.exists():
        raise HTTPException(status_code=409, detail="Skill already exists")

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
        if contains_protected_path_reference({"path": path_text, "content": content}):
            raise HTTPException(status_code=422, detail="Skill file references protected server paths")
        if contains_destructive_action({"path": path_text, "content": content}):
            raise HTTPException(status_code=422, detail="Skill file asks for destructive operations")
        try:
            safe_path = assert_safe_skill_file_path(path_text)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        target = (skill_root / safe_path).resolve()
        if not str(target).startswith(str(skill_root.resolve()) + "/"):
            raise HTTPException(status_code=400, detail="Invalid skill file path")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    if not has_skill_md:
        raise HTTPException(status_code=422, detail="SKILL.md is required")

    manifest = {
        "name": request.name,
        "display_name": request.display_name or request.name,
        "description": request.description,
        "category": "user_skill",
        "queue": "fast",
        "timeout": 180,
        "cost_points": 5,
        "sandbox": "workspace-write",
        "enabled": True,
        "public": True,
        "owner": user.user_id,
        "owner_name": user.username,
        "created_at": now_iso(),
        "delete_allowed": True,
        "community_shared": False,
        "review_status": "pending_review",
    }
    (skill_root / "skill.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    invalidate_skill_caches(user.user_id)
    logger.info("user skill created name=%s user=%s review_status=pending_review", request.name, user.key_hint)
    return {
        "success": True,
        "name": request.name,
        "status": "pending_review",
        "message": "Skill 已安装到你的账户，提交审核后才会进入社区共享库。",
    }


def list_user_visible_skills(user: UserContext) -> list[dict[str, Any]]:
    skills = list_public_skills(settings)
    skills.extend(list_community_skills(settings))
    skills.extend(list_user_installed_skills(settings, user.user_id))
    for item in skills:
        item.setdefault("scope", "system")
    return dedupe_skills(skills)


def dedupe_skills(skills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for skill in skills:
        name = str(skill.get("name") or "")
        if not name or name in seen:
            continue
        seen.add(name)
        result.append(skill)
    return result


def default_skill_content(request: CreateSkillRequest) -> str:
    description = request.description or "用户创建的个人 Codex Skill。"
    display_name = request.display_name or request.name
    return f"""---
name: {request.name}
description: {description}
---

# {display_name}

{description}

## 使用边界

- 只能在当前用户的临时工作区内写入产物。
- 允许读取用户上传文件、创建文件、编辑文件和安装/创建工作区 Skill。
- 不允许删除任何文件。
- 不允许读取服务器配置、环境变量、SSH、Docker、Nginx/OpenResty 或其它用户数据。
- 输出要适合直接展示给普通用户。
"""


def should_return_async(mode: str, queue_name: str) -> bool:
    if mode == "async":
        return True
    if mode == "auto" and queue_name not in {"fast", "image"}:
        return True
    return False


def sync_wait_seconds(mode: str, skill_timeout: int) -> int:
    if mode == "sync":
        return min(skill_timeout + 10, settings.sync_wait_seconds)
    return min(skill_timeout + 10, settings.sync_wait_seconds)


async def wait_for_completion(store: TaskStore, task_id: str, wait_seconds: int) -> dict[str, Any] | None:
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        task = store.get(task_id)
        if task and task.get("status") in {"completed", "failed"}:
            return task
        await asyncio.sleep(1)
    return store.get(task_id)


def public_task_response(task: dict[str, Any], preferred_mode: str | None = None) -> dict[str, Any]:
    status = str(task.get("status"))
    mode = preferred_mode or str(task.get("mode", "async"))
    base = {
        "task_id": task["task_id"],
        "skill_name": task["skill_name"],
        "status": status,
        "model_role": task.get("model_role"),
        "created_at": task.get("created_at"),
        "updated_at": task.get("updated_at"),
    }
    if status == "completed":
        return {
            "success": True,
            "mode": mode,
            **base,
            "result_type": task.get("result_type") or "markdown",
            "result": task.get("result", ""),
            "usage": {
                "duration_ms": task.get("duration_ms", 0),
                "cost_points": task.get("cost_points", 0),
            },
        }
    if status == "failed":
        error = task.get("error") or safe_error("TASK_FAILED", "Task failed.")
        return {"success": False, **base, "error": error}
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
) -> dict[str, Any]:
    return {
        "success": True,
        "mode": mode,
        "task_id": task_id,
        "skill_name": skill_name,
        "status": status,
        "message": message,
    }


def failed_response(task_id: str, code: str, message: str, skill_name: str) -> dict[str, Any]:
    return {
        "success": False,
        "task_id": task_id,
        "skill_name": skill_name,
        "status": "failed",
        "error": safe_error(code, message),
    }


def rejected_admin_response(task_id: str, skill_name: str) -> dict[str, Any]:
    return {
        "success": False,
        "task_id": task_id,
        "skill_name": skill_name,
        "status": "rejected",
        "error": safe_error("ADMIN_ACTION_NOT_ALLOWED", "该操作不允许在云工作台执行。"),
    }


def markdown_document_html(title: str, markdown: str) -> str:
    html = render_simple_markdown(markdown)
    safe_title = html_escape(title)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{safe_title}</title>
  <style>
    body {{ margin: 0; background: #071011; color: #edf7f2; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.72; }}
    main {{ max-width: 920px; margin: 0 auto; padding: 42px 20px 72px; }}
    h1 {{ font-size: 30px; line-height: 1.2; }}
    h2 {{ margin-top: 34px; padding-top: 20px; border-top: 1px solid rgba(181, 204, 196, 0.14); font-size: 21px; }}
    h3 {{ margin-top: 24px; font-size: 17px; }}
    p, li {{ color: #bfd1cb; }}
    code {{ padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,.07); color: #d9fff3; }}
    pre {{ overflow: auto; padding: 14px; border: 1px solid rgba(181,204,196,.12); border-radius: 12px; background: rgba(0,0,0,.26); }}
    pre code {{ padding: 0; background: transparent; }}
    table {{ width: 100%; margin: 18px 0; border-collapse: collapse; border: 1px solid rgba(181,204,196,.14); border-radius: 12px; overflow: hidden; }}
    th, td {{ padding: 10px 12px; border-bottom: 1px solid rgba(181,204,196,.1); text-align: left; vertical-align: top; }}
    th {{ color: #edf7f2; background: rgba(255,255,255,.06); }}
    td {{ color: #bfd1cb; }}
  </style>
</head>
<body><main>{html}</main></body>
</html>"""


def render_simple_markdown(markdown: str) -> str:
    html: list[str] = []
    in_code = False
    list_open: str | None = None
    table_open = False

    def close_list() -> None:
        nonlocal list_open
        if list_open:
            html.append(f"</{list_open}>")
            list_open = None

    def close_table() -> None:
        nonlocal table_open
        if table_open:
            html.append("</tbody></table>")
            table_open = False

    def close_blocks() -> None:
        close_list()
        close_table()

    def inline_markdown(value: str) -> str:
        text = html_escape(value.strip())
        return re.sub(r"`([^`]+)`", r"<code>\1</code>", text)

    def table_cells(line: str) -> list[str]:
        return [cell.strip() for cell in line.strip().strip("|").split("|")]

    def is_table_separator(line: str) -> bool:
        cells = table_cells(line)
        return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)

    lines = markdown.splitlines()
    index = 0
    while index < len(lines):
        raw = lines[index]
        line = raw.rstrip()
        if line.startswith("```"):
            close_blocks()
            if in_code:
                html.append("</code></pre>")
                in_code = False
            else:
                lang = html_escape(line.strip("`").strip() or "text")
                html.append(f'<pre><code data-lang="{lang}">')
                in_code = True
            index += 1
            continue
        if in_code:
            html.append(html_escape(line) + "\n")
            index += 1
            continue
        if not line.strip():
            close_blocks()
            index += 1
            continue
        if (
            line.strip().startswith("|")
            and index + 1 < len(lines)
            and is_table_separator(lines[index + 1].strip())
        ):
            close_blocks()
            headers = table_cells(line)
            html.append("<table><thead><tr>")
            html.extend(f"<th>{inline_markdown(cell)}</th>" for cell in headers)
            html.append("</tr></thead><tbody>")
            table_open = True
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                row = table_cells(lines[index])
                html.append("<tr>")
                html.extend(f"<td>{inline_markdown(cell)}</td>" for cell in row)
                html.append("</tr>")
                index += 1
            close_table()
            continue
        if line.startswith("# "):
            close_blocks()
            html.append(f"<h1>{html_escape(line[2:].strip())}</h1>")
        elif line.startswith("## "):
            close_blocks()
            html.append(f"<h2>{html_escape(line[3:].strip())}</h2>")
        elif line.startswith("### "):
            close_blocks()
            html.append(f"<h3>{html_escape(line[4:].strip())}</h3>")
        elif line.startswith("- "):
            close_table()
            if list_open != "ul":
                close_list()
                html.append("<ul>")
                list_open = "ul"
            html.append(f"<li>{inline_markdown(line[2:])}</li>")
        elif match := re.match(r"^\d+\.\s+(.*)$", line):
            close_table()
            if list_open != "ol":
                close_list()
                html.append("<ol>")
                list_open = "ol"
            html.append(f"<li>{inline_markdown(match.group(1))}</li>")
        else:
            close_blocks()
            html.append(f"<p>{inline_markdown(line)}</p>")
        index += 1
    close_list()
    close_table()
    if in_code:
        html.append("</code></pre>")
    return "\n".join(html)


def html_escape(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def cleanup_expired_runs() -> dict[str, Any]:
    now = time.time()
    removed = 0
    skipped = 0
    root = settings.runs_dir
    root.mkdir(parents=True, exist_ok=True)
    store = task_store()
    for user_dir in root.iterdir():
        if not user_dir.is_dir():
            continue
        for task_dir in user_dir.iterdir():
            if not task_dir.is_dir():
                continue
            try:
                age = now - task_dir.stat().st_mtime
            except FileNotFoundError:
                continue
            if age < settings.task_retention_seconds:
                skipped += 1
                continue
            task_id = task_dir.name
            task = store.get(task_id)
            if task and task.get("status") in {"queued", "retrying", "running"}:
                skipped += 1
                continue
            shutil.rmtree(task_dir)
            removed += 1
    return {"success": True, "removed": removed, "skipped": skipped, "retention_seconds": settings.task_retention_seconds}
