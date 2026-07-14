from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from uuid import uuid4

import httpx
from fastapi import HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from redis import Redis

from app.config import Settings, secret_values_for_redaction
from app.media_tools import MediaGenerationError, generate_media
from app.models import WorkspaceRunRequest
from app.security import UserContext, public_error_message, redact

logger = logging.getLogger(__name__)

MCP_SCOPE = "xingren.agent"
MCP_PROTOCOL_VERSION = "2025-03-26"
PUBLIC_MEDIA_MODEL_ALIASES = {"特价 image-2": "geek2api-image-2"}


def resolved_media_model(model: str) -> str:
    return PUBLIC_MEDIA_MODEL_ALIASES.get(model, model)


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
        return UserContext(
            api_key=str(user.get("api_key") or ""),
            user_id=str(user.get("user_id") or ""),
            key_hint=str(user.get("key_hint") or "agent"),
            username=str(user.get("username") or ""),
            api_keys={str(key): str(value) for key, value in (user.get("api_keys") or {}).items() if value},
            allowed_models_by_mode={str(key): tuple(map(str, value)) for key, value in allowed.items() if isinstance(value, list)},
        )

    @staticmethod
    def _user_record(user: UserContext) -> dict[str, Any]:
        return {
            "user_id": user.user_id,
            "key_hint": user.key_hint,
            "username": user.username,
            "api_keys": {
                mode: key
                for mode, key in (user.api_keys or {"codex": user.api_key, "image": user.api_key}).items()
                if mode in {"codex", "image", "video"} and key
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
        {"name": "xingren_list_media_models", "description": "列出当前账户可用的图像和视频模型。用户问能用哪些模型、想先选模型或第一次生成图片视频时调用。", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}},
        {"name": "xingren_ask", "description": "向星人助手提问、写作或分析。仅在用户明确需要文字结果时调用。", "inputSchema": {"type": "object", "properties": {"prompt": {"type": "string", "description": "用户的问题或任务"}}, "required": ["prompt"], "additionalProperties": False}},
        {"name": "xingren_generate_image", "description": "生成一张图片、海报、封面或插画。仅在用户明确要求图片时调用。先用 xingren_list_media_models 查看模型；model 只能填写列表中图像模型，留空则自动选择。", "inputSchema": {"type": "object", "properties": {"prompt": {"type": "string", "description": "图片描述"}, "model": {"type": "string", "description": "可选的图像模型名称"}, "size": {"type": "string", "enum": ["960x960", "1024x1024", "1536x1024", "1024x1536"]}}, "required": ["prompt"], "additionalProperties": False}},
        {"name": "xingren_generate_video", "description": "生成一段视频。仅在用户明确要求视频时调用。先用 xingren_list_media_models 查看模型；model 只能填写列表中视频模型，留空则自动选择。", "inputSchema": {"type": "object", "properties": {"prompt": {"type": "string", "description": "视频描述"}, "model": {"type": "string", "description": "可选的视频模型名称"}, "duration_seconds": {"type": "integer", "minimum": 4, "maximum": 15}}, "required": ["prompt"], "additionalProperties": False}},
    ]


async def call_agent_tool(
    settings: Settings,
    user: UserContext,
    name: str,
    arguments: dict[str, Any],
    authorization_store: AgentAuthorizationStore,
) -> dict[str, Any]:
    if name == "xingren_connection_status":
        return {"content": [{"type": "text", "text": "已连接。文本、图片和视频工具都可以直接使用。"}]}
    if name == "xingren_list_media_models":
        image_models = list((user.allowed_models_by_mode or {}).get("image") or settings.image_allowed_models)
        video_models = list((user.allowed_models_by_mode or {}).get("video") or settings.video_allowed_models)
        return {"content": [{"type": "text", "text": f"可用图像模型：{', '.join(image_models) or '暂无'}\n可用视频模型：{', '.join(video_models) or '暂无'}\n请告诉我：用哪一个模型生成什么内容。"}]}
    prompt = str(arguments.get("prompt") or "").strip()
    if not prompt or len(prompt) > 8000:
        return safe_mcp_error("请提供不超过 8000 字的任务说明。")
    try:
        if name == "xingren_ask":
            return await _ask(settings, user, prompt)
        if name == "xingren_generate_image":
            return await _generate_image(settings, user, prompt, str(arguments.get("size") or "1024x1024"), str(arguments.get("model") or ""), authorization_store)
        if name == "xingren_generate_video":
            return await _generate_video(settings, user, prompt, arguments, authorization_store)
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


