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

import sync_app_model_permissions as permissions


EXPECTED_BASE_URL = "https://moonapix.com"
BASE_URL_ENV = "GPT_IMAGE25_BASE_URL"
API_KEY_ENV = "GPT_IMAGE25_UPSTREAM_API_KEY"
STAGING_GROUP = "internal"
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MAX_MODELS_RESPONSE_BYTES = 2 * 1024 * 1024
CHANNEL_NAME = "星人 GPT Image 2.5 图像通道"
CHANNEL_REMARK = "GPT Image 2.5 图像线路；人民币 ¥0.17/张"


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
        raise ConfigurationError("the configured GPT Image 2.5 endpoint is not permitted")
    return EXPECTED_BASE_URL


def validate_api_key(value: str) -> str:
    key = value.strip()
    if len(key) < 20 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{API_KEY_ENV} is missing or invalid")
    return key


def fetch_upstream_models(base_url: str, api_key: str) -> set[str]:
    request = urllib.request.Request(
        normalize_base_url(base_url) + "/v1/models",
        headers={
            "Authorization": "Bearer " + validate_api_key(api_key),
            "Accept": "application/json",
            "User-Agent": "shenxiang-new-api-gpt-image25-model-probe/1.0",
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


def append_model_limits(raw_limits: str) -> str:
    models = permissions.sanitize_token_models(
        [item.strip() for item in raw_limits.split(",") if item.strip()]
    )
    for model in permissions.GPT_IMAGE25_MODELS:
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
    rows = permissions.mysql(
        "SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(permissions.GPT_IMAGE25_CHANNEL_TAG)
    )
    if (int(rows[0][0]) if rows else 0) > 1:
        raise ConfigurationError("multiple channels use the managed GPT Image 2.5 tag")
    for model in permissions.GPT_IMAGE25_MODELS:
        rows = permissions.mysql(
            "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') <> "
            + sql_quote(permissions.GPT_IMAGE25_CHANNEL_TAG)
            + " AND FIND_IN_SET("
            + sql_quote(model)
            + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
        )
        if (int(rows[0][0]) if rows else 0) > 0:
            raise ConfigurationError("a managed GPT Image 2.5 model is assigned to another channel")


def build_stage_sql(api_key: str, base_url: str, token_id: str, token_limits: str) -> str:
    models = ",".join(permissions.GPT_IMAGE25_MODELS)
    tag = permissions.GPT_IMAGE25_CHANNEL_TAG
    statements = [
        "START TRANSACTION;",
        "SET @now := UNIX_TIMESTAMP();",
        "SET @gpt_image25_channel := (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(tag) + ");",
        "INSERT INTO channels "
        "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) SELECT "
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
                sql_quote(models),
                sql_quote(STAGING_GROUP),
                sql_quote("{}"),
                "0",
                "1",
                sql_quote(tag),
                sql_quote(CHANNEL_REMARK),
            ]
        )
        + " WHERE @gpt_image25_channel IS NULL;",
        "SET @gpt_image25_channel := IFNULL(@gpt_image25_channel, LAST_INSERT_ID());",
        "UPDATE channels SET type = 1, `key` = "
        + sql_quote(validate_api_key(api_key))
        + ", status = 1, name = "
        + sql_quote(CHANNEL_NAME)
        + ", weight = 100, base_url = "
        + sql_quote(normalize_base_url(base_url))
        + ", models = "
        + sql_quote(models)
        + ", `group` = 'internal', model_mapping = '{}', priority = 0, auto_ban = 1, tag = "
        + sql_quote(tag)
        + ", remark = "
        + sql_quote(CHANNEL_REMARK)
        + " WHERE id = @gpt_image25_channel;",
        "UPDATE abilities SET enabled = 0 WHERE channel_id = @gpt_image25_channel;",
    ]
    for model in permissions.GPT_IMAGE25_MODELS:
        statements.append(
            "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
            + ", ".join(
                [
                    sql_quote(STAGING_GROUP),
                    sql_quote(model),
                    "@gpt_image25_channel",
                    "1",
                    "0",
                    "100",
                    sql_quote(tag),
                ]
            )
            + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = 0, weight = 100, tag = VALUES(tag);"
        )
    statements.extend(
        [
            "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
            + sql_quote(append_model_limits(token_limits))
            + " WHERE id = "
            + str(int(token_id))
            + " AND user_id = 1;",
            "COMMIT;",
        ]
    )
    return "\n".join(statements)


