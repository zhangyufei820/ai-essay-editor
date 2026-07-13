import asyncio
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.codex_runner import CodexRunner
from app.config import Settings
from app.main import (
    build_direct_task,
    fast_chat_completions_payload,
    fast_chat_responses_payload,
    fast_skill_completions_payload,
    fast_skill_responses_payload,
    model_modes,
    submit_workspace_task,
)
from app.models import WorkspaceRunRequest
from app.security import UserContext


def test_model_modes_expose_official_reasoning_efforts() -> None:
    user = UserContext(
        api_key="sk-test",
        user_id="user-1",
        key_hint="sk-****",
        allowed_models_by_mode={
            "codex": ("gpt-5.5", "gpt-5.5-openai-compact", "gpt-5.6-sol", "gpt-5.4-mini"),
            "claude": (),
            "image": (),
            "video": (),
        },
    )

    reasoning = model_modes(user)["codex"]["reasoning"]

    assert reasoning["gpt-5.5"] == {"efforts": ["none", "low", "medium", "high", "xhigh"], "default": "medium"}
    assert reasoning["gpt-5.5-openai-compact"] == {"efforts": ["none", "low", "medium", "high", "xhigh"], "default": "medium"}
    assert reasoning["gpt-5.6-sol"] == {"efforts": ["none", "low", "medium", "high", "xhigh"], "default": "medium"}
    assert "gpt-5.4-mini" not in reasoning


def test_fast_payloads_keep_the_selected_reasoning_effort() -> None:
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": "gpt-5.6-sol"},
        reasoning_effort="xhigh",
        metadata={"mode": "codex", "server_allowed_models_by_mode": {"codex": ["gpt-5.6-sol"]}},
    )

    assert fast_chat_responses_payload(request, "gpt-5.6-sol")["reasoning"] == {"effort": "xhigh"}
    assert fast_chat_completions_payload(request, "gpt-5.6-sol")["reasoning_effort"] == "xhigh"
    assert fast_skill_responses_payload(request, "# Skill", "gpt-5.6-sol")["reasoning"] == {"effort": "xhigh"}
    assert fast_skill_completions_payload(request, "# Skill", "gpt-5.6-sol")["reasoning_effort"] == "xhigh"


def test_request_schema_rejects_unsupported_max_effort() -> None:
    with pytest.raises(ValidationError):
        WorkspaceRunRequest(
            user_query="test",
            model_config={"chat_main": "gpt-5.6-sol"},
            reasoning_effort="max",
        )


def test_unsupported_model_rejects_reasoning_effort_before_task_creation() -> None:
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": "gpt-5.4-mini"},
        reasoning_effort="high",
        metadata={"mode": "codex"},
    )
    user = UserContext(api_key="sk-test", user_id="user-1", key_hint="sk-****")

    result = build_direct_task(request, user)

    assert result["success"] is False
    assert result["error"]["code"] == "INVALID_REASONING_EFFORT"


def test_unsupported_model_rejects_reasoning_effort_before_queueing() -> None:
    request = WorkspaceRunRequest(
        user_query="test",
        model_config={"chat_main": "gpt-5.4-mini"},
        reasoning_effort="high",
        metadata={"mode": "codex"},
    )
    user = UserContext(api_key="sk-test", user_id="user-1", key_hint="sk-****")

    result = asyncio.run(submit_workspace_task(request, user))

    assert result["success"] is False
    assert result["error"]["code"] == "INVALID_REASONING_EFFORT"


def test_codex_command_uses_a_per_request_reasoning_override(tmp_path: Path) -> None:
    runner = CodexRunner.__new__(CodexRunner)
    runner.settings = Settings()
    runner._cached_help_text = "--model --config --json --ephemeral --color --sandbox --skip-git-repo-check --cd"
    task = {
        "model_role": "chat_main",
        "model_config": {"chat_main": "gpt-5.6-sol"},
        "request": {
            "reasoning_effort": "xhigh",
            "metadata": {"mode": "codex", "server_allowed_models_by_mode": {"codex": ["gpt-5.6-sol"]}},
        },
        "skill": {"sandbox": "workspace-write"},
    }

    command = runner._build_command(task, tmp_path, "test", json_events=True)

    assert command[0:4] == ["codex", "exec", "--model", "gpt-5.6-sol"]
    assert "model_reasoning_effort=\"xhigh\"" in command
