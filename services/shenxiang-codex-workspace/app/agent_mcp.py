from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from uuid import uuid4

import httpx
from fastapi import HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from redis import Redis

from app.config import Settings, secret_values_for_redaction
from app.media_catalog import available_public_models, canonical_allowed_media_models, resolve_public_media_model
from app.media_tools import (
    IMAGE_MODEL_CAPABILITIES,
    VIDEO_MODEL_CAPABILITIES,
    MediaGenerationError,
    MediaResult,
    normalize_mcp_media_request,
    persist_remote_media,
)
from app.mcp_media_async import McpMediaSubmissionUncertain, McpMediaTaskState, fetch_mcp_media_task, submit_mcp_media_task
from app.models import WorkspaceRunRequest
from app.security import UserContext, public_error_message, redact, safe_user_path
from app.task_store import TaskStore, now_iso

logger = logging.getLogger(__name__)

MCP_SCOPE = "xingren.agent"
MCP_PROTOCOL_VERSION = "2025-03-26"
MEDIA_TASK_ID_RE = re.compile(r"^mcp_[0-9a-f]{32}$")
MEDIA_TASK_EXPIRED_MESSAGE = "这次生成任务状态已失效，请重新提交。"
MEDIA_TASK_UNCONFIRMED_MESSAGE = "这次生成状态仍无法确认。请勿重新提交，请联系在线客服并提供任务编号。"
MEDIA_TASK_MAX_AGE_SECONDS = 20 * 60
MEDIA_PREVIEW_WAIT_SECONDS = 60
MEDIA_WAIT_MESSAGE = "生成仍在进行。请等待 10 秒后用同一个任务编号再次查询；不要重新生成、换模型或自动重试。"
MEDIA_PREPARING_MESSAGE = "结果正在准备预览。请等待 10 秒后用同一个任务编号再次查询；不要重新生成、换模型或自动重试。"
MEDIA_CONFIRMING_MESSAGE = "生成已提交，正在确认。请等待 10 秒后用同一个任务编号再次查询；不要重新提交、换模型或自动重试。"

def resolved_media_model(model: str, mode: str) -> str | None:
    return resolve_public_media_model(model, mode)


def media_models_message(image_models: tuple[str, ...], video_models: tuple[str, ...]) -> str:
    def render(mode: str, models: tuple[str, ...]) -> str:
        visible = available_public_models(mode, models)
        if not visible:
            return "暂无"
        return "\n".join(f"- {item.name}（{item.price}）{media_model_options(item.model, mode)}" for item in visible)

    return (
        f"可用图像模型：\n{render('image', image_models)}\n\n"
        f"可用视频模型：\n{render('video', video_models)}\n\n"
        "这里只显示已接通的模型。请选择上面的完整名称，例如：用 GPT Image 2 生成一张海报。"
    )


def media_model_options(model: str, mode: str) -> str:
    if mode == "image":
        capability = IMAGE_MODEL_CAPABILITIES.get(model)
        if capability is None:
            return ""
        if capability.family == "ecommerce_image":
            options = ["规格：自动", f"张数：1–{capability.max_count}"]
        else:
            options = [
                f"比例：{'、'.join(capability.aspect_ratios)}",
                f"清晰度：{'、'.join(capability.resolutions)}",
                f"张数：1–{capability.max_count}",
            ]
        if capability.qualities:
            options.append(f"质量：{'、'.join(capability.qualities)}")
        if capability.output_formats:
            options.append(f"格式：{'、'.join(capability.output_formats)}")
        if capability.backgrounds:
            options.append(f"背景：{'、'.join(capability.backgrounds)}")
        if capability.allow_output_compression:
            options.append("输出压缩：0–100")
        return "；" + "；".join(options)
    capability = VIDEO_MODEL_CAPABILITIES.get(model)
    if capability is None:
        return ""
    options = [
        f"时长：{'、'.join(map(str, capability.durations))} 秒",
        f"比例：{'、'.join(capability.aspect_ratios)}",
        f"清晰度：{'、'.join(capability.resolutions)}",
    ]
    if capability.sizes:
        options.append(f"尺寸：{'、'.join(capability.sizes)}")
    optional = []
    if capability.allow_seed:
        optional.append("随机种子")
    if capability.allow_watermark:
        optional.append("水印")
    if optional:
        options.append(f"可选：{'、'.join(optional)}")
    return "；" + "；".join(options)


def media_api_key(user: UserContext, mode: str) -> str:
    return str((user.api_keys or {}).get(mode) or "").strip()


