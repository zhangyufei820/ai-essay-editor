#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import fcntl
import hashlib
import json
import math
import os
import re
import statistics
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("SHENXIANG_NEW_API_ROOT", "/opt/shenxiang-new-api"))
STATE_PATH = ROOT / "data" / "provider-monitor-state.json"
LOG_PATH = ROOT / "logs" / "provider-monitor.jsonl"
LOCK_PATH = ROOT / "data" / "provider-monitor.lock"

HTTP_TIMEOUT = float(os.environ.get("PROVIDER_MONITOR_HTTP_TIMEOUT", "35"))
MAX_WORKERS = int(os.environ.get("PROVIDER_MONITOR_MAX_WORKERS", "8"))
WINDOW_SIZE = int(os.environ.get("PROVIDER_MONITOR_WINDOW_SIZE", "24"))
WINDOW_MAX_AGE_SECONDS = int(os.environ.get("PROVIDER_MONITOR_WINDOW_MAX_AGE_SECONDS", "7200"))
FAIL_ERROR_RATE = float(os.environ.get("PROVIDER_MONITOR_FAIL_ERROR_RATE", "0.50"))
DEGRADE_ERROR_RATE = float(os.environ.get("PROVIDER_MONITOR_DEGRADE_ERROR_RATE", "0.25"))
P95_OPEN_MS = int(os.environ.get("PROVIDER_MONITOR_P95_OPEN_MS", "18000"))
P95_DEGRADE_MS = int(os.environ.get("PROVIDER_MONITOR_P95_DEGRADE_MS", "12000"))
CONSECUTIVE_FAILURES_TO_OPEN = int(os.environ.get("PROVIDER_MONITOR_CONSECUTIVE_FAILURES_TO_OPEN", "2"))
RECOVER_SUCCESS_STREAK = int(os.environ.get("PROVIDER_MONITOR_RECOVER_SUCCESS_STREAK", "2"))
RECOVER_COOLDOWN_SECONDS = int(os.environ.get("PROVIDER_MONITOR_RECOVER_COOLDOWN_SECONDS", "300"))
RECOVERING_RUNS = int(os.environ.get("PROVIDER_MONITOR_RECOVERING_RUNS", "2"))
REAL_REQUEST_LOOKBACK_SECONDS = int(os.environ.get("PROVIDER_MONITOR_REAL_REQUEST_LOOKBACK_SECONDS", "1800"))
REAL_REQUEST_LIMIT = int(os.environ.get("PROVIDER_MONITOR_REAL_REQUEST_LIMIT", "300"))
REAL_REQUEST_USE_TIME_DEGRADE_MS = int(os.environ.get("PROVIDER_MONITOR_REAL_REQUEST_USE_TIME_DEGRADE_MS", "60000"))
IMAGE_REAL_REQUEST_LOOKBACK_SECONDS = int(os.environ.get("PROVIDER_MONITOR_IMAGE_REAL_REQUEST_LOOKBACK_SECONDS", "86400"))
IMAGE_REAL_REQUEST_LIMIT = int(os.environ.get("PROVIDER_MONITOR_IMAGE_REAL_REQUEST_LIMIT", "500"))
IMAGE_REAL_REQUEST_P95_DEGRADE_MS = int(os.environ.get("PROVIDER_MONITOR_IMAGE_REAL_REQUEST_P95_DEGRADE_MS", "300000"))
IMAGE_REAL_REQUEST_P95_SEVERE_MS = int(os.environ.get("PROVIDER_MONITOR_IMAGE_REAL_REQUEST_P95_SEVERE_MS", "600000"))
IMAGE_LONG_TAIL_CHANNEL_IDS = os.environ.get("PROVIDER_MONITOR_IMAGE_LONG_TAIL_CHANNEL_IDS", "4,8,12,16")

REDACTED = "***redacted***"
SENSITIVE_TEXT_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9][A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)(authorization:\s*bearer\s+)[^\s\"']+"),
    re.compile(r"https?://[^\s\"'<>]+"),
)


@dataclass(frozen=True)
class TextFamily:
    name: str
    models: tuple[str, ...]
    channel_ids: tuple[int, ...]
    baseline_priorities: dict[int, int]
    allow_disable: bool = True
    standalone: bool = False


TEXT_FAMILIES = (
    TextFamily(
        name="openai_text",
        models=("gpt-5.5", "gpt-5.4", "gpt-5.4-mini"),
        channel_ids=(1, 14, 2),
        baseline_priorities={1: 40, 14: 30, 2: 20},
    ),
    TextFamily(
        name="claude_text",
        models=("claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6"),
        channel_ids=(13, 9),
        baseline_priorities={13: 30, 9: 20},
    ),
    TextFamily(
        name="claude_fable_text",
        models=("claude-fable-5",),
        channel_ids=(11,),
        baseline_priorities={11: 15},
        standalone=True,
    ),
)


IMAGE2_PRIMARY = {
    "name": "image2_primary",
    "channel_id": 4,
    "fallback_channel_id": 8,
    "model": "gpt-image-2-4K",
    "status_code": 524,
    "lookback_seconds": 1800,
    "disable_threshold": 2,
    "recover_cooldown_seconds": 1800,
}

IMAGE_LONG_TAIL = {
    "name": "image2_long_tail_real_p95",
    "model": "gpt-image-2-4K",
}


LEGACY_PROVIDER_TO_CHANNEL_ID = {
    "tokenflux": 1,
    "yunwu": 14,
    "moonapi": 2,
    "moonapix": 2,
}


