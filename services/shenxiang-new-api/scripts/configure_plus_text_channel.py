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


PLUS_GROUP = "plus"
PLUS_RATIO = 0.5
DEFAULT_GROUP_DESCRIPTION = "原价稳定通道"
PLUS_GROUP_DESCRIPTION = "Plus 0.5x 通道"
MODEL_SYNC_LOCK_PATH = "/tmp/shenxiang-new-api-model-sync.lock"
MAX_MODELS_RESPONSE_BYTES = 5 * 1024 * 1024
OPENAI_CHANNEL_TYPE = 1
DEFAULT_CHANNEL_ORDER = ("aihub", "pdhlzy", "wangwang")
PLUS_TEXT_MODELS = (
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "codex-auto-review",
)
PLUS_UPSTREAM_MODELS = (
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
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
class PlusPlan:
    upstream_model_count: int
    matched_models: tuple[str, ...]
    missing_models: tuple[str, ...]


@dataclass(frozen=True)
class PlusChannelSpec:
    slug: str
    tag: str
    name: str
    key_env: str
    base_url_env: str
    default_base_url: str
    approved_hosts: tuple[str, ...]
    channel_type: int = OPENAI_CHANNEL_TYPE


PLUS_CHANNEL_SPECS = (
    PlusChannelSpec(
        slug="aihub",
        tag="xingren-plus-text-aihub",
        name="星人 Plus 文本链路 A",
        key_env="PLUS_AIHUB_API_KEY",
        base_url_env="PLUS_AIHUB_BASE_URL",
        default_base_url="https://aihub.top",
        approved_hosts=("aihub.top",),
    ),
    PlusChannelSpec(
        slug="wangwang",
        tag="xingren-plus-text-wangwang",
        name="星人 Plus 文本链路 B",
        key_env="PLUS_WANGWANG_API_KEY",
        base_url_env="PLUS_WANGWANG_BASE_URL",
        default_base_url="https://wangwang.sbs",
        approved_hosts=("wangwang.sbs",),
    ),
    PlusChannelSpec(
        slug="pdhlzy",
        tag="xingren-plus-text-pdhlzy",
        name="星人 Plus 文本链路 C",
        key_env="PLUS_PDHLZY_API_KEY",
        base_url_env="PLUS_PDHLZY_BASE_URL",
        default_base_url="https://pdhlzy.com",
        approved_hosts=("pdhlzy.com",),
    ),
)
PLUS_CHANNEL_TAGS = tuple(spec.tag for spec in PLUS_CHANNEL_SPECS)


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def sql_list(values: tuple[str, ...] | list[str]) -> str:
    return ",".join(sql_quote(value) for value in values)


def json_option(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def normalize_base_url(value: str, spec: PlusChannelSpec) -> str:
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


def require_upstream_key(spec: PlusChannelSpec) -> str:
    key = os.environ.get(spec.key_env, "").strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{spec.key_env} is missing or invalid")
    return key


def resolve_upstream_base_url(spec: PlusChannelSpec) -> str:
    configured = os.environ.get(spec.base_url_env, "").strip() or spec.default_base_url
    return normalize_base_url(configured, spec)


def parse_channel_order(raw_value: str) -> tuple[str, ...]:
    order = tuple(item.strip() for item in raw_value.split(",") if item.strip())
    expected = {spec.slug for spec in PLUS_CHANNEL_SPECS}
    if len(order) != len(expected) or set(order) != expected:
        raise ConfigurationError(
            "channel order must contain " + ",".join(DEFAULT_CHANNEL_ORDER) + " exactly once"
        )
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
            "User-Agent": "shenxiang-new-api-plus-model-probe/1.0",
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


def build_plus_plan(upstream_models: set[str], allow_partial: bool = False) -> PlusPlan:
    matched = tuple(model for model in PLUS_UPSTREAM_MODELS if model in upstream_models)
    missing = tuple(model for model in PLUS_UPSTREAM_MODELS if model not in upstream_models)
    if not matched:
        raise ConfigurationError("upstream has no supported Plus models")
    if missing and not allow_partial:
        raise ConfigurationError("upstream is missing required Plus models: " + ",".join(missing))
    return PlusPlan(
        upstream_model_count=len(upstream_models),
        matched_models=matched,
        missing_models=missing,
    )


def published_models_for_plan(plan: PlusPlan) -> tuple[str, ...]:
    upstream_models = set(plan.matched_models)
    return tuple(
        model
        for model in PLUS_TEXT_MODELS
        if model in upstream_models or (model == "codex-auto-review" and "gpt-5.5" in upstream_models)
    )


def validate_public_model_coverage(plans: dict[str, PlusPlan]) -> None:
    covered_models = {
        model
        for plan in plans.values()
        for model in published_models_for_plan(plan)
    }
    missing_models = [model for model in PLUS_TEXT_MODELS if model not in covered_models]
    if missing_models:
        raise ConfigurationError(
            "Plus routes do not cover public models: " + ",".join(missing_models)
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
    group_ratio[PLUS_GROUP] = PLUS_RATIO

    usable_groups = parse_json_object(options["UserUsableGroups"], "UserUsableGroups")
    usable_groups["default"] = DEFAULT_GROUP_DESCRIPTION
    usable_groups[PLUS_GROUP] = PLUS_GROUP_DESCRIPTION

    auto_groups = [
        group
        for group in parse_json_array(options["AutoGroups"], "AutoGroups")
        if group != PLUS_GROUP
    ]

    group_group_ratio = parse_json_object(options["GroupGroupRatio"], "GroupGroupRatio")
    for raw_overrides in group_group_ratio.values():
        if isinstance(raw_overrides, dict):
            raw_overrides.pop(PLUS_GROUP, None)

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
        "SET @plus_options_match := (SELECT COUNT(*) FROM options WHERE " + exact_matches + ");",
    ]


def guarded_option_update(option_key: str, option_value: str) -> str:
    return (
        "UPDATE options SET `value` = "
        + sql_quote(option_value)
        + " WHERE `key` = "
        + sql_quote(option_key)
        + " AND @plus_apply_allowed = 1;"
    )


def mysql_status(output: list[str], prefix: str) -> str:
    for line in reversed(output):
        if line.startswith(prefix):
            return line.removeprefix(prefix)
    raise ConfigurationError("production MySQL update returned no completion status")


def build_order_only_sql(order: tuple[str, ...] = DEFAULT_CHANNEL_ORDER) -> str:
    priorities = channel_priorities(order)
    allowed_tags_sql = sql_list(list(PLUS_CHANNEL_TAGS))
    priority_case = "CASE channel.tag " + " ".join(
        "WHEN " + sql_quote(spec.tag) + " THEN " + str(priorities[spec.slug])
        for spec in PLUS_CHANNEL_SPECS
    ) + " ELSE channel.priority END"
    tag_identity_conflicts = " + ".join(
        "IF((SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(spec.tag) + ") <> 1, 1, 0)"
        for spec in PLUS_CHANNEL_SPECS
    )
    return "\n".join(
        [
            "START TRANSACTION;",
            "SELECT id FROM channels WHERE tag IN ("
            + allowed_tags_sql
            + ") OR FIND_IN_SET("
            + sql_quote(PLUS_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 ORDER BY id FOR UPDATE;",
            "SET @plus_order_tag_identity_conflicts := " + tag_identity_conflicts + ";",
            "SET @plus_order_group_conflicts := (SELECT COUNT(*) FROM channels WHERE "
            + "(tag IN ("
            + allowed_tags_sql
            + ") AND REPLACE(COALESCE(`group`, ''), ' ', '') <> "
            + sql_quote(PLUS_GROUP)
            + ") OR (FIND_IN_SET("
            + sql_quote(PLUS_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 AND COALESCE(tag, '') NOT IN ("
            + allowed_tags_sql
            + ")));",
            "SET @plus_order_ability_conflicts := (SELECT COUNT(*) FROM abilities AS ability "
            + "JOIN channels AS channel ON channel.id = ability.channel_id "
            + "WHERE channel.tag IN ("
            + allowed_tags_sql
            + ") AND ability.`group` = "
            + sql_quote(PLUS_GROUP)
            + " AND COALESCE(ability.tag, '') <> channel.tag);",
            "SET @plus_order_apply_status := CASE "
            + "WHEN @plus_order_tag_identity_conflicts > 0 THEN 'channel_identity_conflict' "
            + "WHEN @plus_order_group_conflicts > 0 THEN 'channel_group_conflict' "
            + "WHEN @plus_order_ability_conflicts > 0 THEN 'ability_tag_conflict' "
            + "ELSE 'ok' END;",
            "SET @plus_order_apply_allowed := IF(@plus_order_apply_status = 'ok', 1, 0);",
            "UPDATE channels AS channel SET channel.priority = "
            + priority_case
            + " WHERE channel.tag IN ("
            + allowed_tags_sql
            + ") AND REPLACE(COALESCE(channel.`group`, ''), ' ', '') = "
            + sql_quote(PLUS_GROUP)
            + " AND @plus_order_apply_allowed = 1;",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
            + "SET ability.priority = "
            + priority_case
            + " WHERE channel.tag IN ("
            + allowed_tags_sql
            + ") AND REPLACE(COALESCE(channel.`group`, ''), ' ', '') = "
            + sql_quote(PLUS_GROUP)
            + " AND ability.`group` = "
            + sql_quote(PLUS_GROUP)
            + " AND ability.tag = channel.tag AND @plus_order_apply_allowed = 1;",
            "COMMIT;",
            "SELECT CONCAT('plus_order_apply_status=', @plus_order_apply_status);",
        ]
    )


def apply_channel_order(order: tuple[str, ...] = DEFAULT_CHANNEL_ORDER) -> None:
    output = mysql_exec(build_order_only_sql(order))
    status = mysql_status(output, "plus_order_apply_status=")
    errors = {
        "channel_identity_conflict": "Plus route identities are missing or duplicated",
        "channel_group_conflict": "Plus routes contain an unmanaged group assignment",
        "ability_tag_conflict": "Plus abilities do not match their managed route identity",
    }
    if status != "ok":
        raise ConfigurationError(errors.get(status, "Plus channel order apply failed closed"))


def channel_id_variable(slug: str) -> str:
    return "@plus_channel_id_" + slug


def build_apply_sql(
    plans: dict[str, PlusPlan],
    api_keys: dict[str, str],
    base_urls: dict[str, str],
    options: dict[str, str],
    order: tuple[str, ...] = DEFAULT_CHANNEL_ORDER,
) -> str:
    expected_slugs = {spec.slug for spec in PLUS_CHANNEL_SPECS}
    if set(plans) != expected_slugs or set(api_keys) != expected_slugs or set(base_urls) != expected_slugs:
        raise ConfigurationError("all Plus upstream plans, keys, and base URLs are required")
    validate_public_model_coverage(plans)
    priorities = channel_priorities(order)
    allowed_tags_sql = sql_list(list(PLUS_CHANNEL_TAGS))
    statements = ["START TRANSACTION;"]
    statements.extend(option_guard_statements(options))
    statements.extend(
        [
            "SELECT id FROM channels WHERE tag IN ("
            + allowed_tags_sql
            + ") OR FIND_IN_SET("
            + sql_quote(PLUS_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 ORDER BY id FOR UPDATE;",
            "SET @plus_group_conflict_count := (SELECT COUNT(*) FROM channels WHERE FIND_IN_SET("
            + sql_quote(PLUS_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 AND COALESCE(tag, '') NOT IN ("
            + allowed_tags_sql
            + "));",
            "SET @plus_duplicate_count := "
            + " + ".join(
                "IF((SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(spec.tag) + ") > 1, 1, 0)"
                for spec in PLUS_CHANNEL_SPECS
            )
            + ";",
            "SET @plus_apply_status := CASE "
            + "WHEN @plus_options_match <> "
            + str(len(options))
            + " THEN 'options_conflict' "
            + "WHEN @plus_group_conflict_count > 0 THEN 'channel_conflict' "
            + "WHEN @plus_duplicate_count > 0 THEN 'duplicate_channels' "
            + "ELSE 'ok' END;",
            "SET @plus_apply_allowed := IF(@plus_apply_status = 'ok', 1, 0);",
        ]
    )
    option_updates = build_group_option_updates(options)
    statements.extend(guarded_option_update(key, value) for key, value in option_updates.items())

    for spec in PLUS_CHANNEL_SPECS:
        channel_variable = channel_id_variable(spec.slug)
        published_models = published_models_for_plan(plans[spec.slug])
        models = ",".join(published_models)
        model_mapping = {model: model for model in plans[spec.slug].matched_models}
        if "codex-auto-review" in published_models:
            model_mapping["codex-auto-review"] = "gpt-5.5"
        model_mapping_json = json_option(model_mapping)
        statements.append(
            "SET "
            + channel_variable
            + " := IF(@plus_apply_allowed = 1, (SELECT MIN(id) FROM channels WHERE tag = "
            + sql_quote(spec.tag)
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
                    sql_quote(PLUS_GROUP),
                    sql_quote(model_mapping_json),
                    str(priorities[spec.slug]),
                    "1",
                    sql_quote(spec.tag),
                    sql_quote(PLUS_GROUP_DESCRIPTION),
                    sql_quote("{}"),
                ]
            )
            + " WHERE "
            + channel_variable
            + " IS NULL AND @plus_apply_allowed = 1;"
        )
        statements.append(
            "SET "
            + channel_variable
            + " := IF(@plus_apply_allowed = 1, IFNULL("
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
            + sql_quote(PLUS_GROUP)
            + ", model_mapping = "
            + sql_quote(model_mapping_json)
            + ", priority = "
            + str(priorities[spec.slug])
            + ", auto_ban = 1, tag = "
            + sql_quote(spec.tag)
            + ", remark = "
            + sql_quote(PLUS_GROUP_DESCRIPTION)
            + ", settings = "
            + sql_quote("{}")
            + " WHERE id = "
            + channel_variable
            + " AND @plus_apply_allowed = 1;"
        )

    channel_variables = ",".join(channel_id_variable(spec.slug) for spec in PLUS_CHANNEL_SPECS)
    statements.extend(
        [
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(PLUS_GROUP)
            + " AND channel_id NOT IN ("
            + channel_variables
            + ") AND @plus_apply_allowed = 1;",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN ("
            + channel_variables
            + ") AND @plus_apply_allowed = 1;",
        ]
    )
    for spec in PLUS_CHANNEL_SPECS:
        for model in published_models_for_plan(plans[spec.slug]):
            statements.append(
                "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) SELECT "
                + ", ".join(
                    [
                        sql_quote(PLUS_GROUP),
                        sql_quote(model),
                        channel_id_variable(spec.slug),
                        "1",
                        str(priorities[spec.slug]),
                        "100",
                        sql_quote(spec.tag),
                    ]
                )
                + " WHERE @plus_apply_allowed = 1 ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = 100, tag = VALUES(tag);"
            )
    statements.append("COMMIT;")
    statements.append("SELECT CONCAT('plus_apply_status=', @plus_apply_status);")
    return "\n".join(statements)


def apply_plus_plan(
    plans: dict[str, PlusPlan],
    api_keys: dict[str, str],
    base_urls: dict[str, str],
    order: tuple[str, ...] = DEFAULT_CHANNEL_ORDER,
) -> None:
    output = mysql_exec(build_apply_sql(plans, api_keys, base_urls, load_group_options(), order))
    status = mysql_status(output, "plus_apply_status=")
    errors = {
        "options_conflict": "group options changed concurrently; retry the apply operation",
        "channel_conflict": "the Plus group is assigned to an unmanaged channel",
        "duplicate_channels": "multiple channels use the same plus route identity",
    }
    if status != "ok":
        raise ConfigurationError(errors.get(status, "Plus channel apply failed closed"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely configure the isolated Plus text channels")
    apply_mode = parser.add_mutually_exclusive_group()
    apply_mode.add_argument("--apply", action="store_true", help="write the validated channels and group configuration")
    apply_mode.add_argument(
        "--apply-order-only",
        action="store_true",
        help="change only managed channel and ability priorities, preserving availability state",
    )
    parser.add_argument(
        "--order",
        default=",".join(DEFAULT_CHANNEL_ORDER),
        help="comma-separated channel order from primary to fallback",
    )
    args = parser.parse_args()

    order = parse_channel_order(args.order)
    if args.apply_order_only:
        with model_sync_lock():
            apply_channel_order(order)
        print(
            json.dumps(
                {
                    "ok": True,
                    "action": "order_applied",
                    "ratio": PLUS_RATIO,
                    "channel_order": order,
                    "runtime_cache_refresh_required": True,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        return 0

    plans: dict[str, PlusPlan] = {}
    api_keys: dict[str, str] = {}
    base_urls: dict[str, str] = {}
    for spec in PLUS_CHANNEL_SPECS:
        api_key = require_upstream_key(spec)
        base_url = resolve_upstream_base_url(spec)
        plans[spec.slug] = build_plus_plan(fetch_upstream_models(base_url, api_key), allow_partial=True)
        api_keys[spec.slug] = api_key
        base_urls[spec.slug] = base_url

    validate_public_model_coverage(plans)

    if args.apply:
        with model_sync_lock():
            apply_plus_plan(plans, api_keys, base_urls, order)
    priorities = channel_priorities(order)
    print(
        json.dumps(
            {
                "ok": True,
                "action": "applied" if args.apply else "probe",
                "ratio": PLUS_RATIO,
                "channel_order": order,
                "published_models": PLUS_TEXT_MODELS,
                "channels": {
                    spec.slug: {
                        "priority": priorities[spec.slug],
                        "upstream_model_count": plans[spec.slug].upstream_model_count,
                        "matched_upstream_models": plans[spec.slug].matched_models,
                        "missing_upstream_models": plans[spec.slug].missing_models,
                        "published_models": published_models_for_plan(plans[spec.slug]),
                        "wire_api": "responses",
                    }
                    for spec in PLUS_CHANNEL_SPECS
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
