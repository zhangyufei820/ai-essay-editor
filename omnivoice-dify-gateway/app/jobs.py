import asyncio
import json
import logging
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

import aiofiles

from .schemas import JobStatus

logger = logging.getLogger("voice_gateway.jobs")


@dataclass
class JobRecord:
    job_id: str
    status: JobStatus
    progress: float
    created_at: datetime
    updated_at: datetime
    audio_url: str | None = None
    filename: str | None = None
    mime_type: str | None = None
    duration_seconds: float | None = None
    voice_id: str | None = None
    commentary_text: str | None = None
    error: str | None = None


class JobQueue:
    def __init__(self, max_concurrent_jobs: int, jobs_jsonl_path: Path) -> None:
        self._sem = asyncio.Semaphore(max_concurrent_jobs)
        self._jobs_jsonl_path = jobs_jsonl_path
        self._jobs: dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()

    def create_job(self, *, voice_id: str | None = None, commentary_text: str | None = None) -> JobRecord:
        now = datetime.now(timezone.utc)
        job = JobRecord(
            job_id=str(uuid.uuid4()),
            status=JobStatus.queued,
            progress=0.0,
            created_at=now,
            updated_at=now,
            voice_id=voice_id,
            commentary_text=commentary_text,
        )
        self._jobs[job.job_id] = job
        asyncio.create_task(self._append(job))
        return job

    def get(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    async def run_job(
        self,
        job: JobRecord,
        handler: Callable[[JobRecord], Awaitable[dict]],
    ) -> JobRecord:
        async with self._sem:
            await self._set_status(job.job_id, JobStatus.running, progress=0.2)
            try:
                result = await handler(job)
                await self._complete(job.job_id, result)
            except Exception as exc:
                logger.exception("job failed", extra={"job_id": job.job_id})
                await self._fail(job.job_id, str(exc))
        return self._jobs[job.job_id]

    def enqueue(self, job: JobRecord, handler: Callable[[JobRecord], Awaitable[dict]]) -> None:
        asyncio.create_task(self.run_job(job, handler))

    async def _set_status(self, job_id: str, status: JobStatus, progress: float | None = None) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            job.status = status
            if progress is not None:
                job.progress = progress
            job.updated_at = datetime.now(timezone.utc)
            await self._append(job)

    async def _complete(self, job_id: str, result: dict) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            job.status = JobStatus.succeeded
            job.progress = 1.0
            job.audio_url = result.get("audio_url")
            job.filename = result.get("filename")
            job.mime_type = result.get("mime_type")
            job.duration_seconds = result.get("duration_seconds")
            job.updated_at = datetime.now(timezone.utc)
            await self._append(job)

    async def _fail(self, job_id: str, error: str) -> None:
        async with self._lock:
            job = self._jobs[job_id]
            job.status = JobStatus.failed
            job.progress = 1.0
            job.error = error
            job.updated_at = datetime.now(timezone.utc)
            await self._append(job)

    async def _append(self, job: JobRecord) -> None:
        self._jobs_jsonl_path.parent.mkdir(parents=True, exist_ok=True)
        payload = asdict(job)
        payload["status"] = job.status.value
        payload["created_at"] = job.created_at.isoformat()
        payload["updated_at"] = job.updated_at.isoformat()
        async with aiofiles.open(self._jobs_jsonl_path, "a", encoding="utf-8") as handle:
            await handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


job_queue: JobQueue | None = None


def init_job_queue(max_concurrent_jobs: int, jobs_jsonl_path: Path) -> JobQueue:
    global job_queue
    job_queue = JobQueue(max_concurrent_jobs, jobs_jsonl_path)
    return job_queue


def get_job_queue() -> JobQueue:
    if job_queue is None:
        raise RuntimeError("Job queue is not initialized")
    return job_queue
