from __future__ import annotations

import json
import os
import shlex
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


RUNNER_PATH = Path(__file__).with_name("sync_app_model_permissions.sh")
RELEASE_COMMIT = "a" * 40


class SyncAppModelPermissionsRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)

        self.temp_path = Path(self.tempdir.name)
        self.root = self.temp_path / "app"
        self.call_log = self.temp_path / "calls.log"
        self.lock_file = self.temp_path / "model-sync.lock"
        self.checkout = self.root / "release-state" / "checkouts" / RELEASE_COMMIT
        self.scripts = self.checkout / "services" / "shenxiang-new-api" / "scripts"
        self.scripts.mkdir(parents=True)
        (self.root / ".env").write_text("", encoding="utf-8")
        (self.root / "release-manifest.json").write_text(
            json.dumps({"repo_commit": RELEASE_COMMIT}),
            encoding="utf-8",
        )
        for name in (
            "sync_app_model_permissions.py",
            "configure_kimi_k3_channel.py",
            "configure_grok45_model.py",
            "configure_grok46_model.py",
        ):
            (self.scripts / name).write_text("# test stub\n", encoding="utf-8")

        self.runner = self.temp_path / "sync_app_model_permissions.sh"
        source = RUNNER_PATH.read_text(encoding="utf-8")
        source = source.replace(
            'ROOT="/opt/shenxiang-new-api"',
            f"ROOT={shlex.quote(str(self.root))}",
            1,
        ).replace(
            'LOCK="/tmp/shenxiang-new-api-model-sync.lock"',
            f"LOCK={shlex.quote(str(self.lock_file))}",
            1,
        )
        self.runner.write_text(source, encoding="utf-8")
        self.runner.chmod(self.runner.stat().st_mode | stat.S_IXUSR)

        self.fake_bin = self.temp_path / "bin"
        self.fake_bin.mkdir()
        self._write_executable(
            "jq",
            """#!/usr/bin/env bash
printf '%s\n' "$TEST_RELEASE_COMMIT"
""",
        )
        self._write_executable(
            "git",
            """#!/usr/bin/env bash
case " $* " in
  *" rev-parse HEAD "*) printf '%s\n' "$TEST_RELEASE_COMMIT" ;;
  *" status --porcelain "*) ;;
  *) exit 97 ;;
esac
""",
        )
        self._write_executable(
            "flock",
            """#!/usr/bin/env bash
printf 'flock|%s\n' "$*" >> "$TEST_CALL_LOG"
exit "${TEST_FLOCK_EXIT:-0}"
""",
        )
        self._write_executable(
            "python3",
            """#!/usr/bin/env bash
script="$1"
name="${script##*/}"
printf 'python3|%s|kimi=%s|grok45=%s|grok46=%s\n' \
  "$name" \
  "${KIMI_K3_CHANNEL_SYNC_LOCK_HELD:-}" \
  "${GROK45_MODEL_SYNC_LOCK_HELD:-}" \
  "${GROK46_MODEL_SYNC_LOCK_HELD:-}" >> "$TEST_CALL_LOG"

if [ ! -f "$script" ]; then
  printf 'simulated missing script %s\n' "$name" >&2
  exit 2
fi

case "$name" in
  sync_app_model_permissions.py) exit_code="${TEST_SYNC_EXIT:-0}" ;;
  configure_kimi_k3_channel.py) exit_code="${TEST_KIMI_EXIT:-0}" ;;
  configure_grok45_model.py) exit_code="${TEST_GROK45_EXIT:-0}" ;;
  configure_grok46_model.py) exit_code="${TEST_GROK46_EXIT:-0}" ;;
  *) exit_code=98 ;;
esac

if [ "$exit_code" -ne 0 ]; then
  printf 'simulated failure for %s\n' "$name" >&2
fi
exit "$exit_code"
""",
        )

    def _write_executable(self, name: str, source: str) -> None:
        path = self.fake_bin / name
        path.write_text(source, encoding="utf-8")
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def _run(self, **overrides: str) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment.update(
            {
                "PATH": f"{self.fake_bin}:{environment['PATH']}",
                "TEST_CALL_LOG": str(self.call_log),
                "TEST_RELEASE_COMMIT": RELEASE_COMMIT,
            }
        )
        environment.update(overrides)
        return subprocess.run(
            ["bash", str(self.runner)],
            check=False,
            capture_output=True,
            text=True,
            env=environment,
        )

    def _python_calls(self) -> list[str]:
        if not self.call_log.exists():
            return []
        return [
            line
            for line in self.call_log.read_text(encoding="utf-8").splitlines()
            if line.startswith("python3|")
        ]

    def test_core_sync_runs_before_optional_reconciles(self) -> None:
        result = self._run()

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(
            [
                "sync_app_model_permissions.py",
                "configure_kimi_k3_channel.py",
                "configure_grok45_model.py",
                "configure_grok46_model.py",
            ],
            [line.split("|", 2)[1] for line in self._python_calls()],
        )
        self.assertNotIn("optional_failures=", result.stderr)

    def test_optional_reconcile_failures_do_not_block_core_or_later_steps(self) -> None:
        cases = (
            ("TEST_KIMI_EXIT", "kimi-k3"),
            ("TEST_GROK45_EXIT", "grok-4.5"),
            ("TEST_GROK46_EXIT", "grok-4.6"),
        )
        for exit_variable, model in cases:
            with self.subTest(model=model):
                self.call_log.unlink(missing_ok=True)
                result = self._run(**{exit_variable: "3"})

                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual(4, len(self._python_calls()))
                self.assertIn(
                    f"warning: optional model reconcile failed model={model} exit_code=3",
                    result.stderr,
                )
                self.assertIn(f"optional_failures={model}:3", result.stderr)

    def test_multiple_optional_failures_are_aggregated(self) -> None:
        result = self._run(TEST_KIMI_EXIT="3", TEST_GROK46_EXIT="4")

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(4, len(self._python_calls()))
        self.assertIn("optional_failures=kimi-k3:3,grok-4.6:4", result.stderr)

    def test_missing_optional_script_is_non_blocking(self) -> None:
        (self.scripts / "configure_kimi_k3_channel.py").unlink()

        result = self._run()

        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual(4, len(self._python_calls()))
        self.assertIn(
            "warning: optional model reconcile failed model=kimi-k3 exit_code=2",
            result.stderr,
        )

    def test_core_sync_failure_is_fatal_and_skips_optional_reconciles(self) -> None:
        result = self._run(TEST_SYNC_EXIT="9")

        self.assertEqual(9, result.returncode, result.stderr)
        self.assertEqual(
            ["sync_app_model_permissions.py"],
            [line.split("|", 2)[1] for line in self._python_calls()],
        )
        self.assertNotIn("optional model reconcile failed", result.stderr)

    def test_shared_lock_and_nested_lock_markers_are_preserved(self) -> None:
        result = self._run()

        self.assertEqual(0, result.returncode, result.stderr)
        log_lines = self.call_log.read_text(encoding="utf-8").splitlines()
        self.assertEqual("flock|-n 9", log_lines[0])
        calls = self._python_calls()
        self.assertIn("|kimi=1|grok45=|grok46=", calls[1])
        self.assertIn("|kimi=|grok45=1|grok46=", calls[2])
        self.assertIn("|kimi=|grok45=|grok46=1", calls[3])

    def test_lock_contention_remains_fatal_before_any_sync(self) -> None:
        result = self._run(TEST_FLOCK_EXIT="75")

        self.assertEqual(75, result.returncode, result.stderr)
        self.assertEqual([], self._python_calls())


if __name__ == "__main__":
    unittest.main()
