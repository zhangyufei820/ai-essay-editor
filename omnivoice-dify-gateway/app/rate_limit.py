import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Request

from .safety import GatewayError


@dataclass
class WindowLimit:
    max_requests: int
    window_seconds: int


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: WindowLimit) -> None:
        now = time.time()
        hits = self._hits[key]
        cutoff = now - limit.window_seconds
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= limit.max_requests:
            raise GatewayError(
                code="RATE_LIMITED",
                message="Too many requests. Please retry later.",
                status_code=429,
            )
        hits.append(now)


limiter = InMemoryRateLimiter()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

