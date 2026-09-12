from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load {path.name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CodexPermissionWriterConsistencyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.guard = load_module("ensure_codex_entry_consistency", SCRIPT_DIR / "ensure_codex_entry.py")
        cls.sync = load_module(
            "sync_app_model_permissions_consistency",
            SCRIPT_DIR / "sync_app_model_permissions.py",
        )

    def test_codex_allowed_models_match_across_all_periodic_writers(self) -> None:
        self.assertEqual(
            tuple(self.sync.CODEX_ALLOWED_MODELS),
            tuple(self.guard.CODEX_ALLOWED_MODELS),
        )

    def test_standard_codex_models_match_across_all_periodic_writers(self) -> None:
        self.assertEqual(
            tuple(self.sync.CODEX_STANDARD_ALLOWED_MODELS),
            tuple(self.guard.CODEX_STANDARD_ALLOWED_MODELS),
        )


if __name__ == "__main__":
    unittest.main()
