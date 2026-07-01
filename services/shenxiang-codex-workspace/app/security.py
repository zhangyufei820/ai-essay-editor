from __future__ import annotations

import hashlib
import hmac
import json
import re
from urllib.parse import quote, quote_plus
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class UserContext:
    api_key: str
    user_id: str
    key_hint: str
    username: str = ""
    group: str = ""
    quota: Any = None
    used_quota: Any = None
    request_count: Any = None
    api_keys: dict[str, str] | None = None
    allowed_models_by_mode: dict[str, tuple[str, ...]] | None = None


ADMIN_INTENT_KEYWORDS = (
    "删除文件",
    "删除目录",
    "删除skill",
    "删除 skill",
    "卸载skill",
    "卸载 skill",
    "重启服务",
    "rm -rf",
)

USER_UPLOAD_CONTEXT_PATTERNS = (
    r"(上传|我传|附件|当前工作区|\.\/input|input\/|input\s*目录).{0,40}(文件|资料|文档|图片|内容|附件|markdown|md|txt|csv|pdf)",
    r"(文件|资料|文档|图片|内容|附件|markdown|md|txt|csv|pdf).{0,40}(上传|我传|当前工作区|\.\/input|input\/|input\s*目录)",
)


def require_new_api_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserContext:
    user = optional_new_api_user(credentials)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="缺少用户令牌")
    return user


def optional_new_api_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> UserContext | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    token = credentials.credentials.strip()
    if not token.startswith("sk-") or len(token) < 16:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户令牌无效")
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return UserContext(api_key=token, user_id=f"user_{digest[:24]}", key_hint=f"sk-{digest[:8]}")


def require_admin_bearer(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    settings = get_settings()
    expected = settings.admin_api_key
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API key is not configured.",
        )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if not hmac.compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def redact(text: str | bytes | None, secret_values: Iterable[str]) -> str:
    if text is None:
        safe = ""
    elif isinstance(text, bytes):
        safe = text.decode("utf-8", errors="replace")
    else:
        safe = str(text)
    for value in secret_values:
        if len(value) >= 8:
            variants = {value, quote(value, safe=""), quote_plus(value, safe="")}
            for variant in variants:
                safe = safe.replace(variant, "[REDACTED]")
    safe = re.sub(
        r"(?i)(authorization:\s*bearer\s+)[A-Za-z0-9._~+/=-]+",
        r"\1[REDACTED]",
        safe,
    )
    safe = re.sub(
        r"(?i)(api[_-]?key[\"']?\s*[:=]\s*[\"']?)[A-Za-z0-9._~+/=-]+",
        r"\1[REDACTED]",
        safe,
    )
    safe = re.sub(r"sk-[A-Za-z0-9._~+/=-]{12,}", "sk-[REDACTED]", safe)
    return safe


INTERNAL_ERROR_PATTERNS = (
    r"https?://[^\s)\"'<>`]+",
    r"\b[A-Za-z0-9.-]+\.(?:ai|top|dev|com|cn|io|net|org|cloud|app|xyz)\b",
    r"\b(?:New\s*API|OpenAI|Anthropic|Claude|Gemini|Grok|Dify|LiteLLM|TokenFlux|Moonapix|VivaAPI|Yunwu|Fable|GJX|RelayDance|OmniVoice)\b",
    r"(?:云雾|硅基|火山|豆包|智谱|月之暗面|供应商|渠道|通道|上游|网关|模型路由|备用线路)",
    r"\b(?:provider|upstream|gateway|channel|model|workflow|plugin|node)[-_a-z0-9:. ]*",
    r"\b(?:request_id|req_id|x-request-id|cf-ray|trace_id|channel_id|workflow_run_id|conversation_id|task_id)\s*[:=]\s*[\w.-]+",
    r"No available channel",
)


def has_internal_error_detail(text: str) -> bool:
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in INTERNAL_ERROR_PATTERNS)


