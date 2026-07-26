#!/usr/bin/env python3
"""Configure the verified pdhlzy Claude channels in the production New API.

Credentials are accepted only through the production environment.  The script
never prints channel keys and keeps the old channels disabled rather than
deleting them so the change is reversible from the database backup.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path("/opt/shenxiang-new-api")
MYSQL_CONTAINER = os.environ.get("MYSQL_CONTAINER", "shenxiang-new-api-mysql")
OLD_CHANNEL_TAGS = (
    "xingren-claude-moonapix-fallback",
    "xingren-claude-geek2api-primary",
)

MODEL_PRICES_CNY = {
    "claude-fable-5": (Decimal("10"), Decimal("50"), Decimal("12.5"), Decimal("1")),
    "claude-haiku-4-5-20251001": (Decimal("1"), Decimal("5"), Decimal("1.25"), Decimal("0.1")),
    "claude-opus-4-5-20251101": (Decimal("5"), Decimal("25"), Decimal("6.25"), Decimal("0.5")),
    "claude-opus-4-6": (Decimal("5"), Decimal("25"), Decimal("6.25"), Decimal("0.5")),
    "claude-opus-4-7": (Decimal("5"), Decimal("25"), Decimal("6.25"), Decimal("0.5")),
    "claude-opus-4-8": (Decimal("5"), Decimal("25"), Decimal("6.25"), Decimal("0.5")),
    "claude-opus-5": (Decimal("5"), Decimal("25"), Decimal("6.25"), Decimal("0.5")),
    "claude-sonnet-4-5-20250929": (Decimal("3"), Decimal("15"), Decimal("3.75"), Decimal("0.3")),
    "claude-sonnet-4-6": (Decimal("3"), Decimal("15"), Decimal("3.75"), Decimal("0.3")),
    "claude-sonnet-5": (Decimal("2"), Decimal("10"), Decimal("2.5"), Decimal("0.2")),
}
ALL_MODELS = tuple(MODEL_PRICES_CNY)

CHANNELS = (
    {
        "env": "PDHLZY_KIRO_KEY",
        "tag": "xingren-claude-pdhlzy-kiro",
        "name": "Claude Kiro 渠道",
        "group_label": "Kiro",
        "type": 1,
        "group": "kiro",
        "ratio": Decimal("0.18"),
        "models": (
            "claude-fable-5",
            "claude-opus-4-6",
            "claude-opus-4-7",
            "claude-opus-4-8",
            "claude-sonnet-4-5-20250929",
            "claude-sonnet-4-6",
            "claude-sonnet-5",
        ),
        "priority": 10,
    },
    {
        "env": "PDHLZY_KIRO_STABLE_KEY",
        "tag": "xingren-claude-pdhlzy-kiro-stable",
        "name": "Claude Kiro 稳定版",
        "group_label": "Kiro 稳定版",
        "type": 1,
        "group": "kiro-stable",
        "ratio": Decimal("0.22"),
        "models": ALL_MODELS,
        "priority": 20,
    },
    {
        "env": "PDHLZY_CCMAX_KEY",
        "tag": "xingren-claude-pdhlzy-ccmax-terminal",
        "name": "Claude ccmax 终端专用",
        "group_label": "ccmax 终端专用",
        "type": 14,
        "group": "ccmax-terminal",
        "ratio": Decimal("0.75"),
        "models": (
            "claude-fable-5",
            "claude-haiku-4-5-20251001",
            "claude-opus-4-6",
            "claude-opus-4-7",
            "claude-opus-4-8",
            "claude-sonnet-4-6",
            "claude-sonnet-5",
        ),
        "priority": 30,
    },
    {
        "env": "PDHLZY_CLAUDE_KEY",
        "tag": "xingren-claude-pdhlzy-claude-external",
        "name": "Claude 外接渠道",
        "group_label": "Claude 外接",
        "type": 14,
        "group": "claude-external",
        "ratio": Decimal("0.9"),
        "models": (
            "claude-fable-5",
            "claude-haiku-4-5-20251001",
            "claude-opus-4-6",
            "claude-opus-4-7",
            "claude-opus-4-8",
            "claude-sonnet-4-6",
            "claude-sonnet-5",
        ),
        "priority": 40,
    },
)


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def mysql(env: dict[str, str], query: str) -> list[list[str]]:
    password = env.get("MYSQL_ROOT_PASSWORD", "")
    database = env.get("MYSQL_DATABASE", "")
    if not password or not database:
        raise RuntimeError("production MySQL environment is incomplete")
    command = [
        "docker",
        "exec",
        "-e",
        "MYSQL_PWD",
        MYSQL_CONTAINER,
        "mysql",
        "--default-character-set=utf8mb4",
        "--batch",
        "--raw",
        "--skip-column-names",
        "-uroot",
        database,
        "-e",
        query,
    ]
    process_env = os.environ.copy()
    process_env["MYSQL_PWD"] = password
    result = subprocess.run(command, env=process_env, check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return [line.split("\t") for line in result.stdout.decode("utf-8").splitlines()]


def mysql_exec(env: dict[str, str], sql: str) -> None:
    password = env.get("MYSQL_ROOT_PASSWORD", "")
    database = env.get("MYSQL_DATABASE", "")
    process_env = os.environ.copy()
    process_env["MYSQL_PWD"] = password
    command = [
        "docker",
        "exec",
        "-i",
        "-e",
        "MYSQL_PWD",
        MYSQL_CONTAINER,
        "mysql",
        "--default-character-set=utf8mb4",
        "--batch",
        "--raw",
        "--skip-column-names",
        "-uroot",
        database,
    ]
    subprocess.run(command, input=sql.encode("utf-8"), env=process_env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def json_option(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def parse_option(raw: str, key: str, expected: type) -> object:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{key} is not valid JSON") from exc
    if not isinstance(value, expected):
        raise RuntimeError(f"{key} has an unexpected JSON type")
    return value


def decimal_float(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP))


def load_options(env: dict[str, str]) -> tuple[dict[str, object], Decimal]:
    keys = ("USDExchangeRate", "GroupRatio", "UserUsableGroups", "AutoGroups", "GroupGroupRatio", "ModelRatio", "CompletionRatio", "CacheRatio", "CreateCacheRatio")
    rows = mysql(env, "SELECT `key`, COALESCE(`value`, '') FROM options WHERE `key` IN (" + ",".join(sql_quote(key) for key in keys) + ")")
    raw = {row[0]: row[1] for row in rows if len(row) == 2}
    missing = [key for key in keys if key not in raw]
    if missing:
        raise RuntimeError("required options missing: " + ",".join(missing))
    try:
        exchange_rate = Decimal(raw["USDExchangeRate"])
    except Exception as exc:
        raise RuntimeError("USDExchangeRate is invalid") from exc
    if exchange_rate <= 0:
        raise RuntimeError("USDExchangeRate must be positive")
    return {
        "GroupRatio": parse_option(raw["GroupRatio"], "GroupRatio", dict),
        "UserUsableGroups": parse_option(raw["UserUsableGroups"], "UserUsableGroups", dict),
        "AutoGroups": parse_option(raw["AutoGroups"], "AutoGroups", list),
        "GroupGroupRatio": parse_option(raw["GroupGroupRatio"], "GroupGroupRatio", dict),
        "ModelRatio": parse_option(raw["ModelRatio"], "ModelRatio", dict),
        "CompletionRatio": parse_option(raw["CompletionRatio"], "CompletionRatio", dict),
        "CacheRatio": parse_option(raw["CacheRatio"], "CacheRatio", dict),
        "CreateCacheRatio": parse_option(raw["CreateCacheRatio"], "CreateCacheRatio", dict),
    }, exchange_rate


def option_updates(options: dict[str, object], exchange_rate: Decimal) -> dict[str, str]:
    group_ratio = dict(options["GroupRatio"])
    user_groups = dict(options["UserUsableGroups"])
    auto_groups = [group for group in options["AutoGroups"] if group not in {item["group"] for item in CHANNELS}]
    group_group_ratio = dict(options["GroupGroupRatio"])
    model_ratio = dict(options["ModelRatio"])
    completion_ratio = dict(options["CompletionRatio"])
    cache_ratio = dict(options["CacheRatio"])
    create_cache_ratio = dict(options["CreateCacheRatio"])

    for channel in CHANNELS:
        group_ratio[channel["group"]] = decimal_float(channel["ratio"])
        user_groups[channel["group"]] = channel["group_label"]
    for model, (input_price, output_price, cache_write, cache_read) in MODEL_PRICES_CNY.items():
        model_ratio[model] = decimal_float(input_price / (Decimal("2") * exchange_rate))
        completion_ratio[model] = decimal_float(output_price / input_price)
        cache_ratio[model] = decimal_float(cache_read / input_price)
        create_cache_ratio[model] = decimal_float(cache_write / input_price)

    return {
        "GroupRatio": json_option(group_ratio),
        "UserUsableGroups": json_option(user_groups),
        "AutoGroups": json_option(auto_groups),
        "GroupGroupRatio": json_option(group_group_ratio),
        "ModelRatio": json_option(model_ratio),
        "CompletionRatio": json_option(completion_ratio),
        "CacheRatio": json_option(cache_ratio),
        "CreateCacheRatio": json_option(create_cache_ratio),
    }


def model_description(model: str) -> str:
    input_price, output_price, cache_write, cache_read = MODEL_PRICES_CNY[model]
    return (
        f"Claude {model}｜输入人民币 ¥{input_price:.4f}/M Tokens｜输出人民币 ¥{output_price:.4f}/M Tokens｜"
        f"缓存读取人民币 ¥{cache_read:.4f}/M Tokens｜缓存写入人民币 ¥{cache_write:.4f}/M Tokens"
    )


def require_keys() -> dict[str, str]:
    keys: dict[str, str] = {}
    for channel in CHANNELS:
        key = os.environ.get(channel["env"], "").strip()
        if len(key) < 16 or any(character.isspace() for character in key):
            raise RuntimeError(f"{channel['env']} is missing or invalid")
        keys[channel["tag"]] = key
    return keys


def build_sql(env: dict[str, str], keys: dict[str, str], updates: dict[str, str]) -> str:
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    for key, value in updates.items():
        quoted = sql_quote(value)
        statements.append(
            "INSERT INTO options (`key`, `value`) VALUES (" + sql_quote(key) + ", " + quoted + ") "
            "ON DUPLICATE KEY UPDATE `value` = " + quoted + ";"
        )

    for model in ALL_MODELS:
        description = sql_quote(model_description(model))
        statements.extend(
            [
                "SET @model_id := (SELECT MIN(id) FROM models WHERE model_name = " + sql_quote(model) + " AND deleted_at IS NULL);",
                "INSERT INTO models (model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
                "SELECT " + ", ".join([sql_quote(model), description, sql_quote("Claude.Color"), sql_quote("text,claude"), "2", sql_quote('{"chat-completion":"/v1/chat/completions"}'), "1", "0", "@now", "@now", "0"]) + " WHERE @model_id IS NULL;",
                "SET @model_id := IFNULL(@model_id, LAST_INSERT_ID());",
                "UPDATE models SET description = " + description + ", icon = " + sql_quote("Claude.Color") + ", tags = " + sql_quote("text,claude") + ", vendor_id = 2, endpoints = " + sql_quote('{"chat-completion":"/v1/chat/completions"}') + ", status = 1, sync_official = 0, deleted_at = NULL, updated_time = @now, name_rule = 0 WHERE id = @model_id;",
            ]
        )

    for channel in CHANNELS:
        tag = channel["tag"]
        models = ",".join(channel["models"])
        mapping = json_option({model: model for model in channel["models"]})
        key = sql_quote(keys[tag])
        statements.extend(
            [
                "SET @channel_id := (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(tag) + ");",
                "INSERT INTO channels (type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
                "SELECT " + ", ".join([str(channel["type"]), key, "1", sql_quote(channel["name"]), "100", "@now", "0", "0", sql_quote("https://pdhlzy.com"), sql_quote(models), sql_quote(channel["group"]), sql_quote(mapping), str(channel["priority"]), "1", sql_quote(tag), sql_quote(f"pdhlzy.com {channel['group']} {channel['ratio']}x")]) + " WHERE @channel_id IS NULL;",
                "SET @channel_id := IFNULL(@channel_id, LAST_INSERT_ID());",
                "UPDATE channels SET type = " + str(channel["type"]) + ", `key` = " + key + ", status = 1, name = " + sql_quote(channel["name"]) + ", weight = 100, base_url = " + sql_quote("https://pdhlzy.com") + ", models = " + sql_quote(models) + ", `group` = " + sql_quote(channel["group"]) + ", model_mapping = " + sql_quote(mapping) + ", priority = " + str(channel["priority"]) + ", auto_ban = 1, tag = " + sql_quote(tag) + ", remark = " + sql_quote(f"pdhlzy.com {channel['group']} {channel['ratio']}x") + " WHERE id = @channel_id;",
                "UPDATE abilities SET enabled = 0 WHERE channel_id = @channel_id;",
            ]
        )
        for model in channel["models"]:
            statements.append(
                "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
                + ", ".join([sql_quote(channel["group"]), sql_quote(model), "@channel_id", "1", str(channel["priority"]), "100", sql_quote(tag)])
                + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = 100, tag = VALUES(tag);"
            )

    old_tags = ",".join(sql_quote(tag) for tag in OLD_CHANNEL_TAGS)
    statements.extend(
        [
            "UPDATE channels SET status = 0, weight = 0, priority = 99, remark = CONCAT(COALESCE(remark, ''), ' | disabled by pdhlzy Claude replacement ', FROM_UNIXTIME(@now)) WHERE tag IN (" + old_tags + ");",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN (SELECT id FROM channels WHERE tag IN (" + old_tags + "));",
            "UPDATE tokens SET `group` = " + sql_quote("kiro-stable") + ", model_limits_enabled = 1, model_limits = " + sql_quote(",".join(CHANNELS[1]["models"])) + ", cross_group_retry = 0 WHERE deleted_at IS NULL AND name = " + sql_quote("星人 Claude 高阶令牌") + ";",
            "UPDATE tokens SET `group` = " + sql_quote("kiro-stable") + ", model_limits_enabled = 1, model_limits = " + sql_quote(",".join(CHANNELS[1]["models"])) + ", cross_group_retry = 0 WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = 'claude';",
            "COMMIT;",
        ]
    )
    return "\n".join(statements) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the verified configuration")
    args = parser.parse_args()
    if not args.apply:
        parser.error("--apply is required")

    env = load_dotenv(ROOT / ".env")
    keys = require_keys()
    options, exchange_rate = load_options(env)
    updates = option_updates(options, exchange_rate)
    duplicate_tags = mysql(env, "SELECT tag, COUNT(*) FROM channels WHERE tag IN (" + ",".join(sql_quote(channel["tag"]) for channel in CHANNELS) + ") GROUP BY tag HAVING COUNT(*) > 1")
    if duplicate_tags:
        raise RuntimeError("managed channel tags are duplicated")
    mysql_exec(env, build_sql(env, keys, updates))
    result = {
        "ok": True,
        "exchange_rate": str(exchange_rate),
        "models": len(ALL_MODELS),
        "channels": [{"tag": channel["tag"], "group": channel["group"], "models": len(channel["models"])} for channel in CHANNELS],
        "old_channels_disabled": list(OLD_CHANNEL_TAGS),
    }
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
