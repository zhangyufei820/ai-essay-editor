#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path("/opt/shenxiang-new-api")
CODEX_ROOT = Path("/opt/shenxiang-codex-workspace")
ADMIN_SYSTEM_TOKEN_USER_ID = 1

TOKEN_PROFILES = {
    "codex": ("星人 Codex 文本令牌", "星人 Codex 自动令牌"),
    "claude": ("星人 Claude 高阶令牌",),
    "image": ("星人图像生成令牌",),
    "video": ("星人视频生成令牌",),
}

RAW_GPT_IMAGE2_MODEL = "gpt-image-2"
GPT_IMAGE2_PRODUCT_MODEL = "gpt-image-2-4K"
DISABLED_ABILITY_PAIRS = {
    ("12", GPT_IMAGE2_PRODUCT_MODEL),
    ("21", RAW_GPT_IMAGE2_MODEL),
}
TOKEN_MODEL_REPLACEMENTS = {
    RAW_GPT_IMAGE2_MODEL: GPT_IMAGE2_PRODUCT_MODEL,
}

CODEX_ALLOWED_MODELS = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"]
CODEX_DEFAULT_MODEL = "gpt-5.5"
CODEX_CHAT_FALLBACK_MODEL = "gpt-5.4-mini"
PUBLIC_SEEDANCE_VIDEO_MODELS = [
    "seedance-2.0-cl-mini",
]
DEPRECATED_PUBLIC_SEEDANCE_MODELS = [
    "seedance-2.0",
    "seedance-2.0-kz-fast",
    "seedance-2.0-cl-fast",
    "seedance-2.0-cl",
]
PUBLIC_SEEDANCE_MODEL_DESCRIPTIONS = {
    "seedance-2.0-cl-mini": "星人 Seedance 2.0 CL Mini 视频生成｜支持 4-15 秒｜支持图片参考，也可传 1 个视频参考，生成后请及时下载",
}
PUBLIC_SEEDANCE_CHANNEL_ID = "5"
PUBLIC_SEEDANCE_CHANNEL_MODELS = [
    *PUBLIC_SEEDANCE_VIDEO_MODELS,
]
PUBLIC_SEEDANCE_MODEL_MAPPING = '{"seedance-2.0-cl-mini":"seedance-2.0-cl-mini"}'
PUBLIC_SEEDANCE_TOKEN_PRICES_CNY_PER_1M = {
    # Customer price = official RMB token price * 1.08.
    # New API ratio formula: input CNY per 1M = model_ratio * 2 * USDExchangeRate.
    "seedance-2.0-cl-mini": {
        "input_with_video": Decimal("11.90") * Decimal("1.08"),
        "output": Decimal("19.55") * Decimal("1.08"),
    }
}


def mysql(query: str) -> list[list[str]]:
    password = os.environ["MYSQL_ROOT_PASSWORD"]
    database = os.environ["MYSQL_DATABASE"]
    env = os.environ.copy()
    env["MYSQL_PWD"] = password
    cmd = [
        "docker",
        "exec",
        "-e",
        "MYSQL_PWD",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        "-N",
        "-B",
        database,
        "-e",
        query,
    ]
    output = subprocess.check_output(cmd, env=env, stderr=subprocess.DEVNULL).decode("utf-8", errors="replace")
    rows: list[list[str]] = []
    for line in output.splitlines():
        rows.append(line.split("\t"))
    return rows


def mysql_exec(query: str) -> None:
    password = os.environ["MYSQL_ROOT_PASSWORD"]
    database = os.environ["MYSQL_DATABASE"]
    env = os.environ.copy()
    env["MYSQL_PWD"] = password
    cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        "MYSQL_PWD",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        database,
    ]
    subprocess.run(cmd, input=query.encode("utf-8"), env=env, check=True, stderr=subprocess.DEVNULL)


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def sanitize_token_models(models: list[str]) -> list[str]:
    sanitized: list[str] = []
    seen: set[str] = set()
    for model in models:
        model = model.strip()
        if not model:
            continue
        model = TOKEN_MODEL_REPLACEMENTS.get(model, model)
        if model in seen:
            continue
        seen.add(model)
        sanitized.append(model)
    return sanitized


def sanitize_model_limits(raw: str) -> str:
    return ",".join(sanitize_token_models(raw.split(",")))


