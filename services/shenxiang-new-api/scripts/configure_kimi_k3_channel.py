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
import sync_app_model_permissions as sync


MODEL_NAME = "kimi-k3"
CHANNEL_TAG = "xingren-kimi-k3"
CHANNEL_NAME = "Kimi K3 独立通道"
CHANNEL_GROUP = "kimi"
CHANNEL_REMARK = "Kimi K3 独立通道"
EXPECTED_UPSTREAM_BASE_URL = "https://www.geek2api.com"
UPSTREAM_KEY_ENV = "KIMI_K3_UPSTREAM_API_KEY"
LOCK_PATH = "/tmp/shenxiang-new-api-kimi-k3-channel.lock"
LOCK_HELD_ENV = "KIMI_K3_CHANNEL_SYNC_LOCK_HELD"
MAX_RESPONSE_BYTES = 1024 * 1024


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
        raise ConfigurationError("the configured Kimi endpoint is not permitted")
    return EXPECTED_UPSTREAM_BASE_URL


def validate_upstream_key(value: str, *, env_name: str | None = None) -> str:
    key = value.strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{env_name or 'configured Kimi credential'} is missing or invalid")
    return key


@contextlib.contextmanager
def channel_lock():
    if os.environ.get(LOCK_HELD_ENV) == "1":
        yield
        return
    descriptor = os.open(LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ConfigurationError("Kimi K3 channel sync is already running") from None
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def fetch_json(url: str, api_key: str, *, method: str, body: dict[str, object] | None = None) -> dict[str, object]:
    data = json.dumps(body, separators=(",", ":")).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + validate_upstream_key(api_key),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "shenxiang-new-api-kimi-k3-probe/1.0",
        },
        method=method,
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(request, timeout=30) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"Kimi K3 upstream request returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("Kimi K3 upstream request failed or timed out") from None
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ConfigurationError("Kimi K3 upstream response exceeded the size limit")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("Kimi K3 upstream response was not valid JSON") from None
    if not isinstance(payload, dict):
        raise ConfigurationError("Kimi K3 upstream response was not an object")
    return payload


def verify_upstream(base_url: str, api_key: str) -> None:
    normalized = normalize_base_url(base_url)
    models = fetch_json(normalized + "/v1/models", api_key, method="GET")
    available = {
        item.get("id")
        for item in models.get("data", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    if MODEL_NAME not in available:
        raise ConfigurationError("the required Kimi K3 model is not available")
    completion = fetch_json(
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
    choices = completion.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ConfigurationError("Kimi K3 inference response did not contain a choice")
    message = choices[0].get("message")
    if not isinstance(message, dict) or str(message.get("content") or "").strip() != "OK":
        raise ConfigurationError("Kimi K3 inference response did not complete the verification prompt")


def load_existing_channel() -> tuple[str, str] | None:
    rows = sync.mysql(
        "SELECT COALESCE(`key`, ''), COALESCE(base_url, '') FROM channels WHERE tag = "
        + sql_quote(CHANNEL_TAG)
        + " ORDER BY id"
    )
    if not rows:
        return None
    if len(rows) != 1 or len(rows[0]) != 2:
        raise ConfigurationError("the configured Kimi K3 channel is ambiguous")
    return validate_upstream_key(rows[0][0]), normalize_base_url(rows[0][1])


def validate_channel_isolation() -> None:
    rows = sync.mysql("SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG))
    if (int(rows[0][0]) if rows else 0) > 1:
        raise ConfigurationError("multiple channels use the reserved Kimi K3 tag")


def build_apply_sql(api_key: str, base_url: str) -> str:
    mapping = json.dumps({MODEL_NAME: MODEL_NAME}, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    key = validate_upstream_key(api_key)
    normalized = normalize_base_url(base_url)
    return "\n".join(
        [
            "START TRANSACTION;",
            "SET @now := UNIX_TIMESTAMP();",
            "SET @kimi_channel_id := (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(CHANNEL_TAG) + ");",
            "INSERT INTO channels "
            "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
            "SELECT "
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
                    sql_quote(CHANNEL_GROUP),
                    sql_quote(mapping),
                    "50",
                    "1",
                    sql_quote(CHANNEL_TAG),
                    sql_quote(CHANNEL_REMARK),
                ]
            )
            + " WHERE @kimi_channel_id IS NULL;",
            "SET @kimi_channel_id := IFNULL(@kimi_channel_id, LAST_INSERT_ID());",
            "UPDATE channels SET type = 1, `key` = "
            + sql_quote(key)
            + ", status = 1, name = "
            + sql_quote(CHANNEL_NAME)
            + ", weight = 100, base_url = "
            + sql_quote(normalized)
            + ", models = "
            + sql_quote(MODEL_NAME)
            + ", `group` = "
            + sql_quote(CHANNEL_GROUP)
            + ", model_mapping = "
            + sql_quote(mapping)
            + ", priority = 50, auto_ban = 1, tag = "
            + sql_quote(CHANNEL_TAG)
            + ", remark = "
            + sql_quote(CHANNEL_REMARK)
            + " WHERE id = @kimi_channel_id;",
            "UPDATE abilities SET enabled = 0 WHERE model = "
            + sql_quote(MODEL_NAME)
            + " AND channel_id <> @kimi_channel_id;",
            "UPDATE abilities SET enabled = 0 WHERE channel_id = @kimi_channel_id;",
            "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES ("
            + ", ".join(
                [
                    sql_quote(CHANNEL_GROUP),
                    sql_quote(MODEL_NAME),
                    "@kimi_channel_id",
                    "1",
                    "50",
                    "100",
                    sql_quote(CHANNEL_TAG),
                ]
            )
            + ") ON DUPLICATE KEY UPDATE enabled = 1, priority = 50, weight = 100, tag = "
            + sql_quote(CHANNEL_TAG)
            + ";",
            "COMMIT;",
        ]
    )


def apply_channel(api_key: str, base_url: str) -> None:
    validate_channel_isolation()
    sync.mysql_exec(build_apply_sql(api_key, base_url))


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely configure the isolated Kimi K3 channel")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true", help="validate and write the Kimi K3 channel")
    action.add_argument("--reconcile-if-configured", action="store_true", help="verify and reapply only an existing Kimi K3 channel")
    args = parser.parse_args()

    if args.reconcile_if_configured:
        with channel_lock():
            configured = load_existing_channel()
            if configured is None:
                print(json.dumps({"ok": True, "action": "not_configured", "model": MODEL_NAME}, ensure_ascii=False))
                return 0
            api_key, base_url = configured
            verify_upstream(base_url, api_key)
            apply_channel(api_key, base_url)
        print(json.dumps({"ok": True, "action": "reconciled", "model": MODEL_NAME}, ensure_ascii=False))
        return 0

    api_key = validate_upstream_key(os.environ.get(UPSTREAM_KEY_ENV, ""), env_name=UPSTREAM_KEY_ENV)
    if args.apply:
        with channel_lock():
            verify_upstream(EXPECTED_UPSTREAM_BASE_URL, api_key)
            apply_channel(api_key, EXPECTED_UPSTREAM_BASE_URL)
    else:
        verify_upstream(EXPECTED_UPSTREAM_BASE_URL, api_key)
    print(json.dumps({"ok": True, "action": "applied" if args.apply else "probe", "model": MODEL_NAME}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
