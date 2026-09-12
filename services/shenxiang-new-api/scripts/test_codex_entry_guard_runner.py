from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


RUNNER_PATH = Path(__file__).with_name("codex_entry_guard.sh")
RELEASE_COMMIT = "a" * 40


class CodexEntryGuardRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)

        self.temp_path = Path(self.tempdir.name)
        self.root = self.temp_path / "app"
        self.call_log = self.temp_path / "calls.log"
        self.checkout = self.root / "release-state" / "checkouts" / RELEASE_COMMIT
        self.release_scripts = self.checkout / "services" / "shenxiang-new-api" / "scripts"
        self.release_scripts.mkdir(parents=True)
        (self.root / "scripts").mkdir(parents=True)
        (self.root / "release-manifest.json").write_text(
            json.dumps({"repo_commit": RELEASE_COMMIT}),
            encoding="utf-8",
        )
        (self.release_scripts / "ensure_codex_entry.py").write_text("# test stub\n", encoding="utf-8")
        self._write_executable(
            self.root / "scripts" / "check-new-api-release-state.sh",
            """#!/usr/bin/env bash
printf 'release-check|%s\n' "$*" >> "$TEST_CALL_LOG"
""",
        )

        self.fake_bin = self.temp_path / "bin"
        self.fake_bin.mkdir()
        self._write_executable(
            self.fake_bin / "jq",
            """#!/usr/bin/env bash
printf '%s\n' "$TEST_RELEASE_COMMIT"
""",
        )
        self._write_executable(
            self.fake_bin / "git",
            """#!/usr/bin/env bash
case " $* " in
  *" rev-parse HEAD "*) printf '%s\n' "${TEST_ACTUAL_COMMIT:-$TEST_RELEASE_COMMIT}" ;;
  *" status --porcelain "*) printf '%s' "${TEST_DIRTY_STATE:-}" ;;
  *) exit 97 ;;
esac
""",
        )
        self._write_executable(
            self.fake_bin / "python3",
            """#!/usr/bin/env bash
printf 'python3|%s\n' "$*" >> "$TEST_CALL_LOG"
test -f "$1"
""",
        )

    @staticmethod
    def _write_executable(path: Path, source: str) -> None:
        path.write_text(source, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def _run(self, **overrides: str) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment.update(
            {
                "APP_DIR": str(self.root),
                "BASE_URL": "http://127.0.0.1:3120",
                "PATH": f"{self.fake_bin}:{environment['PATH']}",
                "TEST_CALL_LOG": str(self.call_log),
                "TEST_RELEASE_COMMIT": RELEASE_COMMIT,
            }
        )
        environment.update(overrides)
        return subprocess.run(
            ["bash", str(RUNNER_PATH)],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    def test_executes_manifest_pinned_guard_after_release_check(self) -> None:
        result = self._run()

        self.assertEqual(0, result.returncode, result.stderr)
        calls = self.call_log.read_text(encoding="utf-8").splitlines()
        self.assertEqual("release-check|", calls[0])
        expected_script = self.release_scripts / "ensure_codex_entry.py"
        self.assertIn(f"python3|{expected_script}", calls[1])
        self.assertIn("--app-root", calls[1])
        self.assertIn(str(self.root), calls[1])
        self.assertIn("--strict", calls[1])

    def test_rejects_checkout_commit_mismatch(self) -> None:
        result = self._run(TEST_ACTUAL_COMMIT="b" * 40)

        self.assertNotEqual(0, result.returncode)
        self.assertIn("does not match manifest commit", result.stderr)
        self.assertNotIn("python3|", self.call_log.read_text(encoding="utf-8"))

    def test_rejects_dirty_checkout(self) -> None:
        result = self._run(TEST_DIRTY_STATE=" M changed.py")

        self.assertNotEqual(0, result.returncode)
        self.assertIn("release checkout is dirty", result.stderr)
        self.assertNotIn("python3|", self.call_log.read_text(encoding="utf-8"))

    def test_rejects_missing_manifest(self) -> None:
        (self.root / "release-manifest.json").unlink()

        result = self._run()

        self.assertNotEqual(0, result.returncode)
        self.assertIn("release manifest missing", result.stderr)
        self.assertFalse(self.call_log.exists())


if __name__ == "__main__":
    unittest.main()
