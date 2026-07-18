#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import getpass
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_HALF_UP

import sync_app_model_permissions as permissions


PUBLIC_MODEL = permissions.PUBLIC_GROK15_1080_VIDEO_MODEL
UPSTREAM_MODEL = permissions.UPSTREAM_GROK15_1080_VIDEO_MODEL
CHANNEL_TAG = permissions.PUBLIC_GROK15_1080_VIDEO_CHANNEL_TAG
CHANNEL_NAME = "星人 Grok Video 1.5 1080P"
CHANNEL_GROUPS = permissions.PUBLIC_GROK15_1080_VIDEO_CHANNEL_GROUPS
STAGING_GROUP = "internal"
RETAIL_PRICE_CNY = Decimal("0.40")
UPSTREAM_COST_CNY = Decimal("0.35")
MODEL_DESCRIPTION = permissions.PUBLIC_VIDEO_MODEL_CONFIGS[PUBLIC_MODEL]["description"]
CHANNEL_REMARK = (
    f"上游成本 CNY ¥{UPSTREAM_COST_CNY:.2f}/次；零售价 CNY ¥{RETAIL_PRICE_CNY:.2f}/次；"
    "仅图生视频；固定 1080P；duration 1-15 秒整数"
)
MAX_MODELS_RESPONSE_BYTES = 2 * 1024 * 1024
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"


class ConfigurationError(RuntimeError):
    pass


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def normalize_base_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ConfigurationError("upstream base URL must be an HTTPS origin without credentials or a path")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def validate_api_key(value: str) -> str:
    key = value.strip()
    if len(key) < 20 or any(character.isspace() for character in key):
        raise ConfigurationError("upstream API key format is invalid")
    return key


def fetch_upstream_models(base_url: str, api_key: str) -> set[str]:
    request = urllib.request.Request(
        normalize_base_url(base_url) + "/v1/models",
        headers={"Authorization": "Bearer " + validate_api_key(api_key), "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read(MAX_MODELS_RESPONSE_BYTES + 1)
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("upstream model probe failed or timed out") from None
    if len(body) > MAX_MODELS_RESPONSE_BYTES:
        raise ConfigurationError("upstream model response exceeded the size limit")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("upstream model response was not valid JSON") from None
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise ConfigurationError("upstream model response did not use the OpenAI models schema")
    return {
        str(row.get("id") or "").strip()
        for row in rows
        if isinstance(row, dict) and str(row.get("id") or "").strip()
    }


def option_map(key: str) -> dict[str, float]:
    return permissions.parse_json_option(key)


def option_sql(key: str, values: dict[str, float]) -> str:
    payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return (
        "INSERT INTO options (`key`, `value`) VALUES ("
        + sql_quote(key)
        + ", "
        + sql_quote(payload)
        + ") ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);"
    )


def staging_price_options() -> dict[str, dict[str, float]]:
    exchange_rate = permissions.usd_exchange_rate()
    model_prices = option_map("ModelPrice")
    model_ratios = option_map("ModelRatio")
    completion_ratios = option_map("CompletionRatio")
    model_prices[PUBLIC_MODEL] = float(
        (RETAIL_PRICE_CNY / exchange_rate).quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP)
    )
    model_ratios.pop(PUBLIC_MODEL, None)
    completion_ratios.pop(PUBLIC_MODEL, None)
    return {
        "ModelPrice": model_prices,
        "ModelRatio": model_ratios,
        "CompletionRatio": completion_ratios,
    }


def append_model_limit(raw_limits: str) -> str:
    models = [item.strip() for item in raw_limits.split(",") if item.strip()]
    if PUBLIC_MODEL not in models:
        models.append(PUBLIC_MODEL)
    return ",".join(models)


def build_stage_sql(api_key: str, base_url: str, options: dict[str, dict[str, float]], token_id: str, token_limits: str) -> str:
    mapping = json.dumps({PUBLIC_MODEL: UPSTREAM_MODEL}, separators=(",", ":"))
    statements = [
        "START TRANSACTION;",
        "SET @now := UNIX_TIMESTAMP();",
        "SET @managed_channel_id := (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG) + ");",
        "INSERT INTO channels "
        "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
        "SELECT "
        + ", ".join(
            [
                "55",
                sql_quote(validate_api_key(api_key)),
                "1",
                sql_quote(CHANNEL_NAME),
                "100",
                "@now",
                "0",
                "0",
                sql_quote(normalize_base_url(base_url)),
                sql_quote(PUBLIC_MODEL),
                sql_quote(STAGING_GROUP),
                sql_quote(mapping),
                "0",
                "1",
                sql_quote(CHANNEL_TAG),
                sql_quote(CHANNEL_REMARK),
            ]
        )
        + " WHERE @managed_channel_id IS NULL;",
        "SET @managed_channel_id := IFNULL(@managed_channel_id, LAST_INSERT_ID());",
        "UPDATE channels SET type = 55, `key` = "
        + sql_quote(validate_api_key(api_key))
        + ", status = 1, name = "
        + sql_quote(CHANNEL_NAME)
        + ", weight = 100, base_url = "
        + sql_quote(normalize_base_url(base_url))
        + ", models = "
        + sql_quote(PUBLIC_MODEL)
        + ", `group` = "
        + sql_quote(STAGING_GROUP)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", priority = 0, auto_ban = 1, remark = "
        + sql_quote(CHANNEL_REMARK)
        + " WHERE id = @managed_channel_id;",
        "SET @managed_model_id := (SELECT MIN(id) FROM models WHERE model_name = "
        + sql_quote(PUBLIC_MODEL)
        + " AND deleted_at IS NULL);",
        "INSERT INTO models (model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
        "SELECT "
        + ", ".join(
            [
                sql_quote(PUBLIC_MODEL),
                sql_quote(MODEL_DESCRIPTION),
                sql_quote("Grok"),
                sql_quote("video,grok"),
                "3",
                sql_quote('{"openai-video":"/v1/videos"}'),
                "1",
                "0",
                "@now",
                "@now",
                "0",
            ]
        )
        + " WHERE @managed_model_id IS NULL;",
        "SET @managed_model_id := IFNULL(@managed_model_id, LAST_INSERT_ID());",
        "UPDATE models SET description = "
        + sql_quote(MODEL_DESCRIPTION)
        + ", icon = 'Grok', tags = 'video,grok', vendor_id = 3, endpoints = '{\"openai-video\":\"/v1/videos\"}', "
        "status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 WHERE id = @managed_model_id;",
        "UPDATE abilities SET enabled = 0 WHERE model = " + sql_quote(PUBLIC_MODEL) + ";",
        "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
        + ", ".join(
            [sql_quote(STAGING_GROUP), sql_quote(PUBLIC_MODEL), "@managed_channel_id", "1", "0", "100", sql_quote(CHANNEL_TAG)]
        )
        + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = 0, weight = 100, tag = VALUES(tag);",
        "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
        + sql_quote(append_model_limit(token_limits))
        + " WHERE id = "
        + str(int(token_id))
        + " AND user_id = 1;",
    ]
    for key in ("ModelPrice", "ModelRatio", "CompletionRatio"):
        statements.append(option_sql(key, options[key]))
    statements.extend(["COMMIT;"])
    return "\n".join(statements)