def now_ts() -> int:
    return int(time.time())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def docker_mysql(args: list[str], env: dict[str, str], *, input_text: str | None = None, capture: bool = True) -> str:
    cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        f"MYSQL_PWD={env['MYSQL_ROOT_PASSWORD']}",
        "shenxiang-new-api-mysql",
        "mysql",
        "-uroot",
        env["MYSQL_DATABASE"],
    ] + args
    kwargs: dict[str, Any] = {"text": True, "encoding": "utf-8", "errors": "replace"}
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    if input_text is not None:
        kwargs["input"] = input_text
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(f"mysql command failed: {stderr}")
    return result.stdout if capture else ""


def mysql_json(query: str, env: dict[str, str]) -> list[dict[str, Any]]:
    out = docker_mysql(["--batch", "--raw", "--skip-column-names", "-e", query], env)
    rows: list[dict[str, Any]] = []
    for line in out.splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def parse_int_list(value: str) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for part in re.split(r"[\s,;]+", value or ""):
        item = part.strip()
        if not item:
            continue
        try:
            channel_id = int(item)
        except ValueError:
            continue
        if channel_id <= 0 or channel_id in seen:
            continue
        ids.append(channel_id)
        seen.add(channel_id)
    return ids


def redact_text(value: str) -> str:
    text = str(value or "")
    for pattern in SENSITIVE_TEXT_PATTERNS:
        text = pattern.sub(lambda m: (m.group(1) + REDACTED) if m.lastindex else REDACTED, text)
    return text


def sanitize_for_event(value: Any) -> Any:
    if isinstance(value, dict):
        safe: dict[str, Any] = {}
        for key, item in value.items():
            key_text = str(key)
            if key_text in {"key", "base_url", "preview", "url"}:
                safe[key_text] = REDACTED
            elif key_text == "provider":
                safe[key_text] = REDACTED
            elif key_text == "providers" and isinstance(item, dict):
                safe[key_text] = {
                    f"provider_{index + 1}": sanitize_for_event(provider_state)
                    for index, provider_state in enumerate(item.values())
                }
            elif key_text in {"error", "reason", "msg"} and isinstance(item, str):
                safe[key_text] = redact_text(item)[:300]
            else:
                safe[key_text] = sanitize_for_event(item)
        return safe
    if isinstance(value, list):
        return [sanitize_for_event(item) for item in value]
    if isinstance(value, str):
        return redact_text(value)
    return value


def write_event(event: dict[str, Any]) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a") as fp:
        fp.write(json.dumps(sanitize_for_event(event), ensure_ascii=False, separators=(",", ":")) + "\n")


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {"version": 2, "routes": {}, "channels": {}, "providers": {}}
    try:
        state = json.loads(STATE_PATH.read_text())
    except Exception:
        backup = STATE_PATH.with_suffix(f".corrupt.{now_ts()}.json")
        STATE_PATH.rename(backup)
        return {"version": 2, "routes": {}, "channels": {}, "providers": {}}
    state.setdefault("version", 2)
    state.setdefault("routes", {})
    state.setdefault("channels", {})
    state.setdefault("providers", {})
    return state


def save_state(state: dict[str, Any]) -> None:
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
    os.chmod(tmp, 0o600)
    tmp.replace(STATE_PATH)


def load_channels(env: dict[str, str], channel_ids: list[int]) -> dict[int, dict[str, Any]]:
    ids = ",".join(str(int(channel_id)) for channel_id in sorted(set(channel_ids)))
    select = f"""
SELECT JSON_OBJECT(
  'id', id,
  'name', name,
  'base_url', base_url,
  'type', type,
  'models', models,
  'group', `group`,
  'status', status,
  'priority', priority,
  'weight', weight,
  'key', `key`
)
FROM channels
WHERE id IN ({ids})
"""
    rows = mysql_json(select, env)
    return {int(row["id"]): row for row in rows}


def redact_channel(channel: dict[str, Any]) -> dict[str, Any]:
    safe = dict(channel)
    if "key" in safe:
        safe["key"] = REDACTED
    if "base_url" in safe:
        safe["base_url"] = REDACTED
    if "name" in safe:
        safe["name"] = REDACTED
    return safe


def split_models(channel: dict[str, Any]) -> set[str]:
    return {part.strip() for part in str(channel.get("models") or "").split(",") if part.strip()}


def first_key(raw_key: str) -> str:
    key = (raw_key or "").strip()
    if not key:
        return ""
    if key.startswith("["):
        try:
            parsed = json.loads(key)
            if isinstance(parsed, list) and parsed:
                item = parsed[0]
                if isinstance(item, str):
                    return item.strip().strip('"')
                return json.dumps(item, ensure_ascii=False)
        except Exception:
            pass
    return key.splitlines()[0].strip()


def classify_http_error(status: int) -> str:
    if status in {401, 403}:
        return "auth_error"
    if status == 402:
        return "quota_error"
    if status == 408:
        return "timeout"
    if status == 429:
        return "rate_limited"
    if status in {499, 524}:
        return "stream_timeout"
    if 500 <= status <= 599:
        return "upstream_5xx"
    return "http_error"


def classify_exception(exc: Exception) -> str:
    name = exc.__class__.__name__.lower()
    if "timeout" in name:
        return "timeout"
    if "ssl" in name:
        return "tls_error"
    if "connection" in name or "url" in name:
        return "network_error"
    return "probe_error"


