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
PRICING_GROUP_DESCRIPTION = "Grok 文本专用通道"
PRIMARY_CHANNEL_TAG = "xingren-grok45-primary"
PRIMARY_CHANNEL_NAME = "星人 Grok 4.5 主通道"
PRIMARY_CHANNEL_REMARK = "Grok 4.5 主路由"
PRIMARY_UPSTREAM_BASE_URL = "https://dragtokens.com"
PRIMARY_UPSTREAM_KEY_ENV = "GROK45_PRIMARY_UPSTREAM_API_KEY"
PRIMARY_PRIORITY = 100
FALLBACK_CHANNEL_TAG = "xingren-grok45"
FALLBACK_CHANNEL_NAME = "星人 Grok 4.5 备用通道"
FALLBACK_CHANNEL_REMARK = "Grok 4.5 备用路由"
FALLBACK_UPSTREAM_BASE_URL = "https://www.geek2api.com"
FALLBACK_PRIORITY = 0
MANAGED_CHANNEL_TAGS = (PRIMARY_CHANNEL_TAG, FALLBACK_CHANNEL_TAG)
PEER_GROK_CHANNEL_TAGS = ("xingren-grok46-primary",)
ALLOWED_GROK_GROUP_CHANNEL_TAGS = (*MANAGED_CHANNEL_TAGS, *PEER_GROK_CHANNEL_TAGS)
ALLOWED_UPSTREAM_BASE_URLS = (PRIMARY_UPSTREAM_BASE_URL, FALLBACK_UPSTREAM_BASE_URL)
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
    canonical_by_hostname = {
        urllib.parse.urlsplit(base_url).hostname: base_url for base_url in ALLOWED_UPSTREAM_BASE_URLS
    }
    if (
        parsed.scheme != "https"
        or parsed.hostname not in canonical_by_hostname
        or parsed.port is not None
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ConfigurationError("the configured Grok endpoint is not permitted")
    return canonical_by_hostname[parsed.hostname]


def require_managed_base_url(value: str, expected_base_url: str) -> str:
    base_url = normalize_base_url(value)
    if base_url != expected_base_url:
        raise ConfigurationError("the configured Grok channel uses an unexpected endpoint")
    return base_url


def validate_upstream_key(value: str, *, env_name: str | None = None) -> str:
    key = value.strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        label = env_name or "configured Grok credential"
        raise ConfigurationError(f"{label} is missing or invalid")
    return key


def require_upstream_key() -> str:
    return validate_upstream_key(
        os.environ.get(PRIMARY_UPSTREAM_KEY_ENV, ""),
        env_name=PRIMARY_UPSTREAM_KEY_ENV,
    )


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
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, UnicodeDecodeError):
        raise ConfigurationError("production MySQL query failed") from None
    return [line.split("\t") for line in output.splitlines()]


def mysql_exec(query: str) -> None:
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
        subprocess.run(
            command,
            input=query.encode("utf-8"),
            env=environment,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=MYSQL_UPDATE_TIMEOUT_SECONDS,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise ConfigurationError("production MySQL update failed") from None


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
    try:
        exchange_rate = Decimal(values.get("USDExchangeRate", "7.3"))
    except InvalidOperation:
        raise ConfigurationError("USDExchangeRate is not a decimal number") from None
    if exchange_rate <= 0:
        raise ConfigurationError("USDExchangeRate must be positive")
    options = {key: values.get(key, "{}") for key in JSON_OPTION_KEYS}
    options["AutoGroups"] = values.get("AutoGroups", "[]")
    return options, exchange_rate


def decimal_as_float(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP))


def build_option_updates(options: dict[str, str], exchange_rate: Decimal) -> dict[str, str]:
    group_ratio = parse_json(options["GroupRatio"], "GroupRatio", dict)
    user_usable_groups = parse_json(options["UserUsableGroups"], "UserUsableGroups", dict)
    auto_groups = parse_json(options["AutoGroups"], "AutoGroups", list)
    group_group_ratio = parse_json(options["GroupGroupRatio"], "GroupGroupRatio", dict)
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
        "ModelRatio": json_option(model_ratio),
        "CompletionRatio": json_option(completion_ratio),
        "CacheRatio": json_option(cache_ratio),
        "CreateCacheRatio": json_option(create_cache_ratio),
        "ModelPrice": json_option(model_price),
        "billing_setting.billing_mode": json_option(billing_mode),
        "billing_setting.billing_expr": json_option(billing_expr),
    }


