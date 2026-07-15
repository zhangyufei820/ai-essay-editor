from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from redis import Redis, WatchError

from app.config import Settings


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class TaskStore:
    def __init__(self, redis_client: Redis, settings: Settings) -> None:
        self.redis = redis_client
        self.settings = settings

    def _key(self, task_id: str) -> str:
        return f"codex:task:{task_id}"

    def _secret_key(self, task_id: str) -> str:
        return f"codex:task-secret:{task_id}"

    def _media_request_key(self, fingerprint: str) -> str:
        return f"codex:mcp-media-request:{fingerprint}"

    def put(self, task: dict[str, Any]) -> None:
        self.redis.set(
            self._key(task["task_id"]),
            json.dumps(task, ensure_ascii=False),
            ex=self.settings.task_retention_seconds,
        )

    def get(self, task_id: str) -> dict[str, Any] | None:
        raw = self.redis.get(self._key(task_id))
        if raw is None:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)

    def create(self, task: dict[str, Any]) -> None:
        task.setdefault("created_at", now_iso())
        task.setdefault("updated_at", now_iso())
        self.put(task)

    def update(self, task_id: str, **fields: Any) -> dict[str, Any] | None:
        key = self._key(task_id)
        while True:
            with self.redis.pipeline() as pipe:
                try:
                    pipe.watch(key)
                    raw = pipe.get(key)
                    if raw is None:
                        pipe.unwatch()
                        return None
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    task = json.loads(raw)
                    task.update(fields)
                    task["updated_at"] = now_iso()
                    pipe.multi()
                    pipe.set(
                        key,
                        json.dumps(task, ensure_ascii=False),
                        ex=self.settings.task_retention_seconds,
                    )
                    pipe.execute()
                    return task
                except WatchError:
                    continue

    def delete(self, task_id: str) -> None:
        self.redis.delete(self._key(task_id))

    def put_task_secret(self, task_id: str, value: str) -> None:
        self.redis.set(self._secret_key(task_id), value, ex=min(self.settings.task_retention_seconds, 86400))

    def get_task_secret(self, task_id: str) -> str:
        raw = self.redis.get(self._secret_key(task_id))
        if raw is None:
            return ""
        if isinstance(raw, bytes):
            return raw.decode("utf-8")
        return str(raw)

    def delete_task_secret(self, task_id: str) -> None:
        self.redis.delete(self._secret_key(task_id))

    def reserve_media_request(self, fingerprint: str, task_id: str, ttl_seconds: int) -> str:
        key = self._media_request_key(fingerprint)
        if self.redis.set(key, task_id, ex=max(1, ttl_seconds), nx=True):
            return task_id
        raw = self.redis.get(key)
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return str(raw or "")

    def release_media_request(self, fingerprint: str, task_id: str) -> bool:
        result = self.redis.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            1,
            self._media_request_key(fingerprint),
            task_id,
        )
        return bool(result)

    def write_status_file(self, task: dict[str, Any]) -> None:
        workspace = task.get("workspace")
        if not workspace:
            return None
        workspace_path = Path(str(workspace))
        workspace_path.mkdir(parents=True, exist_ok=True)
        safe_status = {
            key: task.get(key)
            for key in (
                "task_id",
                "skill_name",
                "status",
                "result_type",
                "error",
                "created_at",
                "started_at",
                "finished_at",
                "duration_ms",
                "cost_points",
            )
            if key in task
        }
        (workspace_path / "status.json").write_text(
            json.dumps(safe_status, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return None
