#!/usr/bin/env python3
"""Configure the guarded 0.25x discount text routing order."""
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
from collections.abc import Iterator


DISCOUNT_GROUP = "discount"
EXPECTED_GROUP_RATIO = 0.25
PRIMARY_TAG = "xingren-discount-text-pdhlzy"
# The previous pdhlzy circuit did not carry gpt-5.5 and was disabled. Reuse
# that exact channel record so this migration does not leave a duplicate
# provider channel behind.
LEGACY_PRIMARY_TAG = "xingren-discount-text-aihub-fallback"
FALLBACKS = (
    ("xingren-discount-text-geek2api", 30),
    ("xingren-discount-text-aihub", 20),
    ("xingren-discount-text-wangwang", 10),
)
PRIMARY_PRIORITY = 40
MODELS = ("gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra")
PRIMARY_NAME = "星人特价文本主链路"
PRIMARY_KEY_ENV = "DISCOUNT_PRIMARY_UPSTREAM_API_KEY"
PRIMARY_BASE_URL_ENV = "DISCOUNT_PRIMARY_UPSTREAM_BASE_URL"
DEFAULT_UPSTREAM_BASE_URL = "https://pdhlzy.art"
DEFAULT_UPSTREAM_HOST = "pdhlzy.art"
EXPECTED_RETRY_TIMES = 3
LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"


class ConfigurationError(RuntimeError):
    pass


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def normalize_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    try:
        parsed = urllib.parse.urlsplit(normalized)
        port = parsed.port
    except ValueError:
        raise ConfigurationError("primary upstream base URL is invalid") from None
    if parsed.scheme != "https" or parsed.hostname != DEFAULT_UPSTREAM_HOST or port not in {None, 443}:
        raise ConfigurationError("primary upstream must use the approved HTTPS host")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ConfigurationError("primary upstream URL must not include credentials or a path")
    return normalized


def require_key() -> str:
    key = os.environ.get(PRIMARY_KEY_ENV, "").strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{PRIMARY_KEY_ENV} is missing or invalid")
    return key