def option_upsert(option_key: str, option_value: str) -> str:
    quoted_value = sql_quote(option_value)
    return (
        "INSERT INTO options (`key`, `value`) VALUES ("
        + sql_quote(option_key)
        + ", "
        + quoted_value
        + ") ON DUPLICATE KEY UPDATE `value` = "
        + quoted_value
        + ";"
    )


def build_channel_statements(
    *,
    variable_name: str,
    api_key: str,
    base_url: str,
    tag: str,
    name: str,
    remark: str,
    priority: int,
    mapping: str,
) -> list[str]:
    channel_id = "@" + variable_name
    return [
        "SET " + channel_id + " := (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(tag) + ");",
        "INSERT INTO channels "
        "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
        "SELECT "
        + ", ".join(
            [
                "1",
                sql_quote(validate_upstream_key(api_key)),
                "1",
                sql_quote(name),
                "100",
                "@now",
                "0",
                "0",
                sql_quote(normalize_base_url(base_url)),
                sql_quote(MODEL_NAME),
                sql_quote(PRICING_GROUP),
                sql_quote(mapping),
                str(priority),
                "1",
                sql_quote(tag),
                sql_quote(remark),
            ]
        )
        + " WHERE "
        + channel_id
        + " IS NULL;",
        "SET " + channel_id + " := IFNULL(" + channel_id + ", LAST_INSERT_ID());",
        "UPDATE channels SET type = 1, `key` = "
        + sql_quote(validate_upstream_key(api_key))
        + ", status = 1, name = "
        + sql_quote(name)
        + ", weight = 100, base_url = "
        + sql_quote(normalize_base_url(base_url))
        + ", models = "
        + sql_quote(MODEL_NAME)
        + ", `group` = "
        + sql_quote(PRICING_GROUP)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", priority = "
        + str(priority)
        + ", auto_ban = 1, tag = "
        + sql_quote(tag)
        + ", remark = "
        + sql_quote(remark)
        + " WHERE id = "
        + channel_id
        + ";",
    ]


def build_apply_sql(
    primary_api_key: str,
    primary_base_url: str,
    fallback_api_key: str,
    fallback_base_url: str,
    options: dict[str, str],
    exchange_rate: Decimal,
) -> str:
    primary_base_url = require_managed_base_url(primary_base_url, PRIMARY_UPSTREAM_BASE_URL)
    fallback_base_url = require_managed_base_url(fallback_base_url, FALLBACK_UPSTREAM_BASE_URL)
    option_updates = build_option_updates(options, exchange_rate)
    mapping = json_option({MODEL_NAME: MODEL_NAME})
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    statements.extend(option_upsert(key, value) for key, value in option_updates.items())
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
            + " WHERE @grok_vendor_id IS NULL;",
            "SET @grok_vendor_id := IFNULL(@grok_vendor_id, LAST_INSERT_ID());",
            "UPDATE vendors SET description = "
            + sql_quote(MODEL_VENDOR_DESCRIPTION)
            + ", icon = "
            + sql_quote(MODEL_VENDOR_ICON)
            + ", status = 1, updated_time = @now, deleted_at = NULL WHERE id = @grok_vendor_id;",
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
            + " WHERE @keep_model_id IS NULL;",
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
            "WHERE id = @keep_model_id;",
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            "WHERE model_name = @grok_model AND id <> @keep_model_id;",
        ]
    )
    statements.extend(
        build_channel_statements(
            variable_name="grok_primary_channel_id",
            api_key=primary_api_key,
            base_url=primary_base_url,
            tag=PRIMARY_CHANNEL_TAG,
            name=PRIMARY_CHANNEL_NAME,
            remark=PRIMARY_CHANNEL_REMARK,
            priority=PRIMARY_PRIORITY,
            mapping=mapping,
        )
    )
    statements.extend(
        build_channel_statements(
            variable_name="grok_fallback_channel_id",
            api_key=fallback_api_key,
            base_url=fallback_base_url,
            tag=FALLBACK_CHANNEL_TAG,
            name=FALLBACK_CHANNEL_NAME,
            remark=FALLBACK_CHANNEL_REMARK,
            priority=FALLBACK_PRIORITY,
            mapping=mapping,
        )
    )
    statements.extend(
        [
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(PRICING_GROUP)
            + " AND model = "
            + sql_quote(MODEL_NAME)
            + " AND channel_id NOT IN (@grok_primary_channel_id, @grok_fallback_channel_id);",
            "UPDATE abilities SET enabled = 0 WHERE model = "
            + sql_quote(MODEL_NAME)
            + " AND `group` <> "
            + sql_quote(PRICING_GROUP)
            + ";",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN (@grok_primary_channel_id, @grok_fallback_channel_id);",
            "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
            + ", ".join(
                [
                    sql_quote(PRICING_GROUP),
                    sql_quote(MODEL_NAME),
                    "@grok_primary_channel_id",
                    "1",
                    str(PRIMARY_PRIORITY),
                    "100",
                    sql_quote(PRIMARY_CHANNEL_TAG),
                ]
            )
            + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = "
            + str(PRIMARY_PRIORITY)
            + ", weight = 100, tag = "
            + sql_quote(PRIMARY_CHANNEL_TAG)
            + ";",
            "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
            + ", ".join(
                [
                    sql_quote(PRICING_GROUP),
                    sql_quote(MODEL_NAME),
                    "@grok_fallback_channel_id",
                    "1",
                    str(FALLBACK_PRIORITY),
                    "100",
                    sql_quote(FALLBACK_CHANNEL_TAG),
                ]
            )
            + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = "
            + str(FALLBACK_PRIORITY)
            + ", weight = 100, tag = "
            + sql_quote(FALLBACK_CHANNEL_TAG)
            + ";",
            "COMMIT;",
        ]
    )
    return "\n".join(statements)


