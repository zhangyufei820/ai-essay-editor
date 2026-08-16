#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import configure_grok45_model as grok45


MODEL_NAME = "grok-4.6"
IMAGE_MODEL_NAME = "grok-imagine-image"
VIDEO_MODEL_NAME = "grok-imagine-video"
REQUIRED_UPSTREAM_MODELS = (MODEL_NAME, IMAGE_MODEL_NAME, VIDEO_MODEL_NAME)
MODEL_DESCRIPTION = "xAI Grok 4.6 文本模型，支持关联的图像与视频生成能力，适合推理、写作、分析与代码任务。"
MODEL_TAGS = "text,xai,grok,codex,可生图像,可生视频"
MODEL_ENDPOINTS = '{"openai":"/v1/chat/completions","openai-response":"/v1/responses"}'
CHANNEL_TAG = "xingren-grok46-primary"
CHANNEL_NAME = "星人 Grok 4.6 主通道"
CHANNEL_REMARK = "Grok 4.6 主路由"
EXPECTED_UPSTREAM_BASE_URL = "https://wangwang.sbs"
UPSTREAM_KEY_ENV = "GROK46_UPSTREAM_API_KEY"
CHANNEL_PRIORITY = 100
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MODEL_SYNC_LOCK_HELD_ENV = "GROK46_MODEL_SYNC_LOCK_HELD"
MAX_RESPONSE_BYTES = 5 * 1024 * 1024


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
    return grok45.sql_quote(value)


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
        raise ConfigurationError("the configured Grok 4.6 endpoint is not permitted")
    return EXPECTED_UPSTREAM_BASE_URL


def validate_upstream_key(value: str, *, env_name: str | None = None) -> str:
    key = value.strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{env_name or 'configured Grok 4.6 credential'} is missing or invalid")
    return key


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


