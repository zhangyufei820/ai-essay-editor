from app.config import get_settings
from app.security import normalize_sandbox


def test_codex_sandbox_defaults_to_workspace_write(monkeypatch):
    monkeypatch.delenv("CODEX_EXEC_SANDBOX", raising=False)

    assert get_settings().codex_exec_sandbox == "workspace-write"


def test_cloud_workspace_rejects_danger_full_access():
    settings = type("Settings", (), {})()

    assert normalize_sandbox("danger-full-access", settings) == "workspace-write"
    assert normalize_sandbox("read-only", settings) == "read-only"
    assert normalize_sandbox("workspace-write", settings) == "workspace-write"
