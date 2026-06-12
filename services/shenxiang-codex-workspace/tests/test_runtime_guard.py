from app.main import (
    FAST_CHAT_HISTORY_CHARS,
    FAST_CHAT_HISTORY_LIMIT,
    fast_chat_messages,
    fast_skill_messages,
    fast_skill_responses_payload,
    response_error_message,
    responses_delta_text,
    runtime_guard_payload,
    should_use_fast_skill,
)
from app.models import WorkspaceFile, WorkspaceRunRequest
from app.security import contains_forbidden_runtime_action
from app.codex_runner import CodexRunner


def test_runtime_guard_does_not_scan_uploaded_document_body():
    request = WorkspaceRunRequest(
        user_query="请按我上传的 skill 处理内容",
        skill_name="codex_workspace",
        files=[
            WorkspaceFile(
                path="notes.md",
                content="""这是一份教程素材，里面提到了 Docker、Nginx、服务器配置等词，\n但用户只是让云 Codex 阅读这份资料并总结，不是在请求操作服务器。\n""",
            )
        ],
    )

    assert contains_forbidden_runtime_action({"files": [item.model_dump() for item in request.files]})
    assert not contains_forbidden_runtime_action(runtime_guard_payload(request))


def test_runtime_guard_still_blocks_destructive_user_intent():
    request = WorkspaceRunRequest(
        user_query="帮我执行 rm -rf ./input",
        skill_name="codex_workspace",
        files=[WorkspaceFile(path="notes.md", content="普通内容")],
    )

    assert contains_forbidden_runtime_action(runtime_guard_payload(request))


def test_codex_runner_runtime_scan_ignores_uploaded_file_content():
    task = {
        "request": {
            "user_query": "请基于上传的规则处理",
            "params": {},
            "metadata": {},
        },
        "files": [
            {
                "path": "notes.md",
                "content": "这份资料提到了 Docker、Nginx、服务器配置，但不是请求操作服务器。",
            }
        ],
    }

    payload = CodexRunner.__new__(CodexRunner)._forbidden_runtime_scan_payload(task)

    assert not contains_forbidden_runtime_action(payload)


def test_fast_skill_route_allows_pure_text_skill():
    request = WorkspaceRunRequest(
        user_query="请按当前 paper_outline skill 执行。为了测试响应速度，只输出一行 pong",
        skill_name="paper_outline",
        model_role="chat_main",
        model_config={"chat_main": "gpt-5.4-mini"},
    )

    assert should_use_fast_skill(request, {"queue": "fast"})


def test_fast_skill_route_blocks_workspace_work():
    request = WorkspaceRunRequest(
        user_query="读取上传文件并修改代码",
        skill_name="paper_outline",
        model_role="chat_main",
        model_config={"chat_main": "gpt-5.4-mini"},
    )

    assert not should_use_fast_skill(request, {"queue": "fast"})
    assert not should_use_fast_skill(
        request.model_copy(update={"files": [WorkspaceFile(path="notes.md", content="hello")]}),
        {"queue": "fast"},
    )
    assert not should_use_fast_skill(
        request.model_copy(update={"skill_name": "codex_workspace", "user_query": "普通问答"}),
        {"queue": "fast"},
    )


def test_fast_skill_messages_include_loaded_skill_markdown():
    request = WorkspaceRunRequest(
        user_query="生成论文大纲",
        skill_name="paper_outline",
        model_role="chat_main",
        model_config={"chat_main": "gpt-5.4-mini"},
        user_intent="论文大纲",
        output_format="markdown",
    )

    messages = fast_skill_messages(request, "# Paper Outline Skill\n\n按论文大纲规则输出。")

    assert messages[0]["role"] == "system"
    assert "Paper Outline Skill" in messages[0]["content"]
    assert "生成论文大纲" in messages[-1]["content"]


def test_fast_chat_messages_trim_history_for_low_latency():
    history = [
        {"role": "user", "content": f"old-{index}-" + "x" * (FAST_CHAT_HISTORY_CHARS + 50)}
        for index in range(FAST_CHAT_HISTORY_LIMIT + 3)
    ]
    request = WorkspaceRunRequest(
        user_query="只回复 pong",
        metadata={"history": history},
        model_config={"chat_main": "gpt-5.4-mini"},
    )

    messages = fast_chat_messages(request)

    assert len(messages) == FAST_CHAT_HISTORY_LIMIT + 2
    assert "old-0" not in "\n".join(message["content"] for message in messages)
    assert all(len(message["content"]) <= FAST_CHAT_HISTORY_CHARS for message in messages[1:-1])


def test_onboarding_fast_skill_uses_compact_prompt():
    request = WorkspaceRunRequest(
        user_query="我想把星人 API 配置到我自己电脑上的 Codex",
        skill_name="xingren-api-onboarding",
        model_role="chat_main",
        model_config={"chat_main": "gpt-5.4-mini"},
    )
    oversized_skill = "# Skill\n" + "完整长文档不应进入 fast prompt\n" * 5000

    messages = fast_skill_messages(request, oversized_skill)
    payload = fast_skill_responses_payload(request, oversized_skill, "gpt-5.4-mini")

    assert "用户自己的本机客户端" in messages[0]["content"]
    assert "完整长文档不应进入 fast prompt" not in messages[0]["content"]
    assert len(messages[0]["content"]) < 2500
    assert payload["model"] == "gpt-5.4-mini"
    assert payload["stream"] is True
    assert "用户自己的本机客户端" in payload["instructions"]


def test_responses_sse_delta_and_error_parsers():
    assert responses_delta_text({"type": "response.output_text.delta", "delta": "pong"}) == "pong"
    assert responses_delta_text({"type": "response.completed", "delta": "ignored"}) == ""
    assert response_error_message({"error": {"message": "bad request"}}) == "bad request"