def managed_channel_count() -> int:
    rows = permissions.mysql("SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG))
    return int(rows[0][0]) if rows else 0


def validate_channel_isolation() -> None:
    if managed_channel_count() > 1:
        raise ConfigurationError("multiple channels use the managed video tag")
    rows = permissions.mysql(
        "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') <> "
        + sql_quote(CHANNEL_TAG)
        + " AND FIND_IN_SET("
        + sql_quote(PUBLIC_MODEL)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
    )
    if (int(rows[0][0]) if rows else 0) > 0:
        raise ConfigurationError("the public video model is assigned to an unmanaged channel")


def require_managed_channel_ready() -> None:
    rows = permissions.mysql_raw(
        "SELECT status, CHAR_LENGTH(COALESCE(`key`, '')), COALESCE(base_url, '') FROM channels WHERE tag = "
        + sql_quote(CHANNEL_TAG)
        + " ORDER BY id"
    )
    if len(rows) != 1 or rows[0][0] != "1" or int(rows[0][1] or "0") < 20:
        raise ConfigurationError("the staged video channel is missing, disabled, or incomplete")
    normalize_base_url(rows[0][2])


def admin_video_token() -> tuple[str, str, str]:
    rows = permissions.mysql_raw(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND user_id = 1 AND name = '星人视频生成令牌' ORDER BY id"
    )
    if len(rows) != 1 or len(rows[0]) != 3 or not rows[0][1]:
        raise ConfigurationError("the admin video system token is missing or ambiguous")
    return rows[0][0], rows[0][1], rows[0][2]


def stage(api_key: str, base_url: str) -> None:
    validate_channel_isolation()
    models = fetch_upstream_models(base_url, api_key)
    if UPSTREAM_MODEL not in models:
        raise ConfigurationError("required upstream video model is unavailable")
    token_id, token_key, token_limits = admin_video_token()
    permissions.mysql_exec(build_stage_sql(api_key, base_url, staging_price_options(), token_id, token_limits))
    permissions.delete_token_caches([token_key])


def publish() -> dict[str, int]:
    validate_channel_isolation()
    require_managed_channel_ready()
    permissions.mysql_exec(
        "UPDATE channels SET status = 1, `group` = "
        + sql_quote(CHANNEL_GROUPS)
        + " WHERE tag = "
        + sql_quote(CHANNEL_TAG)
        + ";"
    )
    permissions.ensure_public_video_models()
    permissions.sync_public_video_pricing()
    profiles = permissions.model_lists()
    if PUBLIC_MODEL not in profiles["video"]:
        raise ConfigurationError("the public video profile did not include the staged model")
    permissions.sync_abilities()
    return permissions.sync_user_video_tokens(profiles)


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the isolated Grok 1080P image-to-video model")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--stage", action="store_true", help="create an internal-only channel and admin test permission")
    action.add_argument("--publish", action="store_true", help="publish the staged model to all groups and video tokens")
    parser.add_argument("--base-url", default=os.environ.get("GROK15_1080P_BASE_URL", ""))
    args = parser.parse_args()
    try:
        with open(MODEL_SYNC_LOCK_PATH, "a+", encoding="utf-8") as lock_file:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ConfigurationError("another model synchronization is already running") from None
            if args.stage:
                base_url = args.base_url or input("Upstream HTTPS origin: ").strip()
                api_key = os.environ.get("GROK15_1080P_API_KEY", "") or getpass.getpass("Upstream API key: ")
                stage(validate_api_key(api_key), normalize_base_url(base_url))
                result = {"ok": True, "action": "staged", "model": PUBLIC_MODEL, "scope": "internal"}
            else:
                token_result = publish()
                result = {"ok": True, "action": "published", "model": PUBLIC_MODEL, **token_result}
    except (ConfigurationError, KeyError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, separators=(",", ":")))
        return 1
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
