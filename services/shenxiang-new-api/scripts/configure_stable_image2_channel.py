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


PUBLIC_MODEL = "官转image 2稳定"
INTERNAL_MODEL = "internal-image2-stable-v1"
UPSTREAM_MODEL = "gpt-image-2"
CHANNEL_NAME = "星人 Image 2 稳定通道"
CHANNEL_TAG = "xingren-stable-image2"
EXPECTED_BASE_URL = "https://api.smile-ai-studio.com"
UPSTREAM_KEY_ENV = "STABLE_IMAGE2_UPSTREAM_API_KEY"
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MAX_RESPONSE_BYTES = 32 * 1024 * 1024


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
    expected = urllib.parse.urlsplit(EXPECTED_BASE_URL)
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
        raise ConfigurationError("the configured image endpoint is not permitted")
    return EXPECTED_BASE_URL


def validate_upstream_key(value: str) -> str:
    key = value.strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{UPSTREAM_KEY_ENV} is missing or invalid")
    return key


def require_upstream_key() -> str:
    return validate_upstream_key(os.environ.get(UPSTREAM_KEY_ENV, ""))


@contextlib.contextmanager
def model_sync_lock():
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


def media_workshop_probe_payload() -> dict[str, object]:
    return {
        "model": UPSTREAM_MODEL,
        "prompt": "A minimal blue circle on a white background, no text",
        "n": 1,
        "size": "1024x1024",
        "resolution": "1K",
        "quality": "auto",
        "output_format": "png",
    }


def require_upstream_image(base_url: str, api_key: str) -> None:
    request = urllib.request.Request(
        normalize_base_url(base_url) + "/v1/images/generations",
        data=json.dumps(media_workshop_probe_payload(), separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + validate_upstream_key(api_key),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "shenxiang-new-api-image2-probe/1.0",
        },
        method="POST",
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(request, timeout=900) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"image inference probe returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("image inference probe failed or timed out") from None
    if len(body) > MAX_RESPONSE_BYTES:
        raise ConfigurationError("image inference response exceeded the size limit")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("image inference response was not valid JSON") from None
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise ConfigurationError("image inference response did not contain one result")
    if not rows[0].get("url") and not rows[0].get("b64_json"):
        raise ConfigurationError("image inference response did not contain image data")


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
            timeout=15,
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
            timeout=30,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise ConfigurationError("production MySQL update failed") from None


def validate_channel_uniqueness() -> None:
    rows = mysql("SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG))
    if (int(rows[0][0]) if rows else 0) > 1:
        raise ConfigurationError("multiple channels use the reserved image channel tag")
    rows = mysql(
        "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') <> "
        + sql_quote(CHANNEL_TAG)
        + " AND TRIM(TRAILING '/' FROM COALESCE(base_url, '')) = "
        + sql_quote(EXPECTED_BASE_URL)
    )
    if (int(rows[0][0]) if rows else 0) > 0:
        raise ConfigurationError("the image endpoint is already assigned to another channel")


def build_apply_sql(api_key: str, base_url: str) -> str:
    mapping = json.dumps({INTERNAL_MODEL: UPSTREAM_MODEL}, separators=(",", ":"), sort_keys=True)
    return "\n".join(
        [
            "START TRANSACTION;",
            "SET @now := UNIX_TIMESTAMP();",
            "SET @stable_channel_id := (SELECT MIN(id) FROM channels WHERE tag = "
            + sql_quote(CHANNEL_TAG)
            + ");",
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
                    "@now",
                    "0",
                    sql_quote(normalize_base_url(base_url)),
                    sql_quote(INTERNAL_MODEL),
                    sql_quote("default"),
                    sql_quote(mapping),
                    "0",
                    "1",
                    sql_quote(CHANNEL_TAG),
                    sql_quote("Image 2 稳定线路"),
                ]
            )
            + " WHERE @stable_channel_id IS NULL;",
            "SET @stable_channel_id := IFNULL(@stable_channel_id, LAST_INSERT_ID());",
            "UPDATE channels SET type = 1, `key` = "
            + sql_quote(validate_upstream_key(api_key))
            + ", status = 1, name = "
            + sql_quote(CHANNEL_NAME)
            + ", weight = 100, test_time = @now, response_time = 0, base_url = "
            + sql_quote(normalize_base_url(base_url))
            + ", models = "
            + sql_quote(INTERNAL_MODEL)
            + ", `group` = 'default', model_mapping = "
            + sql_quote(mapping)
            + ", priority = 0, auto_ban = 1, tag = "
            + sql_quote(CHANNEL_TAG)
            + ", remark = 'Image 2 稳定线路' WHERE id = @stable_channel_id;",
            "UPDATE abilities SET enabled = 0 WHERE channel_id = @stable_channel_id;",
            "COMMIT;",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the stable Image 2 channel")
    parser.add_argument("--check", action="store_true", help="probe the upstream without changing production")
    parser.add_argument("--apply", action="store_true", help="probe and upsert the production channel")
    args = parser.parse_args()
    if args.check == args.apply:
        parser.error("choose exactly one of --check or --apply")

    api_key = require_upstream_key()
    require_upstream_image(EXPECTED_BASE_URL, api_key)
    if args.apply:
        with model_sync_lock():
            validate_channel_uniqueness()
            mysql_exec(build_apply_sql(api_key, EXPECTED_BASE_URL))
    print(json.dumps({"ok": True, "action": "applied" if args.apply else "checked", "model": PUBLIC_MODEL}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None
