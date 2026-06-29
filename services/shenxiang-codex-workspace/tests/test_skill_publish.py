import json
import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import main as workspace_main
from app.models import UserSkillCreateRequest, WorkspaceRunRequest
from app.registry import (
    SkillDefinition,
    community_skills_root,
    publish_user_skill_to_community,
    user_installed_skills_root,
)
from app.security import UserContext


def settings(tmp_path):
    return SimpleNamespace(
        user_skills_dir=tmp_path / "user-skills",
        runs_dir=tmp_path / "runs",
        max_user_skills=20,
    )


def write_personal_skill(root: Path, user_id: str, name: str) -> None:
    skill_root = user_installed_skills_root(SimpleNamespace(user_skills_dir=root), user_id) / name
    skill_root.mkdir(parents=True)
    (skill_root / "SKILL.md").write_text(
        "---\nname: demo_skill\ndescription: demo\n---\n\n# Demo\n\n只在工作区内读取上传文件。\n",
        encoding="utf-8",
    )
    (skill_root / "skill.json").write_text(
        json.dumps({"name": name, "enabled": True, "public": True}, ensure_ascii=False),
        encoding="utf-8",
    )


def test_publish_user_skill_to_community(tmp_path):
    cfg = settings(tmp_path)
    write_personal_skill(cfg.user_skills_dir, "user_1", "demo_skill")

    result = publish_user_skill_to_community(cfg, "user_1", "demo_skill", "Alice")

    target = community_skills_root(cfg) / "demo_skill"
    manifest = json.loads((target / "skill.json").read_text(encoding="utf-8"))
    assert result["scope"] == "community_pending"
    assert result["review_status"] == "pending_review"
    assert (target / "SKILL.md").is_file()
    assert manifest["community_shared"] is False
    assert manifest["enabled"] is False
    assert manifest["public"] is False
    assert manifest["delete_allowed"] is False
    assert manifest["owner_name"] == "Alice"


def test_publish_user_skill_rejects_duplicate_community_name(tmp_path):
    cfg = settings(tmp_path)
    write_personal_skill(cfg.user_skills_dir, "user_1", "demo_skill")
    publish_user_skill_to_community(cfg, "user_1", "demo_skill")

    with pytest.raises(FileExistsError):
        publish_user_skill_to_community(cfg, "user_1", "demo_skill")


def test_create_skill_submission_installs_personal_pending_review(tmp_path, monkeypatch):
    cfg = settings(tmp_path)
    monkeypatch.setattr(workspace_main, "settings", cfg)
    user = UserContext(api_key="sk-test-personal-secret", user_id="user_1", key_hint="sk-test", username="Alice")
    request = UserSkillCreateRequest(
        name="demo_skill",
        description="demo",
        files=[{"path": "SKILL.md", "content": "# Demo\n\n只处理用户上传内容。"}],
    )

    result = workspace_main.create_skill_submission(request, user)

    personal_root = user_installed_skills_root(cfg, "user_1") / "demo_skill"
    manifest = json.loads((personal_root / "skill.json").read_text(encoding="utf-8"))
    assert result["status"] == "pending_review"
    assert personal_root.is_dir()
    assert not (community_skills_root(cfg) / "demo_skill").exists()
    assert manifest["enabled"] is True
    assert manifest["public"] is True
    assert manifest["community_shared"] is False
    assert manifest["review_status"] == "pending_review"


def test_submit_workspace_task_does_not_persist_user_api_key(tmp_path, monkeypatch):
    captured = {}

    class FakeStore:
        def put_task_secret(self, task_id, value):
            captured["secret_task_id"] = task_id
            captured["secret_value"] = value

        def create(self, task):
            captured["task"] = dict(task)

        def write_status_file(self, task):
            captured["status_task"] = dict(task)

    class FakeQueue:
        def enqueue(self, queue_name, task_id):
            captured["queue"] = queue_name
            captured["queued_task_id"] = task_id

    cfg = settings(tmp_path)
    cfg.max_files_per_task = 20
    cfg.max_image_bytes = 8_000_000
    cfg.max_file_bytes = 1_000_000
    cfg.sync_wait_seconds = 1
    monkeypatch.setattr(workspace_main, "settings", cfg)
    monkeypatch.setattr(workspace_main, "task_store", lambda: FakeStore())
    monkeypatch.setattr(workspace_main, "task_queue", lambda: FakeQueue())
    skill = SkillDefinition(
        name="demo_skill",
        display_name="Demo",
        category="test",
        description="",
        queue="slow",
        timeout=30,
        cost_points=1,
        sandbox="workspace-write",
        enabled=True,
        public=True,
    )
    monkeypatch.setattr(workspace_main, "find_user_or_public_skill", lambda _user, _skill_name: skill)

    user = UserContext(
        api_key="sk-default-secret",
        user_id="user_1",
        key_hint="sk-default",
        api_keys={"codex": "sk-mode-secret"},
    )
    request = WorkspaceRunRequest(user_query="hello", skill_name="demo_skill", mode="auto")
    result = asyncio.run(workspace_main.submit_workspace_task(request, user))

    assert result["status"] == "queued"
    assert captured["secret_value"] == "sk-mode-secret"
    assert "_user_api_key" not in captured["task"]
    assert captured["task"]["credential_ref"].startswith("redis:codex:task-secret:")


def test_task_file_route_hides_internal_guidance_files(tmp_path, monkeypatch):
    task_id = "task-1"
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "AGENTS.md").write_text("internal", encoding="utf-8")
    (workspace / "result.md").write_text("public", encoding="utf-8")

    class FakeStore:
        def get(self, requested_task_id):
            assert requested_task_id == task_id
            return {"task_id": task_id, "user_id": "user_1", "workspace": str(workspace)}

    monkeypatch.setattr(workspace_main, "task_store", lambda: FakeStore())
    user = UserContext(api_key="sk-test", user_id="user_1", key_hint="sk-test")

    with pytest.raises(workspace_main.HTTPException) as exc:
        workspace_main.get_task_file(task_id, "AGENTS.md", user)

    assert exc.value.status_code == 404
    public_response = workspace_main.get_task_file(task_id, "result.md", user)
    assert public_response.filename == "result.md"