def public_error_message(message: str | None, fallback: str = "服务暂时不可用，请稍后重试。") -> str:
    text = str(message or "").strip()
    if not text:
        return fallback
    if re.search(r"timeout|timed\s*out|408|504|524|超时", text, flags=re.IGNORECASE):
        return "服务响应超时或连接中断，请稍后重试。"
    if re.search(r"quota|balance|credit|额度|余额", text, flags=re.IGNORECASE):
        return "当前额度不足，请充值或稍后重试。"
    if re.search(r"config|missing|api[_-]?key|token|secret|authorization|credential|env|environment|未配置|凭据|令牌", text, flags=re.IGNORECASE):
        return fallback
    if has_internal_error_detail(text):
        return fallback
    return text[:300]


def public_error_code(code: str | None) -> str:
    text = str(code or "").strip().upper()
    if not text:
        return "SERVICE_TEMPORARILY_UNAVAILABLE"
    if re.search(r"TIMEOUT|TIMED_OUT|408|504|524", text):
        return "SERVICE_RESPONSE_TIMEOUT"
    if re.search(r"AUTH|TOKEN|KEY|SECRET|CREDENTIAL|CONFIG|MISSING", text):
        return "SERVICE_CONFIG_UNAVAILABLE"
    if re.search(r"QUOTA|BALANCE|CREDIT|BILLING", text):
        return "SERVICE_USAGE_LIMIT"
    if re.search(r"UPSTREAM|GATEWAY|PROVIDER|MODEL|CHANNEL|DIFY|OPENAI|ANTHROPIC|CLAUDE|GEMINI|GROK|TOKENFLUX|MOONAPIX|VIVA|YUNWU|FABLE|GJX|RELAYDANCE|OMNIVOICE|NEW_API", text):
        return "SERVICE_TEMPORARILY_UNAVAILABLE"
    return re.sub(r"[^A-Z0-9_]", "_", text)[:80] or "SERVICE_TEMPORARILY_UNAVAILABLE"


def safe_error(code: str, message: str) -> dict[str, str]:
    return {"code": public_error_code(code), "message": public_error_message(message)}


def normalize_sandbox(sandbox: str, settings: Settings) -> str:
    allowed = {"read-only", "workspace-write", "danger-full-access"}
    if sandbox in allowed:
        return sandbox
    return "workspace-write"


FORBIDDEN_COMMAND_PATTERNS = (
    r"\brm\s+-",
    r"\brm\s+",
    r"\brmdir\b",
    r"\bfind\b.{0,80}\b-delete\b",
    r"\bgit\s+(clean|reset)\b",
    r"\bdocker\b",
    r"\bssh\b",
    r"\bscp\b",
    r"\brsync\b",
    r"\bsudo\b",
    r"\bchown\b",
    r"\bkubectl\b",
    r"\bhelm\b",
)

FORBIDDEN_PATH_PATTERNS = (
    r"(^|/)\.env($|[.\s/])",
    r"(?<![\w-])\.env($|[.\s/])",
    r"(^|/)\.ssh($|/)",
    r"docker-compose[^/\s]*\.ya?ml",
    r"(^|/)Dockerfile($|[\s\"'}\]])",
    r"(^|/)nginx($|/)",
    r"(^|/)openresty($|/)",
    r"(^|/)1panel($|/)",
    r"/opt/1panel(?=$|[\s\"'，。,:;!?/}\]])",
    r"/etc(?=$|[\s\"'，。,:;!?/}\]])",
    r"/root(?=$|[\s\"'，。,:;!?/}\]])",
    r"/data/ai-essay-editor(?=$|[\s\"'，。,:;!?/}\]])",
    r"/opt/shenxiang-new-api(?=$|[\s\"'，。,:;!?/}\]])",
    r"/var/lib/docker(?=$|[\s\"'，。,:;!?/}\]])",
)

DESTRUCTIVE_COMMAND_PATTERNS = (
    r"\brm\s+-",
    r"\brm\s+",
    r"\brmdir\b",
    r"\bfind\b.{0,80}\b-delete\b",
    r"\bgit\s+(clean|reset)\b",
    r"\btruncate\b",
    r"\bshred\b",
)

PROTECTED_PATH_PATTERNS = FORBIDDEN_PATH_PATTERNS