def validate_channel_isolation() -> None:
    for tag in MANAGED_CHANNEL_TAGS:
        rows = mysql("SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(tag))
        if (int(rows[0][0]) if rows else 0) > 1:
            raise ConfigurationError("multiple channels use a reserved Grok isolation tag")
    managed_tags_sql = ",".join(sql_quote(tag) for tag in ALLOWED_GROK_GROUP_CHANNEL_TAGS)
    rows = mysql(
        "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') NOT IN ("
        + managed_tags_sql
        + ")"
        + " AND FIND_IN_SET("
        + sql_quote(PRICING_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0"
    )
    if (int(rows[0][0]) if rows else 0) > 0:
        raise ConfigurationError("the Grok group is assigned to a non-isolated channel")


def apply_grok45(
    primary_api_key: str,
    primary_base_url: str,
    fallback_api_key: str,
    fallback_base_url: str,
) -> None:
    validate_channel_isolation()
    options, exchange_rate = load_options()
    mysql_exec(
        build_apply_sql(
            primary_api_key,
            primary_base_url,
            fallback_api_key,
            fallback_base_url,
            options,
            exchange_rate,
        )
    )


def load_existing_channel(tag: str, expected_base_url: str) -> tuple[str, str] | None:
    rows = mysql(
        "SELECT COALESCE(`key`, ''), COALESCE(base_url, '') FROM channels WHERE tag = "
        + sql_quote(tag)
        + " ORDER BY id"
    )
    if not rows:
        return None
    if len(rows) != 1 or len(rows[0]) != 2:
        raise ConfigurationError("the configured Grok channel is ambiguous")
    base_url = require_managed_base_url(rows[0][1], expected_base_url)
    return validate_upstream_key(rows[0][0]), base_url


def probe_upstream(configured: tuple[str, str]) -> None:
    api_key, base_url = configured
    require_exact_model(fetch_upstream_models(base_url, api_key))
    require_upstream_inference(base_url, api_key)


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
            fallback = load_existing_channel(FALLBACK_CHANNEL_TAG, FALLBACK_UPSTREAM_BASE_URL)
            primary = load_existing_channel(PRIMARY_CHANNEL_TAG, PRIMARY_UPSTREAM_BASE_URL)
            if fallback is None and primary is None:
                emit_result("not_configured")
                return 0
            if fallback is None:
                raise ConfigurationError("the managed Grok fallback channel is missing")
            probe_upstream(fallback)
            if primary is None:
                emit_result("fallback_only")
                return 0
            probe_upstream(primary)
            apply_grok45(primary[0], primary[1], fallback[0], fallback[1])
        emit_result("reconciled")
        return 0

    api_key = require_upstream_key()
    base_url = normalize_base_url(PRIMARY_UPSTREAM_BASE_URL)
    if args.apply:
        with model_sync_lock():
            fallback = load_existing_channel(FALLBACK_CHANNEL_TAG, FALLBACK_UPSTREAM_BASE_URL)
            if fallback is None:
                raise ConfigurationError("the managed Grok fallback channel is missing")
            probe_upstream((api_key, base_url))
            probe_upstream(fallback)
            apply_grok45(api_key, base_url, fallback[0], fallback[1])
    else:
        probe_upstream((api_key, base_url))
    emit_result("applied" if args.apply else "probe")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
