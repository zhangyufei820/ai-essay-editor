#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


MODEL_NAME = "grok-4.5"
MODEL_DESCRIPTION = "xAI Grok 4.5 文本模型，适合复杂推理、写作、分析与代码任务。"
MODEL_TAGS = "text,xai,grok,codex"
MODEL_ENDPOINTS = '{"openai":"/v1/chat/completions","openai-response":"/v1/responses"}'
MODEL_VENDOR_NAME = "xAI"
MODEL_VENDOR_DESCRIPTION = "xAI 模型"
MODEL_VENDOR_ICON = "XAI"
PRICING_GROUP = "grok45"
PRICING_GROUP_RATIO = 1
PRICING_GROUP_DESCRIPTION = "Grok 4.5 专用通道"
CHANNEL_TAG = "xingren-grok45"
CHANNEL_NAME = "星人 Grok 4.5 独立通道"
EXPECTED_UPSTREAM_BASE_URL = "https://www.geek2api.com"
UPSTREAM_KEY_ENV = "GROK45_UPSTREAM_API_KEY"
MAX_MODELS_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_INFERENCE_RESPONSE_BYTES = 1 * 1024 * 1024
MYSQL_QUERY_TIMEOUT_SECONDS = 15
MYSQL_UPDATE_TIMEOUT_SECONDS = 30
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MODEL_SYNC_LOCK_HELD_ENV = "GROK45_MODEL_SYNC_LOCK_HELD"
INPUT_CNY_PER_1M = Decimal("2")
OUTPUT_CNY_PER_1M = Decimal("6")
CACHE_READ_CNY_PER_1M = Decimal("0.5")
JSON_OPTION_KEYS = (
    "GroupRatio",
    "UserUsableGroups",
    "AutoGroups",
    "GroupGroupRatio",
    "group_ratio_setting.group_special_usable_group",
    "ModelRatio",
    "CompletionRatio",
    "CacheRatio",
    "CreateCacheRatio",
    "ModelPrice",
    "billing_setting.billing_mode",
    "billing_setting.billing_expr",
)


class ConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ChannelProfile:
    channel_id: str
    channel_type: str
    api_key: str
    status: str
    name: str
    weight: str
    base_url: str
    models: str
    groups: str
    model_mapping: str
    priority: str
    auto_ban: str
    tag: str
    remark: str


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        request: urllib.request.Request,
        file_pointer: object,
        status_code: int,
        message: str,
        response_headers: object,
        new_url: str,
    ) -> None:
        return None


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def normalize_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    parsed = urllib.parse.urlsplit(normalized)
    expected = urllib.parse.urlsplit(EXPECTED_UPSTREAM_BASE_URL)
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected.hostname
        or parsed.port is not None
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ConfigurationError("the configured Grok endpoint is not permitted")
    return EXPECTED_UPSTREAM_BASE_URL


def validate_upstream_key(value: str, *, env_name: str | None = None) -> str:
    key = value.strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        label = env_name or "configured Grok credential"
        raise ConfigurationError(f"{label} is missing or invalid")
    return key


def require_upstream_key() -> str:
    return validate_upstream_key(os.environ.get(UPSTREAM_KEY_ENV, ""), env_name=UPSTREAM_KEY_ENV)


