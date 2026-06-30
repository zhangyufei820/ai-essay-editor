from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    service_name: str = "shenxiang-codex-workspace"
    version: str = "0.1.0"
    admin_api_key: str = ""
    redis_url: str = "redis://shenxiang-codex-workspace-redis:6379/0"
    runs_dir: Path = Path("/workspace/runs")
    user_skills_dir: Path = Path("/workspace/user-skills")
    skills_dir: Path = Path("/opt/codex-skills")
    registry_path: Path = Path("/app/skill_registry.json")
    codex_home: Path = Path("/codex-home")
    new_api_base_url: str = "https://api.aiphui.top/v1"
    public_base_url: str = "https://api.aiphui.top/codex"
    default_chat_model: str = "gpt-5.4-mini"
    default_small_fast_model: str = "gpt-5.4-mini"
    default_web_search_model: str = "gpt-5.4"
    default_image_model: str = "gpt-image-2-4K"
    default_video_model: str = "seedance-2.0"
    default_code_model: str = "gpt-5.4-mini"
    codex_chat_fallback_model: str = "gpt-5.4-mini"
    auto_token_name: str = "星人 Codex 文本令牌"
    claude_token_name: str = "星人 Claude 高阶令牌"
    image_token_name: str = "星人图像生成令牌"
    video_token_name: str = "星人视频生成令牌"
    auto_token_cache_seconds: int = 3600
    user_bootstrap_cache_seconds: int = 60
    models_cache_seconds: int = 300
    skill_cache_seconds: int = 300
    codex_allowed_models: tuple[str, ...] = (
        "gpt-5.4-mini",
        "gpt-5.4",
        "gpt-5.5",
    )
    claude_allowed_models: tuple[str, ...] = (
        "claude-fable-5",
        "claude-opus-4-6-full",
        "claude-opus-4-7-full",
        "claude-opus-4-8-full",
    )
    image_allowed_models: tuple[str, ...] = ("gpt-image-2-4K", "grok-imagine-image")
    video_allowed_models: tuple[str, ...] = (
        "seedance-2.0",
        "seedance-2.0-dj-fast",
        "seedance-2.0-ld-17",
        "grok-video-super-720p",
    )
    sync_wait_seconds: int = 180
    task_retention_seconds: int = 86400
    max_files_per_task: int = 20
    max_file_bytes: int = 120000
    max_image_bytes: int = 6_000_000
    max_user_skills: int = 30
    fast_path_first_delta_timeout_seconds: int = 6
    fast_path_chat_first_delta_timeout_seconds: int = 6
    fast_path_max_output_tokens: int = 1200
    codex_exec_sandbox: str = "danger-full-access"
    log_level: str = "INFO"


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def get_settings() -> Settings:
    return Settings(
        admin_api_key=os.getenv("ADMIN_API_KEY", ""),
        redis_url=os.getenv("REDIS_URL", "redis://shenxiang-codex-workspace-redis:6379/0"),
        runs_dir=Path(os.getenv("RUNS_DIR", "/workspace/runs")),
        user_skills_dir=Path(os.getenv("USER_SKILLS_DIR", "/workspace/user-skills")),
        skills_dir=Path(os.getenv("SKILLS_DIR", "/opt/codex-skills")),
        registry_path=Path(os.getenv("REGISTRY_PATH", "/app/skill_registry.json")),
        codex_home=Path(os.getenv("CODEX_HOME", "/codex-home")),
        new_api_base_url=os.getenv("NEW_API_BASE_URL", "https://api.aiphui.top/v1").rstrip("/"),
        public_base_url=os.getenv("PUBLIC_BASE_URL", "https://api.aiphui.top/codex").rstrip("/"),
        default_chat_model=os.getenv("DEFAULT_CHAT_MODEL", "gpt-5.4-mini"),
        default_small_fast_model=os.getenv("DEFAULT_SMALL_FAST_MODEL", "gpt-5.4-mini"),
        default_web_search_model=os.getenv("DEFAULT_WEB_SEARCH_MODEL", "gpt-5.4"),
        default_image_model=os.getenv("DEFAULT_IMAGE_MODEL", "gpt-image-2-4K"),
        default_video_model=os.getenv("DEFAULT_VIDEO_MODEL", "seedance-2.0"),
        default_code_model=os.getenv("DEFAULT_CODE_MODEL", "gpt-5.4-mini"),
        codex_chat_fallback_model=os.getenv("CODEX_CHAT_FALLBACK_MODEL", "gpt-5.4-mini"),
        auto_token_name=os.getenv("AUTO_TOKEN_NAME", "星人 Codex 文本令牌"),
        claude_token_name=os.getenv("CLAUDE_TOKEN_NAME", "星人 Claude 高阶令牌"),
        image_token_name=os.getenv("IMAGE_TOKEN_NAME", "星人图像生成令牌"),
        video_token_name=os.getenv("VIDEO_TOKEN_NAME", "星人视频生成令牌"),
        auto_token_cache_seconds=_env_int("AUTO_TOKEN_CACHE_SECONDS", 3600),
        user_bootstrap_cache_seconds=_env_int("USER_BOOTSTRAP_CACHE_SECONDS", 60),
        models_cache_seconds=_env_int("MODELS_CACHE_SECONDS", 300),
        skill_cache_seconds=_env_int("SKILL_CACHE_SECONDS", 300),
        codex_allowed_models=_env_list(
            "CODEX_ALLOWED_MODELS",
            "gpt-5.4-mini,gpt-5.4,gpt-5.5",
        ),
        claude_allowed_models=_env_list(
            "CLAUDE_ALLOWED_MODELS",
            "claude-fable-5,claude-opus-4-6-full,claude-opus-4-7-full,claude-opus-4-8-full",
        ),
        image_allowed_models=_env_list("IMAGE_ALLOWED_MODELS", "gpt-image-2-4K,grok-imagine-image"),
        video_allowed_models=_env_list(
            "VIDEO_ALLOWED_MODELS",
            "seedance-2.0,seedance-2.0-dj-fast,seedance-2.0-ld-17,grok-video-super-720p",
        ),
        sync_wait_seconds=_env_int("SYNC_WAIT_SECONDS", 180),
        task_retention_seconds=_env_int("TASK_RETENTION_SECONDS", 86400),
        max_files_per_task=_env_int("MAX_FILES_PER_TASK", 20),
        max_file_bytes=_env_int("MAX_FILE_BYTES", 120000),
        max_image_bytes=_env_int("MAX_IMAGE_BYTES", 6_000_000),
        max_user_skills=_env_int("MAX_USER_SKILLS", 30),
        fast_path_first_delta_timeout_seconds=_env_int("FAST_PATH_FIRST_DELTA_TIMEOUT_SECONDS", 6),
        fast_path_chat_first_delta_timeout_seconds=_env_int("FAST_PATH_CHAT_FIRST_DELTA_TIMEOUT_SECONDS", 6),
        fast_path_max_output_tokens=_env_int("FAST_PATH_MAX_OUTPUT_TOKENS", 1200),
        codex_exec_sandbox=os.getenv("CODEX_EXEC_SANDBOX", "danger-full-access"),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )


