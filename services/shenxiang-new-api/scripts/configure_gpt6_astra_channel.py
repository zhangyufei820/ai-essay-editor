#!/usr/bin/env python3
"""Probe existing OpenAI routes and configure independent Astra chains."""
from __future__ import annotations

import argparse
import contextlib
import concurrent.futures
import fcntl
import http.client
import json
import math
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import sync_app_model_permissions as sync
import provider_monitor

MODEL_NAME = "gpt-6-astra"
LEGACY_CHANNEL_TAG = "xingren-gpt6-astra"
SOURCE_CHANNEL_TAGS = (
    LEGACY_CHANNEL_TAG,
    "xingren-discount-text-aihub",
    "xingren-plus-text-wangwang",
    "xingren-plus-text-pdhlzy",
)
# Public tiers prefer their configured sources, but only completed probes can
# enable them. Legacy tiers retain their established order above.
GROUP_SOURCE_TAG_ORDER_OVERRIDES = {
    "discount": (
        "xingren-plus-text-pdhlzy",
        "xingren-plus-text-wangwang",
        "xingren-discount-text-aihub",
        LEGACY_CHANNEL_TAG,
    ),
    "plus": ("xingren-plus-text-wangwang", "xingren-plus-text-pdhlzy", "xingren-discount-text-aihub", LEGACY_CHANNEL_TAG),
    "default": ("xingren-plus-text-wangwang", "xingren-plus-text-pdhlzy", "xingren-discount-text-aihub", LEGACY_CHANNEL_TAG),
}
MANAGED_GROUPS = ("default", "standard", "pro", "code", "internal", "plus", "discount", "special")
MANAGED_TAG_PREFIX = "xingren-gpt6-astra-"
CHAIN_PRIORITIES = (40, 30, 20, 10)
DISCOUNT_PRIMARY_SOURCE_TAG = "xingren-plus-text-wangwang"
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


def codex_completed_response(source: SourceChannel, body: dict) -> dict | None:
    """Require the terminal event Codex consumes; never follow credential redirects."""
    parsed = urllib.parse.urlsplit(normalize_base_url(source.base_url))
    connection = http.client.HTTPSConnection(parsed.hostname, timeout=60)
    deadline = time.monotonic() + 60
    size = 0
    try:
        connection.request("POST", "/v1/responses", json.dumps(body).encode(), {
            "Authorization": "Bearer " + source.api_key,
            "Content-Type": "application/json", "Accept": "text/event-stream",
            "User-Agent": "codex_cli_rs/0.114.0",
        })
        response = connection.getresponse()
        if response.status != 200:
            return None
        while time.monotonic() < deadline:
            if connection.sock:
                connection.sock.settimeout(max(0.1, deadline - time.monotonic()))
            line = response.readline(MAX_RESPONSE_BYTES + 1)
            size += len(line)
            if not line or size > MAX_RESPONSE_BYTES:
                return None
            if not line.startswith(b"data:"):
                continue
            try:
                event = json.loads(line[5:].strip())
            except ValueError:
                continue
            if not isinstance(event, dict):
                continue
            if event.get("type") == "response.completed":
                payload = event.get("response")
                return payload if isinstance(payload, dict) and payload.get("status") == "completed" else None
            if event.get("type") in {"error", "response.error", "response.failed", "response.incomplete"}:
                return None
    except Exception:
        # Errors may embed an upstream address or key; return only a verdict.
        return None
    finally:
        connection.close()
    return None


def probe_codex_tool_roundtrip(source: SourceChannel) -> bool:
    body = {
        "model": MODEL_NAME, "stream": True, "store": False,
        "reasoning": {"effort": "low"}, "max_output_tokens": 256,
        "include": ["reasoning.encrypted_content"],
        "instructions": "Call audit_sum with 1 and 1. After the tool output reply only 2.",
        "input": [{"role": "user", "content": [{"type": "input_text", "text": "1+1?"}]}],
        "tools": [{"type": "function", "name": "audit_sum", "description": "Add two integers.",
                   "parameters": {"type": "object", "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}},
                                  "required": ["a", "b"], "additionalProperties": False}, "strict": True}],
        "tool_choice": {"type": "function", "name": "audit_sum"},
    }
    first = codex_completed_response(source, body)
    output = (first or {}).get("output")
    if not isinstance(output, list):
        return False
    calls = [item for item in output if isinstance(item, dict) and item.get("type") == "function_call"]
    if len(calls) != 1 or calls[0].get("name") != "audit_sum" or not calls[0].get("call_id"):
        return False
    try:
        if json.loads(calls[0].get("arguments", "")) != {"a": 1, "b": 1}:
            return False
    except (TypeError, ValueError):
        return False
    body["input"] += output + [{"type": "function_call_output", "call_id": calls[0]["call_id"], "output": "2"}]
    body.pop("tool_choice")
    second = codex_completed_response(source, body)
    if not isinstance((second or {}).get("output"), list):
        return False
    text_parts = []
    for item in second["output"]:
        if not isinstance(item, dict) or not isinstance(item.get("content"), list):
            continue
        text_parts.extend(str(content.get("text") or "") for content in item["content"] if isinstance(content, dict))
    text = "".join(text_parts)
    return text.strip() == "2"