def is_disabled_ability_pair(channel_id: str, model: str) -> bool:
    return (str(channel_id).strip(), model.strip()) in DISABLED_ABILITY_PAIRS


def option_value(key: str) -> str | None:
    rows = mysql(f"SELECT `value` FROM options WHERE `key` = {sql_quote(key)} LIMIT 1")
    if not rows:
        return None
    return rows[0][0]


def parse_json_option(key: str) -> dict[str, float]:
    raw = option_value(key)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in option {key}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"option {key} must be a JSON object")
    result: dict[str, float] = {}
    for name, value in parsed.items():
        if isinstance(name, str) and isinstance(value, (int, float)):
            result[name] = float(value)
    return result


def upsert_json_option(key: str, values: dict[str, float]) -> None:
    payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    mysql_exec(
        "INSERT INTO options (`key`, `value`) VALUES ("
        + sql_quote(key)
        + ", "
        + sql_quote(payload)
        + ") ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);"
    )


def decimal_to_float(value: Decimal, places: str = "0.000000000001") -> float:
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def usd_exchange_rate() -> Decimal:
    raw = option_value("USDExchangeRate") or "7.3"
    try:
        rate = Decimal(raw)
    except Exception as exc:
        raise ValueError("USDExchangeRate must be a decimal number") from exc
    if rate <= 0:
        raise ValueError("USDExchangeRate must be greater than 0")
    return rate


def sync_public_seedance_pricing() -> None:
    model_ratios = parse_json_option("ModelRatio")
    completion_ratios = parse_json_option("CompletionRatio")
    model_prices = parse_json_option("ModelPrice")
    exchange_rate = usd_exchange_rate()

    for model, prices in PUBLIC_SEEDANCE_TOKEN_PRICES_CNY_PER_1M.items():
        input_cny = prices["input_with_video"]
        output_cny = prices["output"]
        model_ratio = input_cny / (Decimal("2") * exchange_rate)
        completion_ratio = output_cny / input_cny
        model_ratios[model] = decimal_to_float(model_ratio)
        completion_ratios[model] = decimal_to_float(completion_ratio)
        model_prices.pop(model, None)

    upsert_json_option("ModelRatio", model_ratios)
    upsert_json_option("CompletionRatio", completion_ratios)
    upsert_json_option("ModelPrice", model_prices)


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

    def append_model(profile: str, model: str) -> None:
        if model in TOKEN_MODEL_REPLACEMENTS:
            return
        if model not in profiles[profile]:
            profiles[profile].append(model)

    for _id, model, raw_tags in rows:
        tags = {item.strip().lower() for item in raw_tags.split(",") if item.strip()}
        if "internal-hidden" in tags:
            continue
        if "video" in tags:
            append_model("video", model)
            continue
        if "image" in tags:
            append_model("image", model)
            continue
        if "claude" in tags or model.startswith("claude-"):
            append_model("claude", model)
            continue
        if "text" in tags and ("openai" in tags or "codex" in tags or model.startswith("gpt-") or model == "codex-auto-review"):
            append_model("codex", model)
    available_codex_models = set(profiles["codex"])
    profiles["codex"] = [model for model in CODEX_ALLOWED_MODELS if model in available_codex_models]
    for model in PUBLIC_SEEDANCE_VIDEO_MODELS:
        if model not in profiles["video"]:
            profiles["video"].append(model)
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


