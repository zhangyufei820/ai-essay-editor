#!/usr/bin/env python3
"""Probe existing OpenAI routes and configure independent Astra chains."""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sync_app_model_permissions as sync

MODEL_NAME = "gpt-6-astra"
LEGACY_CHANNEL_TAG = "xingren-gpt6-astra"
SOURCE_CHANNEL_TAGS = (
    LEGACY_CHANNEL_TAG,
    "xingren-discount-text-aihub",
    "xingren-discount-text-wangwang",
    "xingren-plus-text-pdhlzy",
)
MANAGED_GROUPS = ("default", "standard", "pro", "code", "internal", "plus", "discount", "special")
MANAGED_TAG_PREFIX = "xingren-gpt6-astra-"
CHAIN_PRIORITIES = (40, 30, 20, 10)
LOCK_PATH = "/tmp/shenxiang-new-api-gpt6-astra-channel.lock"
LOCK_HELD_ENV = "GPT6_ASTRA_CHANNEL_SYNC_LOCK_HELD"
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_REQUEST_ATTEMPTS = 3
RETRYABLE_HTTP_STATUS = {429, 502, 503, 504}


class ConfigurationError(RuntimeError):
    pass


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, status_code, message, response_headers, new_url):
        return None


@dataclass(frozen=True)
class SourceChannel:
    tag: str
    api_key: str
    base_url: str
    channel_id: int


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def validate_key(value: str, label: str = "credential") -> str:
    key = value.strip()
    if len(key) < 16 or any(character.isspace() for character in key):
        raise ConfigurationError(f"{label} is missing or invalid")
    return key


def normalize_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    try:
        parsed = urllib.parse.urlsplit(normalized)
        port = parsed.port
    except ValueError:
        raise ConfigurationError("source base URL is invalid") from None
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ConfigurationError("source base URL must be a credential-free HTTPS origin")
    if port not in {None, 443} or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ConfigurationError("source base URL must not include a port, path, query, or fragment")
    return normalized


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
            raise ConfigurationError("GPT-6 Astra channel sync is already running") from None
        yield
    finally:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def fetch_json(url: str, api_key: str, body: dict[str, object] | None = None) -> dict[str, object]:
    data = json.dumps(body, separators=(",", ":")).encode() if body is not None else None
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + validate_key(api_key),
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "shenxiang-gpt6-astra-probe/2.0",
        },
        method="POST" if body is not None else "GET",
    )
    opener = urllib.request.build_opener(NoRedirectHandler())
    for attempt in range(1, MAX_REQUEST_ATTEMPTS + 1):
        try:
            with opener.open(request, timeout=45) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            break
        except urllib.error.HTTPError as exc:
            if exc.code not in RETRYABLE_HTTP_STATUS or attempt == MAX_REQUEST_ATTEMPTS:
                raise ConfigurationError(f"upstream request returned HTTP {exc.code}") from None
        except (urllib.error.URLError, TimeoutError):
            if attempt == MAX_REQUEST_ATTEMPTS:
                raise ConfigurationError("upstream request failed or timed out") from None
        time.sleep(2 ** (attempt - 1))
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ConfigurationError("upstream response exceeded the size limit")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ConfigurationError("upstream response was not valid JSON") from None
    if not isinstance(payload, dict):
        raise ConfigurationError("upstream response was not an object")
    return payload


def response_ok(payload: dict[str, object]) -> bool:
    if payload.get("status") != "completed":
        return False
    text = ""
    for item in payload.get("output", []):
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if isinstance(content, dict):
                text += str(content.get("text") or "")
    return text.strip() == "OK"


def chat_ok(payload: dict[str, object]) -> bool:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return False
    message = choices[0].get("message")
    return isinstance(message, dict) and str(message.get("content") or "").strip() == "OK"


def probe_source(source: SourceChannel) -> dict[str, object]:
    models = fetch_json(source.base_url + "/v1/models", source.api_key)
    data = models.get("data")
    has_model = isinstance(data, list) and any(
        isinstance(item, dict) and item.get("id") == MODEL_NAME for item in data
    )
    if not has_model:
        raise ConfigurationError(f"{source.tag} does not expose {MODEL_NAME}")
    response = fetch_json(
        source.base_url + "/v1/responses",
        source.api_key,
        {"model": MODEL_NAME, "input": "Reply with exactly OK.", "max_output_tokens": 16, "stream": False},
    )
    completion = fetch_json(
        source.base_url + "/v1/chat/completions",
        source.api_key,
        {"model": MODEL_NAME, "messages": [{"role": "user", "content": "Reply with exactly OK."}], "max_completion_tokens": 16, "stream": False},
    )
    if not response_ok(response) or not chat_ok(completion):
        raise ConfigurationError(f"{source.tag} failed Responses or Chat Completions verification")
    return {"tag": source.tag, "channel_id": source.channel_id, "models": True, "responses": True, "chat": True}