@contextlib.contextmanager
def shared_lock() -> Iterator[None]:
    fd = os.open(LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ConfigurationError("model permission sync is running; retry after it finishes") from None
        yield
    finally:
        os.close(fd)


def fetch_models(base_url: str, api_key: str) -> set[str]:
    request = urllib.request.Request(
        base_url + "/v1/models",
        headers={"Authorization": "Bearer " + api_key, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read(5 * 1024 * 1024 + 1)
        payload = json.loads(body)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise ConfigurationError("primary upstream model probe failed") from None
    data = payload.get("data") if isinstance(payload, dict) else None
    ids = {
        item.get("id")
        for item in data
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    } if isinstance(data, list) else set()
    missing = [model for model in MODELS if model not in ids]
    if missing:
        raise ConfigurationError("primary upstream is missing required models: " + ",".join(missing))
    return ids


def mysql_exec(query: str) -> list[str]:
    password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE", "")
    if not password or not database:
        raise ConfigurationError("production MySQL environment is not loaded")
    env = os.environ.copy()
    env["MYSQL_PWD"] = password
    command = [
        "docker", "exec", "-i", "-e", "MYSQL_PWD", "shenxiang-new-api-mysql", "mysql",
        "--default-character-set=utf8mb4", "--raw", "-N", "-B", "-uroot", database,
    ]
    try:
        result = subprocess.run(
            command,
            input=query.encode("utf-8"),
            env=env,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        raise ConfigurationError("production MySQL update failed") from None
    return result.stdout.decode("utf-8", errors="strict").splitlines()


def build_apply_sql(api_key: str, base_url: str) -> str:
    tags = (PRIMARY_TAG, LEGACY_PRIMARY_TAG, *(tag for tag, _priority in FALLBACKS))
    tags_sql = ",".join(sql_quote(tag) for tag in tags)
    models_sql = ",".join(sql_quote(model) for model in MODELS)
    models = ",".join(MODELS)
    mapping = json.dumps({model: model for model in MODELS}, separators=(",", ":"))
    fallback_ids = ",".join(
        "IFNULL((SELECT MIN(id) FROM channels WHERE tag=" + sql_quote(tag) + "),-1)"
        for tag, _priority in FALLBACKS
    )
    statements = [
        "START TRANSACTION;",
        "SELECT `value` FROM options WHERE `key` IN ('GroupRatio', 'RetryTimes') FOR UPDATE;",
        "SELECT id FROM channels WHERE tag IN (" + tags_sql + ") FOR UPDATE;",
        "SET @ratio_ok := JSON_EXTRACT((SELECT `value` FROM options WHERE `key` = 'GroupRatio'), '$.discount') = " + str(EXPECTED_GROUP_RATIO) + ";",
        "SET @retry_option_count := (SELECT COUNT(*) FROM options WHERE `key` = 'RetryTimes');",
        "SET @primary_count := (SELECT COUNT(*) FROM channels WHERE tag IN (" + sql_quote(PRIMARY_TAG) + "," + sql_quote(LEGACY_PRIMARY_TAG) + "));",
        "SET @fallback_count := (SELECT COUNT(*) FROM channels WHERE tag IN (" + ",".join(sql_quote(tag) for tag, _ in FALLBACKS) + ") AND status = 1 AND REPLACE(COALESCE(`group`, ''), ' ', '') = 'discount' AND REPLACE(COALESCE(models, ''), ' ', '') = " + sql_quote(models) + ");",
        "SET @route_apply_status := CASE WHEN @ratio_ok <> 1 THEN 'group_ratio_invalid' WHEN @retry_option_count <> 1 THEN 'retry_option_invalid' WHEN @primary_count > 1 THEN 'primary_duplicate' WHEN @fallback_count <> " + str(len(FALLBACKS)) + " THEN 'fallback_invalid' ELSE 'ok' END;",
        "SET @route_apply_allowed := IF(@route_apply_status = 'ok', 1, 0);",
        "SET @primary_id := (SELECT MIN(id) FROM channels WHERE tag IN (" + sql_quote(PRIMARY_TAG) + "," + sql_quote(LEGACY_PRIMARY_TAG) + "));",
        "INSERT INTO channels (type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) SELECT 1," + sql_quote(api_key) + ",1," + sql_quote(PRIMARY_NAME) + ",100,UNIX_TIMESTAMP(),0,0," + sql_quote(base_url) + "," + sql_quote(models) + ",'discount'," + sql_quote(mapping) + "," + str(PRIMARY_PRIORITY) + ",1," + sql_quote(PRIMARY_TAG) + ",'0.25x text primary' WHERE @primary_id IS NULL AND @route_apply_allowed = 1;",
        "SET @primary_id := IF(@route_apply_allowed = 1, IFNULL(@primary_id, LAST_INSERT_ID()), NULL);",
        "UPDATE channels SET type=1, `key`=" + sql_quote(api_key) + ", status=1, name=" + sql_quote(PRIMARY_NAME) + ", weight=100, base_url=" + sql_quote(base_url) + ", models=" + sql_quote(models) + ", `group`='discount', model_mapping=" + sql_quote(mapping) + ", priority=" + str(PRIMARY_PRIORITY) + ", auto_ban=1, tag=" + sql_quote(PRIMARY_TAG) + " WHERE id=@primary_id AND @route_apply_allowed=1;",
        "UPDATE options SET `value`=" + sql_quote(str(EXPECTED_RETRY_TIMES)) + " WHERE `key`='RetryTimes' AND @route_apply_allowed=1;",
        *[
            "UPDATE channels SET priority=" + str(priority) + " WHERE tag=" + sql_quote(tag) + " AND @route_apply_allowed=1;"
            for tag, priority in FALLBACKS
        ],
        "UPDATE abilities SET enabled=0 WHERE `group`='discount' AND model IN (" + models_sql + ") AND channel_id NOT IN (@primary_id," + fallback_ids + ") AND @route_apply_allowed=1;",
    ]
    for tag, priority in ((PRIMARY_TAG, PRIMARY_PRIORITY), *FALLBACKS):
        channel_id = "@primary_id" if tag == PRIMARY_TAG else "(SELECT id FROM channels WHERE tag=" + sql_quote(tag) + ")"
        for model in MODELS:
            statements.append(
                "INSERT INTO abilities (`group`,model,channel_id,enabled,priority,weight,tag) SELECT 'discount'," + sql_quote(model) + "," + channel_id + ",1," + str(priority) + ",100," + sql_quote(tag) + " WHERE @route_apply_allowed=1 ON DUPLICATE KEY UPDATE enabled=1,priority=VALUES(priority),weight=100,tag=VALUES(tag);"
            )
    statements.extend([
        "COMMIT;",
        "SELECT CONCAT('route_apply_status=', @route_apply_status);",
        "SELECT CONCAT('primary_channel_id=', IFNULL(@primary_id, ''));",
        "SELECT CONCAT('retry_times=', (SELECT `value` FROM options WHERE `key`='RetryTimes'));",
    ])
    return "\n".join(statements)


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the 0.25x discount text primary and fallbacks")
    parser.add_argument("--apply", action="store_true", help="persist the validated route")
    args = parser.parse_args()
    base_url = normalize_base_url(os.environ.get(PRIMARY_BASE_URL_ENV, DEFAULT_UPSTREAM_BASE_URL))
    key = require_key()
    upstream_models = fetch_models(base_url, key)
    primary_id = ""
    if args.apply:
        with shared_lock():
            output = mysql_exec(build_apply_sql(key, base_url))
        status = next((line.removeprefix("route_apply_status=") for line in output if line.startswith("route_apply_status=")), "")
        if status != "ok":
            raise ConfigurationError("route apply failed closed: " + (status or "missing_status"))
        primary_id = next((line.removeprefix("primary_channel_id=") for line in output if line.startswith("primary_channel_id=")), "")
    print(json.dumps({"ok": True, "action": "applied" if args.apply else "probe", "required_models": MODELS, "upstream_model_count": len(upstream_models), "primary_channel_id": primary_id}, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
