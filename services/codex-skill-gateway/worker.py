from __future__ import annotations

import logging
import os
import signal
from typing import Any

from redis import Redis

from app.codex_runner import CodexRunner
from app.config import ensure_codex_config, ensure_directories, get_settings
from app.queue import RedisTaskQueue
from app.task_store import TaskStore, now_iso


settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("codex-worker")
stop_requested = False


def handle_signal(signum: int, _frame: Any) -> None:
    global stop_requested
    logger.info("received signal=%s, stopping after current task", signum)
    stop_requested = True


def configured_queues() -> list[str]:
    raw = os.getenv("WORKER_QUEUES") or os.getenv("WORKER_QUEUE") or "fast"
    queues = [item.strip() for item in raw.split(",") if item.strip()]
    return queues or ["fast"]


def main() -> None:
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    ensure_directories(settings)
    ensure_codex_config(settings)

    redis_client = Redis.from_url(settings.redis_url, decode_responses=False)
    queue = RedisTaskQueue(redis_client)
    store = TaskStore(redis_client, settings)
    runner = CodexRunner(settings)
    queues = configured_queues()
    logger.info("worker started queues=%s", ",".join(queues))

    while not stop_requested:
        item = queue.dequeue(queues, timeout=5)
        if item is None:
            continue
        queue_name, task_id = item
        task = store.get(task_id)
        if task is None:
            logger.warning("task disappeared task_id=%s queue=%s", task_id, queue_name)
            continue
        if task.get("status") not in {"queued", "retrying"}:
            logger.info("skip task_id=%s status=%s", task_id, task.get("status"))
            continue

        logger.info("task started task_id=%s skill=%s queue=%s", task_id, task.get("skill_name"), queue_name)
        task = store.update(task_id, status="running", started_at=now_iso()) or task
        store.write_status_file(task)

        result = runner.run(task)
        fields = {
            "status": result["status"],
            "duration_ms": result.get("duration_ms", 0),
            "finished_at": now_iso(),
        }
        if result["status"] == "completed":
            fields.update(
                {
                    "result": result.get("result", ""),
                    "result_type": result.get("result_type", "markdown"),
                }
            )
        else:
            fields["error"] = result.get("error", {"code": "TASK_FAILED", "message": "Task failed."})

        updated = store.update(task_id, **fields)
        if updated:
            store.write_status_file(updated)
        logger.info(
            "task finished task_id=%s skill=%s status=%s duration_ms=%s",
            task_id,
            task.get("skill_name"),
            fields["status"],
            fields["duration_ms"],
        )

    logger.info("worker stopped")


if __name__ == "__main__":
    main()
