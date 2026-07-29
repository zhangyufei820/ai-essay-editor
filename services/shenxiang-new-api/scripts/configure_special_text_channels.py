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


SPECIAL_GROUP = "special"
SPECIAL_RATIO = 0.06
SPECIAL_GROUP_DESCRIPTION = "特价 0.06x 文本通道"
SPECIAL_MODELS = (
    "gpt-5.4-mini",
    "gpt-5.5",
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
)
SPECIAL_CHANNEL_TAGS = (
    "xingren-special-text-primary",
    "xingren-special-text-fallback-1",
    "xingren-special-text-fallback-2",
    "xingren-special-text-fallback-3",
)
SPECIAL_KEY_ENVS = (
    "SPECIAL_TEXT_PRIMARY_API_KEY",
    "SPECIAL_TEXT_FALLBACK_1_API_KEY",
    "SPECIAL_TEXT_FALLBACK_2_API_KEY",
    "SPECIAL_TEXT_FALLBACK_3_API_KEY",
)
SPECIAL_BASE_URL_ENV = "SPECIAL_TEXT_BASE_URL"
SPECIAL_DEFAULT_BASE_URL = "https://aihub.top"
SPECIAL_APPROVED_HOSTS = ("aihub.top",)
SPECIAL_CHANNEL_PRIORITIES = (40, 30, 20, 10)
SPECIAL_OPTION_KEYS = ("GroupRatio", "UserUsableGroups", "AutoGroups", "GroupGroupRatio")
SPECIAL_LOCK_PATH = "/tmp/shenxiang-new-api-special-text.lock"
MAX_MODELS_RESPONSE_BYTES = 5 * 1024 * 1024
OPENAI_CHANNEL_TYPE = 1


class ConfigurationError(RuntimeError):
    pass


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, status_code, message, response_headers, new_url):
        return None


@dataclass(frozen=True)
class SpecialPlan:
    upstream_model_count: int
    matched_models: tuple[str, ...]
    missing_models: tuple[str, ...]


@dataclass(frozen=True)
class SpecialChannelSpec:
    index: int
    tag: str
    key_env: str


