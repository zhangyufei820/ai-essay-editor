from types import SimpleNamespace

from app.artifacts import collect_task_artifacts
from app import main as workspace_main
from app.security import UserContext


def test_collect_task_artifacts_pairs_pptx_with_preview_image(tmp_path):
    workspace = tmp_path / "run"
    output = workspace / "deck"
    output.mkdir(parents=True)
    (output / "lesson.pptx").write_bytes(b"pptx")
    (output / "preview.png").write_bytes(b"png")
    (workspace / "prompt.txt").write_text("internal prompt", encoding="utf-8")
    (workspace / "input").mkdir()
    (workspace / "input" / "source.png").write_bytes(b"source")
    (workspace / ".agents" / "skills").mkdir(parents=True)
    (workspace / ".agents" / "skills" / "SKILL.md").write_text("internal skill", encoding="utf-8")

    artifacts = collect_task_artifacts(
        {"task_id": "task_1", "workspace": str(workspace)},
        "https://api.example.test/codex",
    )

    assert len(artifacts) == 1
    assert artifacts[0]["kind"] == "presentation"
    assert artifacts[0]["path"] == "deck/lesson.pptx"
    assert artifacts[0]["previews"][0]["kind"] == "image"
    assert artifacts[0]["previews"][0]["url"] == "https://api.example.test/codex/api/tasks/task_1/files/deck/preview.png"


def test_public_task_response_includes_artifacts_for_completed_tasks(tmp_path, monkeypatch):
    workspace = tmp_path / "run"
    workspace.mkdir()
    (workspace / "slides.pptx").write_bytes(b"pptx")
    (workspace / "preview.png").write_bytes(b"png")
    monkeypatch.setattr(workspace_main, "settings", SimpleNamespace(public_base_url="https://api.example.test/codex"))

    response = workspace_main.public_task_response(
        {
            "task_id": "task_2",
            "skill_name": "ppt-master-cn",
            "status": "completed",
            "mode": "sync",
            "workspace": str(workspace),
            "result": "done",
            "result_type": "markdown",
        }
    )

    assert response["success"] is True
    assert response["artifacts"][0]["kind"] == "presentation"
    assert response["artifacts"][0]["previews"][0]["kind"] == "image"


def test_task_file_response_is_inline_for_previewable_files(tmp_path, monkeypatch):
    workspace = tmp_path / "run"
    workspace.mkdir()
    (workspace / "preview.pdf").write_bytes(b"%PDF-1.4")
    task = {"task_id": "task_3", "user_id": "user_1", "workspace": str(workspace), "status": "completed"}

    class FakeStore:
        def get(self, task_id):
            return task if task_id == "task_3" else None

    monkeypatch.setattr(workspace_main, "task_store", lambda: FakeStore())
    response = workspace_main.get_task_file(
        "task_3",
        "preview.pdf",
        user=UserContext(api_key="sk-test", user_id="user_1", key_hint="sk-test"),
    )

    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"].startswith("inline;")
