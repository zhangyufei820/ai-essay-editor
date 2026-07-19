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


EXPECTED_BASE_URL = "https://new.ddpapi.top"
BASE_URL_ENV = "GEMINI_DDPAPI_BASE_URL"
STAGING_GROUP = "internal"
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MAX_MODELS_RESPONSE_BYTES = 2 * 1024 * 1024
CHANNEL_CONFIGS = {
    "gemini-3.1-flash-image": {
        "key_env": "GEMINI_DDPAPI_FLASH_API_KEY",
        "channel_name": "星人 Gemini 3.1 Flash 图像通道",
        "channel_tag": "xingren-gemini31-flash-image-ddpapi",
        "price_cny": Decimal("0.10"),
    },
    "gemini-3-pro-image": {
        "key_env": "GEMINI_DDPAPI_PRO_API_KEY",
        "channel_name": "星人 Gemini 3 Pro 图像通道",
        "channel_tag": "xingren-gemini3-pro-image-ddpapi",
        "price_cny": Decimal("0.15"),
    },
}


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
        raise ConfigurationError("the configured Gemini image endpoint is not permitted")
    return EXPECTED_BASE_URL


def validate_api_key(value: str, env_name: str) -> str:
    key = value.strip()
    if len(key) < 20 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{env_name} is missing or invalid")
    return key