def request_chat(base_url: str, api_key: str, model: str) -> dict[str, Any]:
    normalized_base = base_url.rstrip("/")
    if normalized_base.endswith("/v1"):
        url = normalized_base + "/chat/completions"
    else:
        url = normalized_base + "/v1/chat/completions"
    body = json.dumps(
        {
            "model": model,
            "messages": [{"role": "user", "content": "Reply with OK only."}],
            "stream": True,
            "max_tokens": 4,
            "temperature": 0,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "User-Agent": "shenxiang-new-api-latency-canary/2.0",
        },
        method="POST",
    )
    start = time.monotonic()
    preview = ""
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            status = resp.getcode()
            first_ms: int | None = None
            deadline = time.monotonic() + HTTP_TIMEOUT
            while time.monotonic() < deadline:
                line = resp.readline(4096)
                if not line:
                    break
                text = line.decode("utf-8", "replace")
                if text.strip():
                    preview = (preview + text)[:180]
                stripped = text.strip()
                if stripped.startswith("data:") and stripped != "data: [DONE]":
                    first_ms = int((time.monotonic() - start) * 1000)
                    break
            if first_ms is None:
                first_ms = int((time.monotonic() - start) * 1000)
            ok = 200 <= status < 300 and ("data:" in preview or "OK" in preview or first_ms < int(HTTP_TIMEOUT * 1000))
            return {
                "ok": bool(ok),
                "status": status,
                "first_token_ms": first_ms,
                "reason": "ok" if ok else "bad_stream",
            }
    except urllib.error.HTTPError as exc:
        _ = exc.read(512)
        return {
            "ok": False,
            "status": exc.code,
            "first_token_ms": int((time.monotonic() - start) * 1000),
            "reason": classify_http_error(exc.code),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": 0,
            "first_token_ms": int((time.monotonic() - start) * 1000),
            "reason": classify_exception(exc),
        }