def load_sources() -> tuple[SourceChannel, ...]:
    tags = ",".join(sql_quote(tag) for tag in SOURCE_CHANNEL_TAGS)
    rows = sync.mysql(
        "SELECT id, COALESCE(tag,''), COALESCE(base_url,''), COALESCE(`key`,'') "
        "FROM channels WHERE tag IN (" + tags + ") ORDER BY FIELD(tag," + tags + "), id"
    )
    if len(rows) != len(SOURCE_CHANNEL_TAGS):
        raise ConfigurationError("one or more existing OpenAI source channels are missing or duplicated")
    result: list[SourceChannel] = []
    seen: set[str] = set()
    for row in rows:
        if len(row) != 4 or row[1] in seen:
            raise ConfigurationError("existing OpenAI source channel identities are ambiguous")
        seen.add(row[1])
        result.append(SourceChannel(row[1], validate_key(row[3], row[1]), normalize_base_url(row[2]), int(row[0])))
    if tuple(source.tag for source in result) != SOURCE_CHANNEL_TAGS:
        raise ConfigurationError("existing OpenAI source channel order is incomplete")
    return tuple(result)


def managed_tag(group: str, index: int) -> str:
    return f"{MANAGED_TAG_PREFIX}{group}-{index + 1}"


def managed_tags() -> tuple[str, ...]:
    return tuple(managed_tag(group, index) for group in MANAGED_GROUPS for index in range(len(SOURCE_CHANNEL_TAGS)))


def validate_group_options() -> None:
    rows = sync.mysql("SELECT `key`, COALESCE(`value`,'') FROM options WHERE `key` IN ('GroupRatio','UserUsableGroups')")
    options = {row[0]: row[1] for row in rows if len(row) == 2}
    for key in ("GroupRatio", "UserUsableGroups"):
        try:
            parsed = json.loads(options[key])
        except (KeyError, json.JSONDecodeError):
            raise ConfigurationError(f"{key} is missing or invalid") from None
        if not isinstance(parsed, dict) or any(group not in parsed for group in MANAGED_GROUPS):
            raise ConfigurationError(f"{key} does not contain all managed Astra groups")


def validate_managed_channel_tags() -> None:
    rows = sync.mysql(
        "SELECT tag, COUNT(*) FROM channels WHERE tag LIKE "
        + sql_quote(MANAGED_TAG_PREFIX + "%")
        + " GROUP BY tag HAVING COUNT(*) > 1"
    )
    if rows:
        raise ConfigurationError("GPT-6 Astra managed tags are duplicated")