async def _generate_image(settings: Settings, user: UserContext, prompt: str, size: str, model: str, authorization_store: AgentAuthorizationStore) -> dict[str, Any]:
    task_id = f"mcp_{uuid4().hex}"
    allowed_models = tuple((user.allowed_models_by_mode or {}).get("image") or settings.image_allowed_models)
    model = resolved_media_model(model)
    if model and model not in allowed_models:
        return safe_mcp_error("所选图像模型当前不可用。请先查看可用模型后再选择。")
    request = WorkspaceRunRequest(user_query=prompt, model_role="image_generation", task_type="agent_image", model_config={"image_generation": model}, params={"size": size, "n": 1}, metadata={"server_allowed_models_by_mode": {"image": list(allowed_models)}})
    image_key = (user.api_keys or {}).get("image") or user.api_key
    image_user = UserContext(api_key=image_key, user_id=user.user_id, key_hint=user.key_hint, allowed_models_by_mode=user.allowed_models_by_mode)
    await generate_media(settings, request, image_user, {"task_id": task_id, "workspace": str(settings.runs_dir / "mcp" / user.user_id / task_id)}, "image")
    output_dir = settings.runs_dir / "mcp" / user.user_id / task_id / "outputs"
    files = sorted(path for path in output_dir.glob("*") if path.is_file())
    if not files:
        return safe_mcp_error("图片已生成，但暂时无法安全交付，请稍后重试。")
    image = files[0]
    if not image.stat().st_size or image.stat().st_size > 20 * 1024 * 1024:
        return safe_mcp_error("图片结果无效，请稍后重试。")
    mime_type = "image/png" if image.suffix.lower() == ".png" else "image/jpeg" if image.suffix.lower() in {".jpg", ".jpeg"} else "image/webp"
    artifact_token = authorization_store.issue_artifact(user, image)
    return {"content": [{"type": "resource_link", "uri": f"{public_base(settings)}/agent/artifacts/{artifact_token}", "name": "生成的图片", "mimeType": mime_type}, {"type": "text", "text": "图片已生成。请打开生成的图片进行预览或下载。"}]}


async def _generate_video(
    settings: Settings,
    user: UserContext,
    prompt: str,
    arguments: dict[str, Any],
    authorization_store: AgentAuthorizationStore,
) -> dict[str, Any]:
    task_id = f"mcp_{uuid4().hex}"
    model = resolved_media_model(str(arguments.get("model") or ""))
    allowed_models = tuple((user.allowed_models_by_mode or {}).get("video") or settings.video_allowed_models)
    if model and model not in allowed_models:
        return safe_mcp_error("所选视频模型当前不可用。请先查看可用模型后再选择。")
    request = WorkspaceRunRequest(
        user_query=prompt,
        model_role="video_generation",
        task_type="agent_video",
        model_config={"video_generation": model},
        params={"duration_seconds": arguments.get("duration_seconds") or 8},
        metadata={"server_allowed_models_by_mode": {"video": list(allowed_models)}},
    )
    video_key = (user.api_keys or {}).get("video") or user.api_key
    video_user = UserContext(api_key=video_key, user_id=user.user_id, key_hint=user.key_hint, allowed_models_by_mode=user.allowed_models_by_mode)
    await generate_media(settings, request, video_user, {"task_id": task_id, "workspace": str(settings.runs_dir / "mcp" / user.user_id / task_id)}, "video")
    output_dir = settings.runs_dir / "mcp" / user.user_id / task_id / "outputs"
    files = sorted(path for path in output_dir.glob("*") if path.is_file())
    if not files:
        return safe_mcp_error("视频已生成，但暂时无法安全交付，请稍后重试。")
    artifact_token = authorization_store.issue_artifact(user, files[0])
    return {
        "content": [
            {"type": "resource_link", "uri": f"{public_base(settings)}/agent/artifacts/{artifact_token}", "name": "生成的视频", "mimeType": "video/mp4"},
            {"type": "text", "text": "视频已生成。请打开生成的视频进行预览或下载。"},
        ]
    }


def mcp_response(request_id: Any, result: dict[str, Any]) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result}, headers={"Cache-Control": "no-store"})


def mcp_failure(request_id: Any, code: int, message: str) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": public_error_message(message)}}, headers={"Cache-Control": "no-store"})
