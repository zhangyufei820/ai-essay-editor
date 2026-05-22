from __future__ import annotations

import hmac
import json
import re
from pathlib import Path
from typing import Any, Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings


bearer_scheme = HTTPBearer(auto_error=False)

ADMIN_INTENT_KEYWORDS = (
    "安装skill",
    "安装 skill",
    "删除skill",
    "删除 skill",
    "修改skill",
    "修改 skill",
    "创建skill",
    "创建 skill",
    "查看skill.md",
    "查看 skill.md",
    "修改skill.md",
    "修改 skill.md",
    "skill_registry",
    "查看.env",
    "读取.env",
    "环境变量",
    "api key",
    "bearer token",
    "docker",
    "docker compose",
    "rm -rf",
    "重启服务",
    "执行命令",
    "读取服务器目录",
    "cat /",
    "/etc/",
    "/root/",
    "/data/",
)


def require_bearer(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> None:
    settings = get_settings()
    expected = settings.gateway_api_key
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gateway API key is not configured.",
        )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    if not hmac.compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


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
            safe = safe.replace(value, "[REDACTED]")
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
    return safe


def safe_error(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def normalize_sandbox(sandbox: str, settings: Settings) -> str:
    allowed = {"read-only", "workspace-write"}
    normalized = sandbox if sandbox in allowed else "read-only"
    return normalized


FORBIDDEN_COMMAND_PATTERNS = (
    r"\brm\s+-",
    r"\brmdir\b",
    r"\bfind\b.{0,80}\b-delete\b",
    r"\bgit\s+(clean|reset|checkout|push)\b",
    r"\bdocker\b",
    r"\bssh\b",
    r"\bscp\b",
    r"\brsync\b",
    r"\bsudo\b",
    r"\bchmod\b",
    r"\bchown\b",
    r"\bkubectl\b",
    r"\bhelm\b",
)

FORBIDDEN_PATH_PATTERNS = (
    r"(^|/)\.env($|[.\s/])",
    r"(^|/)\.ssh($|/)",
    r"docker-compose[^/\s]*\.ya?ml",
    r"(^|/)Dockerfile($|[\s\"'}\]])",
    r"(^|/)nginx($|/)",
    r"(^|/)openresty($|/)",
    r"(^|/)1panel($|/)",
    r"/opt/1panel($|/)",
    r"/etc($|/)",
    r"/root($|/)",
    r"/data/ai-essay-editor($|/)",
    r"/var/lib/docker($|/)",
)


def contains_forbidden_runtime_action(value: Any) -> bool:
    text = _value_to_text(value)
    for pattern in FORBIDDEN_COMMAND_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return True
    for pattern in FORBIDDEN_PATH_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return True
    return False


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


def contains_admin_intent(value: Any) -> bool:
    text = _value_to_text(value).lower()
    compact = re.sub(r"\s+", "", text)
    for keyword in ADMIN_INTENT_KEYWORDS:
        needle = keyword.lower()
        if needle in text or re.sub(r"\s+", "", needle) in compact:
            return True
    admin_action_pattern = re.compile(
        r"(安装|删除|修改|创建|查看|读取|启用|下线|卸载|install|delete|remove|modify|create|read|enable|disable)"
        r".{0,30}"
        r"(skill|skill\.md|skill_registry|registry|\.env|环境变量|api\s*key|bearer\s*token|docker|服务器目录|/etc/|/root/|/data/)",
        re.IGNORECASE | re.DOTALL,
    )
    if admin_action_pattern.search(text):
        return True
    return False


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
