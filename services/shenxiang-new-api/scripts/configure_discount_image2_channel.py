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


PUBLIC_MODEL = permissions.DISCOUNT_IMAGE2_PUBLIC_MODEL
INTERNAL_MODEL = permissions.INTERNAL_DISCOUNT_IMAGE2_MODEL
UPSTREAM_MODEL = permissions.RAW_GPT_IMAGE2_MODEL
CHANNEL_TAG = permissions.DISCOUNT_IMAGE2_CHANNEL_TAG
CHANNEL_GROUPS = permissions.DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS
STAGING_GROUP = "internal"
CHANNEL_NAME = "星人 Image 2 特价通道"
EXPECTED_BASE_URL = "https://new.ddpapi.top"
UPSTREAM_KEY_ENV = "DISCOUNT_IMAGE2_UPSTREAM_API_KEY"
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MAX_MODELS_RESPONSE_BYTES = 2 * 1024 * 1024


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
    parsed = urllib.parse.urlsplit(value.strip().rstrip("/"))
    expected = urllib.parse.urlsplit(EXPECTED_BASE_URL)
    if (
        parsed.scheme != "https"
        or parsed.hostname != expected.hostname
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise ConfigurationError("the configured image endpoint is not permitted")
    return EXPECTED_BASE_URL


def validate_api_key(value: str) -> str:
    key = value.strip()
    if len(key) < 20 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{UPSTREAM_KEY_ENV} is missing or invalid")
    return key


def fetch_upstream_models(base_url: str, api_key: str) -> set[str]:
    request = urllib.request.Request(
        normalize_base_url(base_url) + "/v1/models",
        headers={
            "Authorization": "Bearer " + validate_api_key(api_key),
            "Accept": "application/json",
            "User-Agent": "shenxiang-new-api-image2-model-probe/1.0",
        },
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(request, timeout=30) as response:
            body = response.read(MAX_MODELS_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise ConfigurationError(f"upstream model probe returned HTTP {error.code}") from None
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
        (permissions.DISCOUNT_IMAGE2_BASE_PRICE_CNY / exchange_rate).quantize(
            Decimal("0.000000000001"),
            rounding=ROUND_HALF_UP,
        )
    )
    model_ratios.pop(PUBLIC_MODEL, None)
    completion_ratios.pop(PUBLIC_MODEL, None)
    return {
        "ModelPrice": model_prices,
        "ModelRatio": model_ratios,
        "CompletionRatio": completion_ratios,
    }


def append_model_limit(raw_limits: str) -> str:
    models = permissions.sanitize_token_models(
        [item.strip() for item in raw_limits.split(",") if item.strip()]
    )
    if PUBLIC_MODEL not in models:
        models.append(PUBLIC_MODEL)
    return ",".join(models)


def admin_image_token() -> tuple[str, str, str]:
    rows = permissions.mysql_raw(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND user_id = 1 AND name = '星人图像生成令牌' ORDER BY id"
    )
    if len(rows) != 1 or len(rows[0]) != 3 or not rows[0][1]:
        raise ConfigurationError("the admin image system token is missing or ambiguous")
    return rows[0][0], rows[0][1], rows[0][2]


def validate_channel_isolation() -> None:
    rows = permissions.mysql(
        "SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG)
    )
    if (int(rows[0][0]) if rows else 0) > 1:
        raise ConfigurationError("multiple channels use the managed image tag")
    rows = permissions.mysql(
        "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') <> "
        + sql_quote(CHANNEL_TAG)
        + " AND FIND_IN_SET("
        + sql_quote(INTERNAL_MODEL)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
    )
    if (int(rows[0][0]) if rows else 0) > 0:
        raise ConfigurationError("the managed image model is assigned to an unmanaged channel")


def build_stage_sql(
    api_key: str,
    base_url: str,
    options: dict[str, dict[str, float]],
    token_id: str,
    token_limits: str,
) -> str:
    mapping = json.dumps({INTERNAL_MODEL: UPSTREAM_MODEL}, separators=(",", ":"), sort_keys=True)
    statements = [
        "START TRANSACTION;",
        "SET @now := UNIX_TIMESTAMP();",
        "SET @managed_channel_id := (SELECT MIN(id) FROM channels WHERE tag = "
        + sql_quote(CHANNEL_TAG)
        + ");",
        "INSERT INTO channels "
        "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
        "SELECT "
        + ", ".join(
            [
                "1",
                sql_quote(validate_api_key(api_key)),
                "1",
                sql_quote(CHANNEL_NAME),
                "100",
                "@now",
                "0",
                "0",
                sql_quote(normalize_base_url(base_url)),
                sql_quote(INTERNAL_MODEL),
                sql_quote(STAGING_GROUP),
                sql_quote(mapping),
                "0",
                "1",
                sql_quote(CHANNEL_TAG),
                sql_quote("Image 2 特价线路；人民币 1K ¥0.06、2K ¥0.09、4K ¥0.10/张"),
            ]
        )
        + " WHERE @managed_channel_id IS NULL;",
        "SET @managed_channel_id := IFNULL(@managed_channel_id, LAST_INSERT_ID());",
        "UPDATE channels SET type = 1, `key` = "
        + sql_quote(validate_api_key(api_key))
        + ", status = 1, name = "
        + sql_quote(CHANNEL_NAME)
        + ", weight = 100, base_url = "
        + sql_quote(normalize_base_url(base_url))
        + ", models = "
        + sql_quote(INTERNAL_MODEL)
        + ", `group` = "
        + sql_quote(STAGING_GROUP)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", priority = 0, auto_ban = 1, tag = "
        + sql_quote(CHANNEL_TAG)
        + ", remark = 'Image 2 特价线路；人民币 1K ¥0.06、2K ¥0.09、4K ¥0.10/张' "
        "WHERE id = @managed_channel_id;",
        "SET @managed_model_id := (SELECT MIN(id) FROM models WHERE model_name = "
        + sql_quote(INTERNAL_MODEL)
        + " AND deleted_at IS NULL);",
        "INSERT INTO models "
        "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
        "SELECT "
        + ", ".join(
            [
                sql_quote(INTERNAL_MODEL),
                sql_quote(permissions.DISCOUNT_IMAGE2_DESCRIPTION),
                sql_quote("OpenAI"),
                sql_quote(permissions.DISCOUNT_IMAGE2_TAGS),
                "1",
                sql_quote(permissions.DISCOUNT_IMAGE2_ENDPOINTS),
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
        + sql_quote(permissions.DISCOUNT_IMAGE2_DESCRIPTION)
        + ", icon = 'OpenAI', tags = "
        + sql_quote(permissions.DISCOUNT_IMAGE2_TAGS)
        + ", vendor_id = 1, endpoints = "
        + sql_quote(permissions.DISCOUNT_IMAGE2_ENDPOINTS)
        + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
        "WHERE id = @managed_model_id;",
        "UPDATE abilities SET enabled = 0 WHERE channel_id = @managed_channel_id;",
        "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
        + ", ".join(
            [
                sql_quote(STAGING_GROUP),
                sql_quote(INTERNAL_MODEL),
                "@managed_channel_id",
                "1",
                "0",
                "100",
                sql_quote(CHANNEL_TAG),
            ]
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
    statements.append("COMMIT;")
    return "\n".join(statements)


def require_staged_channel_ready() -> None:
    rows = permissions.mysql_raw(
        "SELECT status, CHAR_LENGTH(COALESCE(`key`, '')), COALESCE(base_url, ''), "
        "REPLACE(COALESCE(`group`, ''), ' ', ''), REPLACE(COALESCE(models, ''), ' ', '') "
        "FROM channels WHERE tag = "
        + sql_quote(CHANNEL_TAG)
        + " ORDER BY id"
    )
    if (
        len(rows) != 1
        or rows[0][0] != "1"
        or int(rows[0][1] or "0") < 20
        or rows[0][3] != STAGING_GROUP
        or rows[0][4] != INTERNAL_MODEL
    ):
        raise ConfigurationError("the staged image channel is missing, published, disabled, or incomplete")
    normalize_base_url(rows[0][2])


def stage(api_key: str, base_url: str) -> None:
    validate_channel_isolation()
    if UPSTREAM_MODEL not in fetch_upstream_models(base_url, api_key):
        raise ConfigurationError("required upstream image model is unavailable")
    token_id, token_key, token_limits = admin_image_token()
    permissions.mysql_exec(
        build_stage_sql(api_key, base_url, staging_price_options(), token_id, token_limits)
    )
    permissions.delete_token_caches([token_key])


def publish() -> dict[str, int]:
    validate_channel_isolation()
    require_staged_channel_ready()
    try:
        permissions.mysql_exec(
            "UPDATE channels SET status = 1, `group` = "
            + sql_quote(CHANNEL_GROUPS)
            + " WHERE tag = "
            + sql_quote(CHANNEL_TAG)
            + " AND status = 1 AND REPLACE(COALESCE(`group`, ''), ' ', '') = 'internal' "
            "AND REPLACE(COALESCE(models, ''), ' ', '') = "
            + sql_quote(INTERNAL_MODEL)
            + ";"
        )
        if permissions.discount_image2_release_state() != "published":
            raise ConfigurationError("the image channel did not enter the published state")
        permissions.ensure_discount_image2_backing_model()
        permissions.sync_public_image_pricing()
        profiles = permissions.model_lists()
        if PUBLIC_MODEL not in profiles["image"]:
            raise ConfigurationError("the public image profile did not include the staged model")
        permissions.sync_abilities()
        return permissions.sync_user_image_tokens(profiles)
    except Exception:
        try:
            permissions.mysql_exec(
                "UPDATE channels SET `group` = 'internal' WHERE tag = "
                + sql_quote(CHANNEL_TAG)
                + ";"
            )
            permissions.sync_abilities()
        except Exception:
            raise ConfigurationError("publishing failed and staged rollback could not be verified") from None
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the isolated discount Image 2 channel")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--stage", action="store_true", help="create an internal-only channel and admin test permission")
    action.add_argument("--publish", action="store_true", help="publish the staged model to all groups and image tokens")
    parser.add_argument("--base-url", default=os.environ.get("DISCOUNT_IMAGE2_BASE_URL", ""))
    args = parser.parse_args()
    try:
        with open(MODEL_SYNC_LOCK_PATH, "a+", encoding="utf-8") as lock_file:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ConfigurationError("another model synchronization is already running") from None
            if args.stage:
                base_url = args.base_url or input("Upstream HTTPS origin: ").strip()
                api_key = os.environ.get(UPSTREAM_KEY_ENV, "") or getpass.getpass("Upstream API key: ")
                stage(validate_api_key(api_key), normalize_base_url(base_url))
                result = {"ok": True, "action": "staged", "model": PUBLIC_MODEL, "scope": "internal"}
            else:
                token_result = publish()
                result = {"ok": True, "action": "published", "model": PUBLIC_MODEL, **token_result}
    except ConfigurationError as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, separators=(",", ":")))
        return 1
    except (KeyError, OSError, RuntimeError, ValueError):
        print(json.dumps({"ok": False, "error": "model configuration failed"}, ensure_ascii=False, separators=(",", ":")))
        return 1
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
