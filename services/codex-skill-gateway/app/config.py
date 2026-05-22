from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    service_name: str = "codex-skill-gateway"
    version: str = "0.1.0"
    gateway_api_key: str = ""
    admin_api_key: str = ""
    redis_url: str = "redis://codex-redis:6379/0"
    runs_dir: Path = Path("/workspace/runs")
    user_skills_dir: Path = Path("/workspace/user-skills")
    skills_dir: Path = Path("/opt/codex-skills")
    registry_path: Path = Path("/app/skill_registry.json")
    codex_home: Path = Path("/codex-home")
    codex_api_key: str = ""
    codex_model_provider: str = "openai"
    codex_model: str = ""
    codex_proxy_base_url: str = ""
    codex_proxy_env_key: str = "PROXY_API_KEY"
    image_api_base_url: str = ""
    image_api_env_key: str = "IMAGE_API_KEY"
    image_model: str = "gpt-image-1.5"
    sync_wait_seconds: int = 180
    task_retention_seconds: int = 604800
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
        gateway_api_key=os.getenv("GATEWAY_API_KEY", ""),
        admin_api_key=os.getenv("ADMIN_API_KEY", ""),
        redis_url=os.getenv("REDIS_URL", "redis://codex-redis:6379/0"),
        runs_dir=Path(os.getenv("RUNS_DIR", "/workspace/runs")),
        user_skills_dir=Path(os.getenv("USER_SKILLS_DIR", "/workspace/user-skills")),
        skills_dir=Path(os.getenv("SKILLS_DIR", "/opt/codex-skills")),
        registry_path=Path(os.getenv("REGISTRY_PATH", "/app/skill_registry.json")),
        codex_home=Path(os.getenv("CODEX_HOME", "/codex-home")),
        codex_api_key=os.getenv("CODEX_API_KEY", ""),
        codex_model_provider=os.getenv("CODEX_MODEL_PROVIDER", "openai").lower(),
        codex_model=os.getenv("CODEX_MODEL", ""),
        codex_proxy_base_url=os.getenv("CODEX_PROXY_BASE_URL", ""),
        codex_proxy_env_key=os.getenv("CODEX_PROXY_ENV_KEY", "PROXY_API_KEY"),
        image_api_base_url=os.getenv("IMAGE_API_BASE_URL", ""),
        image_api_env_key=os.getenv("IMAGE_API_ENV_KEY", "IMAGE_API_KEY"),
        image_model=os.getenv("IMAGE_MODEL", "gpt-image-1.5"),
        sync_wait_seconds=_env_int("SYNC_WAIT_SECONDS", 180),
        task_retention_seconds=_env_int("TASK_RETENTION_SECONDS", 604800),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )


def ensure_directories(settings: Settings) -> None:
    settings.runs_dir.mkdir(parents=True, exist_ok=True)
    settings.user_skills_dir.mkdir(parents=True, exist_ok=True)
    settings.codex_home.mkdir(parents=True, exist_ok=True)


def ensure_codex_config(settings: Settings) -> None:
    write_codex_config(settings, settings.codex_home)


def write_codex_config(settings: Settings, codex_home: Path) -> None:
    if settings.codex_model_provider != "proxy":
        return
    if not settings.codex_model or not settings.codex_proxy_base_url:
        return

    codex_home.mkdir(parents=True, exist_ok=True)
    config_path = codex_home / "config.toml"
    content = (
        f'model = "{settings.codex_model}"\n'
        'model_provider = "proxy"\n\n'
        "[model_providers.proxy]\n"
        'name = "Custom Proxy Provider"\n'
        f'base_url = "{settings.codex_proxy_base_url}"\n'
        f'env_key = "{settings.codex_proxy_env_key}"\n'
        'wire_api = "responses"\n'
    )
    if config_path.exists() and config_path.read_text(encoding="utf-8") == content:
        return
    config_path.write_text(content, encoding="utf-8")


def build_codex_env(settings: Settings) -> dict[str, str]:
    env = os.environ.copy()
    env["CODEX_HOME"] = str(settings.codex_home)
    if settings.codex_api_key and not env.get("OPENAI_API_KEY"):
        env["OPENAI_API_KEY"] = settings.codex_api_key
    return env


def has_codex_auth(settings: Settings) -> bool:
    if settings.codex_api_key or os.getenv("OPENAI_API_KEY"):
        return True
    if settings.codex_model_provider == "proxy":
        proxy_key_name = settings.codex_proxy_env_key
        if proxy_key_name and os.getenv(proxy_key_name):
            return True
    return any(
        (settings.codex_home / filename).exists()
        for filename in ("auth.json", "credentials.json", "config.toml")
    )


def secret_values_for_redaction(settings: Settings) -> list[str]:
    values = [
        settings.gateway_api_key,
        settings.admin_api_key,
        settings.codex_api_key,
        os.getenv("OPENAI_API_KEY", ""),
    ]
    proxy_key_name = settings.codex_proxy_env_key
    if proxy_key_name:
        values.append(os.getenv(proxy_key_name, ""))
    image_key_name = settings.image_api_env_key
    if image_key_name:
        values.append(os.getenv(image_key_name, ""))
    return [value for value in values if value]