def probe_discount_codex(source: SourceChannel, initial: dict) -> dict:
    samples = [initial]
    for _ in range(2):
        samples.append(provider_monitor.request_responses(source.base_url, source.api_key, MODEL_NAME))
    text_ok = all(sample.get("ok") and isinstance(sample.get("first_token_ms"), (int, float))
                  and math.isfinite(sample["first_token_ms"]) and sample["first_token_ms"] > 0 for sample in samples)
    tools_ok = text_ok and all(probe_codex_tool_roundtrip(source) for _ in range(2))
    return {"discount_healthy": bool(tools_ok), "discount_text_successes": sum(bool(s.get("ok")) for s in samples),
            "discount_ttft_ms": statistics.median([s["first_token_ms"] for s in samples]) if text_ok else None,
            "discount_tools": bool(tools_ok)}


def probe_source(source: SourceChannel) -> dict[str, object]:
    models = fetch_json(source.base_url + "/v1/models", source.api_key)
    data = models.get("data")
    has_model = isinstance(data, list) and any(
        isinstance(item, dict) and item.get("id") == MODEL_NAME for item in data
    )
    if not has_model:
        raise ConfigurationError(f"{source.tag} does not expose {MODEL_NAME}")
    response = provider_monitor.request_responses(source.base_url, source.api_key, MODEL_NAME)
    completion = fetch_json(
        source.base_url + "/v1/chat/completions",
        source.api_key,
        {"model": MODEL_NAME, "messages": [{"role": "user", "content": "Reply with exactly OK."}], "reasoning_effort": "low", "max_completion_tokens": 256, "stream": False},
    )
    if not response.get("ok") or not chat_ok(completion):
        raise ConfigurationError(f"{source.tag} failed Responses or Chat Completions verification")
    return {"tag": source.tag, "channel_id": source.channel_id, "models": True, "responses": True, "chat": True,
            **probe_discount_codex(source, response)}


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


def sources_for_group(group: str, sources: tuple[SourceChannel, ...]) -> tuple[SourceChannel, ...]:
    source_by_tag = {source.tag: source for source in sources}
    if len(source_by_tag) != len(sources):
        raise ConfigurationError("source channel identities are duplicated")
    if set(source_by_tag) != set(SOURCE_CHANNEL_TAGS):
        return sources
    ordered_tags = GROUP_SOURCE_TAG_ORDER_OVERRIDES.get(group, SOURCE_CHANNEL_TAGS)
    return tuple(source_by_tag[tag] for tag in ordered_tags)


def independent_enabled_sources(sources: tuple[SourceChannel, ...], verified: set[str]) -> set[str]:
    """One enabled hop per origin; different keys on one host are not failover."""
    enabled = set()
    origins = set()
    for source in sources:
        origin = urllib.parse.urlsplit(source.base_url).hostname
        if source.tag in verified and origin not in origins:
            enabled.add(source.tag)
            origins.add(origin)
    return enabled


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


