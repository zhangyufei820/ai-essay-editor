#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("SHENXIANG_NEW_API_ROOT", "/opt/shenxiang-new-api"))
REDACTED = "***redacted***"
SENSITIVE_TEXT_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9][A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)(authorization:\s*bearer\s+)[^\s\"']+"),
    re.compile(r"https?://[^\s\"'<>]+"),
)


@dataclass(frozen=True)
class ReportWindow:
    hours: int
    start_ts: int
    end_ts: int


def redact_text(value: Any) -> str:
    text = str(value or "")
    for pattern in SENSITIVE_TEXT_PATTERNS:
        text = pattern.sub(lambda m: (m.group(1) + REDACTED) if m.lastindex else REDACTED, text)
    return text[:500]


def load_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def docker_mysql(args: list[str], env: dict[str, str], *, input_text: str | None = None) -> str:
    cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        f"MYSQL_PWD={env['MYSQL_ROOT_PASSWORD']}",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        env["MYSQL_DATABASE"],
    ] + args
    result = subprocess.run(
        cmd,
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        raise RuntimeError(redact_text(result.stderr))
    return result.stdout


def mysql_json(query: str, env: dict[str, str]) -> list[dict[str, Any]]:
    out = docker_mysql(["--batch", "--raw", "--skip-column-names", "-e", query], env)
    rows: list[dict[str, Any]] = []
    for line in out.splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def percentile(values: list[int], pct: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    pos = (len(ordered) - 1) * pct
    low = int(pos)
    high = min(low + 1, len(ordered) - 1)
    if low == high:
        return ordered[low]
    return int(ordered[low] * (high - pos) + ordered[high] * (pos - low))


def fetch_summary(env: dict[str, str], window: ReportWindow) -> dict[str, Any]:
    query = f"""
SELECT JSON_OBJECT(
  'total_logs', COUNT(*),
  'consume_logs', SUM(type = 2),
  'hard_error_logs', SUM(type = 5),
  'refund_logs', SUM(type = 6),
  'media_failure_logs', SUM(
    (COALESCE(other, '') LIKE '%"failure_kind":"media_task_failed"%')
    OR (COALESCE(other, '') LIKE '%"task_status":"FAILURE"%')
    OR (content LIKE '%媒体工坊%任务失败%')
  ),
  'text_no_output_logs', SUM(
    (COALESCE(other, '') LIKE '%"refund_reason":"no_effective_output"%')
    OR (content LIKE '%未向用户输出有效内容%')
  ),
  'client_gone_logs', SUM(COALESCE(other, '') LIKE '%client_gone%'),
  'access_denied_logs', SUM(
    (COALESCE(other, '') LIKE '%"error_code":"access_denied"%')
    OR (content LIKE '%no access to model%')
    OR (content LIKE '%无权访问模型%')
    OR (content LIKE '%暂未开通该模型%')
  ),
  'slow_180s_logs', SUM(use_time >= 180),
  'slow_300s_logs', SUM(use_time >= 300),
  'slow_600s_logs', SUM(use_time >= 600)
)
FROM logs
WHERE created_at >= {window.start_ts}
  AND created_at < {window.end_ts}
"""
    rows = mysql_json(query, env)
    return rows[0] if rows else {}


def fetch_model_latency(env: dict[str, str], window: ReportWindow, limit: int) -> list[dict[str, Any]]:
    query = f"""
SELECT JSON_OBJECT(
  'model_name', model_name,
  'channel_id', channel_id,
  'requests', COUNT(*),
  'failures', SUM(
    type = 5
    OR COALESCE(other, '') LIKE '%"failure_kind":"media_task_failed"%'
    OR content LIKE '%任务失败%'
  ),
  'avg_use_time', ROUND(AVG(use_time), 2),
  'max_use_time', MAX(use_time),
  'use_times', JSON_ARRAYAGG(use_time)
)
FROM logs
WHERE created_at >= {window.start_ts}
  AND created_at < {window.end_ts}
  AND type IN (2, 5)
  AND model_name <> ''
  AND use_time > 0
GROUP BY model_name, channel_id
ORDER BY MAX(use_time) DESC, COUNT(*) DESC
LIMIT {int(limit)}
"""
    rows = mysql_json(query, env)
    result: list[dict[str, Any]] = []
    for row in rows:
        raw_times = row.pop("use_times", [])
        if isinstance(raw_times, str):
            try:
                raw_times = json.loads(raw_times)
            except json.JSONDecodeError:
                raw_times = []
        if not isinstance(raw_times, list):
            raw_times = []
        use_times = [int(float(value)) for value in raw_times if value is not None]
        row["p95_use_time"] = percentile(use_times, 0.95)
        row["slow_180s"] = sum(1 for value in use_times if value >= 180)
        row["slow_300s"] = sum(1 for value in use_times if value >= 300)
        row["slow_600s"] = sum(1 for value in use_times if value >= 600)
        result.append(row)
    return result


def fetch_recent_examples(env: dict[str, str], window: ReportWindow, limit: int) -> list[dict[str, Any]]:
    query = f"""
SELECT JSON_OBJECT(
  'id', id,
  'created_at', created_at,
  'type', type,
  'user_id', user_id,
  'model_name', model_name,
  'channel_id', channel_id,
  'token_id', token_id,
  'use_time', use_time,
  'quota', quota,
  'request_id', request_id,
  'content', LEFT(content, 220),
  'other', LEFT(COALESCE(other, ''), 900)
)
FROM logs
WHERE created_at >= {window.start_ts}
  AND created_at < {window.end_ts}
  AND (
    type = 5
    OR COALESCE(other, '') LIKE '%"failure_kind"%'
    OR COALESCE(other, '') LIKE '%client_gone%'
    OR COALESCE(other, '') LIKE '%"refund_reason":"no_effective_output"%'
    OR content LIKE '%未向用户输出有效内容%'
    OR content LIKE '%任务失败%'
    OR content LIKE '%no access to model%'
    OR content LIKE '%无权访问模型%'
  )
ORDER BY id DESC
LIMIT {int(limit)}
"""
    rows = mysql_json(query, env)
    for row in rows:
        row["content"] = redact_text(row.get("content", ""))
        other = row.get("other", "")
        row["other_preview"] = redact_text(other)
        row.pop("other", None)
    return rows


def fetch_access_denied_by_model(env: dict[str, str], window: ReportWindow) -> list[dict[str, Any]]:
    query = f"""
SELECT JSON_OBJECT(
  'model_name', model_name,
  'channel_id', channel_id,
  'count', COUNT(*),
  'last_id', MAX(id),
  'last_created_at', MAX(created_at)
)
FROM logs
WHERE created_at >= {window.start_ts}
  AND created_at < {window.end_ts}
  AND (
    COALESCE(other, '') LIKE '%"error_code":"access_denied"%'
    OR content LIKE '%no access to model%'
    OR content LIKE '%无权访问模型%'
    OR content LIKE '%暂未开通该模型%'
  )
GROUP BY model_name, channel_id
ORDER BY COUNT(*) DESC, MAX(id) DESC
LIMIT 30
"""
    return mysql_json(query, env)


def build_report(env: dict[str, str], window: ReportWindow, limit: int) -> dict[str, Any]:
    summary = fetch_summary(env, window)
    return {
        "ok": True,
        "window": {
            "hours": window.hours,
            "start_ts": window.start_ts,
            "end_ts": window.end_ts,
        },
        "summary": summary,
        "latency_by_model_channel": fetch_model_latency(env, window, limit),
        "access_denied_by_model_channel": fetch_access_denied_by_model(env, window),
        "recent_anomaly_examples": fetch_recent_examples(env, window, limit),
        "classification_notes": {
            "hard_error": "logs.type = 5",
            "user_visible_media_failure": "task_status=FAILURE or failure_kind=media_task_failed or failure content",
            "text_no_output_refund": "refund_reason=no_effective_output or legacy no-output content",
            "access_denied": "access_denied error code or no-access public message",
            "slow_tail": "use_time thresholds at 180s/300s/600s and per model/channel P95",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only isolated New API runtime report")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()

    env = load_dotenv(args.root / ".env")
    missing = [key for key in ("MYSQL_ROOT_PASSWORD", "MYSQL_DATABASE") if not env.get(key)]
    if missing:
        raise RuntimeError(f"missing env keys: {','.join(missing)}")
    end_ts = int(time.time())
    window = ReportWindow(hours=args.hours, start_ts=end_ts - args.hours * 3600, end_ts=end_ts)
    print(json.dumps(build_report(env, window, args.limit), ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"ok": False, "error": redact_text(exc)}, ensure_ascii=False), file=os.sys.stderr)
        raise SystemExit(1)
