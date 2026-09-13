#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import sync_app_model_permissions as permissions


MODEL = permissions.PUBLIC_MOON25_B720_VIDEO_MODEL
API_BASE = "http://127.0.0.1:3120"
TASK_ID_FILE = Path("/tmp/newapi-moon25-b720-task-id")
RESULT_FILE = Path("/tmp/newapi-moon25-b720-task-result.json")


def request(path: str, token: str, payload: dict[str, object] | None = None) -> tuple[int, dict[str, object]]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_BASE + path,
        data=body,
        headers={
            "Authorization": "Bearer sk-" + token.removeprefix("sk-"),
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def task_id_from_response(result: dict[str, object]) -> str | None:
    data = result.get("data")
    if isinstance(data, dict):
        for key in ("id", "task_id"):
            value = data.get(key)
            if isinstance(value, str) and value:
                return value
    for key in ("id", "task_id"):
        value = result.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def has_result_url(result: dict[str, object]) -> bool:
    for key in ("url", "video_url", "result_url"):
        if isinstance(result.get(key), str) and result[key]:
            return True
    data = result.get("data")
    return isinstance(data, dict) and any(
        isinstance(data.get(key), str) and data[key] for key in ("url", "video_url", "result_url")
    )


def state_from_response(result: dict[str, object]) -> object:
    state = result.get("status") or result.get("state")
    if state:
        return state
    data = result.get("data")
    if isinstance(data, dict):
        return data.get("status") or data.get("state")
    return None


def safe_summary(status: int, result: dict[str, object]) -> dict[str, object]:
    return {
        "http": status,
        "task_id": task_id_from_response(result),
        "status": state_from_response(result),
        "has_result_url": has_result_url(result),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe the staged Moon Video 2.5 720P route")
    parser.add_argument("--task-id")
    args = parser.parse_args()

    rows = permissions.mysql_raw(
        "SELECT `key`, model_limits FROM tokens WHERE user_id=1 "
        "AND name='星人视频生成令牌' AND status=1 AND deleted_at IS NULL"
    )
    if len(rows) != 1:
        raise RuntimeError("one enabled admin video token is required")
    token, limits = rows[0]
    if MODEL not in limits.split(","):
        raise RuntimeError("admin token lacks the requested model")

    task = args.task_id
    if not task:
        payload = {
            "model": MODEL,
            "prompt": "Keep the exact shape and colors of @image1. Make a minimal product animation with a gentle slow camera push, clean white background, no extra text.",
            "duration": 4,
            "ratio": "16:9",
            "resolution": "720P",
            "references": [
                {
                    "media_type": "image",
                    "role": "reference_image",
                    "url": "https://api.aiphui.top/logo.png",
                    "alias": "image1",
                }
            ],
        }
        http_status, result = request("/v1/videos", token, payload)
        task = task_id_from_response(result)
        print(json.dumps({**safe_summary(http_status, result), "phase": "submit"}, ensure_ascii=False), flush=True)
        if http_status >= 400 or not task:
            raise RuntimeError("submission did not return a task ID")
        TASK_ID_FILE.write_text(task, encoding="utf-8")

    for attempt in range(90):
        http_status, result = request("/v1/videos/" + task, token)
        state = state_from_response(result)
        print(
            json.dumps(
                {**safe_summary(http_status, result), "phase": "poll", "attempt": attempt + 1},
                ensure_ascii=False,
            ),
            flush=True,
        )
        if state in ("succeeded", "completed", "failed", "cancelled", "SUCCESS", "FAILURE"):
            RESULT_FILE.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
            if state not in ("succeeded", "completed", "SUCCESS") or not has_result_url(result):
                raise RuntimeError("task did not complete with a result URL")
            return
        time.sleep(10)
    raise TimeoutError("video task did not finish within the probe window")


if __name__ == "__main__":
    main()
