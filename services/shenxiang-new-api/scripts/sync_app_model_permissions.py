#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path("/opt/shenxiang-new-api")
CODEX_ROOT = Path("/opt/shenxiang-codex-workspace")

TOKEN_PROFILES = {
    "codex": ("星人 Codex 文本令牌", "星人 Codex 自动令牌"),
    "claude": ("星人 Claude 高阶令牌",),
    "image": ("星人图像生成令牌",),
    "video": ("星人视频生成令牌",),
}

CODEX_ALLOWED_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"]
CODEX_DEFAULT_MODEL = "gpt-5.5"
CODEX_CHAT_FALLBACK_MODEL = "gpt-5.4-mini"


def mysql(query: str) -> list[list[str]]:
    password = os.environ["MYSQL_ROOT_PASSWORD"]
    database = os.environ["MYSQL_DATABASE"]
    cmd = [
        "docker",
        "exec",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        f"-p{password}",
        "-N",
        "-B",
        database,
        "-e",
        query,
    ]
    output = subprocess.check_output(cmd, stderr=subprocess.DEVNULL).decode("utf-8", errors="replace")
    rows: list[list[str]] = []
    for line in output.splitlines():
        rows.append(line.split("\t"))
    return rows


def mysql_exec(query: str) -> None:
    password = os.environ["MYSQL_ROOT_PASSWORD"]
    database = os.environ["MYSQL_DATABASE"]
    cmd = [
        "docker",
        "exec",
        "-i",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        f"-p{password}",
        database,
    ]
    subprocess.run(cmd, input=query.encode("utf-8"), check=True, stderr=subprocess.DEVNULL)


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def model_lists() -> dict[str, list[str]]:
    rows = mysql(
        """
        SELECT id, model_name, COALESCE(tags, '')
        FROM models
        WHERE deleted_at IS NULL AND status = 1
        ORDER BY id
        """
    )
    profiles = {"codex": [], "claude": [], "image": [], "video": []}
    for _id, model, raw_tags in rows:
        tags = {item.strip().lower() for item in raw_tags.split(",") if item.strip()}
        if "internal-hidden" in tags:
            continue
        if "video" in tags:
            profiles["video"].append(model)
            continue
        if "image" in tags:
            profiles["image"].append(model)
            continue
        if "claude" in tags or model.startswith("claude-"):
            profiles["claude"].append(model)
            continue
        if "text" in tags and ("openai" in tags or "codex" in tags or model.startswith("gpt-") or model == "codex-auto-review"):
            profiles["codex"].append(model)
    available_codex_models = set(profiles["codex"])
    profiles["codex"] = [model for model in CODEX_ALLOWED_MODELS if model in available_codex_models]
    return profiles


def active_groups() -> list[str]:
    groups = {"default", "standard", "pro", "code", "internal"}
    for row in mysql("SELECT DISTINCT `group` FROM users WHERE status = 1 AND `group` <> ''"):
        if row and row[0]:
            groups.add(row[0])
    for row in mysql("SELECT DISTINCT `group` FROM abilities WHERE `group` <> ''"):
        if row and row[0]:
            groups.add(row[0])
    return sorted(groups)


def sync_tokens(profiles: dict[str, list[str]]) -> None:
    statements = ["START TRANSACTION;"]
    for profile, names in TOKEN_PROFILES.items():
        models = ",".join(profiles[profile])
        for name in names:
            statements.append(
                "UPDATE tokens "
                "SET model_limits_enabled = 1, model_limits = "
                + sql_quote(models)
                + " WHERE deleted_at IS NULL AND name = "
                + sql_quote(name)
                + ";"
            )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def sync_abilities() -> None:
    groups = active_groups()
    channel_rows = mysql(
        """
        SELECT id, COALESCE(models, ''), COALESCE(priority, 0), COALESCE(weight, 0), COALESCE(tag, '')
        FROM channels
        WHERE status = 1 AND COALESCE(models, '') <> ''
        ORDER BY id
        """
    )
    existing_models = {row[0] for row in mysql("SELECT model_name FROM models WHERE deleted_at IS NULL AND status = 1")}
    statements = ["START TRANSACTION;"]
    for channel_id, raw_models, priority, weight, tag in channel_rows:
        for model in [item.strip() for item in raw_models.split(",") if item.strip()]:
            if model not in existing_models:
                continue
            for group in groups:
                statements.append(
                    "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
                    + ", ".join(
                        [
                            sql_quote(group),
                            sql_quote(model),
                            channel_id,
                            "1",
                            priority or "0",
                            weight or "100",
                            sql_quote(tag or "xingren-auto"),
                        ]
                    )
                    + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = VALUES(weight), tag = VALUES(tag);"
                )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def update_env_line(lines: list[str], key: str, value: str) -> tuple[list[str], bool]:
    changed = False
    seen = False
    output: list[str] = []
    needle = f"{key}="
    for line in lines:
        if line.startswith(needle):
            seen = True
            next_line = f"{key}={value}"
            output.append(next_line)
            changed = changed or line != next_line
        else:
            output.append(line)
    if not seen:
        output.append(f"{key}={value}")
        changed = True
    return output, changed


def sync_codex_env(profiles: dict[str, list[str]]) -> bool:
    env_path = CODEX_ROOT / ".env"
    if not env_path.exists():
        return False
    lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines()
    changed_any = False
    updates = {
        "DEFAULT_CHAT_MODEL": CODEX_DEFAULT_MODEL,
        "DEFAULT_CODE_MODEL": CODEX_DEFAULT_MODEL,
        "CODEX_CHAT_FALLBACK_MODEL": CODEX_CHAT_FALLBACK_MODEL,
        "CODEX_ALLOWED_MODELS": ",".join(profiles["codex"]),
        "CLAUDE_ALLOWED_MODELS": ",".join(profiles["claude"]),
        "IMAGE_ALLOWED_MODELS": ",".join(profiles["image"]),
        "VIDEO_ALLOWED_MODELS": ",".join(profiles["video"]),
    }
    for key, value in updates.items():
        lines, changed = update_env_line(lines, key, value)
        changed_any = changed_any or changed
    if changed_any:
        backup = env_path.with_name(f".env.backup.model-sync.{os.environ.get('SYNC_TIMESTAMP', '')}".rstrip("."))
        if not backup.exists():
            backup.write_text(env_path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return changed_any


def refresh_codex() -> None:
    if not (CODEX_ROOT / "docker-compose.yml").exists():
        return
    env = os.environ.copy()
    env.pop("HOST_BIND_IP", None)
    env.pop("HOST_BIND_PORT", None)
    env.pop("NEW_API_CONTAINER_PORT", None)
    subprocess.run(
        ["docker", "compose", "up", "-d", "shenxiang-codex-workspace", "shenxiang-codex-worker-fast", "shenxiang-codex-worker-heavy"],
        cwd=CODEX_ROOT,
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
    )


def main() -> int:
    profiles = model_lists()
    missing = [name for name, values in profiles.items() if not values]
    if missing:
        print(f"refuse to sync empty model profiles: {', '.join(missing)}", file=sys.stderr)
        return 2
    sync_abilities()
    sync_tokens(profiles)
    env_changed = sync_codex_env(profiles)
    if env_changed or os.environ.get("SYNC_FORCE_CODEX_REFRESH") == "1":
        refresh_codex()
    print(
        "synced model permissions: "
        + ", ".join(f"{name}={len(values)}" for name, values in profiles.items())
        + f", codex_env_changed={env_changed}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
