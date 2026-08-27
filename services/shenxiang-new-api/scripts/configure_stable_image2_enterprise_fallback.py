#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys

import configure_stable_image2_channel as stable
import sync_app_model_permissions as permissions


FALLBACK_CHANNEL_NAME = "星人 Image 2 稳定备用通道"
FALLBACK_CHANNEL_TAG = permissions.STABLE_IMAGE2_ENTERPRISE_FALLBACK_CHANNEL_TAG
FALLBACK_PRIORITY = permissions.STABLE_IMAGE2_CHANNEL_PRIORITIES[FALLBACK_CHANNEL_TAG]
UPSTREAM_KEY_ENV = "STABLE_IMAGE2_ENTERPRISE_FALLBACK_API_KEY"


class ConfigurationError(RuntimeError):
    pass


def require_upstream_key() -> str:
    return stable.validate_upstream_key(os.environ.get(UPSTREAM_KEY_ENV, ""))


def validate_channel_topology() -> None:
    tags = (stable.CHANNEL_TAG, FALLBACK_CHANNEL_TAG)
    tag_values = ", ".join(stable.sql_quote(tag) for tag in tags)
    rows = stable.mysql(
        "SELECT tag, COUNT(*) FROM channels WHERE tag IN ("
        + tag_values
        + ") GROUP BY tag"
    )
    counts = {row[0]: int(row[1]) for row in rows if len(row) == 2}
    if counts.get(stable.CHANNEL_TAG, 0) != 1:
        raise ConfigurationError("the stable Image 2 primary channel must exist exactly once")
    if counts.get(FALLBACK_CHANNEL_TAG, 0) > 1:
        raise ConfigurationError("multiple stable Image 2 fallback channels use the reserved tag")
    rows = stable.mysql(
        "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') NOT IN ("
        + tag_values
        + ") AND FIND_IN_SET("
        + stable.sql_quote(stable.INTERNAL_MODEL)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
    )
    if (int(rows[0][0]) if rows else 0) > 0:
        raise ConfigurationError("the stable Image 2 model is assigned to an unmanaged channel")


def build_apply_sql(api_key: str, base_url: str) -> str:
    mapping = json.dumps({stable.INTERNAL_MODEL: stable.UPSTREAM_MODEL}, separators=(",", ":"), sort_keys=True)
    return "\n".join(
        [
            "START TRANSACTION;",
            "SET @now := UNIX_TIMESTAMP();",
            "SET @fallback_channel_id := (SELECT MIN(id) FROM channels WHERE tag = "
            + stable.sql_quote(FALLBACK_CHANNEL_TAG)
            + ");",
            "INSERT INTO channels "
            "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
            "SELECT "
            + ", ".join(
                [
                    "1",
                    stable.sql_quote(stable.validate_upstream_key(api_key)),
                    "1",
                    stable.sql_quote(FALLBACK_CHANNEL_NAME),
                    "100",
                    "@now",
                    "@now",
                    "0",
                    stable.sql_quote(stable.normalize_base_url(base_url)),
                    stable.sql_quote(stable.INTERNAL_MODEL),
                    stable.sql_quote("default"),
                    stable.sql_quote(mapping),
                    str(FALLBACK_PRIORITY),
                    "1",
                    stable.sql_quote(FALLBACK_CHANNEL_TAG),
                    stable.sql_quote(permissions.STABLE_IMAGE2_ENTERPRISE_FALLBACK_REMARK),
                ]
            )
            + " WHERE @fallback_channel_id IS NULL;",
            "SET @fallback_channel_id := IFNULL(@fallback_channel_id, LAST_INSERT_ID());",
            "UPDATE channels SET type = 1, `key` = "
            + stable.sql_quote(stable.validate_upstream_key(api_key))
            + ", status = 1, name = "
            + stable.sql_quote(FALLBACK_CHANNEL_NAME)
            + ", weight = 100, test_time = @now, response_time = 0, base_url = "
            + stable.sql_quote(stable.normalize_base_url(base_url))
            + ", models = "
            + stable.sql_quote(stable.INTERNAL_MODEL)
            + ", `group` = 'default', model_mapping = "
            + stable.sql_quote(mapping)
            + ", priority = "
            + str(FALLBACK_PRIORITY)
            + ", auto_ban = 1, tag = "
            + stable.sql_quote(FALLBACK_CHANNEL_TAG)
            + ", remark = "
            + stable.sql_quote(permissions.STABLE_IMAGE2_ENTERPRISE_FALLBACK_REMARK)
            + " WHERE id = @fallback_channel_id;",
            "UPDATE abilities SET enabled = 0 WHERE channel_id = @fallback_channel_id;",
            "COMMIT;",
        ]
    )


def apply() -> dict[str, object]:
    api_key = require_upstream_key()
    stable.require_upstream_image(stable.EXPECTED_BASE_URL, api_key)
    with stable.model_sync_lock():
        validate_channel_topology()
        stable.mysql_exec(build_apply_sql(api_key, stable.EXPECTED_BASE_URL))
        permissions.ensure_stable_image2_channel_order()
        permissions.sync_abilities()
    return {"ok": True, "action": "applied", "model": stable.PUBLIC_MODEL}


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the stable Image 2 enterprise fallback")
    parser.add_argument("--apply", action="store_true", help="probe and upsert the production fallback channel")
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