def build_apply_sql(
    sources: tuple[SourceChannel, ...],
    enabled_source_tags: set[str] | None = None,
    *, groups: tuple[str, ...] = MANAGED_GROUPS,
    probe_results: list[dict] | None = None,
) -> str:
    if not groups or len(set(groups)) != len(groups) or not set(groups).issubset(MANAGED_GROUPS):
        raise ConfigurationError("invalid Astra target groups")
    if enabled_source_tags is None:
        enabled_source_tags = {source.tag for source in sources}
    unknown_tags = enabled_source_tags.difference(source.tag for source in sources)
    if unknown_tags:
        raise ConfigurationError("enabled Astra source set contains an unknown source")
    tags = tuple(managed_tag(group, index) for group in groups for index in range(len(SOURCE_CHANNEL_TAGS)))
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
    ]
    if groups == MANAGED_GROUPS:
        statements.append("UPDATE channels SET status=2 WHERE tag=" + sql_quote(LEGACY_CHANNEL_TAG) + " AND @astra_apply_allowed=1;")
    discount_priorities, discount_verified = discount_route_policy(sources, probe_results, enabled_source_tags)
    for group in groups:
        group_sources = sources_for_group(group, sources)
        ranking = sorted(group_sources, key=lambda source: -discount_priorities[source.tag]) if group == "discount" and probe_results is not None else group_sources
        group_enabled = independent_enabled_sources(ranking, discount_verified if group == "discount" and probe_results is not None else enabled_source_tags)
        for index, source in enumerate(group_sources):
            priority = discount_priorities[source.tag] if group == "discount" and probe_results is not None else CHAIN_PRIORITIES[index]
            tag = managed_tag(group, index)
            variable = "@astra_" + group.replace("-", "_") + "_" + str(index + 1)
            channel_status = "1" if source.tag in group_enabled else "2"
            target_vars.append(variable)
            mapping = json.dumps({MODEL_NAME: MODEL_NAME}, separators=(",", ":"))
            name = "GPT-6 Astra " + group + " 链路 " + chr(65 + index)
            statements.extend(
                [
                    "SET " + variable + " := IF(@astra_apply_allowed=1,(SELECT MIN(id) FROM channels WHERE tag=" + sql_quote(tag) + "),NULL);",
                    "INSERT INTO channels (type,`key`,status,name,weight,created_time,test_time,response_time,base_url,models,`group`,model_mapping,priority,auto_ban,tag,remark,settings) SELECT 1," + sql_quote(source.api_key) + "," + channel_status + "," + sql_quote(name) + ",100,UNIX_TIMESTAMP(),0,0," + sql_quote(source.base_url) + "," + sql_quote(MODEL_NAME) + "," + sql_quote(group) + "," + sql_quote(mapping) + "," + str(priority) + ",1," + sql_quote(tag) + ",'独立分组计费链路','{}' WHERE " + variable + " IS NULL AND @astra_apply_allowed=1;",
                    "SET " + variable + " := IF(@astra_apply_allowed=1,IFNULL(" + variable + ",LAST_INSERT_ID()),NULL);",
                    "UPDATE channels SET type=1, `key`=" + sql_quote(source.api_key) + ", status=" + channel_status + ", name=" + sql_quote(name) + ", weight=100, base_url=" + sql_quote(source.base_url) + ", models=" + sql_quote(MODEL_NAME) + ", `group`=" + sql_quote(group) + ", model_mapping=" + sql_quote(mapping) + ", priority=" + str(priority) + ", auto_ban=1, tag=" + sql_quote(tag) + ", remark='独立分组计费链路', settings='{}' WHERE id=" + variable + " AND @astra_apply_allowed=1;",
                ]
            )
    id_list = ",".join(target_vars)
    statements.extend(
        [
            "UPDATE abilities SET enabled=0 WHERE model=" + sql_quote(MODEL_NAME) + " AND `group` IN (" + ",".join(sql_quote(g) for g in groups) + ") AND channel_id NOT IN (" + id_list + ") AND @astra_apply_allowed=1;",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id=ability.channel_id SET ability.enabled=0 WHERE channel.tag IN (" + ",".join(sql_quote(tag) for tag in tags) + ") AND (ability.model<>" + sql_quote(MODEL_NAME) + " OR ability.`group`<>channel.`group` OR ability.tag<>channel.tag) AND @astra_apply_allowed=1;",
        ]
    )
    for group in groups:
        group_sources = sources_for_group(group, sources)
        ranking = sorted(group_sources, key=lambda source: -discount_priorities[source.tag]) if group == "discount" and probe_results is not None else group_sources
        group_enabled = independent_enabled_sources(ranking, discount_verified if group == "discount" and probe_results is not None else enabled_source_tags)
        for index, source in enumerate(group_sources):
            priority = discount_priorities[source.tag] if group == "discount" and probe_results is not None else CHAIN_PRIORITIES[index]
            tag = managed_tag(group, index)
            variable = "@astra_" + group.replace("-", "_") + "_" + str(index + 1)
            ability_enabled = "1" if source.tag in group_enabled else "0"
            statements.append(
                "INSERT INTO abilities (`group`,model,channel_id,enabled,priority,weight,tag) VALUES (" + ",".join([sql_quote(group), sql_quote(MODEL_NAME), variable, ability_enabled, str(priority), "100", sql_quote(tag)]) + ") ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),priority=VALUES(priority),weight=100,tag=VALUES(tag);"
            )
    statements.append("COMMIT;")
    return "\n".join(statements)