def fetch_upstream_models(base_url: str, api_key: str, env_name: str) -> set[str]:
    request = urllib.request.Request(
        normalize_base_url(base_url) + "/v1/models",
        headers={
            "Authorization": "Bearer " + validate_api_key(api_key, env_name),
            "Accept": "application/json",
            "User-Agent": "shenxiang-new-api-gemini-image-model-probe/1.0",
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
    for model, config in CHANNEL_CONFIGS.items():
        price_cny = config["price_cny"]
        if not isinstance(price_cny, Decimal):
            raise ConfigurationError("Gemini image price must be Decimal")
        model_prices[model] = float(
            (price_cny / exchange_rate).quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP)
        )
        model_ratios.pop(model, None)
        completion_ratios.pop(model, None)
    return {
        "ModelPrice": model_prices,
        "ModelRatio": model_ratios,
        "CompletionRatio": completion_ratios,
    }


def append_model_limits(raw_limits: str) -> str:
    models = permissions.sanitize_token_models(
        [item.strip() for item in raw_limits.split(",") if item.strip()]
    )
    for model in CHANNEL_CONFIGS:
        if model not in models:
            models.append(model)
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
    for model, config in CHANNEL_CONFIGS.items():
        channel_tag = str(config["channel_tag"])
        rows = permissions.mysql(
            "SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(channel_tag)
        )
        if (int(rows[0][0]) if rows else 0) > 1:
            raise ConfigurationError("multiple channels use a managed Gemini image tag")
        rows = permissions.mysql(
            "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') <> "
            + sql_quote(channel_tag)
            + " AND FIND_IN_SET("
            + sql_quote(model)
            + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
        )
        if (int(rows[0][0]) if rows else 0) > 0:
            raise ConfigurationError("a managed Gemini image model is assigned to another channel")


def build_stage_sql(
    api_keys: dict[str, str],
    base_url: str,
    options: dict[str, dict[str, float]],
    token_id: str,
    token_limits: str,
) -> str:
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    for index, (model, config) in enumerate(CHANNEL_CONFIGS.items()):
        variable = f"@gemini_image_channel_{index}"
        channel_tag = str(config["channel_tag"])
        key_env = str(config["key_env"])
        channel_name = str(config["channel_name"])
        price_cny = config["price_cny"]
        api_key = validate_api_key(api_keys.get(model, ""), key_env)
        statements.extend(
            [
                f"SET {variable} := (SELECT MIN(id) FROM channels WHERE tag = {sql_quote(channel_tag)});",
                "INSERT INTO channels "
                "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) SELECT "
                + ", ".join(
                    [
                        "1",
                        sql_quote(api_key),
                        "1",
                        sql_quote(channel_name),
                        "100",
                        "@now",
                        "0",
                        "0",
                        sql_quote(normalize_base_url(base_url)),
                        sql_quote(model),
                        sql_quote(STAGING_GROUP),
                        sql_quote("{}"),
                        "0",
                        "1",
                        sql_quote(channel_tag),
                        sql_quote(f"Gemini 图片线路；人民币 ¥{price_cny}/张"),
                    ]
                )
                + f" WHERE {variable} IS NULL;",
                f"SET {variable} := IFNULL({variable}, LAST_INSERT_ID());",
                "UPDATE channels SET type = 1, `key` = "
                + sql_quote(api_key)
                + ", status = 1, name = "
                + sql_quote(channel_name)
                + ", weight = 100, base_url = "
                + sql_quote(normalize_base_url(base_url))
                + ", models = "
                + sql_quote(model)
                + ", `group` = 'internal', model_mapping = '{}', priority = 0, auto_ban = 1, tag = "
                + sql_quote(channel_tag)
                + ", remark = "
                + sql_quote(f"Gemini 图片线路；人民币 ¥{price_cny}/张")
                + f" WHERE id = {variable};",
                f"UPDATE abilities SET enabled = 0 WHERE channel_id = {variable};",
                "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
                + ", ".join(
                    [
                        sql_quote(STAGING_GROUP),
                        sql_quote(model),
                        variable,
                        "1",
                        "0",
                        "100",
                        sql_quote(channel_tag),
                    ]
                )
                + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = 0, weight = 100, tag = VALUES(tag);",
            ]
        )
    statements.append(
        "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
        + sql_quote(append_model_limits(token_limits))
        + " WHERE id = "
        + str(int(token_id))
        + " AND user_id = 1;"
    )
    for key in ("ModelPrice", "ModelRatio", "CompletionRatio"):
        statements.append(option_sql(key, options[key]))
    statements.append("COMMIT;")
    return "\n".join(statements)


def require_staged_channels_ready() -> None:
    rows = permissions.mysql_raw(
        "SELECT COALESCE(tag, ''), status, CHAR_LENGTH(COALESCE(`key`, '')), COALESCE(base_url, ''), "
        "REPLACE(COALESCE(`group`, ''), ' ', ''), REPLACE(COALESCE(models, ''), ' ', '') "
        "FROM channels WHERE tag IN ("
        + ", ".join(sql_quote(str(config["channel_tag"])) for config in CHANNEL_CONFIGS.values())
        + ") ORDER BY tag"
    )
    expected_by_tag = {
        str(config["channel_tag"]): model for model, config in CHANNEL_CONFIGS.items()
    }
    if len(rows) != len(CHANNEL_CONFIGS):
        raise ConfigurationError("the staged Gemini image channels are incomplete")
    for tag, status, key_length, base_url, groups, models in rows:
        if (
            status != "1"
            or int(key_length or "0") < 20
            or groups != STAGING_GROUP
            or models != expected_by_tag.get(tag)
        ):
            raise ConfigurationError("a staged Gemini image channel is published, disabled, or incomplete")
        normalize_base_url(base_url)


def stage(api_keys: dict[str, str], base_url: str) -> None:
    validate_channel_isolation()
    for model, config in CHANNEL_CONFIGS.items():
        key_env = str(config["key_env"])
        api_key = validate_api_key(api_keys.get(model, ""), key_env)
        if model not in fetch_upstream_models(base_url, api_key, key_env):
            raise ConfigurationError("required upstream Gemini image model is unavailable")
    token_id, token_key, token_limits = admin_image_token()
    permissions.ensure_gemini_ddpapi_image_models()
    permissions.mysql_exec(
        build_stage_sql(api_keys, base_url, staging_price_options(), token_id, token_limits)
    )
    permissions.delete_token_caches([token_key])


def publish() -> dict[str, int]:
    validate_channel_isolation()
    require_staged_channels_ready()
    tags = ", ".join(sql_quote(str(config["channel_tag"])) for config in CHANNEL_CONFIGS.values())
    try:
        permissions.mysql_exec(
            "UPDATE channels SET status = 1, `group` = "
            + sql_quote(permissions.GEMINI_DDPAPI_PUBLIC_CHANNEL_GROUPS)
            + " WHERE tag IN ("
            + tags
            + ") AND status = 1 AND REPLACE(COALESCE(`group`, ''), ' ', '') = 'internal';"
        )
        if permissions.gemini_ddpapi_release_state() != "published":
            raise ConfigurationError("the Gemini image channels did not enter the published state")
        permissions.ensure_gemini_ddpapi_image_models()
        permissions.sync_public_image_pricing()
        profiles = permissions.model_lists()
        if any(model not in profiles["image"] for model in CHANNEL_CONFIGS):
            raise ConfigurationError("the public image profile did not include both Gemini models")
        permissions.sync_abilities()
        return permissions.sync_user_image_tokens(profiles)
    except Exception:
        try:
            permissions.mysql_exec(
                "UPDATE channels SET `group` = 'internal' WHERE tag IN (" + tags + ");"
            )
            permissions.sync_abilities()
        except Exception:
            raise ConfigurationError("publishing failed and staged rollback could not be verified") from None
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure isolated Gemini DDPAPI image channels")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--stage", action="store_true")
    action.add_argument("--publish", action="store_true")
    parser.add_argument("--base-url", default=os.environ.get(BASE_URL_ENV, EXPECTED_BASE_URL))
    args = parser.parse_args()
    try:
        with open(MODEL_SYNC_LOCK_PATH, "a+", encoding="utf-8") as lock_file:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ConfigurationError("another model synchronization is already running") from None
            if args.stage:
                base_url = normalize_base_url(args.base_url)
                api_keys = {}
                for model, config in CHANNEL_CONFIGS.items():
                    key_env = str(config["key_env"])
                    raw_key = os.environ.get(key_env, "") or getpass.getpass(f"{key_env}: ")
                    api_keys[model] = validate_api_key(raw_key, key_env)
                stage(api_keys, base_url)
                result = {"ok": True, "action": "staged", "models": list(CHANNEL_CONFIGS), "scope": "internal"}
            else:
                token_result = publish()
                result = {"ok": True, "action": "published", "models": list(CHANNEL_CONFIGS), **token_result}
    except ConfigurationError as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, separators=(",", ":")))
        return 1
    except (KeyError, OSError, RuntimeError, TypeError, ValueError):
        print(json.dumps({"ok": False, "error": "Gemini image channel configuration failed"}, ensure_ascii=False, separators=(",", ":")))
        return 1
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