def require_staged_channel_ready() -> None:
    rows = permissions.mysql_raw(
        "SELECT status, CHAR_LENGTH(COALESCE(`key`, '')), COALESCE(base_url, ''), "
        "REPLACE(COALESCE(`group`, ''), ' ', ''), REPLACE(COALESCE(models, ''), ' ', '') "
        "FROM channels WHERE tag = "
        + sql_quote(permissions.GPT_IMAGE25_CHANNEL_TAG)
    )
    if len(rows) != 1:
        raise ConfigurationError("the staged GPT Image 2.5 channel is incomplete")
    status, key_length, base_url, groups, models = rows[0]
    if (
        status != "1"
        or int(key_length or "0") < 20
        or groups != STAGING_GROUP
        or models != ",".join(permissions.GPT_IMAGE25_MODELS)
    ):
        raise ConfigurationError("the staged GPT Image 2.5 channel is published, disabled, or incomplete")
    normalize_base_url(base_url)


def stage(api_key: str, base_url: str) -> None:
    validate_channel_isolation()
    available_models = fetch_upstream_models(base_url, api_key)
    if any(model not in available_models for model in permissions.GPT_IMAGE25_MODELS):
        raise ConfigurationError("a required upstream GPT Image 2.5 model is unavailable")
    token_id, token_key, token_limits = admin_image_token()
    permissions.ensure_gpt_image25_models()
    permissions.mysql_exec(build_stage_sql(api_key, base_url, token_id, token_limits))
    permissions.sync_public_image_pricing()
    permissions.delete_token_caches([token_key])


def publish() -> dict[str, int]:
    validate_channel_isolation()
    require_staged_channel_ready()
    try:
        permissions.mysql_exec(
            "UPDATE channels SET status = 1, `group` = "
            + sql_quote(permissions.GPT_IMAGE25_PUBLIC_CHANNEL_GROUPS)
            + " WHERE tag = "
            + sql_quote(permissions.GPT_IMAGE25_CHANNEL_TAG)
            + " AND status = 1 AND REPLACE(COALESCE(`group`, ''), ' ', '') = 'internal';"
        )
        if permissions.gpt_image25_release_state() != "published":
            raise ConfigurationError("the GPT Image 2.5 channel did not enter the published state")
        permissions.ensure_gpt_image25_models()
        permissions.sync_public_image_pricing()
        profiles = permissions.model_lists()
        if any(model not in profiles["image"] for model in permissions.GPT_IMAGE25_MODELS):
            raise ConfigurationError("the public image profile did not include both GPT Image 2.5 models")
        permissions.sync_abilities()
        return permissions.sync_user_image_tokens(profiles)
    except Exception:
        try:
            permissions.mysql_exec(
                "UPDATE channels SET `group` = 'internal' WHERE tag = "
                + sql_quote(permissions.GPT_IMAGE25_CHANNEL_TAG)
                + ";"
            )
            permissions.sync_abilities()
        except Exception:
            raise ConfigurationError("publishing failed and staged rollback could not be verified") from None
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the isolated GPT Image 2.5 channel")
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
                raw_key = os.environ.get(API_KEY_ENV, "") or getpass.getpass(f"{API_KEY_ENV}: ")
                stage(validate_api_key(raw_key), base_url)
                result = {
                    "ok": True,
                    "action": "staged",
                    "models": list(permissions.GPT_IMAGE25_MODELS),
                    "scope": "internal",
                }
            else:
                token_result = publish()
                result = {
                    "ok": True,
                    "action": "published",
                    "models": list(permissions.GPT_IMAGE25_MODELS),
                    **token_result,
                }
    except ConfigurationError as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, separators=(",", ":")))
        return 1
    except (KeyError, OSError, RuntimeError, TypeError, ValueError):
        print(json.dumps({"ok": False, "error": "GPT Image 2.5 channel configuration failed"}, separators=(",", ":")))
        return 1
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
