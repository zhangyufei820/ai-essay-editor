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
from collections.abc import Iterator
from dataclasses import dataclass


DISCOUNT_GROUP = "discount"
DISCOUNT_RATIO = 0.25
DEFAULT_GROUP_DESCRIPTION = "原价稳定通道"
DISCOUNT_GROUP_DESCRIPTION = "特价通道（可能随时下架；不可用时请切回原价）"
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MAX_MODELS_RESPONSE_BYTES = 5 * 1024 * 1024
OPENAI_CHANNEL_TYPE = 1
LEGACY_DISCOUNT_CHANNEL_TAG = "xingren-discount-text"
DEFAULT_CHANNEL_ORDER = ("wangwang", "pdhlzy", "reserve")
DISCOUNT_TEXT_MODELS = (
    "gpt-5.5",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
)
OPTION_KEYS = ("GroupRatio", "UserUsableGroups", "AutoGroups", "GroupGroupRatio")


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


@dataclass(frozen=True)
class DiscountPlan:
    upstream_model_count: int
    matched_models: tuple[str, ...]
    missing_models: tuple[str, ...]


@dataclass(frozen=True)
class DiscountChannelSpec:
    slug: str
    tag: str
    name: str
    key_envs: tuple[str, ...]
    base_url_envs: tuple[str, ...]
    default_base_url: str
    approved_hosts: tuple[str, ...]
    channel_type: int


DISCOUNT_CHANNEL_SPECS = (
    DiscountChannelSpec(
        slug="wangwang",
        tag="xingren-discount-text-wangwang",
        name="星人特价文本链路 A",
        key_envs=("DISCOUNT_WANGWANG_API_KEY",),
        base_url_envs=("DISCOUNT_WANGWANG_BASE_URL",),
        default_base_url="https://wangwang.sbs",
        approved_hosts=("wangwang.sbs",),
        channel_type=OPENAI_CHANNEL_TYPE,
    ),
    DiscountChannelSpec(
        slug="pdhlzy",
        tag="xingren-discount-text-pdhlzy",
        name="星人特价文本链路 B",
        key_envs=("DISCOUNT_PDHLZY_API_KEY",),
        base_url_envs=("DISCOUNT_PDHLZY_BASE_URL",),
        default_base_url="https://pdhlzy.com",
        approved_hosts=("pdhlzy.com",),
        channel_type=OPENAI_CHANNEL_TYPE,
    ),
    DiscountChannelSpec(
        slug="reserve",
        tag="xingren-discount-text-reserve",
        name="星人特价文本链路 C",
        key_envs=("DISCOUNT_RESERVE_API_KEY", "DISCOUNT_UPSTREAM_API_KEY"),
        base_url_envs=("DISCOUNT_RESERVE_BASE_URL", "DISCOUNT_UPSTREAM_BASE_URL"),
        default_base_url="https://www.geek2api.com",
        approved_hosts=("www.geek2api.com", "api.geek2api.com"),
        channel_type=OPENAI_CHANNEL_TYPE,
    ),
)
DISCOUNT_CHANNEL_TAGS = tuple(spec.tag for spec in DISCOUNT_CHANNEL_SPECS)
ALL_DISCOUNT_CHANNEL_TAGS = DISCOUNT_CHANNEL_TAGS + (LEGACY_DISCOUNT_CHANNEL_TAG,)


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def sql_list(values: tuple[str, ...] | list[str]) -> str:
    return ",".join(sql_quote(value) for value in values)


