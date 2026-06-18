from __future__ import annotations

import json
import logging
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

from app.config import (
    Settings,
    build_codex_env,
    ensure_codex_config,
    has_codex_auth,
    secret_values_for_redaction,
    write_codex_config,
)
from app.security import contains_forbidden_runtime_action, normalize_sandbox, redact

logger = logging.getLogger(__name__)

ARTIFACT_EXTENSIONS = {
    ".csv",
    ".doc",
    ".docx",
    ".gif",
    ".htm",
    ".html",
    ".jpeg",
    ".jpg",
    ".json",
    ".md",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".svg",
    ".txt",
    ".webp",
    ".xls",
    ".xlsx",
    ".zip",
}

PRIMARY_PREVIEW_EXTENSIONS = {".html", ".htm", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
OFFICE_EXTENSIONS = {".ppt", ".pptx", ".doc", ".docx", ".xls", ".xlsx"}
INTERNAL_OUTPUT_FILES = {"prompt.txt", "result.md", "status.json", "stdout.txt", "stderr.txt"}
INTERNAL_DIRS = {".agents", ".git", "__pycache__"}
MAX_ARTIFACT_LINKS = 12


class CodexRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        ensure_codex_config(settings)

    def run(self, task: dict[str, Any]) -> dict[str, Any]:
        task_id = task["task_id"]
        started = time.monotonic()
        workspace = Path(task["workspace"])
        workspace.mkdir(parents=True, exist_ok=True)
        try:
            self._prepare_skills(workspace, task["skill_name"])
        except FileNotFoundError:
            return self._failed(
                task,
                started,
                "SKILL_FILES_NOT_FOUND",
                "Requested skill files are not available.",
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

        if not has_codex_auth(self.settings):
            return self._failed(
                task,
                started,
                "CODEX_AUTH_NOT_CONFIGURED",
                "Codex authentication is not configured. Fill CODEX_API_KEY or proxy credentials in .env.",
            )

        if shutil.which("codex") is None:
            return self._failed(
                task,
                started,
                "CODEX_CLI_NOT_FOUND",
                "codex CLI is not available in the worker image.",
            )

        timeout = int(task["skill"]["timeout"])
        logger.info("running codex task_id=%s skill=%s timeout=%s", task_id, task["skill_name"], timeout)
        command = self._build_command(task, workspace, prompt)
        write_codex_config(self.settings, self.settings.codex_home)

        try:
            completed = subprocess.run(
                command,
                cwd=str(workspace),
                env=build_codex_env(self.settings),
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            stdout = self._to_text(exc.stdout)
            stderr = self._to_text(exc.stderr)
            self._write_output(workspace, stdout, stderr)
            return self._failed(
                task,
                started,
                "CODEX_TIMEOUT",
                f"Codex task timed out after {timeout} seconds.",
            )

        stdout = self._to_text(completed.stdout)
        stderr = self._to_text(completed.stderr)
        self._write_output(workspace, stdout, stderr)

        if completed.returncode != 0:
            message = "Codex execution failed. Check worker logs and task stderr.txt for sanitized details."
            safe_stderr = redact(stderr, secret_values_for_redaction(self.settings)).strip()
            if safe_stderr:
                logger.warning(
                    "codex stderr task_id=%s skill=%s stderr_len=%s",
                    task_id,
                    task["skill_name"],
                    len(safe_stderr),
                )
            if "authentication" in safe_stderr.lower() or "api key" in safe_stderr.lower():
                message = "Codex authentication failed. Check CODEX_API_KEY or proxy provider settings."
            return self._failed(task, started, "CODEX_EXEC_FAILED", message)

        result = redact(stdout.strip(), secret_values_for_redaction(self.settings))
        result = self._append_artifact_preview_links(result, workspace, task_id)
        (workspace / "result.md").write_text(result, encoding="utf-8")
        return {
            "status": "completed",
            "result": result,
            "result_type": self._result_type(task),
            "duration_ms": int((time.monotonic() - started) * 1000),
            "finished_at": time.time(),
        }

    def _build_command(self, task: dict[str, Any], workspace: Path, prompt: str) -> list[str]:
        help_text = self._help_text()
        command = ["codex", "exec"]
        if "--ephemeral" in help_text:
            command.append("--ephemeral")
        if "--color" in help_text:
            command.extend(["--color", "never"])
        sandbox = normalize_sandbox(task["skill"].get("sandbox", "read-only"), self.settings)
        if "--sandbox" in help_text:
            command.extend(["--sandbox", sandbox])
        if "--skip-git-repo-check" in help_text:
            command.append("--skip-git-repo-check")
        if "--cd" in help_text:
            command.extend(["--cd", str(workspace)])
        command.append(prompt)
        return command

    def _help_text(self) -> str:
        try:
            completed = subprocess.run(
                ["codex", "exec", "--help"],
                text=True,
                capture_output=True,
                timeout=20,
                check=False,
            )
        except Exception:
            return ""
        return f"{completed.stdout}\n{completed.stderr}"

    def _prepare_skills(self, workspace: Path, skill_name: str) -> None:
        target_root = workspace / ".agents" / "skills"
        target_root.mkdir(parents=True, exist_ok=True)
        source = self.settings.skills_dir / skill_name
        if not source.is_dir() or not (source / "SKILL.md").is_file():
            raise FileNotFoundError("Requested skill files are not available.")
        target = target_root / skill_name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)

    def _build_prompt(self, task: dict[str, Any]) -> str:
        request = task["request"]
        params_json = json.dumps(request.get("params", {}), ensure_ascii=False, indent=2)
        skill_name = task["skill_name"]
        return f"""请显式使用 {skill_name} 这个 Codex Skill 完成任务。

你必须遵守本工作区 .agents/skills/{skill_name}/SKILL.md 中定义的要求。

用户原始需求：
{request.get("user_query", "")}

任务类型：
{request.get("task_type", "")}

用户意图：
{request.get("user_intent", "")}

用户层级：
{request.get("user_level", "")}

输出语言：
{request.get("language", "zh")}

输出格式：
{request.get("output_format", "structured_markdown")}

结构化参数：
{params_json}

要求：
1. 必须遵守对应 SKILL.md。
2. 不要编造真实文献、真实数据、真实引用。
3. 不要承诺保证通过、保证降重、保证查重。
4. 如果信息不足，先给出可用版本，再列出需要补充的信息。
5. 输出内容必须适合直接返回给 shenxiang.school 用户。
6. 不要暴露服务器路径、环境变量、API Key、内部错误堆栈。
7. 只能在当前临时工作区内写入产物；禁止删除文件。
8. 禁止读取或修改 .env、Docker、Nginx/OpenResty、1Panel、SSH、服务器目录或任何生产配置。
9. 禁止执行 ssh、scp、rsync、docker、sudo、rm、git reset、git clean、chmod、chown 等命令。
10. 生成 PPT、PDF、HTML、图片或文档时，请在回复里优先给前端可预览/可打开的结果，避免把本地文件路径作为第一入口。
"""

    def _append_artifact_preview_links(self, result: str, workspace: Path, task_id: str) -> str:
        artifacts = self._discover_artifacts(workspace)
        if not artifacts:
            return result

        existing = result
        lines = ["", "### 生成文件预览", ""]
        for path in artifacts:
            rel = path.relative_to(workspace).as_posix()
            if self._artifact_already_linked(existing, task_id, rel):
                continue
            label = "打开预览" if path.suffix.lower() in PRIMARY_PREVIEW_EXTENSIONS else "打开文件"
            lines.append(f"- [{label}：{path.name}](/tasks/{task_id}/files/{self._quote_path(rel)})")

        if len(lines) <= 3:
            return result
        return f"{result.rstrip()}\n{chr(10).join(lines)}\n"

    def _discover_artifacts(self, workspace: Path) -> list[Path]:
        candidates: list[Path] = []
        html_stems: set[str] = set()
        for path in workspace.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(workspace)
            if self._is_internal_artifact(rel):
                continue
            extension = path.suffix.lower()
            if extension not in ARTIFACT_EXTENSIONS:
                continue
            candidates.append(path)
            if extension in {".html", ".htm"}:
                html_stems.add(str(path.with_suffix("")))

        visible: list[Path] = []
        for path in candidates:
            if path.suffix.lower() in OFFICE_EXTENSIONS and str(path.with_suffix("")) in html_stems:
                continue
            visible.append(path)

        return sorted(visible, key=self._artifact_sort_key)[:MAX_ARTIFACT_LINKS]

    def _is_internal_artifact(self, rel_path: Path) -> bool:
        if rel_path.name in INTERNAL_OUTPUT_FILES:
            return True
        return any(part in INTERNAL_DIRS or part.startswith(".") for part in rel_path.parts)

    def _artifact_sort_key(self, path: Path) -> tuple[int, int, str]:
        extension = path.suffix.lower()
        if extension in {".html", ".htm"}:
            group = 0
        elif extension in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
            group = 1
        elif extension == ".pdf":
            group = 2
        elif extension in OFFICE_EXTENSIONS:
            group = 3
        else:
            group = 4
        return (group, len(path.parts), path.as_posix())

    def _artifact_already_linked(self, result: str, task_id: str, rel_path: str) -> bool:
        encoded = self._quote_path(rel_path)
        return (
            rel_path in result
            or f"/tasks/{task_id}/files/{encoded}" in result
            or f"/api/codex-skill-files/{task_id}/{encoded}" in result
        )

    def _quote_path(self, rel_path: str) -> str:
        return "/".join(quote(part) for part in rel_path.split("/"))

    def _forbidden_runtime_scan_payload(self, task: dict[str, Any]) -> dict[str, Any]:
        request = task.get("request", {})
        if not isinstance(request, dict):
            request = {}
        return {
            "user_query": request.get("user_query", ""),
            "params": request.get("params", {}),
            "metadata": request.get("metadata", {}),
        }

    def _failed(self, task: dict[str, Any], started: float, code: str, message: str) -> dict[str, Any]:
        workspace = Path(task["workspace"])
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

    def _write_output(self, workspace: Path, stdout: str | bytes | None, stderr: str | bytes | None) -> None:
        secret_values = secret_values_for_redaction(self.settings)
        (workspace / "stdout.txt").write_text(redact(stdout, secret_values), encoding="utf-8")
        (workspace / "stderr.txt").write_text(redact(stderr, secret_values), encoding="utf-8")
