import asyncio
import os
import signal

import pytest

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