def _env_list(name: str, default: str) -> tuple[str, ...]:
    raw = os.getenv(name, default)
    values = tuple(dict.fromkeys(item.strip() for item in raw.split(",") if item.strip()))
    return values or tuple(item.strip() for item in default.split(",") if item.strip())


def ensure_directories(settings: Settings) -> None:
    settings.runs_dir.mkdir(parents=True, exist_ok=True)
    settings.user_skills_dir.mkdir(parents=True, exist_ok=True)
    settings.codex_home.mkdir(parents=True, exist_ok=True)


def ensure_codex_config(settings: Settings) -> None:
    write_codex_config(settings, settings.codex_home)


def write_codex_config(settings: Settings, codex_home: Path) -> None:
    codex_home.mkdir(parents=True, exist_ok=True)
    config_path = codex_home / "config.toml"
    content = (
        f'model = "{settings.default_chat_model}"\n'
        'model_provider = "newapi"\n\n'
        "[model_providers.newapi]\n"
        'name = "Shenxiang New API"\n'
        f'base_url = "{settings.new_api_base_url}"\n'
        'env_key = "OPENAI_API_KEY"\n'
        'wire_api = "responses"\n'
    )
    if config_path.exists() and config_path.read_text(encoding="utf-8") == content:
        return
    config_path.write_text(content, encoding="utf-8")


def build_codex_env(settings: Settings, user_api_key: str = "", extra_path: Path | None = None) -> dict[str, str]:
    path_parts = []
    if extra_path is not None:
        path_parts.append(str(extra_path))
    path_parts.append(os.getenv("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"))
    env = {
        "PATH": ":".join(path_parts),
        "HOME": str(settings.codex_home),
        "CODEX_HOME": str(settings.codex_home),
        "LANG": os.getenv("LANG", "C.UTF-8"),
        "LC_ALL": os.getenv("LC_ALL", "C.UTF-8"),
        "SSL_CERT_FILE": os.getenv("SSL_CERT_FILE", ""),
        "REQUESTS_CA_BUNDLE": os.getenv("REQUESTS_CA_BUNDLE", ""),
        "NODE_OPTIONS": os.getenv("NODE_OPTIONS", ""),
    }
    if user_api_key:
        env["OPENAI_API_KEY"] = user_api_key
        env["OPENAI_BASE_URL"] = settings.new_api_base_url
        env["ANTHROPIC_AUTH_TOKEN"] = user_api_key
        env["ANTHROPIC_BASE_URL"] = settings.public_base_url.removesuffix("/codex").rstrip("/") + "/claude"
    return {key: value for key, value in env.items() if value}


def has_codex_auth(_settings: Settings, user_api_key: str = "") -> bool:
    return bool(user_api_key)


def secret_values_for_redaction(settings: Settings, user_api_key: str = "") -> list[str]:
    values = [
        settings.admin_api_key,
        user_api_key,
        os.getenv("OPENAI_API_KEY", ""),
    ]
    return [value for value in values if value]