async def live_media_models(settings: Settings, api_key: str, mode: str) -> tuple[str, ...]:
    if not api_key or mode not in {"image", "video"}:
        return ()
    timeout = httpx.Timeout(12.0, connect=5.0, read=10.0, write=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{settings.new_api_base_url.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        logger.warning("media model directory unavailable mode=%s reason=%s", mode, type(exc).__name__)
        return ()
    if response.status_code != status.HTTP_200_OK:
        logger.warning("media model directory unavailable mode=%s", mode)
        return ()
    try:
        payload = response.json()
    except ValueError:
        return ()
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return ()
    models: list[str] = []
    for item in data:
        if isinstance(item, dict):
            value = item.get("id")
        else:
            value = item
        if isinstance(value, str) and value.strip():
            models.append(value.strip())
    return canonical_allowed_media_models(mode, models)


def public_base(settings: Settings) -> str:
    return settings.public_base_url.rstrip("/")


def mcp_endpoint(settings: Settings) -> str:
    return f"{public_base(settings)}/mcp"


def authorization_server(settings: Settings) -> str:
    return f"{public_base(settings)}/oauth"


def safe_mcp_error(message: str = "服务暂时不可用，请稍后重试。") -> dict[str, Any]:
    return {"content": [{"type": "text", "text": public_error_message(message)}], "isError": True}


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _append_query(url: str, values: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(values)
    return urlunparse(parsed._replace(query=urlencode(query)))


def _is_safe_redirect_uri(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme == "https" and bool(parsed.netloc):
        return True
    if parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}:
        return True
    return False


def _pkce_valid(verifier: str, challenge: str) -> bool:
    digest = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("utf-8")).digest()).decode("ascii").rstrip("=")
    return secrets.compare_digest(digest, challenge)


class AgentAuthorizationStore:
    def __init__(self, redis: Redis, settings: Settings) -> None:
        self.redis = redis
        self.settings = settings

    def register_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        redirect_uris = payload.get("redirect_uris")
        if not isinstance(redirect_uris, list) or not redirect_uris or not all(isinstance(uri, str) and _is_safe_redirect_uri(uri) for uri in redirect_uris):
            raise HTTPException(status_code=400, detail="客户端回调地址无效")
        client_id = f"agent_{secrets.token_urlsafe(24)}"
        record = {
            "client_id": client_id,
            "client_name": str(payload.get("client_name") or "我的 Agent")[:120],
            "redirect_uris": redirect_uris,
            "token_endpoint_auth_method": "none",
        }
        self._set_json(f"mcp:client:{client_id}", record, self.settings.mcp_refresh_token_seconds)
        return record

    def start_authorization(self, values: dict[str, str]) -> str:
        client_id = values.get("client_id", "").strip()
        redirect_uri = values.get("redirect_uri", "").strip()
        code_challenge = values.get("code_challenge", "").strip()
        if values.get("response_type") != "code" or not client_id or not redirect_uri or not code_challenge:
            raise HTTPException(status_code=400, detail="授权请求参数不完整")
        requested_scope = values.get("scope", MCP_SCOPE).strip() or MCP_SCOPE
        if requested_scope != MCP_SCOPE:
            raise HTTPException(status_code=400, detail="授权范围无效")
        client = self._get_json(f"mcp:client:{client_id}")
        if not client or redirect_uri not in client.get("redirect_uris", []):
            raise HTTPException(status_code=400, detail="客户端未注册或回调地址不匹配")
        if values.get("code_challenge_method", "S256") != "S256" or len(code_challenge) < 43:
            raise HTTPException(status_code=400, detail="需要使用安全授权校验")
        request_id = secrets.token_urlsafe(24)
        record = {
            "client_id": client_id,
            "client_name": str(client.get("client_name") or "我的 Agent"),
            "redirect_uri": redirect_uri,
            "state": values.get("state", ""),
            "scope": requested_scope,
            "code_challenge": code_challenge,
        }
        self._set_json(f"mcp:authorization:{request_id}", record, self.settings.mcp_authorization_code_seconds)
        return request_id

    def approve_authorization(self, request_id: str, user: UserContext) -> RedirectResponse:
        record = self._get_json(f"mcp:authorization:{request_id}")
        if not record:
            raise HTTPException(status_code=400, detail="授权已过期，请回到 Agent 重新连接")
        self.redis.delete(f"mcp:authorization:{request_id}")
        code = secrets.token_urlsafe(32)
        user_record = self._user_record(user)
        self._set_json(
            f"mcp:code:{_hash(code)}",
            {"authorization": record, "user": user_record},
            self.settings.mcp_authorization_code_seconds,
        )
        values = {"code": code}
        if record.get("state"):
            values["state"] = str(record["state"])
        return RedirectResponse(_append_query(str(record["redirect_uri"]), values), status_code=302)

    def issue_codex_connection_code(self, user: UserContext) -> str:
        user_key = _hash(user.user_id)
        pointer_key = f"mcp:codex-connection:user:{user_key}"
        previous = self._get_json(pointer_key)
        if previous and isinstance(previous.get("digest"), str):
            self.redis.delete(f"mcp:codex-connection:{previous['digest']}")
        code = f"xrc_{secrets.token_urlsafe(36)}"
        digest = _hash(code)
        self._set_json(
            f"mcp:codex-connection:{digest}",
            {"user": self._user_record(user)},
            self.settings.codex_connection_code_seconds,
        )
        self._set_json(pointer_key, {"digest": digest}, self.settings.codex_connection_code_seconds)
        return code

    def revoke_codex_connection_code(self, user: UserContext) -> None:
        pointer_key = f"mcp:codex-connection:user:{_hash(user.user_id)}"
        previous = self._get_json(pointer_key)
        self.redis.delete(pointer_key)
        if previous and isinstance(previous.get("digest"), str):
            self.redis.delete(f"mcp:codex-connection:{previous['digest']}")

    def authorization_details(self, request_id: str) -> dict[str, Any] | None:
        return self._get_json(f"mcp:authorization:{request_id}")

    def exchange_code(self, code: str, verifier: str, client_id: str, redirect_uri: str) -> dict[str, Any]:
        key = f"mcp:code:{_hash(code)}"
        record = self._get_json(key)
        if not record:
            raise HTTPException(status_code=400, detail="授权码无效或已过期")
        self.redis.delete(key)
        authorization = record.get("authorization") if isinstance(record.get("authorization"), dict) else {}
        if authorization.get("client_id") != client_id or authorization.get("redirect_uri") != redirect_uri:
            raise HTTPException(status_code=400, detail="授权客户端不匹配")
        if not verifier or not _pkce_valid(verifier, str(authorization.get("code_challenge") or "")):
            raise HTTPException(status_code=400, detail="授权校验失败")
        return self._issue_tokens(record["user"], client_id)

    def refresh(self, refresh_token: str, client_id: str) -> dict[str, Any]:
        key = f"mcp:refresh:{_hash(refresh_token)}"
        record = self._get_json(key)
        if not record or record.get("client_id") != client_id:
            raise HTTPException(status_code=400, detail="刷新授权无效，请重新连接")
        self.redis.delete(key)
        return self._issue_tokens(record["user"], client_id)

    def access_user(self, token: str) -> UserContext | None:
        record = self._get_json(f"mcp:access:{_hash(token)}")
        if record is None:
            record = self._get_json(f"mcp:codex-connection:{_hash(token)}")
        user = record.get("user") if isinstance(record, dict) and isinstance(record.get("user"), dict) else None
        if not user:
            return None
        allowed = user.get("allowed_models_by_mode") if isinstance(user.get("allowed_models_by_mode"), dict) else {}
        api_key = str(user.get("api_key") or "")
        api_keys = {str(key): str(value) for key, value in (user.get("api_keys") or {}).items() if value}
        for mode in ("image", "video"):
            if api_keys.get(mode) == api_key:
                api_keys.pop(mode, None)
        return UserContext(
            api_key=api_key,
            user_id=str(user.get("user_id") or ""),
            key_hint=str(user.get("key_hint") or "agent"),
            username=str(user.get("username") or ""),
            api_keys=api_keys,
            allowed_models_by_mode={str(key): tuple(map(str, value)) for key, value in allowed.items() if isinstance(value, list)},
        )

    @staticmethod
    def _user_record(user: UserContext) -> dict[str, Any]:
        api_keys = user.api_keys or {"codex": user.api_key}
        return {
            "user_id": user.user_id,
            "key_hint": user.key_hint,
            "username": user.username,
            "api_keys": {
                mode: key
                for mode, key in api_keys.items()
                if mode in {"codex", "image", "video"} and key and (mode not in {"image", "video"} or key != user.api_key)
            },
            "api_key": user.api_key,
            "allowed_models_by_mode": {key: list(value) for key, value in (user.allowed_models_by_mode or {}).items()},
        }

    def issue_artifact(self, user: UserContext, file_path: Path) -> str:
        root = (self.settings.runs_dir / "mcp" / user.user_id).resolve()
        target = file_path.resolve()
        if root not in target.parents or not target.is_file():
            raise ValueError("生成文件无效")
        token = secrets.token_urlsafe(32)
        self._set_json(
            f"mcp:artifact:{_hash(token)}",
            {"user_id": user.user_id, "path": str(target)},
            self.settings.mcp_access_token_seconds,
        )
        return token

    def artifact_path(self, token: str) -> Path | None:
        record = self._get_json(f"mcp:artifact:{_hash(token)}")
        if not record:
            return None
        user_id = str(record.get("user_id") or "")
        path = Path(str(record.get("path") or "")).resolve()
        root = (self.settings.runs_dir / "mcp" / user_id).resolve()
        if not user_id or root not in path.parents or not path.is_file():
            return None
        return path

    def _issue_tokens(self, user: dict[str, Any], client_id: str) -> dict[str, Any]:
        access_token = secrets.token_urlsafe(32)
        refresh_token = secrets.token_urlsafe(40)
        record = {"client_id": client_id, "user": user}
        self._set_json(f"mcp:access:{_hash(access_token)}", record, self.settings.mcp_access_token_seconds)
        self._set_json(f"mcp:refresh:{_hash(refresh_token)}", record, self.settings.mcp_refresh_token_seconds)
        return {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": self.settings.mcp_access_token_seconds,
            "refresh_token": refresh_token,
            "scope": MCP_SCOPE,
        }

    def _get_json(self, key: str) -> dict[str, Any] | None:
        try:
            raw = self.redis.get(key)
        except Exception as exc:
            logger.error("agent authorization storage unavailable: %s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="授权服务暂时不可用，请稍后重试") from exc
        if not raw:
            return None
        try:
            value = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
        except (TypeError, ValueError):
            return None
        return value if isinstance(value, dict) else None

    def _set_json(self, key: str, value: dict[str, Any], ttl: int) -> None:
        try:
            self.redis.set(key, json.dumps(value, ensure_ascii=False, separators=(",", ":")), ex=max(1, ttl))
        except Exception as exc:
            logger.error("agent authorization storage unavailable: %s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="授权服务暂时不可用，请稍后重试") from exc


def authorization_page(request_id: str, client_name: str, redirect_uri: str) -> HTMLResponse:
    safe_name = client_name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    callback_host = (urlparse(redirect_uri).hostname or "此 Agent").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    html = f"""<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>连接 Agent</title><style>body{{font:16px system-ui;max-width:520px;margin:10vh auto;padding:24px;color:#172033}}button{{background:#2558d9;color:#fff;border:0;border-radius:10px;padding:13px 18px;font-size:16px;cursor:pointer}}.card{{border:1px solid #dce2ef;border-radius:16px;padding:28px;box-shadow:0 12px 30px #dce2ef}}</style><main class=\"card\"><h1>连接你的 Agent</h1><p><strong>{safe_name}</strong> 将获得调用星人文本、图片和视频工具的权限。</p><p>完成后会返回到：<strong>{callback_host}</strong></p><p>不会看到你的账户 Key，也不能管理账户。</p><button id=\"approve\">确认连接</button><p id=\"message\"></p></main><script>document.querySelector('#approve').onclick=async()=>{{const message=document.querySelector('#message');const uid=localStorage.getItem('uid')||(()=>{{try{{return JSON.parse(localStorage.getItem('user')||'{{}}').id||''}}catch{{return ''}}}})();if(!uid){{message.textContent='请先登录星人 API 控制台，再回到本页。';return}}message.textContent='正在连接…';const res=await fetch('./approve',{{method:'POST',credentials: 'include',headers:{{'X-New-Api-User':uid,'Content-Type':'application/json'}},body:JSON.stringify({{request_id:{json.dumps(request_id)}}})}});const data=await res.json().catch(()=>({{}}));if(res.ok&&data.redirect_to)location.assign(data.redirect_to);else message.textContent=data.detail||'连接暂时无法完成，请稍后重试。'}};</script></html>"""
    return HTMLResponse(html, headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"})


def codex_connection_page() -> HTMLResponse:
    html = """<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>连接 Codex</title><style>body{font:16px system-ui;max-width:620px;margin:8vh auto;padding:24px;color:#172033}.card{border:1px solid #dce2ef;border-radius:16px;padding:28px;box-shadow:0 12px 30px #dce2ef}button{background:#2558d9;color:#fff;border:0;border-radius:10px;padding:13px 18px;font-size:16px;cursor:pointer}button.secondary{background:#fff;color:#2558d9;border:1px solid #2558d9}.code{display:none;margin:18px 0;padding:14px;background:#f4f7ff;border-radius:10px;word-break:break-all;font-family:ui-monospace,monospace}.hint{color:#5b6579;line-height:1.65}</style><main class=\"card\"><h1>连接 Codex</h1><p>点击一次生成连接码，然后把它填入 Codex 的“标头值”。</p><p class=\"hint\">连接码只用于调用星人工具；请勿发送给他人。重新生成或断开连接后，旧码立即失效。</p><button id=\"create\">生成连接码</button><div class=\"code\" id=\"code\"></div><button class=\"secondary\" id=\"copy\" hidden>复制连接码</button><button class=\"secondary\" id=\"revoke\" hidden>断开 Codex</button><p class=\"hint\" id=\"message\"></p></main><script>const message=document.querySelector('#message'),code=document.querySelector('#code'),copy=document.querySelector('#copy'),revoke=document.querySelector('#revoke');function userId(){try{return localStorage.getItem('uid')||JSON.parse(localStorage.getItem('user')||'{}').id||''}catch{return ''}}async function call(method){const uid=userId();if(!uid){message.textContent='请先登录星人控制台，再回到本页。';return null}const response=await fetch('./connection-code',{method,credentials:'include',headers:{'X-New-Api-User':uid}});const data=await response.json().catch(()=>({}));if(!response.ok){message.textContent='暂时无法完成，请稍后重试。';return null}return data}document.querySelector('#create').onclick=async()=>{message.textContent='正在生成…';const data=await call('POST');if(!data)return;code.textContent=data.connection_code;code.style.display='block';copy.hidden=false;revoke.hidden=false;message.textContent='请复制连接码，再按下方步骤填入 Codex。'};copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.textContent);message.textContent='已复制。'}catch{message.textContent='请手动选中并复制连接码。'}};revoke.onclick=async()=>{message.textContent='正在断开…';const data=await call('DELETE');if(!data)return;code.textContent='';code.style.display='none';copy.hidden=true;revoke.hidden=true;message.textContent='已断开。Codex 将不能继续使用星人工具。'};</script></html>"""
    html = html.replace("fetch('./connection-code'", 'fetch("/codex/agent/codex/connection-code"')
    html = html.replace("复制连接码", "复制填写值")
    html = html.replace("code.textContent=data.connection_code", "code.textContent=`Bearer ${data.connection_code}`")
    html = html.replace("请复制连接码，再按下方步骤填入 Codex。", "点击“复制填写值”，再按下方步骤填入 Codex。")
    html = html.replace(
        "</main><script>",
        """<section class="guide"><h2>接下来怎么填</h2><ol><li>点击“复制填写值”。</li><li>打开 Codex 的设置，依次进入“插件 → MCP → 添加服务器 → 连接至自定义 MCP”。</li><li>名称填写 <code>xingren-media</code>（只能使用英文、数字或连字符），类型选择“流式 HTTP”。</li><li>URL 填写 <code>https://api.aiphui.top/codex/mcp</code>。</li><li>使用页面已经显示的那一行标头：键填写 <code>Authorization</code>；把复制的内容直接粘贴到“值”，然后保存。不要点击“添加标头”。</li></ol><p class="hint">不要填写 Bearer 令牌环境变量，也不要填写其他标头。</p><p><a href="/codex/docs/agent-connect" target="_blank" rel="noopener noreferrer">查看完整图文说明</a></p></section></main><script>""",
    )
    html = html.replace("</style>", ".guide{margin-top:28px;padding-top:20px;border-top:1px solid rgba(181,204,196,.16);line-height:1.8}.guide h2{font-size:20px;margin:0 0 10px}.guide ol{padding-left:22px}.guide code{background:rgba(69,185,157,.12);padding:2px 5px;border-radius:4px;word-break:break-all;color:#b5e8da}.guide a{color:#8ee0c8}body{max-width:760px;margin:0 auto;padding:48px 24px;color:#edf7f2;background:radial-gradient(circle at top,#173a33 0,#07110f 55%);min-height:100vh}.card{background:rgba(13,31,27,.96);border:1px solid rgba(181,204,196,.16);border-radius:20px;padding:34px;box-shadow:0 24px 60px rgba(0,0,0,.32)}h1{font-size:32px;letter-spacing:-.03em}button{background:#45b99d;border-radius:10px;font-weight:700}button.secondary{background:transparent;color:#b5e8da;border:1px solid rgba(142,224,200,.6)}.code{background:rgba(69,185,157,.12);color:#dffbf2}.hint{color:#adc4ba}</style>")
    return HTMLResponse(html, headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"})


def mcp_tools() -> list[dict[str, Any]]:
    return [
        {"name": "xingren_connection_status", "description": "检查星人工具是否已经连接。用户第一次使用或说连接不上时调用。", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
        {"name": "xingren_list_media_models", "description": "唯一用于查询当前账户图像和视频能力的工具，返回已接通的图像/视频模型、费用和可选规格。用户询问星人或 AIPHUI 有哪些模型、图像模型、视频模型、价格，或准备生成图片/视频时，必须调用本工具；不得调用 xingren_ask 或自行罗列文本模型。", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
        {"name": "xingren_ask", "description": "向星人助手提问、写作或分析。仅在用户明确需要文字结果时调用；不得用于查询模型列表、图像、视频、价格或媒体能力。", "inputSchema": {"type": "object", "properties": {"prompt": {"type": "string", "description": "用户的问题或任务"}}, "required": ["prompt"], "additionalProperties": False}},
        {"name": "xingren_generate_image", "description": "生成一张图片、海报、封面或插画。仅在用户明确要求图片时调用。先用 xingren_list_media_models 查看模型、费用和可选规格；model 只能填写列表中的完整展示名称，留空则自动选择。等待、空结果或普通失败不代表参数不支持、权限未开通或模型不可用；不得猜测原因、自动重试或自行换模型。", "inputSchema": {"type": "object", "properties": {"prompt": {"type": "string", "description": "图片描述"}, "model": {"type": "string", "description": "可选的图像模型展示名称"}, "aspect_ratio": {"type": "string", "description": "画面比例，必须使用所选模型列表中标注的值"}, "resolution": {"type": "string", "description": "清晰度，必须使用所选模型列表中标注的值"}, "n": {"type": "integer", "minimum": 1, "maximum": 4, "description": "生成张数，默认 1；最多 4 张"}, "quality": {"type": "string", "description": "可选质量，必须使用所选模型列表中标注的值"}, "output_format": {"type": "string", "description": "可选输出格式"}, "output_compression": {"type": "integer", "minimum": 0, "maximum": 100, "description": "可选输出压缩，范围 0–100；仅在模型列表标注支持时填写"}, "background": {"type": "string", "description": "可选背景模式"}}, "required": ["prompt"], "additionalProperties": False}},
        {"name": "xingren_generate_video", "description": "生成一段视频。仅在用户明确要求视频时调用。先用 xingren_list_media_models 查看模型、费用和可选规格；model 只能填写列表中的完整展示名称，留空则自动选择。等待、空结果或普通失败不代表参数不支持、权限未开通或模型不可用；不得猜测原因、自动重试或自行换模型。", "inputSchema": {"type": "object", "properties": {"prompt": {"type": "string", "description": "视频描述"}, "model": {"type": "string", "description": "可选的视频模型展示名称"}, "duration_seconds": {"type": "integer", "minimum": 4, "maximum": 15, "description": "时长，必须使用所选模型列表中标注的值"}, "aspect_ratio": {"type": "string", "description": "画面比例，必须使用所选模型列表中标注的值"}, "size": {"type": "string", "description": "可选像素尺寸，必须使用所选模型列表中标注的值；不能与画面比例冲突"}, "resolution": {"type": "string", "description": "清晰度，必须使用所选模型列表中标注的值"}, "seed": {"type": "integer", "minimum": 0, "description": "可选随机种子；仅在模型支持时填写"}, "watermark": {"type": "boolean", "description": "可选水印开关；仅在模型支持时填写"}}, "required": ["prompt"], "additionalProperties": False}},
        {"name": "xingren_get_media_result", "description": "查询已开始的图片或视频生成任务。生成工具返回任务编号后，等待至少 10 秒再调用；任务仍在进行时，只能用同一编号继续查询，不能重新生成、换模型或自动重试。等待、空结果或普通失败不代表参数不支持、权限未开通或模型不可用；不得猜测原因，也不得声称已重试或已换模型。只有工具返回明确的安全提示时才可说明原因。", "inputSchema": {"type": "object", "properties": {"task_id": {"type": "string", "pattern": "^mcp_[a-f0-9]{32}$", "description": "生成工具返回的任务编号"}}, "required": ["task_id"], "additionalProperties": False}},
    ]


async def call_agent_tool(
    settings: Settings,
    user: UserContext,
    name: str,
    arguments: dict[str, Any],
    authorization_store: AgentAuthorizationStore,
) -> dict[str, Any]:
    if name == "xingren_connection_status":
        return {"content": [{"type": "text", "text": "已连接。使用图片或视频前，我会先检查当前可用模型。"}]}
    if name == "xingren_list_media_models":
        image_models, video_models = await asyncio.gather(
            live_media_models(settings, media_api_key(user, "image"), "image"),
            live_media_models(settings, media_api_key(user, "video"), "video"),
        )
        return {"content": [{"type": "text", "text": media_models_message(image_models, video_models)}]}
    if name == "xingren_get_media_result":
        return await _media_result_response(settings, user, str(arguments.get("task_id") or ""), authorization_store)
    prompt = str(arguments.get("prompt") or "").strip()
    if not prompt or len(prompt) > 8000:
        return safe_mcp_error("请提供不超过 8000 字的任务说明。")
    try:
        if name == "xingren_ask":
            return await _ask(settings, user, prompt)
        if name == "xingren_generate_image":
            request, media_user = await _prepare_image_generation(
                settings,
                user,
                prompt,
                str(arguments.get("size") or ""),
                str(arguments.get("model") or ""),
                resolution=str(arguments.get("resolution") or ""),
                aspect_ratio=str(arguments.get("aspect_ratio") or ""),
                quality=str(arguments.get("quality") or ""),
                output_format=str(arguments.get("output_format") or ""),
                output_compression=arguments.get("output_compression"),
                background=str(arguments.get("background") or ""),
                count=arguments.get("n"),
            )
            return await _start_media_task(settings, user, "image", request, media_user, authorization_store)
        if name == "xingren_generate_video":
            request, media_user = await _prepare_video_generation(settings, user, prompt, arguments)
            return await _start_media_task(settings, user, "video", request, media_user, authorization_store)
        return safe_mcp_error("该工具暂不可用。")
    except MediaGenerationError as exc:
        return safe_mcp_error(redact(str(exc), secret_values_for_redaction(settings, user.api_key)))
    except Exception as exc:
        logger.warning("agent tool failed tool=%s user=%s reason=%s", name, user.key_hint, type(exc).__name__)
        return safe_mcp_error()


async def _ask(settings: Settings, user: UserContext, prompt: str) -> dict[str, Any]:
    api_key = (user.api_keys or {}).get("codex") or user.api_key
    payload = {"model": settings.default_chat_model, "messages": [{"role": "user", "content": prompt}], "stream": False, "max_tokens": settings.fast_path_max_output_tokens}
    timeout = httpx.Timeout(120.0, connect=8.0, read=120.0, write=20.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(f"{settings.new_api_base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, json=payload)
    if response.status_code >= 400:
        return safe_mcp_error()
    try:
        body = response.json()
        text = str((((body.get("choices") or [{}])[0].get("message") or {}).get("content") or "")).strip()
    except (AttributeError, ValueError, TypeError):
        text = ""
    return {"content": [{"type": "text", "text": text or "暂时没有生成内容，请稍后重试。"}]}


async def _prepare_image_generation(
    settings: Settings,
    user: UserContext,
    prompt: str,
    size: str,
    model: str,
    *,
    resolution: str = "",
    aspect_ratio: str = "",
    quality: str = "",
    output_format: str = "",
    output_compression: Any = None,
    background: str = "",
    count: Any = None,
) -> tuple[WorkspaceRunRequest, UserContext]:
    image_key = media_api_key(user, "image")
    if not image_key:
        raise MediaGenerationError("当前账号没有可用的图像模型权限。请刷新模型列表后重试。")
    allowed_models = await live_media_models(settings, image_key, "image")
    if not allowed_models:
        raise MediaGenerationError("当前没有可用的图像模型。请刷新模型列表后重试。")
    resolved_model = resolved_media_model(model, "image")
    if resolved_model is None or (resolved_model and resolved_model not in allowed_models):
        raise MediaGenerationError("所选图像模型当前不可用。请先查看可用模型后再选择。")
    selected_model = resolved_model or allowed_models[0]
    params: dict[str, Any] = {"n": 1 if count is None else count}
    for key, value in {
        "size": size,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "quality": quality,
        "output_format": output_format,
        "background": background,
    }.items():
        if value:
            params[key] = value
    if output_compression is not None:
        params["output_compression"] = output_compression
    request = WorkspaceRunRequest(
        user_query=prompt,
        model_role="image_generation",
        task_type="agent_image",
        model_config={"image_generation": selected_model},
        params=params,
        metadata={"server_allowed_models_by_mode": {"image": list(allowed_models)}},
    )
    normalized = normalize_mcp_media_request(request, "image", selected_model)
    media_user = UserContext(
        api_key=image_key,
        user_id=user.user_id,
        key_hint=user.key_hint,
        allowed_models_by_mode=user.allowed_models_by_mode,
    )
    return normalized, media_user


async def _prepare_video_generation(
    settings: Settings,
    user: UserContext,
    prompt: str,
    arguments: dict[str, Any],
) -> tuple[WorkspaceRunRequest, UserContext]:
    video_key = media_api_key(user, "video")
    if not video_key:
        raise MediaGenerationError("当前账号没有可用的视频模型权限。请刷新模型列表后重试。")
    allowed_models = await live_media_models(settings, video_key, "video")
    if not allowed_models:
        raise MediaGenerationError("当前没有可用的视频模型。请刷新模型列表后重试。")
    selected_model = resolved_media_model(str(arguments.get("model") or ""), "video")
    if selected_model is None or (selected_model and selected_model not in allowed_models):
        raise MediaGenerationError("所选视频模型当前不可用。请先查看可用模型后再选择。")
    selected_model = selected_model or allowed_models[0]
    params = {
        key: arguments[key]
        for key in ("duration_seconds", "aspect_ratio", "size", "resolution", "seed", "watermark")
        if key in arguments and arguments[key] is not None
    }
    request = WorkspaceRunRequest(
        user_query=prompt,
        model_role="video_generation",
        task_type="agent_video",
        model_config={"video_generation": selected_model},
        params=params,
        metadata={"server_allowed_models_by_mode": {"video": list(allowed_models)}},
    )
    normalized = normalize_mcp_media_request(request, "video", selected_model)
    media_user = UserContext(
        api_key=video_key,
        user_id=user.user_id,
        key_hint=user.key_hint,
        allowed_models_by_mode=user.allowed_models_by_mode,
    )
    return normalized, media_user


def media_task_store(authorization_store: AgentAuthorizationStore) -> TaskStore:
    return TaskStore(authorization_store.redis, authorization_store.settings)


def _media_task_expires_at() -> str:
    return (datetime.now(UTC) + timedelta(seconds=MEDIA_TASK_MAX_AGE_SECONDS)).isoformat()


def _media_task_has_expired(task: dict[str, Any]) -> bool:
    raw_deadline = str(task.get("expires_at") or "")
    try:
        deadline = datetime.fromisoformat(raw_deadline)
    except ValueError:
        return True
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)
    return datetime.now(UTC) >= deadline


def _media_wait_response(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}]}


def _media_started_response(task_id: str) -> dict[str, Any]:
    return {
        "content": [
            {
                "type": "text",
                "text": (
                    "生成任务已开始。请等待至少 10 秒后，只调用 xingren_get_media_result 查询结果；"
                    "在任务完成前，不要再次调用生成工具、不要更换模型、不要自动重试。"
                    "等待、空结果或普通失败不代表参数不支持、权限未开通或模型不可用；不得猜测原因。"
                    f"\n任务编号：{task_id}"
                ),
            }
        ]
    }


def _media_confirming_response(task_id: str) -> dict[str, Any]:
    return _media_wait_response(f"{MEDIA_CONFIRMING_MESSAGE}\n任务编号：{task_id}")


def _update_media_task(store: TaskStore, task_id: str, **fields: Any) -> dict[str, Any] | None:
    try:
        return store.update(task_id, **fields)
    except Exception as exc:
        logger.warning("media task state update failed type=%s", type(exc).__name__)
        return None


def _delete_media_task_secret(store: TaskStore, task_id: str) -> None:
    try:
        store.delete_task_secret(task_id)
    except Exception as exc:
        logger.warning("media task secret cleanup failed type=%s", type(exc).__name__)


def _media_request_fingerprint(user: UserContext, media_type: str, request: WorkspaceRunRequest, media_user: UserContext) -> str:
    payload = {
        "user_id": user.user_id,
        "media_type": media_type,
        "prompt": request.user_query,
        "model": request.model_roles.image_generation if media_type == "image" else request.model_roles.video_generation,
        "params": request.params,
        "files": [
            {"path": item.path, "content_hash": _hash(item.content)}
            for item in request.files
        ],
    }
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hmac.new(media_user.api_key.encode("utf-8"), serialized.encode("utf-8"), hashlib.sha256).hexdigest()


def _release_media_request(store: TaskStore, task: dict[str, Any]) -> None:
    fingerprint = str(task.get("active_request_fingerprint") or "")
    task_id = str(task.get("task_id") or "")
    if not fingerprint or not MEDIA_TASK_ID_RE.fullmatch(task_id):
        return
    try:
        store.release_media_request(fingerprint, task_id)
    except Exception as exc:
        logger.warning("media request release failed type=%s", type(exc).__name__)


def _finish_media_task(store: TaskStore, task_id: str, status_value: str, **fields: Any) -> dict[str, Any] | None:
    task = _update_media_task(store, task_id, status=status_value, **fields)
    if task is not None:
        _delete_media_task_secret(store, task_id)
        if status_value in {"completed", "failed", "expired", "interrupted", "cancelled", "canceled"}:
            _release_media_request(store, task)
    return task


def _existing_media_task_response(store: TaskStore, task_id: str, user: UserContext) -> dict[str, Any] | None:
    try:
        task = store.get(task_id)
    except Exception as exc:
        logger.warning("media request lookup failed type=%s", type(exc).__name__)
        return safe_mcp_error()
    if not task:
        return None
    owner = str(task.get("user_id") or "")
    if not owner or not secrets.compare_digest(owner, user.user_id):
        return safe_mcp_error()
    status_value = str(task.get("status") or "")
    if _media_task_has_expired(task):
        if not str(task.get("remote_task_id") or ""):
            _finish_media_task(store, task_id, "unconfirmed")
            return safe_mcp_error(MEDIA_TASK_UNCONFIRMED_MESSAGE)
        _finish_media_task(store, task_id, "expired")
        return None
    if status_value == "submitting":
        return _media_confirming_response(task_id)
    if status_value in {"running", "preparing"}:
        return _media_started_response(task_id)
    if status_value == "unconfirmed":
        return safe_mcp_error(MEDIA_TASK_UNCONFIRMED_MESSAGE)
    _release_media_request(store, task)
    return None


async def _start_media_task(
    settings: Settings,
    user: UserContext,
    media_type: str,
    request: WorkspaceRunRequest,
    media_user: UserContext,
    authorization_store: AgentAuthorizationStore,
) -> dict[str, Any]:
    task_id = f"mcp_{uuid4().hex}"
    created_at = now_iso()
    fingerprint = _media_request_fingerprint(user, media_type, request, media_user)
    task = {
        "task_id": task_id,
        "user_id": user.user_id,
        "task_type": "mcp_media",
        "media_type": media_type,
        "status": "submitting",
        "credential_ref": "task-secret",
        "active_request_fingerprint": fingerprint,
        "created_at": created_at,
        "updated_at": created_at,
        "expires_at": _media_task_expires_at(),
    }
    try:
        store = media_task_store(authorization_store)
        store.put_task_secret(task_id, media_user.api_key)
        store.create(task)
    except Exception as exc:
        logger.warning("media task initialization failed type=%s user=%s", type(exc).__name__, user.key_hint)
        try:
            store.delete_task_secret(task_id)
        except Exception:
            pass
        return safe_mcp_error("生成任务暂时无法开始，请稍后重试。")
    for _ in range(2):
        try:
            reserved_task_id = store.reserve_media_request(fingerprint, task_id, settings.task_retention_seconds)
        except Exception as exc:
            logger.warning("media request reservation failed type=%s", type(exc).__name__)
            _delete_media_task_secret(store, task_id)
            try:
                store.delete(task_id)
            except Exception:
                pass
            return safe_mcp_error("生成任务暂时无法开始，请稍后重试。")
        if reserved_task_id == task_id:
            break
        existing_response = _existing_media_task_response(store, reserved_task_id, user)
        if existing_response is not None:
            _delete_media_task_secret(store, task_id)
            try:
                store.delete(task_id)
            except Exception:
                pass
            return existing_response
        try:
            store.release_media_request(fingerprint, reserved_task_id)
        except Exception as exc:
            logger.warning("stale media request release failed type=%s", type(exc).__name__)
            _delete_media_task_secret(store, task_id)
            try:
                store.delete(task_id)
            except Exception:
                pass
            return safe_mcp_error("生成任务暂时无法开始，请稍后重试。")
    else:
        _delete_media_task_secret(store, task_id)
        try:
            store.delete(task_id)
        except Exception:
            pass
        return safe_mcp_error("生成任务暂时无法开始，请稍后重试。")
    try:
        submission = await submit_mcp_media_task(settings, request, media_user, media_type)
    except McpMediaSubmissionUncertain:
        return _media_confirming_response(task_id)
    except MediaGenerationError:
        _finish_media_task(store, task_id, "failed")
        return safe_mcp_error("生成任务暂时无法开始，请稍后重试。")
    except Exception as exc:
        logger.warning("media task submit failed type=%s user=%s", type(exc).__name__, user.key_hint)
        return _media_confirming_response(task_id)
    if submission.state is McpMediaTaskState.COMPLETED:
        if submission.media is None:
            _finish_media_task(store, task_id, "unconfirmed")
            return safe_mcp_error(MEDIA_TASK_UNCONFIRMED_MESSAGE)
        file_paths = await _persist_media_output(settings, user, task, submission.media)
        if not file_paths:
            _finish_media_task(store, task_id, "unconfirmed")
            return safe_mcp_error(MEDIA_TASK_UNCONFIRMED_MESSAGE)
        completed = _finish_media_task(store, task_id, "completed", media_file_names=[path.name for path in file_paths])
        if completed is None:
            return _media_confirming_response(task_id)
        try:
            return _media_artifact_response(settings, user, media_type, file_paths, authorization_store)
        except Exception as exc:
            logger.warning("media artifact issue failed type=%s user=%s", type(exc).__name__, user.key_hint)
            return safe_mcp_error("生成结果暂时无法展示，请稍后使用同一个任务编号查询。")
    if submission.state is not McpMediaTaskState.PENDING or not submission.remote_task_id:
        _finish_media_task(store, task_id, "failed")
        return safe_mcp_error("生成任务暂时无法开始，请稍后重试。")
    updated = _update_media_task(store, task_id, status="running", remote_task_id=submission.remote_task_id)
    if updated is None:
        return _media_confirming_response(task_id)
    return _media_started_response(task_id)


async def _media_result_response(
    settings: Settings,
    user: UserContext,
    task_id: str,
    authorization_store: AgentAuthorizationStore,
) -> dict[str, Any]:
    if not MEDIA_TASK_ID_RE.fullmatch(task_id):
        return safe_mcp_error("生成任务编号无效，请重新提交。")
    try:
        task = media_task_store(authorization_store).get(task_id)
    except Exception as exc:
        logger.warning("media task query failed type=%s user=%s", type(exc).__name__, user.key_hint)
        return safe_mcp_error()
    if not task or task.get("task_type") != "mcp_media":
        return safe_mcp_error("找不到这次生成任务，请重新提交。")
    owner = str(task.get("user_id") or "")
    if not owner or not secrets.compare_digest(owner, user.user_id):
        return safe_mcp_error("找不到这次生成任务，请重新提交。")
    status_value = str(task.get("status") or "")
    media_type = str(task.get("media_type") or "")
    if media_type not in {"image", "video"}:
        return safe_mcp_error("找不到这次生成任务，请重新提交。")
    if status_value == "completed":
        file_paths = _media_output_files(settings, user, task)
        if not file_paths:
            return safe_mcp_error(MEDIA_TASK_EXPIRED_MESSAGE)
        try:
            return _media_artifact_response(settings, user, media_type, file_paths, authorization_store)
        except Exception as exc:
            logger.warning("media artifact issue failed type=%s user=%s", type(exc).__name__, user.key_hint)
            return safe_mcp_error("生成结果暂时无法展示，请稍后使用同一个任务编号查询。")
    if status_value in {"failed", "expired", "interrupted", "cancelled", "canceled", "unconfirmed"}:
        if status_value == "unconfirmed":
            return safe_mcp_error(MEDIA_TASK_UNCONFIRMED_MESSAGE)
        if status_value in {"expired", "interrupted", "cancelled", "canceled"}:
            return safe_mcp_error(MEDIA_TASK_EXPIRED_MESSAGE)
        return safe_mcp_error("这次生成未能完成，请稍后重新提交。")
    store = media_task_store(authorization_store)
    if _media_task_has_expired(task):
        if not str(task.get("remote_task_id") or ""):
            _finish_media_task(store, task_id, "unconfirmed")
            return safe_mcp_error(MEDIA_TASK_UNCONFIRMED_MESSAGE)
        _finish_media_task(store, task_id, "expired")
        return safe_mcp_error(MEDIA_TASK_EXPIRED_MESSAGE)
    if status_value == "submitting":
        return _media_confirming_response(task_id)
    remote_task_id = str(task.get("remote_task_id") or "")
    if not remote_task_id:
        return _media_confirming_response(task_id)
    try:
        media_key = store.get_task_secret(task_id)
    except Exception as exc:
        logger.warning("media task secret read failed type=%s", type(exc).__name__)
        return _media_wait_response(MEDIA_CONFIRMING_MESSAGE)
    if not media_key:
        _finish_media_task(store, task_id, "expired")
        return safe_mcp_error(MEDIA_TASK_EXPIRED_MESSAGE)
    media_user = UserContext(api_key=media_key, user_id=user.user_id, key_hint=user.key_hint)
    try:
        result = await fetch_mcp_media_task(settings, media_user, media_type, remote_task_id)
    except MediaGenerationError:
        return _media_wait_response(MEDIA_CONFIRMING_MESSAGE)
    except Exception as exc:
        logger.warning("media task poll failed type=%s user=%s", type(exc).__name__, user.key_hint)
        return _media_wait_response(MEDIA_CONFIRMING_MESSAGE)
    if result.state is McpMediaTaskState.PENDING:
        _update_media_task(store, task_id, status="running")
        return _media_wait_response(MEDIA_WAIT_MESSAGE)
    if result.state is McpMediaTaskState.FAILED:
        _finish_media_task(store, task_id, "failed")
        return safe_mcp_error("这次生成未能完成，请稍后重新提交。")
    if result.state is not McpMediaTaskState.COMPLETED or result.media is None:
        _update_media_task(store, task_id, status="preparing")
        return _media_wait_response(MEDIA_PREPARING_MESSAGE)
    file_paths = await _persist_media_output(settings, user, task, result.media)
    if not file_paths:
        _update_media_task(store, task_id, status="preparing")
        return _media_wait_response(MEDIA_PREPARING_MESSAGE)
    completed = _finish_media_task(store, task_id, "completed", media_file_names=[path.name for path in file_paths])
    if completed is None:
        return _media_wait_response(MEDIA_PREPARING_MESSAGE)
    try:
        return _media_artifact_response(settings, user, media_type, file_paths, authorization_store)
    except Exception as exc:
        logger.warning("media artifact issue failed type=%s user=%s", type(exc).__name__, user.key_hint)
        return safe_mcp_error("生成结果暂时无法展示，请稍后使用同一个任务编号查询。")


async def _persist_media_output(
    settings: Settings,
    user: UserContext,
    task: dict[str, Any],
    media: MediaResult,
) -> list[Path]:
    task_id = str(task.get("task_id") or "")
    media_type = str(task.get("media_type") or "")
    if not MEDIA_TASK_ID_RE.fullmatch(task_id) or media_type not in {"image", "video"} or media.media_type != media_type:
        return []
    workspace = safe_user_path(settings.runs_dir / "mcp", user.user_id, task_id)
    output_dir = (workspace / "outputs").resolve()
    root = (settings.runs_dir / "mcp" / user.user_id).resolve()
    if root not in output_dir.parents:
        return []
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        await persist_remote_media(settings, user, task, output_dir, media, timeout_seconds=MEDIA_PREVIEW_WAIT_SECONDS)
    except Exception as exc:
        logger.warning("media result persistence failed type=%s user=%s", type(exc).__name__, user.key_hint)
        return []
    maximum_files = 4 if media_type == "image" else 1
    files = [path for path in sorted(output_dir.iterdir()) if path.is_file() and _valid_media_output_file(path, media_type, root)]
    return files[:maximum_files]


def _media_output_files(settings: Settings, user: UserContext, task: dict[str, Any]) -> list[Path] | None:
    task_id = str(task.get("task_id") or "")
    media_type = str(task.get("media_type") or "")
    file_names = task.get("media_file_names")
    if not MEDIA_TASK_ID_RE.fullmatch(task_id) or media_type not in {"image", "video"} or not isinstance(file_names, list):
        return None
    maximum_files = 4 if media_type == "image" else 1
    if not 1 <= len(file_names) <= maximum_files:
        return None
    workspace = safe_user_path(settings.runs_dir / "mcp", user.user_id, task_id)
    output_dir = (workspace / "outputs").resolve()
    root = (settings.runs_dir / "mcp" / user.user_id).resolve()
    if root not in output_dir.parents:
        return None
    files: list[Path] = []
    names: set[str] = set()
    for value in file_names:
        file_name = str(value or "")
        if not file_name or file_name in names or Path(file_name).name != file_name:
            return None
        names.add(file_name)
        file_path = (output_dir / file_name).resolve()
        if not _valid_media_output_file(file_path, media_type, root):
            return None
        files.append(file_path)
    return files


def _valid_media_output_file(file_path: Path, media_type: str, root: Path) -> bool:
    allowed_suffixes = {".png", ".jpg", ".jpeg", ".webp", ".gif"} if media_type == "image" else {".mp4", ".webm", ".mov", ".m4v"}
    if file_path.suffix.lower() not in allowed_suffixes or root not in file_path.parents or not file_path.is_file():
        return False
    maximum_size = 20 * 1024 * 1024 if media_type == "image" else 120 * 1024 * 1024
    try:
        size = file_path.stat().st_size
        if size <= 0 or size > maximum_size:
            return False
        with file_path.open("rb") as handle:
            header = handle.read(16)
    except OSError:
        return False
    suffix = file_path.suffix.lower()
    if suffix == ".png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    if suffix in {".jpg", ".jpeg"}:
        return header.startswith(b"\xff\xd8\xff")
    if suffix == ".gif":
        return header.startswith((b"GIF87a", b"GIF89a"))
    if suffix == ".webp":
        return header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    if suffix == ".webm":
        return header.startswith(b"\x1aE\xdf\xa3")
    return len(header) >= 12 and header[4:8] == b"ftyp"


def _media_artifact_response(
    settings: Settings,
    user: UserContext,
    media_type: str,
    file_paths: list[Path],
    authorization_store: AgentAuthorizationStore,
) -> dict[str, Any]:
    if media_type not in {"image", "video"} or not file_paths:
        raise ValueError("生成文件无效")
    content: list[dict[str, str]] = []
    if media_type == "image":
        for index, file_path in enumerate(file_paths, start=1):
            suffix = file_path.suffix.lower()
            mime_type = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".gif": "image/gif",
            }[suffix]
            artifact_token = authorization_store.issue_artifact(user, file_path)
            artifact_uri = f"{public_base(settings)}/agent/artifacts/{artifact_token}"
            name = "生成的图片" if len(file_paths) == 1 else f"生成的图片 {index}"
            content.append({"type": "resource_link", "uri": artifact_uri, "name": name, "mimeType": mime_type})
            content.append({"type": "text", "text": f"![{name}]({artifact_uri})"})
        content.insert(len(file_paths), {"type": "text", "text": f"已生成 {len(file_paths)} 张图片。请打开图片进行预览或下载。"})
        return {"content": content}
    file_path = file_paths[0]
    mime_type = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".m4v": "video/x-m4v",
    }[file_path.suffix.lower()]
    artifact_token = authorization_store.issue_artifact(user, file_path)
    artifact_uri = f"{public_base(settings)}/agent/artifacts/{artifact_token}"
    return {
        "content": [
            {"type": "resource_link", "uri": artifact_uri, "name": "生成的视频", "mimeType": mime_type},
            {"type": "text", "text": "视频已生成。请打开生成的视频进行预览或下载。"},
            {"type": "text", "text": f"[预览或下载生成的视频]({artifact_uri})"},
        ]
    }


def mcp_response(request_id: Any, result: dict[str, Any]) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result}, headers={"Cache-Control": "no-store"})


def mcp_failure(request_id: Any, code: int, message: str) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": public_error_message(message)}}, headers={"Cache-Control": "no-store"})
