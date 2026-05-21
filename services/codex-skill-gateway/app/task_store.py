from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from redis import Redis

from app.config import Settings


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class TaskStore:
    def __init__(self, redis_client: Redis, settings: Settings) -> None:
        self.redis = redis_client
        self.settings = settings

    def _key(self, task_id: str) -> str:
        return f"codex:task:{task_id}"

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
        task = self.get(task_id)
        if task is None:
            return None
        task.update(fields)
        task["updated_at"] = now_iso()
        self.put(task)
        return task

    def delete(self, task_id: str) -> None:
        self.redis.delete(self._key(task_id))

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