def build_apply_sql(sources: tuple[SourceChannel, ...]) -> str:
    tags = managed_tags()
    all_tags = (LEGACY_CHANNEL_TAG, *tags)
    tag_sql = ",".join(sql_quote(tag) for tag in all_tags)
    target_vars: list[str] = []
    statements = [
        "START TRANSACTION;",
        "SELECT id FROM channels WHERE tag IN (" + tag_sql + ") FOR UPDATE;",
        "SET @astra_duplicate_count := " + " + ".join("IF((SELECT COUNT(*) FROM channels WHERE tag=" + sql_quote(tag) + ") > 1,1,0)" for tag in tags) + ";",
        "SET @astra_ratio_ok := (JSON_VALID((SELECT `value` FROM options WHERE `key`='GroupRatio')) AND " + " AND ".join("JSON_EXTRACT((SELECT `value` FROM options WHERE `key`='GroupRatio'), '$." + group + "') IS NOT NULL" for group in MANAGED_GROUPS) + ");",
        "SET @astra_apply_status := CASE WHEN @astra_duplicate_count > 0 THEN 'duplicate_channels' WHEN @astra_ratio_ok <> 1 THEN 'group_options_invalid' ELSE 'ok' END;",
        "SET @astra_apply_allowed := IF(@astra_apply_status='ok',1,0);",
        "UPDATE channels SET status=2 WHERE tag=" + sql_quote(LEGACY_CHANNEL_TAG) + " AND @astra_apply_allowed=1;",
    ]
    for group in MANAGED_GROUPS:
        for index, source in enumerate(sources):
            tag = managed_tag(group, index)
            variable = "@astra_" + group.replace("-", "_") + "_" + str(index + 1)
            target_vars.append(variable)
            mapping = json.dumps({MODEL_NAME: MODEL_NAME}, separators=(",", ":"))
            name = "GPT-6 Astra " + group + " 链路 " + chr(65 + index)
            statements.extend(
                [
                    "SET " + variable + " := IF(@astra_apply_allowed=1,(SELECT MIN(id) FROM channels WHERE tag=" + sql_quote(tag) + "),NULL);",
                    "INSERT INTO channels (type,`key`,status,name,weight,created_time,test_time,response_time,base_url,models,`group`,model_mapping,priority,auto_ban,tag,remark,settings) SELECT 1," + sql_quote(source.api_key) + ",1," + sql_quote(name) + ",100,UNIX_TIMESTAMP(),0,0," + sql_quote(source.base_url) + "," + sql_quote(MODEL_NAME) + "," + sql_quote(group) + "," + sql_quote(mapping) + "," + str(CHAIN_PRIORITIES[index]) + ",1," + sql_quote(tag) + ",'独立分组计费链路','{}' WHERE " + variable + " IS NULL AND @astra_apply_allowed=1;",
                    "SET " + variable + " := IF(@astra_apply_allowed=1,IFNULL(" + variable + ",LAST_INSERT_ID()),NULL);",
                    "UPDATE channels SET type=1, `key`=" + sql_quote(source.api_key) + ", status=1, name=" + sql_quote(name) + ", weight=100, base_url=" + sql_quote(source.base_url) + ", models=" + sql_quote(MODEL_NAME) + ", `group`=" + sql_quote(group) + ", model_mapping=" + sql_quote(mapping) + ", priority=" + str(CHAIN_PRIORITIES[index]) + ", auto_ban=1, tag=" + sql_quote(tag) + ", remark='独立分组计费链路', settings='{}' WHERE id=" + variable + " AND @astra_apply_allowed=1;",
                ]
            )
    id_list = ",".join(target_vars)
    statements.extend(
        [
            "UPDATE abilities SET enabled=0 WHERE model=" + sql_quote(MODEL_NAME) + " AND channel_id NOT IN (" + id_list + ") AND @astra_apply_allowed=1;",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id=ability.channel_id SET ability.enabled=0 WHERE channel.tag IN (" + ",".join(sql_quote(tag) for tag in tags) + ") AND (ability.model<>" + sql_quote(MODEL_NAME) + " OR ability.`group`<>channel.`group` OR ability.tag<>channel.tag) AND @astra_apply_allowed=1;",
        ]
    )
    for group in MANAGED_GROUPS:
        for index in range(len(sources)):
            tag = managed_tag(group, index)
            variable = "@astra_" + group.replace("-", "_") + "_" + str(index + 1)
            statements.append(
                "INSERT INTO abilities (`group`,model,channel_id,enabled,priority,weight,tag) VALUES (" + ",".join([sql_quote(group), sql_quote(MODEL_NAME), variable, "1", str(CHAIN_PRIORITIES[index]), "100", sql_quote(tag)]) + ") ON DUPLICATE KEY UPDATE enabled=1,priority=VALUES(priority),weight=100,tag=VALUES(tag);"
            )
    statements.append("COMMIT;")
    return "\n".join(statements)


def apply_sources(sources: tuple[SourceChannel, ...]) -> None:
    validate_group_options()
    validate_managed_channel_tags()
    sync.mysql_exec(build_apply_sql(sources))


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe OpenAI sources and configure independent GPT-6 Astra chains")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true")
    action.add_argument("--reconcile-if-configured", action="store_true")
    args = parser.parse_args()
    with channel_lock():
        sources = load_sources()
        probe_results = [probe_source(source) for source in sources]
        configured = sync.mysql("SELECT COUNT(*) FROM channels WHERE tag LIKE " + sql_quote(MANAGED_TAG_PREFIX + "%"))
        if args.reconcile_if_configured and (not configured or int(configured[0][0]) == 0):
            print(json.dumps({"ok": True, "action": "not_configured", "model": MODEL_NAME, "sources": probe_results}, ensure_ascii=False, separators=(",", ":")))
            return 0
        if args.apply or args.reconcile_if_configured:
            apply_sources(sources)
    print(json.dumps({"ok": True, "action": "applied" if args.apply or args.reconcile_if_configured else "probe", "model": MODEL_NAME, "groups": MANAGED_GROUPS, "sources": probe_results}, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