def percentile(values: list[int], pct: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * pct
    low = math.floor(pos)
    high = math.ceil(pos)
    if low == high:
        return ordered[int(pos)]
    return int(ordered[low] * (high - pos) + ordered[high] * (pos - low))


def consecutive_failures(samples: list[dict[str, Any]]) -> int:
    count = 0
    for sample in reversed(samples):
        if sample.get("ok"):
            break
        count += 1
    return count


def consecutive_successes(samples: list[dict[str, Any]]) -> int:
    count = 0
    for sample in reversed(samples):
        if not sample.get("ok"):
            break
        count += 1
    return count


def append_sample(state: dict[str, Any], family: str, model: str, channel_id: int, result: dict[str, Any]) -> dict[str, Any]:
    key = f"{family}:{model}:{channel_id}"
    route = state.setdefault("routes", {}).setdefault(key, {"samples": []})
    samples = route.setdefault("samples", [])
    sample = {
        "ts": int(result.get("ts") or now_ts()),
        "ok": bool(result.get("ok")),
        "status": int(result.get("status") or 0),
        "first_token_ms": int(result.get("first_token_ms") or 0),
        "reason": str(result.get("reason") or "unknown")[:80],
        "source": str(result.get("source") or "canary")[:40],
    }
    if result.get("use_time_ms") is not None:
        sample["use_time_ms"] = int(result.get("use_time_ms") or 0)
    if result.get("log_id") is not None:
        sample["log_id"] = int(result.get("log_id") or 0)
    samples.append(sample)
    cutoff = now_ts() - WINDOW_MAX_AGE_SECONDS
    route["samples"] = [sample for sample in samples if int(sample.get("ts") or 0) >= cutoff][-WINDOW_SIZE:]
    return route


def summarize_route(route: dict[str, Any]) -> dict[str, Any]:
    samples = list(route.get("samples") or [])
    total = len(samples)
    ok_samples = [sample for sample in samples if sample.get("ok")]
    ok_latencies = [int(sample.get("first_token_ms") or 0) for sample in ok_samples]
    use_times = [int(sample.get("use_time_ms") or 0) for sample in ok_samples if int(sample.get("use_time_ms") or 0) > 0]
    failures = total - len(ok_samples)
    error_rate = failures / total if total else 1.0
    p50 = percentile(ok_latencies, 0.50)
    p95 = percentile(ok_latencies, 0.95)
    use_time_p95 = percentile(use_times, 0.95)
    last = samples[-1] if samples else {}
    fail_streak = consecutive_failures(samples)
    success_streak = consecutive_successes(samples)
    hard_error = int(last.get("status") or 0) in {401, 402, 403}
    slow_real_request = use_time_p95 is not None and use_time_p95 >= REAL_REQUEST_USE_TIME_DEGRADE_MS
    state_name = "healthy"
    if total >= 2 and (hard_error or fail_streak >= CONSECUTIVE_FAILURES_TO_OPEN):
        state_name = "open"
    elif total >= 3 and (error_rate >= FAIL_ERROR_RATE or (p95 is not None and p95 >= P95_OPEN_MS)):
        state_name = "open"
    elif total >= 2 and (error_rate >= DEGRADE_ERROR_RATE or (p95 is not None and p95 >= P95_DEGRADE_MS) or slow_real_request):
        state_name = "degraded"
    return {
        "samples": total,
        "real_samples": sum(1 for sample in samples if sample.get("source") == "real_request"),
        "successes": len(ok_samples),
        "failures": failures,
        "error_rate": round(error_rate, 4),
        "p50_ms": p50,
        "p95_ms": p95,
        "p95_use_ms": use_time_p95,
        "last": {k: last.get(k) for k in ("ok", "status", "first_token_ms", "reason", "ts")},
        "consecutive_failures": fail_streak,
        "consecutive_successes": success_streak,
        "state": state_name,
    }


def channel_state(state: dict[str, Any], channel_id: int, baseline_priority: int) -> dict[str, Any]:
    channels = state.setdefault("channels", {})
    key = str(channel_id)
    ch_state = channels.setdefault(
        key,
        {
            "auto_disabled": False,
            "disabled_at": 0,
            "recovering_runs_left": 0,
            "baseline_priority": baseline_priority,
        },
    )
    ch_state.setdefault("baseline_priority", baseline_priority)
    if not ch_state.get("auto_disabled"):
        for legacy_name, legacy in (state.get("providers") or {}).items():
            if LEGACY_PROVIDER_TO_CHANNEL_ID.get(legacy_name) == channel_id and legacy.get("auto_disabled"):
                ch_state["auto_disabled"] = True
                ch_state["disabled_at"] = int(legacy.get("disabled_at") or 0)
    return ch_state


def execute_sql(env: dict[str, str], sql: str, dry_run: bool) -> None:
    if not dry_run:
        docker_mysql([], env, input_text=sql, capture=True)


def set_channel_status(env: dict[str, str], channel_id: int, status: int, reason: str, dry_run: bool) -> None:
    remark = f"latency_canary {now_iso()} {reason}"
    sql = f"""
UPDATE channels
SET status = {int(status)}, remark = {shell_quote(remark)}
WHERE id = {int(channel_id)};
UPDATE abilities
SET enabled = {1 if status == 1 else 0}
WHERE channel_id = {int(channel_id)};
"""
    execute_sql(env, sql, dry_run)
    write_event(
        {
            "ts": now_iso(),
            "event": "channel_status_update",
            "channel_id": channel_id,
            "status": status,
            "reason": reason,
            "dry_run": dry_run,
        }
    )


def set_channel_priority(env: dict[str, str], channel_id: int, priority: int, reason: str, dry_run: bool) -> None:
    remark = f"latency_canary {now_iso()} {reason}"
    sql = f"""
UPDATE channels
SET priority = {int(priority)}, remark = {shell_quote(remark)}
WHERE id = {int(channel_id)} AND COALESCE(priority, 0) <> {int(priority)};
UPDATE abilities
SET priority = {int(priority)}
WHERE channel_id = {int(channel_id)} AND COALESCE(priority, 0) <> {int(priority)};
"""
    execute_sql(env, sql, dry_run)
    write_event(
        {
            "ts": now_iso(),
            "event": "channel_priority_update",
            "channel_id": channel_id,
            "priority": priority,
            "reason": reason,
            "dry_run": dry_run,
        }
    )


def set_channel_weight(env: dict[str, str], channel_id: int, weight: int, reason: str, dry_run: bool) -> None:
    remark = f"latency_canary {now_iso()} {reason}"
    sql = f"""
UPDATE channels
SET weight = {int(weight)}, remark = {shell_quote(remark)}
WHERE id = {int(channel_id)} AND COALESCE(weight, 0) <> {int(weight)};
UPDATE abilities
SET weight = {int(weight)}
WHERE channel_id = {int(channel_id)} AND COALESCE(weight, 0) <> {int(weight)};
"""
    execute_sql(env, sql, dry_run)
    write_event(
        {
            "ts": now_iso(),
            "event": "channel_weight_update",
            "channel_id": channel_id,
            "weight": weight,
            "reason": reason,
            "dry_run": dry_run,
        }
    )


def score_channel(model_summaries: list[dict[str, Any]], baseline_rank: int) -> float:
    if not model_summaries:
        return 10_000_000.0
    p50_values = [summary["p50_ms"] for summary in model_summaries if summary.get("p50_ms") is not None]
    p95_values = [summary["p95_ms"] for summary in model_summaries if summary.get("p95_ms") is not None]
    use_time_p95_values = [summary["p95_use_ms"] for summary in model_summaries if summary.get("p95_use_ms") is not None]
    error_rate = statistics.mean([float(summary.get("error_rate") or 1.0) for summary in model_summaries])
    open_count = sum(1 for summary in model_summaries if summary.get("state") == "open")
    degraded_count = sum(1 for summary in model_summaries if summary.get("state") == "degraded")
    p50 = statistics.median(p50_values) if p50_values else P95_OPEN_MS
    p95 = max(p95_values) if p95_values else P95_OPEN_MS
    use_time_penalty = max(use_time_p95_values) * 0.08 if use_time_p95_values else 0
    return float(p50) + float(p95) * 0.35 + use_time_penalty + error_rate * 20_000 + open_count * 80_000 + degraded_count * 8_000 + baseline_rank * 25


def stream_status_from_other(other: dict[str, Any]) -> tuple[bool, str]:
    stream_status = other.get("stream_status")
    if not isinstance(stream_status, dict):
        return True, "real_ok"
    status = str(stream_status.get("status") or "ok")
    end_reason = str(stream_status.get("end_reason") or "")
    if status == "ok" and end_reason in {"", "done", "eof", "handler_stop"}:
        return True, "real_ok"
    if end_reason == "client_gone":
        return False, "real_client_gone"
    if end_reason == "timeout":
        return False, "real_timeout"
    if end_reason == "panic":
        return False, "real_panic"
    return False, "real_stream_error"


def load_real_request_rows(env: dict[str, str], state: dict[str, Any], families: tuple[TextFamily, ...]) -> list[dict[str, Any]]:
    channel_ids = sorted({channel_id for family in families for channel_id in family.channel_ids})
    models = sorted({model for family in families for model in family.models})
    if not channel_ids or not models or REAL_REQUEST_LIMIT <= 0:
        return []
    last_id = int(state.get("real_request_last_log_id") or 0)
    cutoff = now_ts() - REAL_REQUEST_LOOKBACK_SECONDS
    ids = ",".join(str(channel_id) for channel_id in channel_ids)
    model_filter = ",".join(shell_quote(model) for model in models)
    select = f"""
SELECT JSON_OBJECT(
  'id', id,
  'created_at', created_at,
  'model_name', model_name,
  'channel_id', channel_id,
  'use_time', use_time,
  'is_stream', is_stream,
  'prompt_tokens', prompt_tokens,
  'completion_tokens', completion_tokens,
  'other', COALESCE(other, '')
)
FROM logs
WHERE id > {last_id}
  AND created_at >= {cutoff}
  AND channel_id IN ({ids})
  AND model_name IN ({model_filter})
ORDER BY id ASC
LIMIT {int(REAL_REQUEST_LIMIT)}
"""
    return mysql_json(select, env)


def ingest_real_request_samples(
    families: tuple[TextFamily, ...],
    state: dict[str, Any],
    env: dict[str, str],
) -> dict[str, Any]:
    rows = load_real_request_rows(env, state, families)
    family_by_route: dict[tuple[int, str], str] = {}
    for family in families:
        for channel_id in family.channel_ids:
            for model in family.models:
                family_by_route[(channel_id, model)] = family.name

    ingested = 0
    skipped = 0
    max_id = int(state.get("real_request_last_log_id") or 0)
    for row in rows:
        log_id = int(row.get("id") or 0)
        max_id = max(max_id, log_id)
        channel_id = int(row.get("channel_id") or 0)
        model_name = str(row.get("model_name") or "")
        family_name = family_by_route.get((channel_id, model_name))
        if not family_name:
            skipped += 1
            continue
        try:
            other = json.loads(str(row.get("other") or "{}"))
            if not isinstance(other, dict):
                other = {}
        except Exception:
            other = {}
        request_path = str(other.get("request_path") or "")
        if request_path and request_path not in {"/v1/responses", "/v1/chat/completions"}:
            skipped += 1
            continue
        frt = int(float(other.get("frt") or 0))
        if frt <= 0:
            skipped += 1
            continue
        ok, reason = stream_status_from_other(other)
        append_sample(
            state,
            family_name,
            model_name,
            channel_id,
            {
                "ts": int(row.get("created_at") or now_ts()),
                "ok": ok,
                "status": 200 if ok else 499,
                "first_token_ms": frt,
                "use_time_ms": int(row.get("use_time") or 0) * 1000,
                "reason": reason,
                "source": "real_request",
                "log_id": log_id,
            },
        )
        ingested += 1
    if max_id:
        state["real_request_last_log_id"] = max_id
    event = {
        "ts": now_iso(),
        "event": "real_request_latency_ingest",
        "rows": len(rows),
        "ingested": ingested,
        "skipped": skipped,
        "last_log_id": state.get("real_request_last_log_id", 0),
    }
    write_event(event)
    return event


def evaluate_text_family(
    family: TextFamily,
    channels: dict[int, dict[str, Any]],
    state: dict[str, Any],
    env: dict[str, str],
    dry_run: bool,
) -> dict[str, Any]:
    route_results: dict[str, Any] = {}
    futures: dict[concurrent.futures.Future[dict[str, Any]], tuple[int, str]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        for channel_id in family.channel_ids:
            channel = channels.get(channel_id)
            if not channel:
                continue
            channel_models = split_models(channel)
            api_key = first_key(str(channel.get("key") or ""))
            base_url = str(channel.get("base_url") or "").strip()
            if not api_key or not base_url:
                continue
            for model in family.models:
                if model not in channel_models:
                    continue
                futures[pool.submit(request_chat, base_url, api_key, model)] = (channel_id, model)
        for future in concurrent.futures.as_completed(futures):
            channel_id, model = futures[future]
            result = future.result()
            result.pop("preview", None)
            route = append_sample(state, family.name, model, channel_id, result)
            summary = summarize_route(route)
            route_results[f"{model}:{channel_id}"] = {
                "model": model,
                "channel_id": channel_id,
                "result": result,
                "summary": summary,
            }

    priorities = sorted(set(family.baseline_priorities.values()), reverse=True)
    lowest_priority = priorities[-1] if priorities else 1
    channel_summaries: dict[int, dict[str, Any]] = {}
    for index, channel_id in enumerate(family.channel_ids):
        channel = channels.get(channel_id)
        if not channel:
            channel_summaries[channel_id] = {"missing": True}
            continue
        baseline = family.baseline_priorities.get(channel_id, int(channel.get("priority") or 0))
        ch_state = channel_state(state, channel_id, baseline)
        model_summaries = [
            route_results[key]["summary"]
            for key in route_results
            if route_results[key]["channel_id"] == channel_id
        ]
        score = score_channel(model_summaries, index)
        hard_unhealthy = bool(model_summaries) and all(summary.get("state") == "open" for summary in model_summaries)
        degraded = bool(model_summaries) and any(summary.get("state") in {"open", "degraded"} for summary in model_summaries)
        success_streak = min((summary.get("consecutive_successes") or 0) for summary in model_summaries) if model_summaries else 0
        current_status = int(channel.get("status") or 0)
        channel_summaries[channel_id] = {
            "channel_id": channel_id,
            "current_status": current_status,
            "current_priority": int(channel.get("priority") or 0),
            "baseline_priority": baseline,
            "score": round(score, 3),
            "hard_unhealthy": hard_unhealthy,
            "degraded": degraded,
            "model_summaries": model_summaries,
            "auto_disabled": bool(ch_state.get("auto_disabled")),
            "recovering_runs_left": int(ch_state.get("recovering_runs_left") or 0),
            "action": "none",
        }

    enabled_count = sum(1 for channel in channel_summaries.values() if channel.get("current_status") == 1)
    for channel_id, summary in channel_summaries.items():
        if summary.get("missing"):
            continue
        ch_state = channel_state(state, channel_id, int(summary["baseline_priority"]))
        current_status = int(summary["current_status"])
        if (
            family.allow_disable
            and current_status == 1
            and summary["hard_unhealthy"]
            and enabled_count > 1
        ):
            set_channel_status(env, channel_id, 3, f"{family.name}_circuit_open", dry_run)
            ch_state["auto_disabled"] = True
            ch_state["disabled_at"] = now_ts()
            ch_state["recovering_runs_left"] = 0
            summary["action"] = "circuit_open"
            enabled_count -= 1
        elif current_status == 3 and ch_state.get("auto_disabled"):
            cooldown_ok = now_ts() - int(ch_state.get("disabled_at") or 0) >= RECOVER_COOLDOWN_SECONDS
            recent_success = all(
                model_summary.get("consecutive_successes", 0) >= RECOVER_SUCCESS_STREAK
                for model_summary in summary.get("model_summaries") or []
            )
            if cooldown_ok and recent_success:
                set_channel_status(env, channel_id, 1, f"{family.name}_half_open_recover", dry_run)
                ch_state["auto_disabled"] = False
                ch_state["recovering_runs_left"] = RECOVERING_RUNS
                summary["action"] = "half_open_recover"
                summary["current_status"] = 1
                enabled_count += 1

    rankable = [
        summary
        for summary in channel_summaries.values()
        if not summary.get("missing") and int(summary.get("current_status") or 0) == 1
    ]
    rankable.sort(key=lambda item: (item.get("hard_unhealthy", False), float(item.get("score") or 10_000_000)))
    for rank, summary in enumerate(rankable):
        channel_id = int(summary["channel_id"])
        ch_state = channel_state(state, channel_id, int(summary["baseline_priority"]))
        target_priority = priorities[min(rank, len(priorities) - 1)] if priorities else int(summary["baseline_priority"])
        target_weight = 100
        if int(ch_state.get("recovering_runs_left") or 0) > 0:
            target_priority = min(target_priority, lowest_priority)
            target_weight = 25
            ch_state["recovering_runs_left"] = max(0, int(ch_state.get("recovering_runs_left") or 0) - 1)
        elif summary.get("hard_unhealthy") and enabled_count <= 1:
            target_weight = 25
            if summary["action"] == "none":
                summary["action"] = "soft_circuit_no_fallback"
        elif summary.get("degraded"):
            target_weight = 50
        if int(summary.get("current_priority") or 0) != target_priority:
            set_channel_priority(env, channel_id, target_priority, f"{family.name}_score_rank_{rank + 1}", dry_run)
            summary["action"] = f"rank_priority_{target_priority}"
        current_weight = int(channels[channel_id].get("weight") or 0)
        if current_weight != target_weight:
            set_channel_weight(env, channel_id, target_weight, f"{family.name}_weight_{target_weight}", dry_run)
        ch_state["last_score"] = summary["score"]
        ch_state["last_checked_at"] = now_iso()

    event = {
        "ts": now_iso(),
        "event": "text_latency_family",
        "family": family.name,
        "dry_run": dry_run,
        "routes": route_results,
        "channels": channel_summaries,
        "ranked_channel_ids": [item["channel_id"] for item in rankable],
    }
    write_event(event)
    return event


def docker_logs_since(seconds: int) -> str:
    result = subprocess.run(
        ["docker", "logs", "--since", f"{int(seconds)}s", "shenxiang-new-api"],
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if result.returncode != 0:
        raise RuntimeError(f"docker logs failed: {(result.stdout or '').strip()[:300]}")
    return result.stdout or ""


def find_recent_image2_primary_524s() -> list[str]:
    logs = docker_logs_since(IMAGE2_PRIMARY["lookback_seconds"])
    pattern = re.compile(
        r"\|\s*([A-Za-z0-9]+)\s*\|\s*channel error "
        rf"\(channel #{IMAGE2_PRIMARY['channel_id']}, status code: {IMAGE2_PRIMARY['status_code']}\)"
    )
    matches = sorted(set(pattern.findall(logs)))
    if not matches:
        error_marker = re.compile(
            rf"channel error \(channel #{IMAGE2_PRIMARY['channel_id']}, status code: {IMAGE2_PRIMARY['status_code']}\)"
        )
        unparsed = [line for line in logs.splitlines() if error_marker.search(line)]
        if unparsed:
            write_event({"type": "warn", "msg": "image2_primary errors found but request ids were not parseable; synthetic ids used"})
            matches = sorted({
                "unparsed-" + hashlib.sha1(line.encode("utf-8", "ignore")).hexdigest()[:16]
                for line in unparsed
            })
    return matches


def load_channels_by_id(env: dict[str, str], channel_ids: list[int]) -> dict[int, dict[str, Any]]:
    return load_channels(env, channel_ids)


def evaluate_image2_primary(channels_by_id: dict[int, dict[str, Any]], state: dict[str, Any], env: dict[str, str], dry_run: bool) -> dict[str, Any]:
    spec = IMAGE2_PRIMARY
    primary = channels_by_id.get(spec["channel_id"])
    fallback = channels_by_id.get(spec["fallback_channel_id"])
    if not primary or not fallback:
        return {
            "action": "missing_channel",
            "primary_channel_id": spec["channel_id"],
            "fallback_channel_id": spec["fallback_channel_id"],
        }

    provider_state = state.setdefault("providers", {}).setdefault(
        spec["name"],
        {"failures": 0, "recoveries": 0, "auto_disabled": False, "seen_request_ids": [], "disabled_at": 0},
    )
    seen = set(provider_state.get("seen_request_ids") or [])
    recent_request_ids = find_recent_image2_primary_524s()
    new_request_ids = [request_id for request_id in recent_request_ids if request_id not in seen]

    provider_state["seen_request_ids"] = sorted((seen | set(recent_request_ids)))[-200:]
    current_status = int(primary.get("status") or 0)
    fallback_ready = int(fallback.get("status") or 0) == 1
    action = "none"

    if current_status == 1:
        provider_state["auto_disabled"] = False
        provider_state["disabled_at"] = 0
        if new_request_ids:
            provider_state["failures"] = int(provider_state.get("failures", 0)) + len(new_request_ids)
            provider_state["recoveries"] = 0
            if provider_state["failures"] >= spec["disable_threshold"]:
                if fallback_ready:
                    set_channel_status(env, spec["channel_id"], 3, "image2_primary_524_failover", dry_run)
                    provider_state["auto_disabled"] = True
                    provider_state["disabled_at"] = now_ts()
                    action = "auto_disable_primary"
                else:
                    action = "hold_primary_fallback_unavailable"
        else:
            provider_state["failures"] = 0
            provider_state["recoveries"] = int(provider_state.get("recoveries", 0)) + 1
    elif current_status == 3 and provider_state.get("auto_disabled"):
        disabled_at = int(provider_state.get("disabled_at") or 0)
        if disabled_at and now_ts() - disabled_at >= spec["recover_cooldown_seconds"]:
            set_channel_status(env, spec["channel_id"], 1, "image2_primary_cooldown_recover", dry_run)
            provider_state["auto_disabled"] = False
            provider_state["failures"] = 0
            provider_state["recoveries"] = int(provider_state.get("recoveries", 0)) + 1
            action = "recover_enable_primary"
        else:
            action = "cooldown_wait"
    else:
        action = "manual_status_noop"

    provider_state["last_checked_at"] = now_iso()
    provider_state["last_action"] = action
    provider_state["recent_request_ids"] = recent_request_ids[-20:]
    provider_state["last_new_failure_count"] = len(new_request_ids)

    event = {
        "ts": now_iso(),
        "event": "image2_primary_guard",
        "provider": spec["name"],
        "model": spec["model"],
        "primary_channel_id": spec["channel_id"],
        "fallback_channel_id": spec["fallback_channel_id"],
        "primary_status_before": primary.get("status"),
        "fallback_status": fallback.get("status"),
        "fallback_ready": fallback_ready,
        "recent_failure_count": len(recent_request_ids),
        "new_failure_count": len(new_request_ids),
        "failure_count": provider_state.get("failures", 0),
        "dry_run": dry_run,
        "action": action,
    }
    write_event(event)
    return event


def load_image_long_tail_rows(env: dict[str, str], channel_ids: list[int]) -> list[dict[str, Any]]:
    if not channel_ids or IMAGE_REAL_REQUEST_LIMIT <= 0:
        return []
    cutoff = now_ts() - IMAGE_REAL_REQUEST_LOOKBACK_SECONDS
    ids = ",".join(str(channel_id) for channel_id in channel_ids)
    model = shell_quote(str(IMAGE_LONG_TAIL["model"]))
    select = f"""
SELECT JSON_OBJECT(
  'id', id,
  'created_at', created_at,
  'channel_id', channel_id,
  'type', type,
  'use_time', use_time,
  'content', LEFT(COALESCE(content, ''), 220),
  'other', LEFT(COALESCE(other, ''), 1200)
)
FROM logs
WHERE created_at >= {cutoff}
  AND model_name = {model}
  AND channel_id IN ({ids})
  AND use_time > 0
ORDER BY id DESC
LIMIT {int(IMAGE_REAL_REQUEST_LIMIT)}
"""
    return mysql_json(select, env)


def row_is_media_failure(row: dict[str, Any]) -> bool:
    content = str(row.get("content") or "")
    other = str(row.get("other") or "")
    return (
        int(row.get("type") or 0) == 5
        or '"failure_kind":"media_task_failed"' in other
        or '"task_status":"FAILURE"' in other
        or "任务失败" in content
    )


def evaluate_image_long_tail_real_p95(
    channels_by_id: dict[int, dict[str, Any]],
    state: dict[str, Any],
    env: dict[str, str],
    dry_run: bool,
) -> dict[str, Any]:
    configured_channel_ids = parse_int_list(IMAGE_LONG_TAIL_CHANNEL_IDS)
    channel_ids = [channel_id for channel_id in configured_channel_ids if channel_id in channels_by_id]
    if not channel_ids:
        return {"event": IMAGE_LONG_TAIL["name"], "action": "missing_channel", "configured_channel_ids": configured_channel_ids}

    rows = load_image_long_tail_rows(env, channel_ids)
    by_channel: dict[int, list[dict[str, Any]]] = {channel_id: [] for channel_id in channel_ids}
    for row in rows:
        channel_id = int(row.get("channel_id") or 0)
        if channel_id in by_channel:
            by_channel[channel_id].append(row)

    available_channels = [
        channel_id
        for channel_id in channel_ids
        if int(channels_by_id.get(channel_id, {}).get("status") or 0) == 1
    ]
    summaries: dict[int, dict[str, Any]] = {}
    for index, channel_id in enumerate(channel_ids):
        channel = channels_by_id.get(channel_id, {})
        channel_rows = by_channel.get(channel_id, [])
        use_times_ms = [int(row.get("use_time") or 0) * 1000 for row in channel_rows if int(row.get("use_time") or 0) > 0]
        failures = sum(1 for row in channel_rows if row_is_media_failure(row))
        p95_ms = percentile(use_times_ms, 0.95)
        max_ms = max(use_times_ms) if use_times_ms else None
        current_weight = int(channel.get("weight") or 0)
        target_weight = current_weight if current_weight > 0 else 100
        action = "none"
        severity = "insufficient_samples" if len(use_times_ms) < 2 else "healthy"
        if p95_ms is not None and len(use_times_ms) >= 2:
            target_weight = 100
            if p95_ms >= IMAGE_REAL_REQUEST_P95_SEVERE_MS:
                severity = "severe_long_tail"
                target_weight = 25
            elif p95_ms >= IMAGE_REAL_REQUEST_P95_DEGRADE_MS:
                severity = "degraded_long_tail"
                target_weight = 50
        if failures and len(channel_rows) >= 2 and failures / max(len(channel_rows), 1) >= DEGRADE_ERROR_RATE:
            severity = "failure_degraded" if severity == "healthy" else severity
            target_weight = min(target_weight, 50)
        if target_weight < 100 and len(available_channels) <= 1:
            target_weight = min(75, max(target_weight, 75))
            action = "soft_degrade_no_fallback"

        baseline_priority = int(channel.get("priority") or 0)
        ch_state = channel_state(state, channel_id, baseline_priority)
        ch_state["last_image_p95_ms"] = p95_ms
        ch_state["last_image_max_ms"] = max_ms
        ch_state["last_image_sample_count"] = len(use_times_ms)
        ch_state["last_image_severity"] = severity
        ch_state["last_checked_at"] = now_iso()

        if current_weight != target_weight:
            set_channel_weight(env, channel_id, target_weight, f"{IMAGE_LONG_TAIL['name']}_{severity}", dry_run)
            if action == "none":
                action = f"weight_{target_weight}"

        summaries[channel_id] = {
            "channel_id": channel_id,
            "current_status": int(channel.get("status") or 0),
            "current_weight": current_weight,
            "target_weight": target_weight,
            "current_priority": baseline_priority,
            "sample_count": len(use_times_ms),
            "failure_count": failures,
            "p95_use_ms": p95_ms,
            "max_use_ms": max_ms,
            "severity": severity,
            "action": action,
            "rank": index + 1,
        }

    event = {
        "ts": now_iso(),
        "event": IMAGE_LONG_TAIL["name"],
        "model": IMAGE_LONG_TAIL["model"],
        "dry_run": dry_run,
        "lookback_seconds": IMAGE_REAL_REQUEST_LOOKBACK_SECONDS,
        "rows": len(rows),
        "configured_channel_ids": configured_channel_ids,
        "available_channel_ids": available_channels,
        "channels": summaries,
    }
    write_event(event)
    return event


def all_configured_channel_ids() -> list[int]:
    ids: set[int] = {IMAGE2_PRIMARY["channel_id"], IMAGE2_PRIMARY["fallback_channel_id"]}
    ids.update(parse_int_list(IMAGE_LONG_TAIL_CHANNEL_IDS))
    for family in TEXT_FAMILIES:
        ids.update(family.channel_ids)
    return sorted(ids)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="probe and log without database changes")
    parser.add_argument("--no-probe", action="store_true", help="only print current state")
    args = parser.parse_args()

    ROOT.joinpath("logs").mkdir(exist_ok=True)
    ROOT.joinpath("data").mkdir(exist_ok=True)
    with LOCK_PATH.open("w") as lock_fp:
        fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
        env = load_dotenv(ROOT / ".env")
        required = ["MYSQL_ROOT_PASSWORD", "MYSQL_DATABASE"]
        missing = [key for key in required if not env.get(key)]
        if missing:
            raise RuntimeError(f"missing env keys: {','.join(missing)}")

        channels = load_channels(env, all_configured_channel_ids())
        state = load_state()
        if args.no_probe:
            print(
                json.dumps(
                    sanitize_for_event({
                        "text_families": [family.__dict__ for family in TEXT_FAMILIES],
                        "channels": {channel_id: redact_channel(channel) for channel_id, channel in channels.items()},
                        "state": state,
                    }),
                    ensure_ascii=False,
                    default=str,
                )
            )
            return 0

        results: dict[str, Any] = {}
        results["real_request_latency_ingest"] = ingest_real_request_samples(TEXT_FAMILIES, state, env)
        results[IMAGE2_PRIMARY["name"]] = evaluate_image2_primary(
            load_channels_by_id(env, [IMAGE2_PRIMARY["channel_id"], IMAGE2_PRIMARY["fallback_channel_id"]]),
            state,
            env,
            args.dry_run,
        )
        results[IMAGE_LONG_TAIL["name"]] = evaluate_image_long_tail_real_p95(
            channels,
            state,
            env,
            args.dry_run,
        )
        for family in TEXT_FAMILIES:
            results[family.name] = evaluate_text_family(family, channels, state, env, args.dry_run)
        save_state(state)
        print(json.dumps({"ok": True, "dry_run": args.dry_run, "results": results}, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BlockingIOError:
        print(json.dumps({"ok": False, "error": "provider monitor already running"}, ensure_ascii=False), file=os.sys.stderr)
        raise SystemExit(75)
    except Exception as exc:
        safe_error = redact_text(str(exc))[:500]
        write_event({"ts": now_iso(), "event": "provider_monitor_error", "error": safe_error})
        print(json.dumps({"ok": False, "error": safe_error}, ensure_ascii=False), file=os.sys.stderr)
        raise SystemExit(1)