def fetch_json(
    url: str,
    api_key: str,
    *,
    method: str,
    body: dict[str, object] | None = None,
) -> dict[str, object]:
    request = urllib.request.Request(
        url,
        data=json.dumps(body, separators=(",", ":")).encode("utf-8") if body is not None else None,
        headers={
            "Authorization": "Bearer " + validate_upstream_key(api_key),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "shenxiang-new-api-grok46-probe/1.0",
        },
        method=method,
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(request, timeout=45) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"Grok 4.6 upstream request returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("Grok 4.6 upstream request failed or timed out") from None
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ConfigurationError("Grok 4.6 upstream response exceeded the size limit")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("Grok 4.6 upstream response was not valid JSON") from None
    if not isinstance(payload, dict):
        raise ConfigurationError("Grok 4.6 upstream response was not an object")
    return payload


def extract_responses_text(payload: dict[str, object]) -> str:
    text_parts: list[str] = []
    output = payload.get("output")
    if not isinstance(output, list):
        return ""
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            text = part.get("text")
            if isinstance(text, str):
                text_parts.append(text)
    return "".join(text_parts).strip()


def verify_upstream(base_url: str, api_key: str) -> None:
    normalized = normalize_base_url(base_url)
    models = fetch_json(normalized + "/v1/models", api_key, method="GET")
    available = {
        item.get("id")
        for item in models.get("data", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    missing_models = [model for model in REQUIRED_UPSTREAM_MODELS if model not in available]
    if missing_models:
        raise ConfigurationError("the required Grok 4.6 text or media model is not available")

    chat = fetch_json(
        normalized + "/v1/chat/completions",
        api_key,
        method="POST",
        body={
            "model": MODEL_NAME,
            "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
            "max_tokens": 8,
            "stream": False,
        },
    )
    choices = chat.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ConfigurationError("Grok 4.6 chat response did not contain a choice")
    message = choices[0].get("message")
    if not isinstance(message, dict) or str(message.get("content") or "").strip() != "OK":
        raise ConfigurationError("Grok 4.6 chat response did not complete the verification prompt")

    responses = fetch_json(
        normalized + "/v1/responses",
        api_key,
        method="POST",
        body={
            "model": MODEL_NAME,
            "input": "Reply with exactly: OK",
            "max_output_tokens": 8,
            "stream": False,
        },
    )
    if extract_responses_text(responses) != "OK":
        raise ConfigurationError("Grok 4.6 Responses output did not complete the verification prompt")


def build_option_updates(options: dict[str, str], exchange_rate: object) -> dict[str, str]:
    updates = grok45.build_option_updates(options, exchange_rate)
    model_ratio = grok45.parse_json(updates["ModelRatio"], "ModelRatio", dict)
    completion_ratio = grok45.parse_json(updates["CompletionRatio"], "CompletionRatio", dict)
    cache_ratio = grok45.parse_json(updates["CacheRatio"], "CacheRatio", dict)
    create_cache_ratio = grok45.parse_json(updates["CreateCacheRatio"], "CreateCacheRatio", dict)
    model_price = grok45.parse_json(updates["ModelPrice"], "ModelPrice", dict)
    billing_mode = grok45.parse_json(updates["billing_setting.billing_mode"], "billing_setting.billing_mode", dict)
    billing_expr = grok45.parse_json(updates["billing_setting.billing_expr"], "billing_setting.billing_expr", dict)

    model_ratio[MODEL_NAME] = model_ratio[grok45.MODEL_NAME]
    completion_ratio[MODEL_NAME] = completion_ratio[grok45.MODEL_NAME]
    cache_ratio[MODEL_NAME] = cache_ratio[grok45.MODEL_NAME]
    create_cache_ratio.pop(MODEL_NAME, None)
    model_price.pop(MODEL_NAME, None)
    billing_mode.pop(MODEL_NAME, None)
    billing_expr.pop(MODEL_NAME, None)

    updates["ModelRatio"] = grok45.json_option(model_ratio)
    updates["CompletionRatio"] = grok45.json_option(completion_ratio)
    updates["CacheRatio"] = grok45.json_option(cache_ratio)
    updates["CreateCacheRatio"] = grok45.json_option(create_cache_ratio)
    updates["ModelPrice"] = grok45.json_option(model_price)
    updates["billing_setting.billing_mode"] = grok45.json_option(billing_mode)
    updates["billing_setting.billing_expr"] = grok45.json_option(billing_expr)
    return updates


def build_apply_sql(api_key: str, base_url: str, options: dict[str, str], exchange_rate: object) -> str:
    key = validate_upstream_key(api_key)
    normalized = normalize_base_url(base_url)
    option_updates = build_option_updates(options, exchange_rate)
    mapping = grok45.json_option({MODEL_NAME: MODEL_NAME})
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    statements.extend(grok45.option_upsert(option_key, option_value) for option_key, option_value in option_updates.items())
    statements.extend(
        [
            "SET @grok46_model := " + sql_quote(MODEL_NAME) + " COLLATE utf8mb4_unicode_ci;",
            "SET @grok_vendor_id := (SELECT MIN(id) FROM vendors WHERE name = "
            + sql_quote(grok45.MODEL_VENDOR_NAME)
            + " AND deleted_at IS NULL);",
            "SET @grok_vendor_id := IFNULL(@grok_vendor_id, (SELECT MIN(id) FROM vendors WHERE name = "
            + sql_quote(grok45.MODEL_VENDOR_NAME)
            + "));",
            "INSERT INTO vendors (name, description, icon, status, created_time, updated_time) SELECT "
            + ", ".join(
                [
                    sql_quote(grok45.MODEL_VENDOR_NAME),
                    sql_quote(grok45.MODEL_VENDOR_DESCRIPTION),
                    sql_quote(grok45.MODEL_VENDOR_ICON),
                    "1",
                    "@now",
                    "@now",
                ]
            )
            + " WHERE @grok_vendor_id IS NULL;",
            "SET @grok_vendor_id := IFNULL(@grok_vendor_id, LAST_INSERT_ID());",
            "UPDATE vendors SET description = "
            + sql_quote(grok45.MODEL_VENDOR_DESCRIPTION)
            + ", icon = "
            + sql_quote(grok45.MODEL_VENDOR_ICON)
            + ", status = 1, updated_time = @now, deleted_at = NULL WHERE id = @grok_vendor_id;",
            "SET @grok46_model_id := (SELECT MIN(id) FROM models WHERE model_name = @grok46_model AND deleted_at IS NULL);",
            "SET @grok46_model_id := IFNULL(@grok46_model_id, (SELECT MIN(id) FROM models WHERE model_name = @grok46_model));",
            "INSERT INTO models "
            "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) SELECT "
            + ", ".join(
                [
                    "@grok46_model",
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
            + " WHERE @grok46_model_id IS NULL;",
            "SET @grok46_model_id := IFNULL(@grok46_model_id, LAST_INSERT_ID());",
            "UPDATE models SET description = "
            + sql_quote(MODEL_DESCRIPTION)
            + ", icon = 'XAI', tags = "
            + sql_quote(MODEL_TAGS)
            + ", vendor_id = @grok_vendor_id, endpoints = "
            + sql_quote(MODEL_ENDPOINTS)
            + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
            "WHERE id = @grok46_model_id;",
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            "WHERE model_name = @grok46_model AND id <> @grok46_model_id;",
            "SET @grok46_channel_id := (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG) + ");",
            "INSERT INTO channels "
            "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) SELECT "
            + ", ".join(
                [
                    "1",
                    sql_quote(key),
                    "1",
                    sql_quote(CHANNEL_NAME),
                    "100",
                    "@now",
                    "0",
                    "0",
                    sql_quote(normalized),
                    sql_quote(MODEL_NAME),
                    sql_quote(grok45.PRICING_GROUP),
                    sql_quote(mapping),
                    str(CHANNEL_PRIORITY),
                    "1",
                    sql_quote(CHANNEL_TAG),
                    sql_quote(CHANNEL_REMARK),
                ]
            )
            + " WHERE @grok46_channel_id IS NULL;",
            "SET @grok46_channel_id := IFNULL(@grok46_channel_id, LAST_INSERT_ID());",
            "UPDATE channels SET type = 1, `key` = "
            + sql_quote(key)
            + ", status = 1, name = "
            + sql_quote(CHANNEL_NAME)
            + ", weight = 100, base_url = "
            + sql_quote(normalized)
            + ", models = "
            + sql_quote(MODEL_NAME)
            + ", `group` = "
            + sql_quote(grok45.PRICING_GROUP)
            + ", model_mapping = "
            + sql_quote(mapping)
            + ", priority = "
            + str(CHANNEL_PRIORITY)
            + ", auto_ban = 1, tag = "
            + sql_quote(CHANNEL_TAG)
            + ", remark = "
            + sql_quote(CHANNEL_REMARK)
            + " WHERE id = @grok46_channel_id;",
            "UPDATE abilities SET enabled = 0 WHERE model = "
            + sql_quote(MODEL_NAME)
            + " AND channel_id <> @grok46_channel_id;",
            "UPDATE abilities SET enabled = 0 WHERE channel_id = @grok46_channel_id;",
            "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
            + ", ".join(
                [
                    sql_quote(grok45.PRICING_GROUP),
                    sql_quote(MODEL_NAME),
                    "@grok46_channel_id",
                    "1",
                    str(CHANNEL_PRIORITY),
                    "100",
                    sql_quote(CHANNEL_TAG),
                ]
            )
            + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = "
            + str(CHANNEL_PRIORITY)
            + ", weight = 100, tag = "
            + sql_quote(CHANNEL_TAG)
            + ";",
            "COMMIT;",
        ]
    )
    return "\n".join(statements)


def validate_channel_isolation() -> None:
    rows = grok45.mysql("SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG))
    if (int(rows[0][0]) if rows else 0) > 1:
        raise ConfigurationError("multiple channels use the reserved Grok 4.6 isolation tag")
    rows = grok45.mysql(
        "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') <> "
        + sql_quote(CHANNEL_TAG)
        + " AND FIND_IN_SET("
        + sql_quote(MODEL_NAME)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
        + " AND FIND_IN_SET("
        + sql_quote(grok45.PRICING_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0"
    )
    if (int(rows[0][0]) if rows else 0) > 0:
        raise ConfigurationError("the Grok 4.6 model is assigned to another Grok channel")


def apply_grok46(api_key: str, base_url: str) -> None:
    validate_channel_isolation()
    options, exchange_rate = grok45.load_options()
    grok45.mysql_exec(build_apply_sql(api_key, base_url, options, exchange_rate))


def load_existing_channel() -> tuple[str, str] | None:
    rows = grok45.mysql(
        "SELECT COALESCE(`key`, ''), COALESCE(base_url, '') FROM channels WHERE tag = "
        + sql_quote(CHANNEL_TAG)
        + " ORDER BY id"
    )
    if not rows:
        return None
    if len(rows) != 1 or len(rows[0]) != 2:
        raise ConfigurationError("the configured Grok 4.6 channel is ambiguous")
    return validate_upstream_key(rows[0][0]), normalize_base_url(rows[0][1])


def emit_result(action: str) -> None:
    print(json.dumps({"ok": True, "action": action, "model": MODEL_NAME}, ensure_ascii=False, separators=(",", ":")))


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely configure the isolated Grok 4.6 model")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true", help="validate and write the Grok 4.6 model configuration")
    action.add_argument(
        "--reconcile-if-configured",
        action="store_true",
        help="verify and reapply only when the managed Grok 4.6 channel already exists",
    )
    args = parser.parse_args()

    if args.reconcile_if_configured:
        with model_sync_lock():
            configured = load_existing_channel()
            if configured is None:
                emit_result("not_configured")
                return 0
            verify_upstream(configured[1], configured[0])
            apply_grok46(configured[0], configured[1])
        emit_result("reconciled")
        return 0

    api_key = validate_upstream_key(os.environ.get(UPSTREAM_KEY_ENV, ""), env_name=UPSTREAM_KEY_ENV)
    if args.apply:
        with model_sync_lock():
            verify_upstream(EXPECTED_UPSTREAM_BASE_URL, api_key)
            apply_grok46(api_key, EXPECTED_UPSTREAM_BASE_URL)
    else:
        verify_upstream(EXPECTED_UPSTREAM_BASE_URL, api_key)
    emit_result("applied" if args.apply else "probe")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ConfigurationError, grok45.ConfigurationError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
