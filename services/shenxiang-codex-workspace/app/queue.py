from __future__ import annotations

from redis import Redis


class RedisTaskQueue:
    def __init__(self, redis_client: Redis, prefix: str = "codex:queue") -> None:
        self.redis = redis_client
        self.prefix = prefix

    def key(self, queue_name: str) -> str:
        return f"{self.prefix}:{queue_name}"

    def enqueue(self, queue_name: str, task_id: str) -> None:
        self.redis.lpush(self.key(queue_name), task_id)

    def dequeue(self, queue_names: list[str], timeout: int = 5) -> tuple[str, str] | None:
        keys = [self.key(name) for name in queue_names]
        item = self.redis.brpop(keys, timeout=timeout)
        if item is None:
            return None
        key, task_id = item
        key_text = key.decode("utf-8") if isinstance(key, bytes) else key
        task_text = task_id.decode("utf-8") if isinstance(task_id, bytes) else task_id
        return key_text.rsplit(":", 1)[-1], task_text