@contextlib.contextmanager
def model_sync_lock():
    if os.environ.get(MODEL_SYNC_LOCK_HELD_ENV) == "1":
        yield
        return
    descriptor = os.open(MODEL_SYNC_LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ConfigurationError("model permission sync is already running") from None
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def fetch_upstream_models(base_url: str, api_key: str) -> set[str]:
    request = urllib.request.Request(
        normalize_base_url(base_url) + "/v1/models",
        headers={
            "Authorization": "Bearer " + validate_upstream_key(api_key),
            "Accept": "application/json",
            "User-Agent": "shenxiang-new-api-grok-model-probe/1.0",
        },
        method="GET",
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(request, timeout=15) as response:
            body = response.read(MAX_MODELS_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"Grok model probe returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("Grok model probe failed or timed out") from None
    if len(body) > MAX_MODELS_RESPONSE_BYTES:
        raise ConfigurationError("Grok model response exceeded the size limit")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("Grok model response was not valid JSON") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ConfigurationError("Grok model response did not use the OpenAI models schema")
    models: set[str] = set()
    for item in payload["data"]:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if isinstance(model_id, str) and 0 < len(model_id) <= 255:
            models.add(model_id.strip())
    return models


def require_exact_model(upstream_models: set[str]) -> None:
    if MODEL_NAME not in upstream_models:
        raise ConfigurationError("the required Grok model is not available")


def require_upstream_inference(base_url: str, api_key: str) -> None:
    request = urllib.request.Request(
        normalize_base_url(base_url) + "/v1/chat/completions",
        data=json.dumps(
            {
                "model": MODEL_NAME,
                "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                "max_tokens": 8,
                "stream": False,
            },
            separators=(",", ":"),
        ).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + validate_upstream_key(api_key),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "shenxiang-new-api-grok-inference-probe/1.0",
        },
        method="POST",
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(request, timeout=30) as response:
            body = response.read(MAX_INFERENCE_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"Grok inference probe returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("Grok inference probe failed or timed out") from None
    if len(body) > MAX_INFERENCE_RESPONSE_BYTES:
        raise ConfigurationError("Grok inference response exceeded the size limit")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("Grok inference response was not valid JSON") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("choices"), list) or not payload["choices"]:
        raise ConfigurationError("Grok inference response did not use the OpenAI chat schema")
    first_choice = payload["choices"][0]
    if not isinstance(first_choice, dict) or not isinstance(first_choice.get("message"), dict):
        raise ConfigurationError("Grok inference response did not contain an assistant message")
    if str(first_choice["message"].get("content") or "").strip() != "OK":
        raise ConfigurationError("Grok inference response did not complete the verification prompt")


def mysql(query: str) -> list[list[str]]:
    password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE", "")
    if not password or not database:
        raise ConfigurationError("production MySQL environment is not loaded")
    environment = os.environ.copy()
    environment["MYSQL_PWD"] = password
    command = [
        "docker",
        "exec",
        "-e",
        "MYSQL_PWD",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "--raw",
        "-uroot",
        "-N",
        "-B",
        database,
        "-e",
        query,
    ]
    try:
        output = subprocess.check_output(
            command,
            env=environment,
            stderr=subprocess.DEVNULL,
            timeout=MYSQL_QUERY_TIMEOUT_SECONDS,
        ).decode("utf-8", errors="strict")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, UnicodeDecodeError, OSError):
        raise ConfigurationError("production MySQL query failed") from None
    return [line.split("\t") for line in output.splitlines()]


def mysql_exec(query: str) -> list[str]:
    password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE", "")
    if not password or not database:
        raise ConfigurationError("production MySQL environment is not loaded")
    environment = os.environ.copy()
    environment["MYSQL_PWD"] = password
    command = [
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
    try:
        completed = subprocess.run(
            command,
            input=query.encode("utf-8"),
            env=environment,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=MYSQL_UPDATE_TIMEOUT_SECONDS,
        )
        output = completed.stdout.decode("utf-8", errors="strict")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, UnicodeDecodeError, OSError):
        raise ConfigurationError("production MySQL update failed") from None
    return output.splitlines()


def parse_json(raw_value: str, option_key: str, expected_type: type) -> object:
    try:
        value = json.loads(raw_value)
    except json.JSONDecodeError:
        raise ConfigurationError(f"{option_key} is not valid JSON") from None
    if not isinstance(value, expected_type):
        raise ConfigurationError(f"{option_key} has an invalid JSON type")
    return value


def json_option(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def load_options() -> tuple[dict[str, str], Decimal]:
    keys = (*JSON_OPTION_KEYS, "USDExchangeRate")
    rows = mysql(
        "SELECT `key`, COALESCE(`value`, '') FROM options WHERE `key` IN ("
        + ",".join(sql_quote(key) for key in keys)
        + ")"
    )
    values = {row[0]: row[1] for row in rows if len(row) == 2}
    missing = [key for key in keys if key not in values]
    if missing:
        raise ConfigurationError("required Grok options are missing: " + ",".join(missing))
    try:
        exchange_rate = Decimal(values["USDExchangeRate"])
    except InvalidOperation:
        raise ConfigurationError("USDExchangeRate is not a decimal number") from None
    if not exchange_rate.is_finite() or exchange_rate <= 0:
        raise ConfigurationError("USDExchangeRate must be positive")
    options = {key: values[key] for key in JSON_OPTION_KEYS}
    options["USDExchangeRate"] = values["USDExchangeRate"]
    return options, exchange_rate


def decimal_as_float(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP))


def build_option_updates(options: dict[str, str], exchange_rate: Decimal) -> dict[str, str]:
    group_ratio = parse_json(options["GroupRatio"], "GroupRatio", dict)
    user_usable_groups = parse_json(options["UserUsableGroups"], "UserUsableGroups", dict)
    auto_groups = parse_json(options["AutoGroups"], "AutoGroups", list)
    group_group_ratio = parse_json(options["GroupGroupRatio"], "GroupGroupRatio", dict)
    special_usable_groups = parse_json(
        options["group_ratio_setting.group_special_usable_group"],
        "group_ratio_setting.group_special_usable_group",
        dict,
    )
    model_ratio = parse_json(options["ModelRatio"], "ModelRatio", dict)
    completion_ratio = parse_json(options["CompletionRatio"], "CompletionRatio", dict)
    cache_ratio = parse_json(options["CacheRatio"], "CacheRatio", dict)
    create_cache_ratio = parse_json(options["CreateCacheRatio"], "CreateCacheRatio", dict)
    model_price = parse_json(options["ModelPrice"], "ModelPrice", dict)
    billing_mode = parse_json(options["billing_setting.billing_mode"], "billing_setting.billing_mode", dict)
    billing_expr = parse_json(options["billing_setting.billing_expr"], "billing_setting.billing_expr", dict)

    group_ratio[PRICING_GROUP] = PRICING_GROUP_RATIO
    user_usable_groups[PRICING_GROUP] = PRICING_GROUP_DESCRIPTION
    auto_groups = [group for group in auto_groups if group != PRICING_GROUP]
    for overrides in group_group_ratio.values():
        if isinstance(overrides, dict):
            overrides.pop(PRICING_GROUP, None)
    for overrides in special_usable_groups.values():
        if not isinstance(overrides, dict):
            continue
        overrides.pop(PRICING_GROUP, None)
        overrides.pop("+:" + PRICING_GROUP, None)

    model_ratio[MODEL_NAME] = decimal_as_float(INPUT_CNY_PER_1M / (Decimal("2") * exchange_rate))
    completion_ratio[MODEL_NAME] = decimal_as_float(OUTPUT_CNY_PER_1M / INPUT_CNY_PER_1M)
    cache_ratio[MODEL_NAME] = decimal_as_float(CACHE_READ_CNY_PER_1M / INPUT_CNY_PER_1M)
    create_cache_ratio.pop(MODEL_NAME, None)
    model_price.pop(MODEL_NAME, None)
    billing_mode.pop(MODEL_NAME, None)
    billing_expr.pop(MODEL_NAME, None)

    return {
        "GroupRatio": json_option(group_ratio),
        "UserUsableGroups": json_option(user_usable_groups),
        "AutoGroups": json_option(auto_groups),
        "GroupGroupRatio": json_option(group_group_ratio),
        "group_ratio_setting.group_special_usable_group": json_option(special_usable_groups),
        "ModelRatio": json_option(model_ratio),
        "CompletionRatio": json_option(completion_ratio),
        "CacheRatio": json_option(cache_ratio),
        "CreateCacheRatio": json_option(create_cache_ratio),
        "ModelPrice": json_option(model_price),
        "billing_setting.billing_mode": json_option(billing_mode),
        "billing_setting.billing_expr": json_option(billing_expr),
    }


def option_guard_statements(options: dict[str, str]) -> list[str]:
    expected_keys = (*JSON_OPTION_KEYS, "USDExchangeRate")
    missing = [key for key in expected_keys if key not in options]
    if missing:
        raise ConfigurationError("required Grok options are missing: " + ",".join(missing))
    keys = ",".join(sql_quote(key) for key in expected_keys)
    exact_matches = " OR ".join(
        "(`key` = "
        + sql_quote(key)
        + " AND BINARY COALESCE(`value`, '') = BINARY "
        + sql_quote(options[key])
        + ")"
        for key in expected_keys
    )
    return [
        "SELECT `key` FROM options WHERE `key` IN (" + keys + ") ORDER BY `key` FOR UPDATE;",
        "SET @grok_options_match := (SELECT COUNT(*) FROM options WHERE "
        + exact_matches
        + ");",
    ]


def guarded_option_update(option_key: str, option_value: str, expected_value: str) -> str:
    return (
        "UPDATE options SET `value` = "
        + sql_quote(option_value)
        + " WHERE `key` = "
        + sql_quote(option_key)
        + " AND @grok_apply_allowed = 1"
        + " AND BINARY COALESCE(`value`, '') = BINARY "
        + sql_quote(expected_value)
        + ";"
    )


def profile_match_condition(profile: ChannelProfile) -> str:
    numeric_fields = {
        "id": profile.channel_id,
        "type": profile.channel_type,
        "status": profile.status,
        "weight": profile.weight,
        "priority": profile.priority,
        "auto_ban": profile.auto_ban,
    }
    string_fields = {
        "`key`": profile.api_key,
        "name": profile.name,
        "base_url": profile.base_url,
        "models": profile.models,
        "`group`": profile.groups,
        "model_mapping": profile.model_mapping,
        "tag": profile.tag,
        "remark": profile.remark,
    }
    conditions = [
        "COALESCE(profile_channel." + field + ", 0) = " + str(int(value))
        for field, value in numeric_fields.items()
    ]
    conditions.extend(
        "BINARY COALESCE(profile_channel."
        + field
        + ", '') = BINARY "
        + sql_quote(value)
        for field, value in string_fields.items()
    )
    return " AND ".join(conditions)


def mysql_status(output: list[str], prefix: str) -> str:
    for line in reversed(output):
        if line.startswith(prefix):
            return line.removeprefix(prefix)
    raise ConfigurationError("production MySQL update returned no completion status")


def build_apply_sql(
    api_key: str,
    base_url: str,
    options: dict[str, str],
    exchange_rate: Decimal,
    *,
    expected_profile: ChannelProfile | None = None,
) -> str:
    option_updates = build_option_updates(options, exchange_rate)
    mapping = json_option({MODEL_NAME: MODEL_NAME})
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    statements.extend(option_guard_statements(options))
    relevant_channel_condition = (
        "tag = "
        + sql_quote(CHANNEL_TAG)
        + " OR FIND_IN_SET("
        + sql_quote(PRICING_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0"
    )
    conflicting_channel_condition = (
        "COALESCE(tag, '') <> "
        + sql_quote(CHANNEL_TAG)
        + " AND FIND_IN_SET("
        + sql_quote(PRICING_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0"
    )
    statements.extend(
        [
            "SELECT id FROM channels WHERE " + relevant_channel_condition + " ORDER BY id FOR UPDATE;",
            "SELECT id FROM vendors WHERE name = "
            + sql_quote(MODEL_VENDOR_NAME)
            + " ORDER BY id FOR UPDATE;",
            "SELECT id FROM models WHERE model_name = "
            + sql_quote(MODEL_NAME)
            + " ORDER BY id FOR UPDATE;",
            "SET @grok_tag_channel_count := (SELECT COUNT(*) FROM channels WHERE tag = "
            + sql_quote(CHANNEL_TAG)
            + ");",
            "SET @grok_group_conflict_count := (SELECT COUNT(*) FROM channels WHERE "
            + conflicting_channel_condition
            + ");",
        ]
    )
    if expected_profile is None:
        statements.append("SET @grok_profile_match := 1;")
    else:
        statements.append(
            "SET @grok_profile_match := (SELECT COUNT(*) FROM channels AS profile_channel WHERE "
            + profile_match_condition(expected_profile)
            + ");"
        )
    statements.extend(
        [
            "SET @grok_apply_status := CASE "
            + "WHEN @grok_options_match <> "
            + str(len(JSON_OPTION_KEYS) + 1)
            + " THEN 'options_conflict' "
            + "WHEN @grok_group_conflict_count > 0 THEN 'channel_conflict' "
            + "WHEN @grok_tag_channel_count > 1 THEN 'duplicate_channels' "
            + "WHEN @grok_profile_match <> 1 THEN 'profile_conflict' "
            + "ELSE 'ok' END;",
            "SET @grok_apply_allowed := IF(@grok_apply_status = 'ok', 1, 0);",
        ]
    )
    statements.extend(
        guarded_option_update(key, value, options[key])
        for key, value in option_updates.items()
    )
    statements.extend(
        [
            "SET @grok_model := " + sql_quote(MODEL_NAME) + " COLLATE utf8mb4_unicode_ci;",
            "SET @grok_vendor_id := (SELECT MIN(id) FROM vendors WHERE name = "
            + sql_quote(MODEL_VENDOR_NAME)
            + " AND deleted_at IS NULL);",
            "SET @grok_vendor_id := IFNULL(@grok_vendor_id, (SELECT MIN(id) FROM vendors WHERE name = "
            + sql_quote(MODEL_VENDOR_NAME)
            + "));",
            "INSERT INTO vendors (name, description, icon, status, created_time, updated_time) SELECT "
            + ", ".join(
                [
                    sql_quote(MODEL_VENDOR_NAME),
                    sql_quote(MODEL_VENDOR_DESCRIPTION),
                    sql_quote(MODEL_VENDOR_ICON),
                    "1",
                    "@now",
                    "@now",
                ]
            )
            + " WHERE @grok_vendor_id IS NULL AND @grok_apply_allowed = 1;",
            "SET @grok_vendor_id := IFNULL(@grok_vendor_id, LAST_INSERT_ID());",
            "UPDATE vendors SET description = "
            + sql_quote(MODEL_VENDOR_DESCRIPTION)
            + ", icon = "
            + sql_quote(MODEL_VENDOR_ICON)
            + ", status = 1, updated_time = @now, deleted_at = NULL WHERE id = @grok_vendor_id"
            + " AND @grok_apply_allowed = 1;",
            "SET @keep_model_id := (SELECT MIN(id) FROM models WHERE model_name = @grok_model AND deleted_at IS NULL);",
            "SET @keep_model_id := IFNULL(@keep_model_id, (SELECT MIN(id) FROM models WHERE model_name = @grok_model));",
            "INSERT INTO models "
            "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
            "SELECT "
            + ", ".join(
                [
                    "@grok_model",
                    sql_quote(MODEL_DESCRIPTION),
                    sql_quote("XAI"),
                    sql_quote(MODEL_TAGS),
                    "@grok_vendor_id",
                    sql_quote(MODEL_ENDPOINTS),
                    "1",
                    "0",
                    "@now",
                    "@now",
                    "0",
                ]
            )
            + " WHERE @keep_model_id IS NULL AND @grok_apply_allowed = 1;",
            "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());",
            "UPDATE models SET description = "
            + sql_quote(MODEL_DESCRIPTION)
            + ", icon = "
            + sql_quote("XAI")
            + ", tags = "
            + sql_quote(MODEL_TAGS)
            + ", vendor_id = @grok_vendor_id"
            + ", endpoints = "
            + sql_quote(MODEL_ENDPOINTS)
            + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
            "WHERE id = @keep_model_id AND @grok_apply_allowed = 1;",
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            "WHERE model_name = @grok_model AND id <> @keep_model_id AND @grok_apply_allowed = 1;",
            "SET @grok_channel_id := (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG) + ");",
            "INSERT INTO channels "
            "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
            "SELECT "
            + ", ".join(
                [
                    "1",
                    sql_quote(validate_upstream_key(api_key)),
                    "1",
                    sql_quote(CHANNEL_NAME),
                    "100",
                    "@now",
                    "0",
                    "0",
                    sql_quote(normalize_base_url(base_url)),
                    sql_quote(MODEL_NAME),
                    sql_quote(PRICING_GROUP),
                    sql_quote(mapping),
                    "0",
                    "1",
                    sql_quote(CHANNEL_TAG),
                    sql_quote(PRICING_GROUP_DESCRIPTION),
                ]
            )
            + " WHERE @grok_channel_id IS NULL AND @grok_apply_allowed = 1;",
            "SET @grok_channel_id := IFNULL(@grok_channel_id, LAST_INSERT_ID());",
            "UPDATE channels SET type = 1, `key` = "
            + sql_quote(validate_upstream_key(api_key))
            + ", status = 1, name = "
            + sql_quote(CHANNEL_NAME)
            + ", weight = 100, base_url = "
            + sql_quote(normalize_base_url(base_url))
            + ", models = "
            + sql_quote(MODEL_NAME)
            + ", `group` = "
            + sql_quote(PRICING_GROUP)
            + ", model_mapping = "
            + sql_quote(mapping)
            + ", priority = 0, auto_ban = 1, tag = "
            + sql_quote(CHANNEL_TAG)
            + ", remark = "
            + sql_quote(PRICING_GROUP_DESCRIPTION)
            + " WHERE id = @grok_channel_id AND @grok_apply_allowed = 1;",
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(PRICING_GROUP)
            + " AND channel_id <> @grok_channel_id AND @grok_apply_allowed = 1;",
            "UPDATE abilities SET enabled = 0 WHERE model = "
            + sql_quote(MODEL_NAME)
            + " AND `group` <> "
            + sql_quote(PRICING_GROUP)
            + " AND @grok_apply_allowed = 1;",
            "UPDATE abilities SET enabled = 0 WHERE channel_id = @grok_channel_id"
            + " AND @grok_apply_allowed = 1;",
            "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) SELECT "
            + ", ".join(
                [
                    sql_quote(PRICING_GROUP),
                    sql_quote(MODEL_NAME),
                    "@grok_channel_id",
                    "1",
                    "0",
                    "100",
                    sql_quote(CHANNEL_TAG),
                ]
            )
            + " WHERE @grok_apply_allowed = 1 AND @grok_channel_id IS NOT NULL"
            + " ON DUPLICATE KEY UPDATE enabled = 1, priority = 0, weight = 100, tag = "
            + sql_quote(CHANNEL_TAG)
            + ";",
            "COMMIT;",
            "SELECT CONCAT('grok_apply_status=', @grok_apply_status);",
        ]
    )
    return "\n".join(statements)


def apply_grok45(
    api_key: str,
    base_url: str,
    *,
    expected_profile: ChannelProfile | None = None,
) -> None:
    options, exchange_rate = load_options()
    output = mysql_exec(
        build_apply_sql(
            api_key,
            base_url,
            options,
            exchange_rate,
            expected_profile=expected_profile,
        )
    )
    status = mysql_status(output, "grok_apply_status=")
    errors = {
        "options_conflict": "Grok options changed concurrently; retry the apply operation",
        "profile_conflict": "the managed Grok channel profile changed concurrently",
        "channel_conflict": "the Grok group is already assigned to a non-isolated channel",
        "duplicate_channels": "multiple channels use the reserved Grok isolation tag",
    }
    if status != "ok":
        raise ConfigurationError(errors.get(status, "Grok model apply failed closed"))


def load_existing_channel() -> ChannelProfile | None:
    rows = mysql(
        "SELECT id, COALESCE(type, 0), COALESCE(`key`, ''), COALESCE(status, 0), "
        "COALESCE(name, ''), COALESCE(weight, 0), COALESCE(base_url, ''), "
        "COALESCE(models, ''), COALESCE(`group`, ''), COALESCE(model_mapping, ''), "
        "COALESCE(priority, 0), COALESCE(auto_ban, 0), COALESCE(tag, ''), COALESCE(remark, '') "
        "FROM channels WHERE tag = "
        + sql_quote(CHANNEL_TAG)
        + " ORDER BY id"
    )
    if not rows:
        return None
    if len(rows) != 1 or len(rows[0]) != 14:
        raise ConfigurationError("the configured Grok channel is ambiguous")
    profile = ChannelProfile(*rows[0])
    validate_upstream_key(profile.api_key)
    normalize_base_url(profile.base_url)
    return profile


def emit_result(action: str) -> None:
    print(json.dumps({"ok": True, "action": action, "model": MODEL_NAME}, ensure_ascii=False, separators=(",", ":")))


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely configure the isolated Grok 4.5 model")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true", help="validate and write the Grok model configuration")
    action.add_argument(
        "--reconcile-if-configured",
        action="store_true",
        help="reapply isolation and pricing only when the managed channel already exists",
    )
    args = parser.parse_args()

    if args.reconcile_if_configured:
        with model_sync_lock():
            configured = load_existing_channel()
            if configured is None:
                emit_result("not_configured")
                return 0
            api_key = validate_upstream_key(configured.api_key)
            base_url = normalize_base_url(configured.base_url)
            require_exact_model(fetch_upstream_models(base_url, api_key))
            require_upstream_inference(base_url, api_key)
            apply_grok45(api_key, base_url, expected_profile=configured)
        emit_result("reconciled")
        return 0

    api_key = require_upstream_key()
    base_url = normalize_base_url(EXPECTED_UPSTREAM_BASE_URL)
    if args.apply:
        with model_sync_lock():
            require_exact_model(fetch_upstream_models(base_url, api_key))
            require_upstream_inference(base_url, api_key)
            apply_grok45(api_key, base_url)
    else:
        require_exact_model(fetch_upstream_models(base_url, api_key))
        require_upstream_inference(base_url, api_key)
    emit_result("applied" if args.apply else "probe")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
