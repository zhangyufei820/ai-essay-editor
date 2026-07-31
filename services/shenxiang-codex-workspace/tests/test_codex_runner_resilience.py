import asyncio
import json
import os
import signal

import pytest

from app.config import Settings
from app.codex_runner import CodexRunner


def test_gpt_56_sol_uses_at_least_ten_minute_timeout():
    runner = CodexRunner.__new__(CodexRunner)
    runner._model_for_task = lambda _task: "gpt-5.6-sol"

    assert runner._effective_timeout({"skill": {"timeout": 180}}) == 600
    assert runner._effective_timeout({"skill": {"timeout": 900}}) == 900


def test_other_models_keep_the_skill_timeout():
    runner = CodexRunner.__new__(CodexRunner)
    runner._model_for_task = lambda _task: "gpt-5.5"

    assert runner._effective_timeout({"skill": {"timeout": 180}}) == 180


def test_stream_disconnect_error_is_retryable_and_never_becomes_answer_text():
    runner = CodexRunner.__new__(CodexRunner)
    runner.settings = Settings()
    internal_url = "http://shenxiang-new-api:3000/v1/responses"

    event = runner._parse_codex_event(
        json.dumps(
            {
                "type": "error",
                "message": f"stream disconnected before completion: error sending request for url ({internal_url})",
            }
        ),
        "sk-test-secret-value",
    )

    assert event["type"] == "codex_event"
    assert event["event"] == "error"
    assert runner._is_retryable_upstream_error(event)
    failure = runner._deterministic_upstream_error(event)
    assert failure == {
        "type": "error",
        "code": "SERVICE_TEMPORARILY_UNAVAILABLE",
        "message": "模型连接短暂中断，正在切换稳定链路。",
    }
    assert internal_url not in str(failure)


@pytest.mark.asyncio
async def test_stdout_reader_emits_heartbeats_without_cancelling_the_pending_read():
    runner = CodexRunner.__new__(CodexRunner)
    reader = asyncio.StreamReader()

    async def feed_output():
        await asyncio.sleep(0.035)
        reader.feed_data(b'{"type":"response.output_text.delta","delta":"ok"}\n')
        reader.feed_eof()

    feeder = asyncio.create_task(feed_output())
    chunks = []
    async for chunk in runner._iter_stdout_with_heartbeats(reader, interval_seconds=0.01):
        chunks.append(chunk)
    await feeder

    assert chunks.count(None) >= 2
    assert chunks[-1] == b'{"type":"response.output_text.delta","delta":"ok"}\n'


@pytest.mark.asyncio
async def test_terminate_process_group_signals_the_whole_session(monkeypatch):
    runner = CodexRunner.__new__(CodexRunner)
    signals = []

    class FakeProcess:
        pid = 4321
        returncode = None

        async def wait(self):
            self.returncode = -signal.SIGTERM
            return self.returncode

    monkeypatch.setattr(os, "killpg", lambda pid, sig: signals.append((pid, sig)))

    await runner._terminate_process_group(FakeProcess(), grace_seconds=0.01)

    assert signals == [(4321, signal.SIGTERM)]
