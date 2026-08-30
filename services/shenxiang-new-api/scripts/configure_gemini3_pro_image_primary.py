#!/usr/bin/env python3
"""Promote the verified Gemini 3 Pro Image key on channel 18.

The existing channel-18 credential is copied once into a dedicated fallback
channel before channel 18 is updated.  Credentials are read only from the
process environment and are never printed or written to the repository.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import configure_stable_image2_channel as stable
import sync_app_model_permissions as permissions


PRIMARY_CHANNEL_ID = 18
PRIMARY_CHANNEL_TAG = "xingren-gemini3-pro-image"
FALLBACK_CHANNEL_TAG = "xingren-gemini3-pro-image-moonapix-fallback"
PUBLIC_MODEL = "gemini-3-pro-image-preview"
UPSTREAM_MODEL = "gemini-3-pro-image-preview"
PRIMARY_PRIORITY = 16
FALLBACK_PRIORITY = 0
EXPECTED_BASE_URL = "https://moonapix.com"
UPSTREAM_KEY_ENV = "GEMINI3_PRO_IMAGE_PRIMARY_API_KEY"
MAX_POLL_SECONDS = 360
POLL_INTERVAL_SECONDS = 2


class ConfigurationError(RuntimeError):
    pass


def require_upstream_key() -> str:
    value = os.environ.get(UPSTREAM_KEY_ENV, "").strip()
    if len(value) < 16 or any(character.isspace() for character in value):
        raise ConfigurationError(f"{UPSTREAM_KEY_ENV} is missing or invalid")
    return value


def request_json(path: str, api_key: str, payload: dict[str, object] | None = None) -> dict[str, object]:
    request = urllib.request.Request(
        stable.normalize_base_url(EXPECTED_BASE_URL) + path,
        data=(
            json.dumps(payload, separators=(",", ":")).encode("utf-8")
            if payload is not None
            else None
        ),
        headers={
            "Authorization": "Bearer " + api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "shenxiang-new-api-gemini3-pro-image-probe/1.0",
        },
        method="POST" if payload is not None else "GET",
    )
    try:
        opener = urllib.request.build_opener(stable.NoRedirectHandler())
        with opener.open(request, timeout=40) as response:
            body = response.read(stable.MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"Gemini async probe returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("Gemini async probe failed or timed out") from None
    if len(body) > stable.MAX_RESPONSE_BYTES:
        raise ConfigurationError("Gemini async probe response exceeded the size limit")
    try:
        parsed = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("Gemini async probe response was not valid JSON") from None
    if not isinstance(parsed, dict):
        raise ConfigurationError("Gemini async probe response was not an object")
    return parsed


def require_upstream_image(api_key: str) -> None:
    """Validate the actual asynchronous image path before any DB mutation."""
    submitted = request_json(
        "/v1/images/generations/async",
        api_key,
        {
            "model": UPSTREAM_MODEL,
            "prompt": "A single blue circle centered on a plain white background, clean vector style.",
            "size": "16:9",
            "resolution": "4K",
            "n": 1,
        },
    )
    task_id = submitted.get("id")
    status = str(submitted.get("status", "")).lower()
    if not isinstance(task_id, str) or not task_id or status not in {"submitted", "queued", "running"}:
        raise ConfigurationError("Gemini async probe did not return an accepted task")

    deadline = time.monotonic() + MAX_POLL_SECONDS
    while time.monotonic() < deadline:
        time.sleep(POLL_INTERVAL_SECONDS)
        task = request_json("/v1/images/tasks/" + urllib.parse.quote(task_id, safe=""), api_key)
        task_status = str(task.get("status", "")).lower()
        if task_status == "failed":
            raise ConfigurationError("Gemini async probe task failed")
        if task_status != "succeeded":
            continue
        rows = task.get("data")
        if (
            not isinstance(rows, list)
            or len(rows) != 1
            or not isinstance(rows[0], dict)
            or not rows[0].get("url")
        ):
            raise ConfigurationError("Gemini async probe succeeded without one image URL")
        return
    raise ConfigurationError("Gemini async probe task timed out")


def validate_channel_topology() -> None:
    tags = ", ".join(stable.sql_quote(tag) for tag in (PRIMARY_CHANNEL_TAG, FALLBACK_CHANNEL_TAG))
    rows = stable.mysql(
        "SELECT tag, COUNT(*) FROM channels WHERE id = "
        + str(PRIMARY_CHANNEL_ID)
        + " OR tag IN ("
        + tags
        + ") GROUP BY tag"
    )
    counts = {row[0]: int(row[1]) for row in rows if len(row) == 2}
    if counts.get(PRIMARY_CHANNEL_TAG, 0) != 1:
        raise ConfigurationError("channel 18 must retain the reserved Gemini primary tag")
    if counts.get(FALLBACK_CHANNEL_TAG, 0) > 1:
        raise ConfigurationError("multiple Gemini fallback channels use the reserved tag")

    rows = stable.mysql(
        "SELECT COUNT(*) FROM channels WHERE id <> "
        + str(PRIMARY_CHANNEL_ID)
        + " AND COALESCE(tag, '') <> "
        + stable.sql_quote(FALLBACK_CHANNEL_TAG)
        + " AND FIND_IN_SET("
        + stable.sql_quote(PUBLIC_MODEL)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
    )
    if (int(rows[0][0]) if rows else 0) > 0:
        raise ConfigurationError("the Gemini model is assigned to an unmanaged channel")


def build_apply_sql(api_key: str) -> str:
    key = require_key_value(api_key)
    target_mapping = json.dumps({PUBLIC_MODEL: UPSTREAM_MODEL}, separators=(",", ":"), sort_keys=True)
    fallback_name = "星人 Gemini 3 Pro Image 备用通道"
    primary_name = "星人 Gemini 3 Pro Image"
    return "\n".join(
        [
            "START TRANSACTION;",
            "SET @now := UNIX_TIMESTAMP();",
            "SET @fallback_channel_id := (SELECT MIN(id) FROM channels WHERE tag = "
            + stable.sql_quote(FALLBACK_CHANNEL_TAG)
            + ");",
            "INSERT INTO channels "
            "(type, `key`, open_ai_organization, test_model, status, name, weight, created_time, test_time, response_time, base_url, other, models, `group`, model_mapping, status_code_mapping, priority, auto_ban, other_info, tag, setting, param_override, header_override, remark, channel_info, settings) "
            "SELECT type, `key`, open_ai_organization, test_model, 1, "
            + stable.sql_quote(fallback_name)
            + ", weight, created_time, test_time, response_time, base_url, other, models, `group`, model_mapping, status_code_mapping, "
            + str(FALLBACK_PRIORITY)
            + ", auto_ban, other_info, "
            + stable.sql_quote(FALLBACK_CHANNEL_TAG)
            + ", setting, param_override, header_override, "
            + stable.sql_quote("Gemini 3 Pro Image 备用线路")
            + ", channel_info, settings FROM channels WHERE id = "
            + str(PRIMARY_CHANNEL_ID)
            + " AND @fallback_channel_id IS NULL;",
            "SET @fallback_channel_id := IFNULL(@fallback_channel_id, LAST_INSERT_ID());",
            "UPDATE channels SET status = 1, name = "
            + stable.sql_quote(fallback_name)
            + ", weight = 100, models = "
            + stable.sql_quote(PUBLIC_MODEL)
            + ", model_mapping = "
            + stable.sql_quote(target_mapping)
            + ", priority = "
            + str(FALLBACK_PRIORITY)
            + ", tag = "
            + stable.sql_quote(FALLBACK_CHANNEL_TAG)
            + ", remark = "
            + stable.sql_quote("Gemini 3 Pro Image 备用线路")
            + " WHERE id = @fallback_channel_id;",
            "UPDATE channels SET `key` = "
            + stable.sql_quote(key)
            + ", status = 1, name = "
            + stable.sql_quote(primary_name)
            + ", weight = 100, test_time = @now, response_time = 0, base_url = "
            + stable.sql_quote(stable.normalize_base_url(EXPECTED_BASE_URL))
            + ", models = "
            + stable.sql_quote(PUBLIC_MODEL)
            + ", model_mapping = "
            + stable.sql_quote(target_mapping)
            + ", priority = "
            + str(PRIMARY_PRIORITY)
            + ", tag = "
            + stable.sql_quote(PRIMARY_CHANNEL_TAG)
            + ", remark = "
            + stable.sql_quote("Gemini 3 Pro Image 主线路")
            + " WHERE id = "
            + str(PRIMARY_CHANNEL_ID)
            + ";",
            "COMMIT;",
        ]
    )


def require_key_value(value: str) -> str:
    key = value.strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError("the supplied Gemini primary key is invalid")
    return key


def validate_applied_topology() -> None:
    rows = stable.mysql(
        "SELECT "
        "SUM(id = "
        + str(PRIMARY_CHANNEL_ID)
        + " AND status = 1 AND priority = "
        + str(PRIMARY_PRIORITY)
        + " AND tag = "
        + stable.sql_quote(PRIMARY_CHANNEL_TAG)
        + "), "
        "SUM(tag = "
        + stable.sql_quote(FALLBACK_CHANNEL_TAG)
        + " AND status = 1 AND priority = "
        + str(FALLBACK_PRIORITY)
        + "), "
        "SUM(id = "
        + str(PRIMARY_CHANNEL_ID)
        + " AND SHA2(`key`, 256) = (SELECT SHA2(`key`, 256) FROM channels WHERE tag = "
        + stable.sql_quote(FALLBACK_CHANNEL_TAG)
        + " LIMIT 1)) FROM channels"
    )
    values = [int(value or 0) for value in (rows[0] if rows else [])]
    if values != [1, 1, 0]:
        raise ConfigurationError("Gemini primary and fallback routing did not converge")


def apply() -> dict[str, object]:
    api_key = require_upstream_key()
    require_upstream_image(api_key)
    with stable.model_sync_lock():
        validate_channel_topology()
        stable.mysql_exec(build_apply_sql(api_key))
        permissions.sync_abilities()
        validate_applied_topology()
    return {"ok": True, "action": "applied", "model": PUBLIC_MODEL}


def main() -> int:
    parser = argparse.ArgumentParser(description="Promote verified Gemini 3 Pro Image channel 18")
    parser.add_argument("--apply", action="store_true", help="probe and configure primary plus fallback")
    args = parser.parse_args()
    if not args.apply:
        parser.error("--apply is required")
    print(json.dumps(apply(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ConfigurationError, stable.ConfigurationError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None