def json_option(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def normalize_base_url(value: str, spec: DiscountChannelSpec) -> str:
    normalized = value.strip().rstrip("/")
    try:
        parsed = urllib.parse.urlsplit(normalized)
        port = parsed.port
    except ValueError:
        raise ConfigurationError(f"{spec.slug} upstream base URL is invalid") from None
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ConfigurationError(f"{spec.slug} upstream base URL must be a credential-free HTTPS origin")
    if parsed.hostname not in spec.approved_hosts or port not in {None, 443}:
        raise ConfigurationError(f"{spec.slug} upstream base URL must use an approved HTTPS host")
    if parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ConfigurationError(f"{spec.slug} upstream base URL must not include a path, query, or fragment")
    return normalized


def read_first_env(names: tuple[str, ...]) -> str:
    for name in names:
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""


def require_upstream_key(spec: DiscountChannelSpec) -> str:
    key = read_first_env(spec.key_envs)
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{spec.key_envs[0]} is missing or invalid")
    return key


def resolve_upstream_base_url(spec: DiscountChannelSpec) -> str:
    configured = read_first_env(spec.base_url_envs) or spec.default_base_url
    return normalize_base_url(configured, spec)


def parse_channel_order(raw_value: str) -> tuple[str, ...]:
    order = tuple(item.strip() for item in raw_value.split(",") if item.strip())
    expected = {spec.slug for spec in DISCOUNT_CHANNEL_SPECS}
    if len(order) != len(expected) or set(order) != expected:
        raise ConfigurationError("channel order must contain wangwang,pdhlzy,reserve exactly once")
    return order


def channel_priorities(order: tuple[str, ...]) -> dict[str, int]:
    return {slug: (len(order) - index) * 10 for index, slug in enumerate(order)}


@contextlib.contextmanager
def model_sync_lock() -> Iterator[None]:
    try:
        lock_fd = os.open(MODEL_SYNC_LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o600)
    except OSError:
        raise ConfigurationError("cannot open the shared model-sync lock") from None
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ConfigurationError("model permission sync is running; retry after it finishes") from None
        except OSError:
            raise ConfigurationError("cannot acquire the shared model-sync lock") from None
        yield
    finally:
        os.close(lock_fd)


def fetch_upstream_models(base_url: str, api_key: str) -> set[str]:
    request = urllib.request.Request(
        base_url + "/v1/models",
        headers={
            "Authorization": "Bearer " + api_key,
            "Accept": "application/json",
            "User-Agent": "shenxiang-new-api-discount-model-probe/2.0",
        },
        method="GET",
    )
    try:
        opener = urllib.request.build_opener(NoRedirectHandler())
        with opener.open(request, timeout=15) as response:
            body = response.read(MAX_MODELS_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"upstream model probe returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("upstream model probe failed or timed out") from None
    if len(body) > MAX_MODELS_RESPONSE_BYTES:
        raise ConfigurationError("upstream model response exceeded the size limit")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("upstream model response was not valid JSON") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ConfigurationError("upstream model response did not use the OpenAI models schema")
    models: set[str] = set()
    for item in payload["data"]:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id")
        if isinstance(model_id, str) and 0 < len(model_id) <= 255:
            models.add(model_id.strip())
    if not models:
        raise ConfigurationError("upstream model response contained no usable model IDs")
    return models


def build_discount_plan(upstream_models: set[str]) -> DiscountPlan:
    matched = tuple(model for model in DISCOUNT_TEXT_MODELS if model in upstream_models)
    missing = tuple(model for model in DISCOUNT_TEXT_MODELS if model not in upstream_models)
    if missing:
        raise ConfigurationError("upstream is missing required discount models: " + ",".join(missing))
    return DiscountPlan(
        upstream_model_count=len(upstream_models),
        matched_models=matched,
        missing_models=missing,
    )


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
        ).decode("utf-8", errors="strict")
    except (subprocess.CalledProcessError, UnicodeDecodeError):
        raise ConfigurationError("production MySQL query failed") from None
    return [line.split("\t") for line in output.splitlines()]


def mysql_exec(query: str) -> list[str]:
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
        "--raw",
        "-N",
        "-B",
        "-uroot",
        database,
    ]
    try:
        completed = subprocess.run(
            command,
            input=query.encode("utf-8"),
            env=environment,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        output = completed.stdout.decode("utf-8", errors="strict")
    except (subprocess.CalledProcessError, UnicodeDecodeError):
        raise ConfigurationError("production MySQL update failed") from None
    return output.splitlines()


def load_group_options(option_keys: tuple[str, ...] = OPTION_KEYS) -> dict[str, str]:
    keys = ",".join(sql_quote(key) for key in option_keys)
    rows = mysql(f"SELECT `key`, COALESCE(`value`, '') FROM options WHERE `key` IN ({keys})")
    options = {row[0]: row[1] for row in rows if len(row) == 2}
    missing = [key for key in option_keys if key not in options]
    if missing:
        raise ConfigurationError("required group options are missing: " + ",".join(missing))
    return options


def parse_json_object(raw_value: str, option_key: str) -> dict[str, object]:
    try:
        value = json.loads(raw_value)
    except json.JSONDecodeError:
        raise ConfigurationError(f"{option_key} is not valid JSON") from None
    if not isinstance(value, dict):
        raise ConfigurationError(f"{option_key} must be a JSON object")
    return value


def parse_json_array(raw_value: str, option_key: str) -> list[object]:
    try:
        value = json.loads(raw_value)
    except json.JSONDecodeError:
        raise ConfigurationError(f"{option_key} is not valid JSON") from None
    if not isinstance(value, list):
        raise ConfigurationError(f"{option_key} must be a JSON array")
    return value


def build_group_option_updates(options: dict[str, str]) -> dict[str, str]:
    group_ratio = parse_json_object(options["GroupRatio"], "GroupRatio")
    group_ratio[DISCOUNT_GROUP] = DISCOUNT_RATIO

    usable_groups = parse_json_object(options["UserUsableGroups"], "UserUsableGroups")
    usable_groups["default"] = DEFAULT_GROUP_DESCRIPTION
    usable_groups[DISCOUNT_GROUP] = DISCOUNT_GROUP_DESCRIPTION

    auto_groups = [
        group
        for group in parse_json_array(options["AutoGroups"], "AutoGroups")
        if group != DISCOUNT_GROUP
    ]

    group_group_ratio = parse_json_object(options["GroupGroupRatio"], "GroupGroupRatio")
    for raw_overrides in group_group_ratio.values():
        if isinstance(raw_overrides, dict):
            raw_overrides.pop(DISCOUNT_GROUP, None)

    return {
        "GroupRatio": json_option(group_ratio),
        "UserUsableGroups": json_option(usable_groups),
        "AutoGroups": json_option(auto_groups),
        "GroupGroupRatio": json_option(group_group_ratio),
    }


def option_guard_statements(options: dict[str, str]) -> list[str]:
    keys = ",".join(sql_quote(key) for key in options)
    exact_matches = " OR ".join(
        "(`key` = "
        + sql_quote(key)
        + " AND BINARY COALESCE(`value`, '') = BINARY "
        + sql_quote(value)
        + ")"
        for key, value in options.items()
    )
    return [
        "SELECT `key` FROM options WHERE `key` IN (" + keys + ") FOR UPDATE;",
        "SET @discount_options_match := (SELECT COUNT(*) FROM options WHERE "
        + exact_matches
        + ");",
    ]


def guarded_option_update(option_key: str, option_value: str, guard_condition: str) -> str:
    return (
        "UPDATE options SET `value` = "
        + sql_quote(option_value)
        + " WHERE `key` = "
        + sql_quote(option_key)
        + " AND "
        + guard_condition
        + ";"
    )


def mysql_status(output: list[str], prefix: str) -> str:
    for line in reversed(output):
        if line.startswith(prefix):
            return line.removeprefix(prefix)
    raise ConfigurationError("production MySQL update returned no completion status")


def channel_id_variable(slug: str) -> str:
    return "@discount_channel_id_" + slug


def build_apply_sql(
    plans: dict[str, DiscountPlan],
    api_keys: dict[str, str],
    base_urls: dict[str, str],
    order: tuple[str, ...],
    options: dict[str, str],
) -> str:
    if set(plans) != {spec.slug for spec in DISCOUNT_CHANNEL_SPECS}:
        raise ConfigurationError("all discount upstream plans are required")
    priorities = channel_priorities(order)
    models = ",".join(DISCOUNT_TEXT_MODELS)
    model_mapping = json_option({model: model for model in DISCOUNT_TEXT_MODELS})
    allowed_tags_sql = sql_list(list(ALL_DISCOUNT_CHANNEL_TAGS))
    statements = ["START TRANSACTION;"]
    statements.extend(option_guard_statements(options))
    statements.extend(
        [
            "SELECT id FROM channels WHERE tag IN ("
            + allowed_tags_sql
            + ") OR FIND_IN_SET("
            + sql_quote(DISCOUNT_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 ORDER BY id FOR UPDATE;",
            "SET @discount_group_conflict_count := (SELECT COUNT(*) FROM channels WHERE FIND_IN_SET("
            + sql_quote(DISCOUNT_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 AND COALESCE(tag, '') NOT IN ("
            + allowed_tags_sql
            + "));",
            "SET @discount_duplicate_count := "
            + " + ".join(
                "IF((SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(spec.tag) + ") > 1, 1, 0)"
                for spec in DISCOUNT_CHANNEL_SPECS
                if spec.slug != "reserve"
            )
            + " + IF((SELECT COUNT(*) FROM channels WHERE tag IN ("
            + sql_list(
                [
                    next(spec.tag for spec in DISCOUNT_CHANNEL_SPECS if spec.slug == "reserve"),
                    LEGACY_DISCOUNT_CHANNEL_TAG,
                ]
            )
            + ")) > 1, 1, 0);",
            "SET @discount_apply_status := CASE "
            + "WHEN @discount_options_match <> "
            + str(len(options))
            + " THEN 'options_conflict' "
            + "WHEN @discount_group_conflict_count > 0 THEN 'channel_conflict' "
            + "WHEN @discount_duplicate_count > 0 THEN 'duplicate_channels' "
            + "ELSE 'ok' END;",
            "SET @discount_apply_allowed := IF(@discount_apply_status = 'ok', 1, 0);",
        ]
    )
    option_updates = build_group_option_updates(options)
    statements.extend(
        guarded_option_update(key, value, "@discount_apply_allowed = 1")
        for key, value in option_updates.items()
    )

    for spec in DISCOUNT_CHANNEL_SPECS:
        channel_variable = channel_id_variable(spec.slug)
        if spec.slug == "reserve":
            lookup_condition = "tag IN (" + sql_list([spec.tag, LEGACY_DISCOUNT_CHANNEL_TAG]) + ")"
        else:
            lookup_condition = "tag = " + sql_quote(spec.tag)
        statements.append(
            "SET "
            + channel_variable
            + " := IF(@discount_apply_allowed = 1, (SELECT MIN(id) FROM channels WHERE "
            + lookup_condition
            + "), NULL);"
        )
        statements.append(
            "INSERT INTO channels "
            "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark, settings) SELECT "
            + ", ".join(
                [
                    str(spec.channel_type),
                    sql_quote(api_keys[spec.slug]),
                    "1",
                    sql_quote(spec.name),
                    "100",
                    "UNIX_TIMESTAMP()",
                    "0",
                    "0",
                    sql_quote(base_urls[spec.slug]),
                    sql_quote(models),
                    sql_quote(DISCOUNT_GROUP),
                    sql_quote(model_mapping),
                    str(priorities[spec.slug]),
                    "1",
                    sql_quote(spec.tag),
                    sql_quote(DISCOUNT_GROUP_DESCRIPTION),
                    sql_quote("{}"),
                ]
            )
            + " WHERE "
            + channel_variable
            + " IS NULL AND @discount_apply_allowed = 1;"
        )
        statements.append(
            "SET "
            + channel_variable
            + " := IF(@discount_apply_allowed = 1, IFNULL("
            + channel_variable
            + ", LAST_INSERT_ID()), NULL);"
        )
        statements.append(
            "UPDATE channels SET type = "
            + str(spec.channel_type)
            + ", `key` = "
            + sql_quote(api_keys[spec.slug])
            + ", status = 1, name = "
            + sql_quote(spec.name)
            + ", weight = 100, base_url = "
            + sql_quote(base_urls[spec.slug])
            + ", models = "
            + sql_quote(models)
            + ", `group` = "
            + sql_quote(DISCOUNT_GROUP)
            + ", model_mapping = "
            + sql_quote(model_mapping)
            + ", priority = "
            + str(priorities[spec.slug])
            + ", auto_ban = 1, tag = "
            + sql_quote(spec.tag)
            + ", remark = "
            + sql_quote(DISCOUNT_GROUP_DESCRIPTION)
            + ", settings = "
            + sql_quote("{}")
            + ", other = "
            + sql_quote("{}")
            + " WHERE id = "
            + channel_variable
            + " AND @discount_apply_allowed = 1;"
        )

    channel_variables = ",".join(channel_id_variable(spec.slug) for spec in DISCOUNT_CHANNEL_SPECS)
    statements.extend(
        [
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(DISCOUNT_GROUP)
            + " AND channel_id NOT IN ("
            + channel_variables
            + ") AND @discount_apply_allowed = 1;",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN ("
            + channel_variables
            + ") AND @discount_apply_allowed = 1;",
        ]
    )
    for spec in DISCOUNT_CHANNEL_SPECS:
        for model in DISCOUNT_TEXT_MODELS:
            statements.append(
                "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) SELECT "
                + ", ".join(
                    [
                        sql_quote(DISCOUNT_GROUP),
                        sql_quote(model),
                        channel_id_variable(spec.slug),
                        "1",
                        str(priorities[spec.slug]),
                        "100",
                        sql_quote(spec.tag),
                    ]
                )
                + " WHERE @discount_apply_allowed = 1 ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = 100, tag = VALUES(tag);"
            )
    statements.append("COMMIT;")
    statements.append("SELECT CONCAT('discount_apply_status=', @discount_apply_status);")
    return "\n".join(statements)


def apply_discount_plan(
    plans: dict[str, DiscountPlan],
    api_keys: dict[str, str],
    base_urls: dict[str, str],
    order: tuple[str, ...],
) -> None:
    output = mysql_exec(build_apply_sql(plans, api_keys, base_urls, order, load_group_options()))
    status = mysql_status(output, "discount_apply_status=")
    errors = {
        "options_conflict": "group options changed concurrently; retry the apply operation",
        "channel_conflict": "the discount group is assigned to an unmanaged channel",
        "duplicate_channels": "multiple channels use the same discount route identity",
    }
    if status != "ok":
        raise ConfigurationError(errors.get(status, "discount channel apply failed closed"))


def build_disable_option_updates(options: dict[str, str]) -> dict[str, str]:
    usable_groups = parse_json_object(options["UserUsableGroups"], "UserUsableGroups")
    usable_groups.pop(DISCOUNT_GROUP, None)
    auto_groups = [
        group
        for group in parse_json_array(options["AutoGroups"], "AutoGroups")
        if group != DISCOUNT_GROUP
    ]
    return {
        "UserUsableGroups": json_option(usable_groups),
        "AutoGroups": json_option(auto_groups),
    }


def build_disable_sql(options: dict[str, str] | None, option_updates: dict[str, str] | None) -> str:
    tags = sql_list(list(ALL_DISCOUNT_CHANNEL_TAGS))
    statements = [
        "START TRANSACTION;",
        "UPDATE channels SET status = 2 WHERE tag IN ("
        + tags
        + ") OR FIND_IN_SET("
        + sql_quote(DISCOUNT_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
        "UPDATE abilities SET enabled = 0 WHERE `group` = "
        + sql_quote(DISCOUNT_GROUP)
        + " OR channel_id IN (SELECT id FROM channels WHERE tag IN ("
        + tags
        + "));",
    ]
    if options is not None and option_updates is not None:
        statements.extend(option_guard_statements(options))
        statements.extend(
            guarded_option_update(
                key,
                value,
                "@discount_options_match = " + str(len(options)),
            )
            for key, value in option_updates.items()
        )
    statements.append("COMMIT;")
    if options is None or option_updates is None:
        statements.append("SELECT 'discount_disable_status=channel_only';")
    else:
        statements.append(
            "SELECT CONCAT('discount_disable_status=', IF(@discount_options_match = "
            + str(len(options))
            + ", 'ok', 'options_conflict'));"
        )
    return "\n".join(statements)


def disable_discount_channel() -> bool:
    options: dict[str, str] | None = None
    option_updates: dict[str, str] | None = None
    try:
        options = load_group_options(("UserUsableGroups", "AutoGroups"))
        option_updates = build_disable_option_updates(options)
    except ConfigurationError:
        pass
    output = mysql_exec(build_disable_sql(options, option_updates))
    status = mysql_status(output, "discount_disable_status=")
    return status == "ok"


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely configure the isolated discount text channels")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true", help="write the validated channels and group configuration")
    action.add_argument("--disable", action="store_true", help="disable all managed channels and hide the discount group")
    parser.add_argument(
        "--order",
        default=",".join(DEFAULT_CHANNEL_ORDER),
        help="comma-separated channel order from primary to final fallback",
    )
    args = parser.parse_args()

    if args.disable:
        with model_sync_lock():
            group_hidden = disable_discount_channel()
        print(
            json.dumps(
                {
                    "ok": True,
                    "action": "disabled",
                    "group_hidden": group_hidden,
                    "runtime_cache_refresh_required": True,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        return 0

    order = parse_channel_order(args.order)
    plans: dict[str, DiscountPlan] = {}
    api_keys: dict[str, str] = {}
    base_urls: dict[str, str] = {}
    for spec in DISCOUNT_CHANNEL_SPECS:
        api_key = require_upstream_key(spec)
        base_url = resolve_upstream_base_url(spec)
        plans[spec.slug] = build_discount_plan(fetch_upstream_models(base_url, api_key))
        api_keys[spec.slug] = api_key
        base_urls[spec.slug] = base_url

    if args.apply:
        with model_sync_lock():
            apply_discount_plan(plans, api_keys, base_urls, order)
    priorities = channel_priorities(order)
    print(
        json.dumps(
            {
                "ok": True,
                "action": "applied" if args.apply else "probe",
                "ratio": DISCOUNT_RATIO,
                "channel_order": order,
                "channels": {
                    spec.slug: {
                        "priority": priorities[spec.slug],
                        "upstream_model_count": plans[spec.slug].upstream_model_count,
                        "matched_public_models": plans[spec.slug].matched_models,
                        "wire_api": "responses",
                    }
                    for spec in DISCOUNT_CHANNEL_SPECS
                },
                "runtime_cache_refresh_required": args.apply,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