def contains_forbidden_runtime_action(value: Any, *, allow_skill_docs: bool = False) -> bool:
    text = _value_to_text(value)
    command_patterns = DESTRUCTIVE_COMMAND_PATTERNS if allow_skill_docs else FORBIDDEN_COMMAND_PATTERNS
    for pattern in command_patterns:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL) and not _is_non_executable_instruction(text, pattern):
            return True
    for pattern in FORBIDDEN_PATH_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return True
    return False


def contains_protected_path_reference(value: Any) -> bool:
    text = _value_to_text(value)
    return any(re.search(pattern, text, re.IGNORECASE | re.DOTALL) for pattern in PROTECTED_PATH_PATTERNS)


def contains_destructive_action(value: Any) -> bool:
    text = _value_to_text(value)
    return any(
        re.search(pattern, text, re.IGNORECASE | re.DOTALL) and not _is_non_executable_instruction(text, pattern)
        for pattern in DESTRUCTIVE_COMMAND_PATTERNS
    )


def assert_safe_skill_file_path(relative_path: str) -> Path:
    if "\x00" in relative_path:
        raise ValueError("file path contains null byte")
    path = Path(relative_path)
    if path.is_absolute():
        raise ValueError("file path must be relative")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("file path must not contain traversal segments")
    path_text = path.as_posix()
    allowed = (
        path_text == "SKILL.md"
        or path_text == "agents/openai.yaml"
        or path_text.startswith("scripts/")
        or path_text.startswith("references/")
        or path_text.startswith("assets/")
    )
    if not allowed:
        raise ValueError("file path is outside allowed skill folders")
    for pattern in FORBIDDEN_PATH_PATTERNS:
        if re.search(pattern, path_text, re.IGNORECASE | re.DOTALL):
            raise ValueError("file path is forbidden")
    return path


def assert_safe_workspace_file_path(relative_path: str) -> Path:
    if "\x00" in relative_path:
        raise ValueError("file path contains null byte")
    path = Path(relative_path)
    if path.is_absolute():
        raise ValueError("file path must be relative")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("file path must not contain traversal segments")
    path_text = path.as_posix()
    if path_text.startswith("."):
        raise ValueError("hidden files are not allowed")
    for pattern in FORBIDDEN_PATH_PATTERNS:
        if re.search(pattern, path_text, re.IGNORECASE | re.DOTALL):
            raise ValueError("file path is forbidden")
    return path


def contains_admin_intent(value: Any) -> bool:
    text = _value_to_text(value).lower()
    compact = re.sub(r"\s+", "", text)
    if is_user_upload_file_intent(text) and not contains_forbidden_runtime_action(value):
        return False
    for keyword in ADMIN_INTENT_KEYWORDS:
        needle = keyword.lower()
        if needle in text or re.sub(r"\s+", "", needle) in compact:
            return True
    admin_action_pattern = re.compile(
        r"(删除|卸载|重启|delete|remove|restart)"
        r".{0,30}"
        r"(文件|目录|skill|skill\.md|registry|\.env|docker|服务器目录|/etc/|/root/|/data/|/opt/)",
        re.IGNORECASE | re.DOTALL,
    )
    if admin_action_pattern.search(text):
        return True
    if contains_destructive_action(value) or contains_protected_path_reference(value):
        return True
    return False


def is_user_upload_file_intent(text: str) -> bool:
    for pattern in USER_UPLOAD_CONTEXT_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return True
    return False


def safe_user_path(root: Path, user_id: str, *parts: str) -> Path:
    user_root = (root / user_id).resolve()
    target = user_root.joinpath(*parts).resolve()
    if target != user_root and not str(target).startswith(str(user_root) + "/"):
        raise HTTPException(status_code=400, detail="Invalid user path")
    return target


def _value_to_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value)


def _is_non_executable_instruction(text: str, pattern: str) -> bool:
    match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
    if not match:
        return False
    window = text[max(0, match.start() - 80) : min(len(text), match.end() + 80)].lower()
    instruction_markers = (
        "不允许",
        "禁止",
        "不要",
        "不能",
        "不得",
        "avoid",
        "forbid",
        "forbidden",
        "do not",
        "don't",
        "not allowed",
        "disallow",
    )
    return any(marker in window for marker in instruction_markers)