SPECIAL_CHANNEL_SPECS = tuple(
    SpecialChannelSpec(index, tag, key_env)
    for index, (tag, key_env) in enumerate(zip(SPECIAL_CHANNEL_TAGS, SPECIAL_KEY_ENVS))
)


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def json_option(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def read_key(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if len(value) < 16 or any(character.isspace() for character in value):
        raise ConfigurationError(f"{name} is missing or invalid")
    return value


def normalize_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    try:
        parsed = urllib.parse.urlsplit(normalized)
        port = parsed.port
    except ValueError:
        raise ConfigurationError("special upstream base URL is invalid") from None
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ConfigurationError("special upstream base URL must be a credential-free HTTPS origin")
    if parsed.hostname not in SPECIAL_APPROVED_HOSTS or port not in {None, 443}:
        raise ConfigurationError("special upstream base URL must use an approved HTTPS host")
    if parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ConfigurationError("special upstream base URL must not include a path, query, or fragment")
    return normalized


def fetch_upstream_models(base_url: str, api_key: str) -> set[str]:
    request = urllib.request.Request(
        base_url + "/v1/models",
        headers={
            "Authorization": "Bearer " + api_key,
            "Accept": "application/json",
            "User-Agent": "shenxiang-new-api-special-model-probe/1.0",
        },
        method="GET",
    )
    try:
        with urllib.request.build_opener(NoRedirectHandler()).open(request, timeout=15) as response:
            body = response.read(MAX_MODELS_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        raise ConfigurationError(f"special upstream model probe returned HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError):
        raise ConfigurationError("special upstream model probe failed or timed out") from None
    if len(body) > MAX_MODELS_RESPONSE_BYTES:
        raise ConfigurationError("special upstream model response exceeded the size limit")
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("special upstream model response was not valid JSON") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ConfigurationError("special upstream model response did not use the OpenAI models schema")
    models = {
        item.get("id", "").strip()
        for item in payload["data"]
        if isinstance(item, dict) and isinstance(item.get("id"), str) and item.get("id", "").strip()
    }
    if not models:
        raise ConfigurationError("special upstream model response contained no usable model IDs")
    return models


def build_special_plan(upstream_models: set[str]) -> SpecialPlan:
    matched = tuple(model for model in SPECIAL_MODELS if model in upstream_models)
    missing = tuple(model for model in SPECIAL_MODELS if model not in upstream_models)
    if not matched:
        raise ConfigurationError("special upstream does not expose any approved model")
    return SpecialPlan(len(upstream_models), matched, missing)


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
        output = subprocess.check_output(command, env=environment, stderr=subprocess.DEVNULL).decode("utf-8")
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
        "-uroot",
        "-N",
        "-B",
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
        return completed.stdout.decode("utf-8").splitlines()
    except (subprocess.CalledProcessError, UnicodeDecodeError):
        raise ConfigurationError("production MySQL update failed") from None


def load_options() -> dict[str, str]:
    keys = ",".join(sql_quote(key) for key in SPECIAL_OPTION_KEYS)
    rows = mysql(f"SELECT `key`, COALESCE(`value`, '') FROM options WHERE `key` IN ({keys})")
    options = {row[0]: row[1] for row in rows if len(row) == 2}
    missing = [key for key in SPECIAL_OPTION_KEYS if key not in options]
    if missing:
        raise ConfigurationError("required group options are missing: " + ",".join(missing))
    return options


def parse_object(value: str, key: str) -> dict[str, object]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        raise ConfigurationError(f"{key} is not valid JSON") from None
    if not isinstance(parsed, dict):
        raise ConfigurationError(f"{key} must be a JSON object")
    return parsed


def parse_array(value: str, key: str) -> list[object]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        raise ConfigurationError(f"{key} is not valid JSON") from None
    if not isinstance(parsed, list):
        raise ConfigurationError(f"{key} must be a JSON array")
    return parsed


def build_group_option_updates(options: dict[str, str]) -> dict[str, str]:
    group_ratio = parse_object(options["GroupRatio"], "GroupRatio")
    group_ratio[SPECIAL_GROUP] = SPECIAL_RATIO
    usable_groups = parse_object(options["UserUsableGroups"], "UserUsableGroups")
    usable_groups[SPECIAL_GROUP] = SPECIAL_GROUP_DESCRIPTION
    auto_groups = [group for group in parse_array(options["AutoGroups"], "AutoGroups") if group != SPECIAL_GROUP]
    group_group_ratio = parse_object(options["GroupGroupRatio"], "GroupGroupRatio")
    for overrides in group_group_ratio.values():
        if isinstance(overrides, dict):
            overrides.pop(SPECIAL_GROUP, None)
    return {
        "GroupRatio": json_option(group_ratio),
        "UserUsableGroups": json_option(usable_groups),
        "AutoGroups": json_option(auto_groups),
        "GroupGroupRatio": json_option(group_group_ratio),
    }


def option_guard_statements(options: dict[str, str]) -> list[str]:
    exact_matches = " OR ".join(
        "(`key` = " + sql_quote(key) + " AND BINARY COALESCE(`value`, '') = BINARY " + sql_quote(value) + ")"
        for key, value in options.items()
    )
    keys = ",".join(sql_quote(key) for key in options)
    return [
        "SELECT `key` FROM options WHERE `key` IN (" + keys + ") FOR UPDATE;",
        "SET @special_options_match := (SELECT COUNT(*) FROM options WHERE " + exact_matches + ");",
        "SET @special_apply_allowed := IF(@special_options_match = " + str(len(options)) + ", 1, 0);",
    ]


def channel_variable(index: int) -> str:
    return "@special_channel_id_" + str(index)


def build_apply_sql(plans: dict[int, SpecialPlan], api_keys: dict[int, str], base_url: str, options: dict[str, str]) -> str:
    if set(plans) != set(range(len(SPECIAL_CHANNEL_SPECS))):
        raise ConfigurationError("all special upstream plans are required")
    tags_sql = ",".join(sql_quote(tag) for tag in SPECIAL_CHANNEL_TAGS)
    statements = ["START TRANSACTION;"]
    statements.extend(option_guard_statements(options))
    statements.extend(
        [
            "SELECT id FROM channels WHERE tag IN (" + tags_sql + ") OR FIND_IN_SET(" + sql_quote(SPECIAL_GROUP) + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 FOR UPDATE;",
            "SET @special_conflict_count := (SELECT COUNT(*) FROM channels WHERE FIND_IN_SET(" + sql_quote(SPECIAL_GROUP) + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 AND COALESCE(tag, '') NOT IN (" + tags_sql + "));",
            "SET @special_duplicate_count := " + " + ".join("IF((SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(tag) + ") > 1, 1, 0)" for tag in SPECIAL_CHANNEL_TAGS) + ";",
            "SET @special_apply_allowed := IF(@special_apply_allowed = 1 AND @special_conflict_count = 0 AND @special_duplicate_count = 0, 1, 0);",
        ]
    )
    for key, value in build_group_option_updates(options).items():
        statements.append("UPDATE options SET `value` = " + sql_quote(value) + " WHERE `key` = " + sql_quote(key) + " AND @special_apply_allowed = 1;")

    for spec in SPECIAL_CHANNEL_SPECS:
        index = spec.index
        variable = channel_variable(index)
        models = ",".join(plans[index].matched_models)
        mapping = json_option({model: model for model in plans[index].matched_models})
        statements.append("SET " + variable + " := IF(@special_apply_allowed = 1, (SELECT MIN(id) FROM channels WHERE tag = " + sql_quote(spec.tag) + "), NULL);")
        statements.append(
            "INSERT INTO channels (type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark, settings) SELECT "
            + ",".join([str(OPENAI_CHANNEL_TYPE), sql_quote(api_keys[index]), "1", sql_quote("星人特价文本链路 " + str(index + 1)), "100", "UNIX_TIMESTAMP()", "0", "0", sql_quote(base_url), sql_quote(models), sql_quote(SPECIAL_GROUP), sql_quote(mapping), str(SPECIAL_CHANNEL_PRIORITIES[index]), "1", sql_quote(spec.tag), sql_quote(SPECIAL_GROUP_DESCRIPTION), sql_quote("{}")])
            + " WHERE " + variable + " IS NULL AND @special_apply_allowed = 1;"
        )
        statements.append("SET " + variable + " := IF(@special_apply_allowed = 1, IFNULL(" + variable + ", LAST_INSERT_ID()), NULL);")
        statements.append(
            "UPDATE channels SET type = " + str(OPENAI_CHANNEL_TYPE) + ", `key` = " + sql_quote(api_keys[index]) + ", status = 1, name = " + sql_quote("星人特价文本链路 " + str(index + 1)) + ", weight = 100, base_url = " + sql_quote(base_url) + ", models = " + sql_quote(models) + ", `group` = " + sql_quote(SPECIAL_GROUP) + ", model_mapping = " + sql_quote(mapping) + ", priority = " + str(SPECIAL_CHANNEL_PRIORITIES[index]) + ", auto_ban = 1, tag = " + sql_quote(spec.tag) + ", remark = " + sql_quote(SPECIAL_GROUP_DESCRIPTION) + ", settings = '{}', other = '{}' WHERE id = " + variable + " AND @special_apply_allowed = 1;"
        )

    variables = ",".join(channel_variable(spec.index) for spec in SPECIAL_CHANNEL_SPECS)
    statements.append("UPDATE abilities SET enabled = 0 WHERE `group` = " + sql_quote(SPECIAL_GROUP) + " AND channel_id NOT IN (" + variables + ") AND @special_apply_allowed = 1;")
    statements.append("UPDATE abilities SET enabled = 0 WHERE channel_id IN (" + variables + ") AND @special_apply_allowed = 1;")
    for spec in SPECIAL_CHANNEL_SPECS:
        for model in plans[spec.index].matched_models:
            statements.append("INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) SELECT " + ",".join([sql_quote(SPECIAL_GROUP), sql_quote(model), channel_variable(spec.index), "1", str(SPECIAL_CHANNEL_PRIORITIES[spec.index]), "100", sql_quote(spec.tag)]) + " WHERE @special_apply_allowed = 1 ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = VALUES(weight), tag = VALUES(tag);")
    statements.extend(["COMMIT;", "SELECT CONCAT('special_apply_status=', IF(@special_apply_allowed = 1, 'ok', 'conflict')); "])
    return "\n".join(statements)


def mysql_status(output: list[str], prefix: str) -> str:
    for line in reversed(output):
        if line.startswith(prefix):
            return line.removeprefix(prefix).strip()
    raise ConfigurationError("production MySQL update returned no completion status")


def apply_special_plans(plans: dict[int, SpecialPlan], api_keys: dict[int, str], base_url: str) -> None:
    output = mysql_exec(build_apply_sql(plans, api_keys, base_url, load_options()))
    status = mysql_status(output, "special_apply_status=")
    if status != "ok":
        raise ConfigurationError("special channel apply conflicted with concurrent or unmanaged state")


def build_disable_sql() -> str:
    tags_sql = ",".join(sql_quote(tag) for tag in SPECIAL_CHANNEL_TAGS)
    return "\n".join(
        [
            "START TRANSACTION;",
            "UPDATE channels SET status = 2 WHERE tag IN (" + tags_sql + ") OR FIND_IN_SET(" + sql_quote(SPECIAL_GROUP) + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
            "UPDATE abilities SET enabled = 0 WHERE `group` = " + sql_quote(SPECIAL_GROUP) + " OR channel_id IN (SELECT id FROM channels WHERE tag IN (" + tags_sql + "));",
            "COMMIT;",
            "SELECT 'special_disable_status=channel_only';",
        ]
    )


def disable_special_channels() -> None:
    if mysql_status(mysql_exec(build_disable_sql()), "special_disable_status=") != "channel_only":
        raise ConfigurationError("special channel disable failed")


@contextlib.contextmanager
def model_sync_lock() -> Iterator[None]:
    lock_fd = os.open(SPECIAL_LOCK_PATH, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ConfigurationError("special model configuration is already running") from None
        yield
    finally:
        os.close(lock_fd)


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure the isolated special 0.06x text group")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--disable", action="store_true")
    args = parser.parse_args()
    if args.apply and args.disable:
        parser.error("--apply and --disable are mutually exclusive")
    if args.disable:
        with model_sync_lock():
            disable_special_channels()
        print(json.dumps({"ok": True, "action": "disabled", "group": SPECIAL_GROUP}, ensure_ascii=False, separators=(",", ":")))
        return 0

    base_url = normalize_base_url(os.environ.get(SPECIAL_BASE_URL_ENV, SPECIAL_DEFAULT_BASE_URL))
    plans: dict[int, SpecialPlan] = {}
    api_keys: dict[int, str] = {}
    union: set[str] = set()
    for spec in SPECIAL_CHANNEL_SPECS:
        api_key = read_key(spec.key_env)
        plan = build_special_plan(fetch_upstream_models(base_url, api_key))
        plans[spec.index] = plan
        api_keys[spec.index] = api_key
        union.update(plan.matched_models)
    missing = [model for model in SPECIAL_MODELS if model not in union]
    if missing:
        raise ConfigurationError("special upstreams collectively lack required models: " + ",".join(missing))
    if args.apply:
        with model_sync_lock():
            apply_special_plans(plans, api_keys, base_url)
    print(json.dumps({
        "ok": True,
        "action": "applied" if args.apply else "probe",
        "group": SPECIAL_GROUP,
        "ratio": SPECIAL_RATIO,
        "channel_order": list(SPECIAL_CHANNEL_TAGS),
        "channels": {
            str(spec.index + 1): {
                "priority": SPECIAL_CHANNEL_PRIORITIES[spec.index],
                "matched_models": list(plans[spec.index].matched_models),
                "missing_models": list(plans[spec.index].missing_models),
                "upstream_model_count": plans[spec.index].upstream_model_count,
                "wire_api": "responses",
            }
            for spec in SPECIAL_CHANNEL_SPECS
        },
    }, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