def ensure_public_seedance_models() -> None:
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    if DEPRECATED_PUBLIC_SEEDANCE_MODELS:
        deprecated_models = ", ".join(sql_quote(model) for model in DEPRECATED_PUBLIC_SEEDANCE_MODELS)
        statements.append(
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            f"WHERE model_name IN ({deprecated_models});"
        )
        statements.append(
            "UPDATE abilities SET enabled = 0 WHERE channel_id = "
            + PUBLIC_SEEDANCE_CHANNEL_ID
            + f" AND model IN ({deprecated_models});"
        )
    for model in PUBLIC_SEEDANCE_VIDEO_MODELS:
        description = PUBLIC_SEEDANCE_MODEL_DESCRIPTIONS[model]
        statements.append(
            "SET @seedance_model := "
            + sql_quote(model)
            + " COLLATE utf8mb4_unicode_ci;"
            "SET @keep_model_id := ("
            "SELECT MIN(id) FROM models WHERE model_name = @seedance_model AND deleted_at IS NULL"
            ");"
            "SET @keep_model_id := IFNULL(@keep_model_id, ("
            "SELECT MIN(id) FROM models WHERE model_name = @seedance_model"
            "));"
            "INSERT INTO models "
            "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
            "SELECT "
            + ", ".join(
                [
                    "@seedance_model",
                    sql_quote(description),
                    sql_quote("Doubao.Color"),
                    sql_quote("video,seedance"),
                    "4",
                    sql_quote('{"openai-video":"/v1/videos"}'),
                    "1",
                    "0",
                    "@now",
                    "@now",
                    "0",
                ]
            )
            + " WHERE @keep_model_id IS NULL;"
            "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());"
            "UPDATE models SET "
            "description = "
            + sql_quote(description)
            + ", icon = "
            + sql_quote("Doubao.Color")
            + ", tags = "
            + sql_quote("video,seedance")
            + ", vendor_id = 4, endpoints = "
            + sql_quote('{"openai-video":"/v1/videos"}')
            + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
            "WHERE id = @keep_model_id;"
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            "WHERE model_name = @seedance_model AND id <> @keep_model_id;"
        )
    statements.append(
        "UPDATE channels SET models = "
        + sql_quote(",".join(PUBLIC_SEEDANCE_CHANNEL_MODELS))
        + ", model_mapping = "
        + sql_quote(PUBLIC_SEEDANCE_MODEL_MAPPING)
        + " WHERE id = "
        + PUBLIC_SEEDANCE_CHANNEL_ID
        + ";"
    )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def sync_tokens(profiles: dict[str, list[str]]) -> None:
    statements = ["START TRANSACTION;"]
    for profile, names in TOKEN_PROFILES.items():
        models = ",".join(sanitize_token_models(profiles[profile]))
        for name in names:
            statements.append(
                "UPDATE tokens "
                "SET model_limits_enabled = 1, model_limits = "
                + sql_quote(models)
                + " WHERE deleted_at IS NULL AND name = "
                + sql_quote(name)
                + " AND user_id = "
                + str(ADMIN_SYSTEM_TOKEN_USER_ID)
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
            if is_disabled_ability_pair(channel_id, model):
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


def enforce_gpt_image2_db_guard() -> dict[str, int]:
    disabled_ability_counts: dict[str, int] = {}
    for channel_id, model in DISABLED_ABILITY_PAIRS:
        rows = mysql(
            "SELECT COUNT(*) FROM abilities WHERE enabled = 1 AND channel_id = "
            + sql_quote(channel_id)
            + " AND model = "
            + sql_quote(model)
            + ";"
        )
        disabled_ability_counts[f"channel_{channel_id}_{model}"] = int(rows[0][0]) if rows else 0
    token_rows = mysql(
        "SELECT id, COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND model_limits_enabled = 1 "
        "AND COALESCE(model_limits, '') LIKE "
        + sql_quote(f"%{RAW_GPT_IMAGE2_MODEL}%")
        + ";"
    )
    token_updates: list[tuple[str, str]] = []
    for token_id, raw_limits in token_rows:
        next_limits = sanitize_model_limits(raw_limits)
        if next_limits != raw_limits:
            token_updates.append((token_id, next_limits))

    statements = ["START TRANSACTION;"]
    for channel_id, model in DISABLED_ABILITY_PAIRS:
        statements.append(
            "UPDATE abilities SET enabled = 0 WHERE channel_id = "
            + sql_quote(channel_id)
            + " AND model = "
            + sql_quote(model)
            + ";"
        )
    for token_id, next_limits in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits = "
            + sql_quote(next_limits)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    disabled_ability_counts["tokens_rewritten"] = len(token_updates)
    return disabled_ability_counts


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
    ensure_public_seedance_models()
    sync_public_seedance_pricing()
    profiles = model_lists()
    missing = [name for name, values in profiles.items() if not values]
    if missing:
        print(f"refuse to sync empty model profiles: {', '.join(missing)}", file=sys.stderr)
        return 2
    sync_abilities()
    sync_tokens(profiles)
    guard_result = enforce_gpt_image2_db_guard()
    env_changed = sync_codex_env(profiles)
    if env_changed or os.environ.get("SYNC_FORCE_CODEX_REFRESH") == "1":
        refresh_codex()
    print(
        "synced model permissions: "
        + ", ".join(f"{name}={len(values)}" for name, values in profiles.items())
        + f", codex_env_changed={env_changed}, gpt_image2_guard={guard_result}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