def discount_route_policy(sources, probe_results, enabled_source_tags):
    reports = {r["tag"]: r for r in (probe_results or [])}
    healthy = {tag for tag, report in reports.items() if tag in enabled_source_tags
               and report.get("discount_healthy") is True and isinstance(report.get("discount_ttft_ms"), (int, float))
               and math.isfinite(report["discount_ttft_ms"]) and report["discount_ttft_ms"] > 0}
    ranked = sorted(sources, key=lambda source: (
        source.tag != DISCOUNT_PRIMARY_SOURCE_TAG,
        source.tag not in healthy,
        reports.get(source.tag, {}).get("discount_ttft_ms") or float("inf"), source.tag))
    # The requested primary remains routable after the baseline Models,
    # Responses and Chat checks pass. The stricter repeated Codex round-trip
    # gate decides only whether an optional fallback is safe to add.
    routable = set(healthy)
    if any(source.tag == DISCOUNT_PRIMARY_SOURCE_TAG for source in sources):
        routable.add(DISCOUNT_PRIMARY_SOURCE_TAG)
    return {source.tag: CHAIN_PRIORITIES[i] for i, source in enumerate(ranked)}, routable


def apply_sources(sources: tuple[SourceChannel, ...], enabled_source_tags: set[str] | None = None,
                  *, groups: tuple[str, ...] = MANAGED_GROUPS, probe_results: list[dict] | None = None) -> None:
    validate_group_options()
    validate_managed_channel_tags()
    sync.mysql_exec(build_apply_sql(sources, enabled_source_tags, groups=groups, probe_results=probe_results))


def probe_sources(sources: tuple[SourceChannel, ...]) -> tuple[list[dict[str, object]], list[str]]:
    results: list[dict[str, object]] = []
    unavailable_tags: list[str] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [(source, pool.submit(probe_source, source)) for source in sources]
        for source, future in futures:
            try:
                results.append(future.result())
            except ConfigurationError:
                unavailable_tags.append(source.tag)
    return results, unavailable_tags


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe OpenAI sources and configure independent GPT-6 Astra chains")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--apply", action="store_true")
    action.add_argument("--reconcile-if-configured", action="store_true")
    parser.add_argument("--discount-only", action="store_true", help="change only the public 0.25x Astra chain")
    args = parser.parse_args()
    with channel_lock():
        sources = load_sources()
        probe_results, unavailable_tags = probe_sources(sources)
        if not probe_results:
            raise ConfigurationError("no GPT-6 Astra source passed verification")
        if args.apply and unavailable_tags:
            raise ConfigurationError("one or more GPT-6 Astra sources failed verification")
        configured = sync.mysql("SELECT COUNT(*) FROM channels WHERE tag LIKE " + sql_quote(MANAGED_TAG_PREFIX + "%"))
        if args.reconcile_if_configured and (not configured or int(configured[0][0]) == 0):
            print(json.dumps({"ok": True, "action": "not_configured", "model": MODEL_NAME, "sources": probe_results}, ensure_ascii=False, separators=(",", ":")))
            return 0
        if args.apply or args.reconcile_if_configured:
            if load_sources() != sources:
                raise ConfigurationError("source identity changed while probing; no changes applied")
            apply_sources(sources, {str(result["tag"]) for result in probe_results},
                          groups=("discount",) if args.discount_only else MANAGED_GROUPS, probe_results=probe_results)
    action_name = "applied" if args.apply else "reconciled" if args.reconcile_if_configured else "probe"
    selected_groups = ("discount",) if args.discount_only else MANAGED_GROUPS
    print(json.dumps({"ok": True, "action": action_name, "model": MODEL_NAME, "groups": selected_groups, "sources": probe_results, "unavailable_sources": unavailable_tags}, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ConfigurationError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
