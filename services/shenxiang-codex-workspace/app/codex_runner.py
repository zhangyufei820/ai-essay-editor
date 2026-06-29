from __future__ import annotations

import json
import logging
import shutil
import subprocess
import time
import asyncio
import base64
import re
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

from app.config import (
    Settings,
    build_codex_env,
    ensure_codex_config,
    has_codex_auth,
    secret_values_for_redaction,
    write_codex_config,
)
from app.security import contains_forbidden_runtime_action, normalize_sandbox, public_error_code, public_error_message, redact

logger = logging.getLogger(__name__)

RETRYABLE_UPSTREAM_STATUS_CODES = ("502", "503", "524")


class CodexRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._cached_help_text: str | None = None
        ensure_codex_config(settings)

    def run(self, task: dict[str, Any]) -> dict[str, Any]:
        task_id = task["task_id"]
        started = time.monotonic()
        workspace = Path(task["workspace"])
        workspace.mkdir(parents=True, exist_ok=True)
        try:
            self._prepare_skills(workspace, task["skill_name"], str(task.get("user_id", "")))
            image_paths = self._prepare_workspace_files(workspace, task)
            task["_command_guard_dir"] = str(self._prepare_command_guards(workspace))
            task["_image_paths"] = image_paths
        except (FileNotFoundError, ValueError) as exc:
            return self._failed(
                task,
                started,
                "WORKSPACE_PREPARE_FAILED",
                str(exc) or "Workspace preparation failed.",
            )
        prompt = self._build_prompt(task)
        if contains_forbidden_runtime_action(self._forbidden_runtime_scan_payload(task)):
            return self._failed(
                task,
                started,
                "FORBIDDEN_RUNTIME_ACTION",
                "This request asks for forbidden file, server, or destructive operations.",
            )
        (workspace / "prompt.txt").write_text(prompt, encoding="utf-8")

        user_api_key = str(task.get("_user_api_key", ""))
        if not has_codex_auth(self.settings, user_api_key):
            return self._failed(
                task,
                started,
                "USER_KEY_NOT_CONFIGURED",
                "New API user key is required.",
            )

        if shutil.which("codex") is None:
            return self._failed(
                task,
                started,
                "CODEX_CLI_NOT_FOUND",
                "codex CLI is not available in the worker image.",
            )

        timeout = int(task["skill"]["timeout"])
        logger.info(
            "running codex task_id=%s user=%s skill=%s timeout=%s",
            task_id,
            task.get("key_hint", "unknown"),
            task["skill_name"],
            timeout,
        )
        command = self._build_command(task, workspace, prompt, task.get("_image_paths", []))
        write_codex_config(self.settings, self.settings.codex_home)

        try:
            completed = subprocess.run(
                command,
                cwd=str(workspace),
                env=build_codex_env(self.settings, user_api_key, self._command_guard_path(task)),
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            stdout = self._to_text(exc.stdout)
            stderr = self._to_text(exc.stderr)
            self._write_output(workspace, stdout, stderr, user_api_key)
            return self._failed(
                task,
                started,
                "CODEX_TIMEOUT",
                f"Codex task timed out after {timeout} seconds.",
            )

        stdout = self._to_text(completed.stdout)
        stderr = self._to_text(completed.stderr)
        self._write_output(workspace, stdout, stderr, user_api_key)

        if completed.returncode != 0:
            message = "Codex execution failed. Check task stderr for sanitized details."
            safe_stderr = redact(stderr, secret_values_for_redaction(self.settings, user_api_key)).strip()
            if safe_stderr:
                logger.warning(
                    "codex stderr task_id=%s user=%s skill=%s stderr_len=%s",
                    task_id,
                    task.get("key_hint", "unknown"),
                    task["skill_name"],
                    len(safe_stderr),
                )
            if "authentication" in safe_stderr.lower() or "api key" in safe_stderr.lower():
                message = "New API user key authentication failed."
            return self._failed(task, started, "CODEX_EXEC_FAILED", message)

        result = redact(stdout.strip(), secret_values_for_redaction(self.settings, user_api_key))
        (workspace / "result.md").write_text(result, encoding="utf-8")
        return {
            "status": "completed",
            "result": result,
            "result_type": self._result_type(task),
            "duration_ms": int((time.monotonic() - started) * 1000),
            "finished_at": time.time(),
        }

    async def stream(self, task: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        task_id = task["task_id"]
        started = time.monotonic()
        workspace = Path(task["workspace"])
        workspace.mkdir(parents=True, exist_ok=True)
        user_api_key = str(task.get("_user_api_key", ""))
        try:
            yield {"type": "status", "message": "创建隔离工作区", "task_id": task_id}
            self._prepare_skills(workspace, task["skill_name"], str(task.get("user_id", "")))
            image_paths = self._prepare_workspace_files(workspace, task)
            task["_command_guard_dir"] = str(self._prepare_command_guards(workspace))
            task["_image_paths"] = image_paths
            if task.get("_uploaded_files"):
                yield {"type": "status", "message": f"已接收 {len(task['_uploaded_files'])} 个上传文件"}
            prompt = self._build_prompt(task)
            if contains_forbidden_runtime_action(self._forbidden_runtime_scan_payload(task)):
                yield {
                    "type": "error",
                    "code": "FORBIDDEN_RUNTIME_ACTION",
                    "message": "This request asks for forbidden file, server, or destructive operations.",
                }
                return
            (workspace / "prompt.txt").write_text(prompt, encoding="utf-8")
            yield {"type": "status", "message": "加载社区 Skill 与上下文"}
        except (FileNotFoundError, ValueError) as exc:
            yield {"type": "error", "code": "WORKSPACE_PREPARE_FAILED", "message": str(exc)}
            return

        if not has_codex_auth(self.settings, user_api_key):
            yield {"type": "error", "code": "USER_KEY_NOT_CONFIGURED", "message": "New API user key is required."}
            return
        if shutil.which("codex") is None:
            yield {"type": "error", "code": "CODEX_CLI_NOT_FOUND", "message": "codex CLI is not available."}
            return

        command = self._build_command(task, workspace, prompt, task.get("_image_paths", []), json_events=True)
        write_codex_config(self.settings, self.settings.codex_home)
        timeout = int(task["skill"]["timeout"])
        yield {"type": "status", "message": "连接模型并开始流式生成"}

        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(workspace),
            env=build_codex_env(self.settings, user_api_key, self._command_guard_path(task)),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_chunks: list[str] = []
        stderr_chunks: list[str] = []
        final_message = ""
        stderr_task = asyncio.create_task(self._collect_stderr(process, stderr_chunks))
        try:
            async with asyncio.timeout(timeout):
                assert process.stdout is not None
                async for raw_line in process.stdout:
                    line = raw_line.decode("utf-8", errors="replace").strip()
                    if not line:
                        continue
                    stdout_chunks.append(line)
                    event = self._parse_codex_event(line, user_api_key)
                    fast_fail = self._deterministic_upstream_error(event)
                    if fast_fail:
                        process.kill()
                        await process.wait()
                        self._write_output(workspace, "\n".join(stdout_chunks), "\n".join(stderr_chunks), user_api_key)
                        if self._is_retryable_upstream_error(fast_fail.get("message", "")):
                            async for fallback_event in self._stream_chat_completions_fallback(task, user_api_key):
                                yield fallback_event
                            return
                        yield fast_fail
                        return
                    if event.get("type") == "delta":
                        final_message += str(event.get("text", ""))
                        yield event
                        continue
                    if event.get("type") == "message":
                        text = str(event.get("text", ""))
                        if text:
                            final_message += text
                            async for chunk in self._drip_text(text, event.get("event", "")):
                                yield chunk
                        continue
                    yield event
                return_code = await process.wait()
        except TimeoutError:
            process.kill()
            await process.wait()
            self._write_output(workspace, "\n".join(stdout_chunks), "\n".join(stderr_chunks), user_api_key)
            yield {"type": "error", "code": "CODEX_TIMEOUT", "message": f"Codex task timed out after {timeout} seconds."}
            return
        finally:
            if not stderr_task.done():
                stderr_task.cancel()
            await asyncio.gather(stderr_task, return_exceptions=True)

        stdout = "\n".join(stdout_chunks)
        stderr = "\n".join(stderr_chunks)
        self._write_output(workspace, stdout, stderr, user_api_key)
        if return_code != 0:
            safe_stderr = redact(stderr, secret_values_for_redaction(self.settings, user_api_key)).strip()
            logger.warning("codex stream failed task_id=%s stderr_len=%s", task_id, len(safe_stderr))
            if self._is_retryable_upstream_error(f"{stdout}\n{stderr}"):
                async for fallback_event in self._stream_chat_completions_fallback(task, user_api_key):
                    yield fallback_event
                return
            yield {"type": "error", "code": "CODEX_EXEC_FAILED", "message": self._safe_failure_message(stdout, stderr)}
            return

        result = final_message.strip() or self._extract_final_text(stdout, user_api_key)
        result = redact(result, secret_values_for_redaction(self.settings, user_api_key))
        (workspace / "result.md").write_text(result, encoding="utf-8")
        yield {
            "type": "complete",
            "status": "completed",
            "result": result,
            "result_type": self._result_type(task),
            "duration_ms": int((time.monotonic() - started) * 1000),
        }

    def _build_command(
        self,
        task: dict[str, Any],
        workspace: Path,
        prompt: str,
        image_paths: list[str] | None = None,
        json_events: bool = False,
    ) -> list[str]:
        help_text = self._help_text()
        command = ["codex", "exec"]
        model = self._model_for_task(task)
        if model and "--model" in help_text:
            command.extend(["--model", model])
        if json_events and "--json" in help_text:
            command.append("--json")
        if "--ephemeral" in help_text:
            command.append("--ephemeral")
        if "--color" in help_text:
            command.extend(["--color", "never"])
        sandbox = normalize_sandbox(self.settings.codex_exec_sandbox or task["skill"].get("sandbox", "workspace-write"), self.settings)
        if "--sandbox" in help_text:
            command.extend(["--sandbox", sandbox])
        if "--skip-git-repo-check" in help_text:
            command.append("--skip-git-repo-check")
        if "--cd" in help_text:
            command.extend(["--cd", str(workspace)])
        if image_paths and "--image" in help_text:
            for image_path in image_paths:
                command.extend(["--image", image_path])
        command.append(prompt)
        return command

    async def _collect_stderr(self, process: asyncio.subprocess.Process, chunks: list[str]) -> None:
        if process.stderr is None:
            return
        async for raw_line in process.stderr:
            line = raw_line.decode("utf-8", errors="replace").rstrip()
            if line:
                chunks.append(line)

    def _parse_codex_event(self, line: str, user_api_key: str) -> dict[str, Any]:
        secret_values = secret_values_for_redaction(self.settings, user_api_key)
        try:
            payload = json.loads(line)
        except ValueError:
            return {"type": "codex_event", "message": redact(line, secret_values)}
        if not isinstance(payload, dict):
            return {"type": "codex_event", "message": redact(str(payload), secret_values)}
        event_type = str(payload.get("type") or payload.get("event") or "")
        text = self._event_text(payload)
        safe_payload = json.loads(redact(json.dumps(payload, ensure_ascii=False), secret_values))
        if text:
            if self._is_completed_agent_message(payload):
                return {"type": "message", "text": redact(text, secret_values), "event": event_type}
            return {"type": "delta", "text": redact(text, secret_values), "event": event_type}
        if any(key in event_type.lower() for key in ("tool", "exec", "command")):
            return {"type": "tool", "message": self._event_label(payload), "event": event_type, "raw": safe_payload}
        return {"type": "codex_event", "message": self._event_label(payload), "event": event_type, "raw": safe_payload}

    def _deterministic_upstream_error(self, event: dict[str, Any]) -> dict[str, str] | None:
        if event.get("event") != "error" and event.get("type") not in {"error", "codex_event"}:
            return None
        raw = event.get("raw") if isinstance(event.get("raw"), dict) else {}
        message = str(raw.get("message") or event.get("message") or "")
        lower = message.lower()
        if "invalid token" in lower or "401 unauthorized" in lower:
            return {
                "type": "error",
                "code": public_error_code("MODEL_AUTH_FAILED"),
                "message": "令牌验证失败。请重新复制对应的专用 Key 后再试。",
            }
        if "no available channel" in lower:
            return {
                "type": "error",
                "code": public_error_code("MODEL_TEMPORARILY_UNAVAILABLE"),
                "message": "当前模型暂不可用，请切换文本模型或让管理员检查该用户分组的模型权限。",
            }
        if "insufficient_user_quota" in lower or "insufficient quota" in lower:
            return {
                "type": "error",
                "code": "INSUFFICIENT_USER_QUOTA",
                "message": "当前用户额度不足，请先充值或兑换额度后再使用 Codex。",
            }
        if "model" in lower and ("not found" in lower or "not available" in lower):
            return {
                "type": "error",
                "code": public_error_code("MODEL_UNAVAILABLE"),
                "message": "当前模型不可用，请切换为已开放的文本模型。",
            }
        return None

    def _safe_failure_message(self, stdout: str, stderr: str) -> str:
        combined = f"{stdout}\n{stderr}".lower()
        if "invalid token" in combined or "401 unauthorized" in combined:
            return "令牌验证失败。请重新复制对应的专用 Key 后再试。"
        if "no available channel" in combined:
            return "当前模型暂不可用，请切换文本模型或让管理员检查该用户分组的模型权限。"
        if "insufficient_user_quota" in combined or "insufficient quota" in combined:
            return "当前用户额度不足，请先充值或兑换额度后再使用 Codex。"
        return "Codex 执行失败，请检查用户模型权限、额度或模型服务状态。"

    def _is_retryable_upstream_error(self, message: object) -> bool:
        text = str(message or "").lower()
        return any(
            marker in text
            for marker in (
                "status code 502",
                "http 502",
                " 502",
                "bad gateway",
                "status code 503",
                "http 503",
                " 503",
                "service unavailable",
                "status code 524",
                "http 524",
                " 524",
                "timeout occurred",
                "a timeout occurred",
            )
        )

    async def _stream_chat_completions_fallback(
        self,
        task: dict[str, Any],
        user_api_key: str,
    ) -> AsyncIterator[dict[str, Any]]:
        task_id = str(task.get("task_id") or "")
        model = self._chat_fallback_model(task)
        yield {
            "type": "status",
            "message": "主服务暂时异常，正在切换稳定链路",
            "event": "fallback.started",
            "task_id": task_id,
        }
        payload = {
            "model": model,
            "messages": self._chat_fallback_messages(task),
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {user_api_key}",
            "Content-Type": "application/json",
        }
        final_text = ""
        try:
            timeout = httpx.Timeout(120.0, connect=8.0, read=120.0, write=20.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.settings.new_api_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    if response.status_code >= 400:
                        body = (await response.aread()).decode("utf-8", errors="replace")
                        yield {
                            "type": "error",
                            "code": "CODEX_FALLBACK_FAILED",
                            "message": self._safe_http_error(body, user_api_key, response.status_code),
                            "task_id": task_id,
                        }
                        return
                    async for line in response.aiter_lines():
                        line = line.strip()
                        if not line or line.startswith(":") or not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            event = json.loads(data)
                        except ValueError:
                            continue
                        error = event.get("error") if isinstance(event, dict) else None
                        if isinstance(error, dict):
                            yield {
                                "type": "error",
                                "code": "CODEX_STABLE_ROUTE_ERROR",
                                "message": redact(
                                    str(error.get("message") or "稳定链路返回错误。"),
                                    secret_values_for_redaction(self.settings, user_api_key),
                                ),
                                "task_id": task_id,
                            }
                            return
                        delta = self._chat_completion_delta_text(event)
                        if delta:
                            final_text += delta
                            yield {
                                "type": "delta",
                                "text": delta,
                                "event": "fallback.chat.delta",
                                "task_id": task_id,
                            }
        except Exception as exc:
            yield {
                "type": "error",
                "code": "CODEX_FALLBACK_REQUEST_FAILED",
                "message": redact(str(exc), secret_values_for_redaction(self.settings, user_api_key)),
                "task_id": task_id,
            }
            return

        result = final_text.strip() or "稳定链路已完成，但没有返回文本。"
        workspace = Path(task["workspace"])
        workspace.mkdir(parents=True, exist_ok=True)
        (workspace / "result.md").write_text(
            redact(result, secret_values_for_redaction(self.settings, user_api_key)),
            encoding="utf-8",
        )
        yield {
            "type": "complete",
            "status": "completed",
            "result": result,
            "result_type": self._result_type(task),
            "duration_ms": 0,
            "event": "fallback.completed",
            "task_id": task_id,
        }

    def _chat_fallback_model(self, task: dict[str, Any]) -> str:
        configured = str(getattr(self.settings, "codex_chat_fallback_model", "") or "").strip()
        if configured:
            return configured
        if self.settings.default_chat_model in set(self.settings.codex_allowed_models):
            return self.settings.default_chat_model
        return self.settings.codex_allowed_models[0] if self.settings.codex_allowed_models else self.settings.default_chat_model

    def _chat_fallback_messages(self, task: dict[str, Any]) -> list[dict[str, str]]:
        prompt = self._build_prompt(task)
        return [
            {
                "role": "system",
                "content": (
                    "你是星人 Codex 云工作台的稳定链路模型。"
                    "主服务暂时不可用时，你需要直接帮助用户完成当前请求。"
                    "如果任务需要读取或修改文件、安装依赖、执行命令，请明确说明当前链路不能执行工具，"
                    "并给出可复制的操作步骤或可用版本。"
                ),
            },
            {"role": "user", "content": prompt},
        ]

    def _chat_completion_delta_text(self, payload: Any) -> str:
        if not isinstance(payload, dict):
            return ""
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return ""
        choice = choices[0]
        if not isinstance(choice, dict):
            return ""
        for container_name in ("delta", "message"):
            container = choice.get(container_name)
            if not isinstance(container, dict):
                continue
            content = container.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return "".join(str(item.get("text") or "") for item in content if isinstance(item, dict))
        text = choice.get("text")
        return str(text) if isinstance(text, str) else ""

    def _safe_http_error(self, body: str, user_api_key: str, status_code: int) -> str:
        safe_body = redact(body[:600], secret_values_for_redaction(self.settings, user_api_key))
        try:
            payload = json.loads(safe_body)
        except ValueError:
            payload = {}
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict) and error.get("message"):
                safe_body = str(error["message"])
            elif payload.get("message"):
                safe_body = str(payload["message"])
        if not safe_body:
            safe_body = "智能服务暂时不可用，请稍后重试。"
        return public_error_message(safe_body, "智能服务暂时不可用，请稍后重试。")

    def _event_text(self, payload: dict[str, Any]) -> str:
        for key in ("delta", "text", "content"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        message = payload.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                parts = [item.get("text", "") for item in content if isinstance(item, dict)]
                return "".join(parts)
        item = payload.get("item")
        if isinstance(item, dict):
            text = self._event_text(item)
            if text:
                return text
        return ""

    def _is_completed_agent_message(self, payload: dict[str, Any]) -> bool:
        event_type = str(payload.get("type") or payload.get("event") or "")
        item = payload.get("item")
        return event_type == "item.completed" and isinstance(item, dict) and item.get("type") == "agent_message"

    async def _drip_text(self, text: str, event_type: object = "") -> AsyncIterator[dict[str, Any]]:
        for chunk in self._text_chunks(text):
            yield {"type": "delta", "text": chunk, "event": str(event_type or "agent_message")}
            await asyncio.sleep(0.012)

    def _text_chunks(self, text: str, size: int = 5) -> list[str]:
        if not text:
            return []
        chunks: list[str] = []
        current = ""
        for char in text:
            current += char
            if char in "\n。！？；，,.!?; " or len(current) >= size:
                chunks.append(current)
                current = ""
        if current:
            chunks.append(current)
        return chunks

    def _event_label(self, payload: dict[str, Any]) -> str:
        event_type = str(payload.get("type") or payload.get("event") or "codex_event")
        if "turn_started" in event_type:
            return "开始推理"
        if "turn_completed" in event_type:
            return "本轮完成"
        if "exec" in event_type or "tool" in event_type:
            return "调用工具"
        return event_type.replace("_", " ") or "Codex event"

    def _extract_final_text(self, stdout: str, user_api_key: str) -> str:
        parts: list[str] = []
        for line in stdout.splitlines():
            event = self._parse_codex_event(line, user_api_key)
            if event.get("type") in {"delta", "message"}:
                parts.append(str(event.get("text", "")))
        return "".join(parts).strip()

    def _model_for_task(self, task: dict[str, Any]) -> str:
        role = str(task.get("model_role") or "chat_main")
        model_config = task.get("model_config") if isinstance(task.get("model_config"), dict) else {}
        model = str(model_config.get(role) or "")
        mode = self._task_mode(task, role)
        if model and self._is_allowed_model_for_mode(model, mode) and role not in {"image_generation", "video_generation"}:
            return model
        if role in {"image_generation", "video_generation"}:
            return self.settings.default_chat_model
        if mode == "claude":
            candidate = self.settings.default_web_search_model
            if self._is_allowed_model_for_mode(candidate, mode):
                return candidate
            return self.settings.claude_allowed_models[0] if self.settings.claude_allowed_models else self.settings.default_chat_model
        fallback = {
            "chat_main": self.settings.default_chat_model,
            "small_fast": self.settings.default_small_fast_model,
            "web_search": self.settings.default_web_search_model,
            "image_generation": self.settings.default_chat_model,
            "video_generation": self.settings.default_chat_model,
            "code_review": self.settings.default_code_model,
        }
        candidate = fallback.get(role, self.settings.default_chat_model)
        if self._is_allowed_model_for_mode(candidate, mode):
            return candidate
        return self.settings.codex_allowed_models[0] if self.settings.codex_allowed_models else self.settings.default_chat_model

    def _is_codex_text_model(self, model: str) -> bool:
        lower = model.lower()
        return not any(hint in lower for hint in ("image", "imagine", "video", "seedance", "sora", "veo"))

    def _is_codex_allowed_model(self, model: str) -> bool:
        return self._is_codex_text_model(model) and model in set(self.settings.codex_allowed_models)

    def _task_mode(self, task: dict[str, Any], role: str) -> str:
        request = task.get("request") if isinstance(task.get("request"), dict) else {}
        metadata = request.get("metadata") if isinstance(request.get("metadata"), dict) else {}
        mode = str(metadata.get("mode") or metadata.get("model_mode") or "").strip()
        if mode in {"codex", "claude", "image", "video"}:
            return mode
        if role == "web_search":
            return "claude"
        if role == "image_generation":
            return "image"
        if role == "video_generation":
            return "video"
        return "codex"

    def _is_allowed_model_for_mode(self, model: str, mode: str) -> bool:
        if not self._is_codex_text_model(model):
            return False
        if mode == "claude":
            return model in set(self.settings.claude_allowed_models)
        return model in set(self.settings.codex_allowed_models)

    def _help_text(self) -> str:
        if self._cached_help_text is not None:
            return self._cached_help_text
        try:
            completed = subprocess.run(
                ["codex", "exec", "--help"],
                text=True,
                capture_output=True,
                timeout=20,
                check=False,
            )
        except Exception:
            self._cached_help_text = ""
            return ""
        self._cached_help_text = f"{completed.stdout}\n{completed.stderr}"
        return self._cached_help_text

    def _prepare_skills(self, workspace: Path, skill_name: str, user_id: str) -> None:
        target_root = workspace / ".agents" / "skills"
        target_root.mkdir(parents=True, exist_ok=True)
        source = self.settings.skills_dir / skill_name
        if not source.is_dir() or not (source / "SKILL.md").is_file():
            source = self.settings.user_skills_dir / "community" / "installed" / skill_name
        if not source.is_dir() or not (source / "SKILL.md").is_file():
            source = self.settings.user_skills_dir / user_id / "installed" / skill_name
        if not source.is_dir() or not (source / "SKILL.md").is_file():
            raise FileNotFoundError("Requested skill files are not available.")
        target = target_root / skill_name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(
            source,
            target,
            ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache", ".git", "*.pyc", "*.pyo"),
        )
        self._prepare_workspace_guidance(workspace, skill_name)

    def _prepare_workspace_guidance(self, workspace: Path, skill_name: str) -> Path:
        docs_root = Path(__file__).resolve().parents[1] / "docs"
        router_path = docs_root / "codex_task_router.md"
        if router_path.exists():
            router_text = router_path.read_text(encoding="utf-8")
        else:
            router_text = "# Cloud Codex Task Router\n\nRead the selected skill, lock scope, and stay inside the current workspace.\n"
        guidance = f"""# Cloud Codex Workspace Instructions

You are running inside a temporary cloud Codex task workspace.

Required first steps:
1. Read this `AGENTS.md`.
2. Read `.agents/skills/{skill_name}/SKILL.md`.
3. If `./input/UPLOAD_MANIFEST.md` exists, read it before answering.
4. Produce or internally apply a routing card with `scope_lock`, `target_stack`, `target_paths`, `forbidden_paths`, `evidence_first`, `done_card`, `verification`, and `cleanup`.

Important distinction:
- Cloud Codex is a service platform for user tasks, not the local development workspace.
- Do not require this temporary user workspace to commit, deploy, or clean the local repository.
- Local repository repair hygiene applies only when a maintainer is changing the cloud Codex service platform itself.

{router_text}
"""
        target = workspace / "AGENTS.md"
        target.write_text(guidance, encoding="utf-8")
        return target

    def _prepare_command_guards(self, workspace: Path) -> Path:
        guard_dir = workspace / "bin"
        guard_dir.mkdir(parents=True, exist_ok=True)
        blocked = {
            "rm": "Deletion is disabled in this cloud workspace.",
            "rmdir": "Deletion is disabled in this cloud workspace.",
            "shred": "Destructive file operations are disabled in this cloud workspace.",
            "truncate": "Destructive file operations are disabled in this cloud workspace.",
            "docker": "Docker access is not available inside user workspaces.",
            "sudo": "sudo is not available inside user workspaces.",
            "ssh": "Remote shell access is not available inside user workspaces.",
            "scp": "Remote copy is not available inside user workspaces.",
            "rsync": "Remote sync is not available inside user workspaces.",
            "chown": "Ownership changes are not available inside user workspaces.",
            "kubectl": "Cluster access is not available inside user workspaces.",
            "helm": "Cluster access is not available inside user workspaces.",
        }
        for command, message in blocked.items():
            wrapper = guard_dir / command
            wrapper.write_text(
                "#!/bin/sh\n"
                f"echo \"{message}\" >&2\n"
                "exit 126\n",
                encoding="utf-8",
            )
            wrapper.chmod(0o755)
        git_wrapper = guard_dir / "git"
        git_wrapper.write_text(
            "#!/bin/sh\n"
            "case \"${1:-}\" in\n"
            "  clean|reset)\n"
            "    echo \"Destructive git operations are disabled in this cloud workspace.\" >&2\n"
            "    exit 126\n"
            "    ;;\n"
            "esac\n"
            "exec /usr/bin/git \"$@\"\n",
            encoding="utf-8",
        )
        git_wrapper.chmod(0o755)
        return guard_dir

    def _command_guard_path(self, task: dict[str, Any]) -> Path | None:
        value = task.get("_command_guard_dir")
        return Path(str(value)) if value else None

    def _prepare_workspace_files(self, workspace: Path, task: dict[str, Any]) -> list[str]:
        files = task.get("files", [])
        if not isinstance(files, list):
            return []
        workspace = workspace.resolve()
        input_dir = workspace / "input"
        input_dir.mkdir(exist_ok=True)
        image_paths: list[str] = []
        uploaded_files: list[dict[str, Any]] = []
        for item in files:
            if not isinstance(item, dict):
                continue
            path = str(item.get("path", ""))
            content = str(item.get("content", ""))
            if self._is_data_image(content):
                image_path = self._write_data_image(input_dir, path, content)
                image_paths.append(str(image_path))
                uploaded_files.append(
                    {
                        "path": image_path.relative_to(workspace).as_posix(),
                        "kind": "image",
                        "bytes": image_path.stat().st_size,
                    }
                )
                continue
            if len(content.encode("utf-8")) > self.settings.max_file_bytes:
                raise ValueError(f"File {path} is too large.")
            target = (input_dir / path).resolve()
            if not str(target).startswith(str(input_dir.resolve()) + "/"):
                raise ValueError("Invalid input file path.")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            uploaded_files.append(
                {
                    "path": target.relative_to(workspace).as_posix(),
                    "kind": "text",
                    "bytes": len(content.encode("utf-8")),
                }
            )
        if uploaded_files:
            manifest = self._upload_manifest(uploaded_files)
            (input_dir / "UPLOAD_MANIFEST.md").write_text(manifest, encoding="utf-8")
        task["_uploaded_files"] = uploaded_files
        return image_paths

    def _is_data_image(self, content: str) -> bool:
        return content.startswith("data:image/") and ";base64," in content[:80]

    def _write_data_image(self, input_dir: Path, path: str, content: str) -> Path:
        match = re.match(r"^data:image/([a-zA-Z0-9.+-]+);base64,(.*)$", content, re.DOTALL)
        if not match:
            raise ValueError(f"Image {path} is invalid.")
        ext = match.group(1).lower().replace("jpeg", "jpg").split("+", 1)[0]
        if ext not in {"png", "jpg", "webp", "gif"}:
            raise ValueError(f"Image {path} type is not supported.")
        raw = base64.b64decode(match.group(2), validate=True)
        if len(raw) > self.settings.max_image_bytes:
            raise ValueError(f"Image {path} is too large.")
        safe_name = Path(path).name or f"image.{ext}"
        if "." not in safe_name:
            safe_name = f"{safe_name}.{ext}"
        target = (input_dir / safe_name).resolve()
        if not str(target).startswith(str(input_dir.resolve()) + "/"):
            raise ValueError("Invalid image file path.")
        target.write_bytes(raw)
        return target

    def _build_prompt(self, task: dict[str, Any]) -> str:
        request = task["request"]
        params_json = json.dumps(request.get("params", {}), ensure_ascii=False, indent=2)
        model_config_json = json.dumps(task.get("model_config", {}), ensure_ascii=False, indent=2)
        skill_name = task["skill_name"]
        upload_context = self._upload_prompt_context(task)
        visible_skills_json = json.dumps(
            request.get("metadata", {}).get("visible_skills", []),
            ensure_ascii=False,
            indent=2,
        )
        return f"""你是星人 Codex 云工作台里的多用户隔离执行代理。

请显式使用 {skill_name} 这个 Codex Skill 完成任务。
你必须遵守本工作区 .agents/skills/{skill_name}/SKILL.md 中定义的要求。
你必须先读取当前工作区根目录的 AGENTS.md，并按其中的 Task Router 完成 scope lock、证据链选择和 Done Card 判断。

用户原始需求：
{request.get("user_query", "")}

任务类型：
{request.get("task_type", "")}

用户意图：
{request.get("user_intent", "")}

输出格式：
{request.get("output_format", "structured_markdown")}

模型角色配置：
{model_config_json}

结构化参数：
{params_json}

上传文件上下文：
{upload_context}

当前账户可见 Skill 列表：
{visible_skills_json}

自动 API 配置：
1. 当前云 Codex 会话已经由系统自动注入 OPENAI_API_KEY 和 OPENAI_BASE_URL。
2. 如果本次任务需要在当前云端工作区检查 OpenAI-compatible 接口，只能使用已有环境变量，例如：
   curl -sS "$OPENAI_BASE_URL/models" -H "Authorization: Bearer $OPENAI_API_KEY"
3. 上述自动配置只适用于当前云端工作区，不代表用户自己电脑上的 Codex、Claude Code 或第三方客户端已经配置完成。
4. 对 xingren-api-onboarding/API 接入老师任务，必须把目标锁定为用户本机或第三方客户端；不要用“云 Codex 已可用”作为最终答案。
5. 不要让云 Codex 用户手动设置云端 OPENAI_API_KEY，不要输出任何以 `sk-` 开头的占位 Key。
6. 如果用户要在自己电脑上的 Claude Code、Codex、Hermes、OpenClaw、OpenCode、Cherry Studio 等第三方客户端接入，请引导他打开“第三方接入”页面复制真实专用 Key；不要编造或展示占位 Key。
7. 如果看到 `[REDACTED]替换成...`、`Invalid token`，应明确说明这是复制了占位文本，不是真实令牌，并让用户点击左侧“自动配置/第三方接入”重新复制。

工作区说明：
0. 当前工作区根目录包含 AGENTS.md；开始任务前必须读取并遵守。它是云端 Codex 服务平台注入的运行边界，不应作为用户产物输出。
1. 用户上传文件只在 ./input/ 目录内；如果上方列出了上传文件，你必须先读取 ./input/UPLOAD_MANIFEST.md，再读取清单里的相关文件后再回答。
2. 你可以在当前临时工作区自由读取上传文件、创建文件、编辑文件、安装或创建 Skill、写入结果文件。
3. 不允许删除任何文件或目录。如果需要替换内容，请覆盖写入或创建新版本文件。
4. 用户之间完全隔离，你不能读取其他用户或历史任务的数据。
5. 工作区之外的服务器文件、生产配置、数据库、容器和密钥都不属于你的权限范围。

安全要求：
1. 禁止读取或修改 .env、Docker、Nginx/OpenResty、1Panel、SSH、服务器目录或任何生产配置。
2. 禁止执行 ssh、scp、rsync、docker、sudo、rm、rmdir、git reset、git clean、chown 等破坏性或越权命令。
3. 不要暴露服务器路径、环境变量、API Key、内部错误堆栈。
4. 如果信息不足，先给出可用版本，再列出需要补充的信息。
5. 输出内容必须适合直接返回给普通用户。
"""

    def _upload_manifest(self, uploaded_files: list[dict[str, Any]]) -> str:
        lines = [
            "# 上传文件清单",
            "",
            "这些文件由当前用户上传，只允许在本次临时工作区内读取。",
            "",
            "| 序号 | 路径 | 类型 | 大小 |",
            "|---:|---|---|---:|",
        ]
        for index, item in enumerate(uploaded_files, 1):
            lines.append(
                f"| {index} | `{item['path']}` | {item['kind']} | {item['bytes']} bytes |"
            )
        lines.extend(
            [
                "",
                "读取要求：",
                "1. 先读取本清单确认文件路径。",
                "2. 再读取用户问题相关的上传文件。",
                "3. 如果文件类型无法解析，直接告诉用户该文件需要转换为文本、Markdown、图片或可读取格式。",
            ]
        )
        return "\n".join(lines) + "\n"

    def _upload_prompt_context(self, task: dict[str, Any]) -> str:
        uploaded_files = task.get("_uploaded_files")
        if not isinstance(uploaded_files, list) or not uploaded_files:
            return "本次没有上传文件。"
        lines = ["本次用户上传了以下文件，文件清单已写入 `./input/UPLOAD_MANIFEST.md`："]
        for index, item in enumerate(uploaded_files, 1):
            if not isinstance(item, dict):
                continue
            lines.append(
                f"{index}. `{item.get('path', '')}` ({item.get('kind', 'file')}, {item.get('bytes', 0)} bytes)"
            )
        lines.append("回答前必须基于这些上传文件内容，不要声称看不到文件，除非读取后确实为空或格式无法解析。")
        return "\n".join(lines)

    def _forbidden_runtime_scan_payload(self, task: dict[str, Any]) -> dict[str, Any]:
        request = task.get("request", {})
        if not isinstance(request, dict):
            request = {}
        files = task.get("files", [])
        if not isinstance(files, list):
            files = []
        return {
            "user_query": request.get("user_query", ""),
            "params": request.get("params", {}),
            "metadata": request.get("metadata", {}),
            "files": [
                {
                    "path": str(item.get("path", "")),
                    "kind": "image" if str(item.get("content", "")).startswith("data:image/") else "text",
                    "bytes": len(str(item.get("content", "")).encode("utf-8")),
                }
                for item in files
                if isinstance(item, dict)
            ],
        }

    def _failed(self, task: dict[str, Any], started: float, code: str, message: str) -> dict[str, Any]:
        workspace = Path(task["workspace"])
        workspace.mkdir(parents=True, exist_ok=True)
        for filename in ("stdout.txt", "stderr.txt", "result.md"):
            path = workspace / filename
            if not path.exists():
                path.write_text("", encoding="utf-8")
        return {
            "status": "failed",
            "error": {"code": code, "message": message},
            "duration_ms": int((time.monotonic() - started) * 1000),
            "finished_at": time.time(),
        }

    def _result_type(self, task: dict[str, Any]) -> str:
        output_format = task["request"].get("output_format", "")
        if "json" in output_format:
            return "json"
        if "markdown" in output_format:
            return "markdown"
        return "text"

    def _to_text(self, value: str | bytes | None) -> str:
        if value is None:
            return ""
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return str(value)

    def _write_output(
        self,
        workspace: Path,
        stdout: str | bytes | None,
        stderr: str | bytes | None,
        user_api_key: str,
    ) -> None:
        secret_values = secret_values_for_redaction(self.settings, user_api_key)
        (workspace / "stdout.txt").write_text(redact(stdout, secret_values), encoding="utf-8")
        (workspace / "stderr.txt").write_text(redact(stderr, secret_values), encoding="utf-8")
