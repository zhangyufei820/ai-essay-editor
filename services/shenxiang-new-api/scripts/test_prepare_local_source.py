from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SERVICE_DIR = Path(__file__).resolve().parents[1]
SCRIPT = SERVICE_DIR / "scripts" / "prepare-local-source.sh"
APPROVED_UPSTREAM = "4e570389dd433a717373ce9c9b822b59f5ed3d5d"


def run(*args: str, cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        check=check,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


class PrepareLocalSourceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.upstream = self.root / "upstream"
        self.upstream.mkdir()
        run("git", "init", "-q", cwd=self.upstream)
        run("git", "config", "user.name", "Build Test", cwd=self.upstream)
        run("git", "config", "user.email", "build-test@example.invalid", cwd=self.upstream)
        (self.upstream / "go.mod").write_text(
            "module github.com/QuantumNous/new-api\n\ngo 1.23\n",
            encoding="utf-8",
        )
        (self.upstream / "common").mkdir()
        (self.upstream / "common" / "version.go").write_text(
            'package common\n\nvar Version = "test-version"\n',
            encoding="utf-8",
        )
        (self.upstream / "base.txt").write_text("locked\n", encoding="utf-8")
        run("git", "add", ".", cwd=self.upstream)
        run("git", "commit", "-qm", "locked source", cwd=self.upstream)
        self.locked_commit = run("git", "rev-parse", "HEAD", cwd=self.upstream).stdout.strip()

        (self.upstream / "base.txt").write_text("moving-head\n", encoding="utf-8")
        run("git", "add", "base.txt", cwd=self.upstream)
        run("git", "commit", "-qm", "moving source", cwd=self.upstream)
        self.moving_commit = run("git", "rev-parse", "HEAD", cwd=self.upstream).stdout.strip()

        self.patch_dir = self.root / "patch"
        self.patch_dir.mkdir()
        (self.patch_dir / "overlay.txt").write_text("overlay\n", encoding="utf-8")
        self.lock_file = self.root / "UPSTREAM.lock"
        self.patch_base_file = self.root / "PATCH_BASE"
        self.write_contract(self.locked_commit)
        self.build_root = self.root / "build"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write_contract(self, commit: str) -> None:
        self.lock_file.write_text(
            f"UPSTREAM_REPO={self.upstream}\nUPSTREAM_COMMIT={commit}\n",
            encoding="utf-8",
        )
        self.patch_base_file.write_text(f"{commit}\n", encoding="utf-8")

    def prepare(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env.update(
            {
                "UPSTREAM_LOCK_FILE": str(self.lock_file),
                "PATCH_BASE_FILE": str(self.patch_base_file),
                "UPSTREAM_REPO": str(self.upstream),
                "BUILD_ROOT": str(self.build_root),
                "PATCH_DIR": str(self.patch_dir),
            }
        )
        return subprocess.run(
            [str(SCRIPT), *args],
            cwd=SERVICE_DIR.parents[1],
            env=env,
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def manifest(self) -> dict[str, object]:
        return json.loads((self.build_root / "worktree" / "BUILD-MANIFEST.json").read_text(encoding="utf-8"))

    def test_default_prepares_exact_locked_commit_and_manifest(self) -> None:
        result = self.prepare()

        self.assertEqual(result.returncode, 0, result.stderr)
        worktree = self.build_root / "worktree"
        self.assertEqual((worktree / "base.txt").read_text(encoding="utf-8"), "locked\n")
        self.assertEqual((worktree / "overlay.txt").read_text(encoding="utf-8"), "overlay\n")
        manifest = self.manifest()
        self.assertEqual(manifest["schema_version"], 1)
        self.assertEqual(
            manifest["repository"],
            run("git", "remote", "get-url", "origin", cwd=SERVICE_DIR.parents[1]).stdout.strip(),
        )
        self.assertEqual(manifest["upstream_repository"], str(self.upstream))
        self.assertEqual(manifest["upstream_commit"], self.locked_commit)
        self.assertEqual(manifest["patch_base"], self.locked_commit)
        self.assertRegex(str(manifest["repository_commit"]), r"^[0-9a-f]{40}$")
        self.assertRegex(str(manifest["patch_sha256"]), r"^[0-9a-f]{64}$")
        self.assertRegex(str(manifest["source_digest"]), r"^[0-9a-f]{64}$")
        self.assertEqual(
            (worktree / "common" / "build-manifest.json").read_bytes(),
            (worktree / "BUILD-MANIFEST.json").read_bytes(),
        )

    def test_patch_base_mismatch_fails_before_overlay(self) -> None:
        self.patch_base_file.write_text(f"{self.moving_commit}\n", encoding="utf-8")

        result = self.prepare()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PATCH_BASE", result.stderr)
        self.assertFalse((self.build_root / "worktree" / "overlay.txt").exists())

    def test_missing_locked_commit_fails_even_with_cached_repository(self) -> None:
        first = self.prepare()
        self.assertEqual(first.returncode, 0, first.stderr)
        missing_commit = "0" * 40
        self.write_contract(missing_commit)

        result = self.prepare("--skip-fetch")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("locked upstream commit", result.stderr)

    def test_ref_override_cannot_move_away_from_lock(self) -> None:
        result = self.prepare("--ref", self.moving_commit)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match UPSTREAM.lock", result.stderr)

    def test_skip_fetch_rejects_cache_from_different_origin(self) -> None:
        first = self.prepare()
        self.assertEqual(first.returncode, 0, first.stderr)
        cache = self.build_root / "upstream"
        run("git", "remote", "set-url", "origin", str(self.root / "wrong-origin"), cwd=cache)

        result = self.prepare("--skip-fetch")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("cached origin does not match UPSTREAM.lock", result.stderr)

    def test_skip_fetch_requires_an_existing_cache(self) -> None:
        result = self.prepare("--skip-fetch")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--skip-fetch requires an existing upstream cache", result.stderr)

    def test_cache_symlink_outside_build_root_fails_without_checkout(self) -> None:
        outside_cache = self.root / "outside-cache"
        run("git", "clone", "-q", str(self.upstream), str(outside_cache), cwd=self.root)
        original_head = run("git", "rev-parse", "HEAD", cwd=outside_cache).stdout.strip()
        self.assertEqual(original_head, self.moving_commit)
        self.build_root.mkdir()
        (self.build_root / "upstream").symlink_to(outside_cache, target_is_directory=True)

        result = self.prepare("--skip-fetch")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symbolic link", result.stderr)
        self.assertEqual(run("git", "rev-parse", "HEAD", cwd=outside_cache).stdout.strip(), original_head)

    def test_worktree_symlink_outside_build_root_fails_without_writes(self) -> None:
        outside_worktree = self.root / "outside-worktree"
        outside_worktree.mkdir()
        sentinel = outside_worktree / "sentinel.txt"
        sentinel.write_text("unchanged\n", encoding="utf-8")
        self.build_root.mkdir()
        (self.build_root / "worktree").symlink_to(outside_worktree, target_is_directory=True)

        result = self.prepare()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symbolic link", result.stderr)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "unchanged\n")
        self.assertFalse((outside_worktree / "go.mod").exists())
        self.assertFalse((outside_worktree / "overlay.txt").exists())

    def test_cached_untracked_and_ignored_files_are_not_materialized(self) -> None:
        first = self.prepare()
        self.assertEqual(first.returncode, 0, first.stderr)
        cache = self.build_root / "upstream"
        (cache / "untracked-contamination.txt").write_text(
            "untracked\n",
            encoding="utf-8",
        )
        (cache / ".git" / "info" / "exclude").write_text(
            "ignored-contamination.txt\n",
            encoding="utf-8",
        )
        (cache / "ignored-contamination.txt").write_text(
            "ignored\n",
            encoding="utf-8",
        )

        result = self.prepare("--skip-fetch")

        self.assertEqual(result.returncode, 0, result.stderr)
        worktree = self.build_root / "worktree"
        self.assertFalse((worktree / "untracked-contamination.txt").exists())
        self.assertFalse((worktree / "ignored-contamination.txt").exists())

    def test_source_dir_rejects_dirty_locked_checkout(self) -> None:
        source_dir = self.root / "source-dir"
        run("git", "clone", "-q", str(self.upstream), str(source_dir), cwd=self.root)
        run("git", "checkout", "-q", "--detach", self.locked_commit, cwd=source_dir)
        (source_dir / "base.txt").write_text("dirty source\n", encoding="utf-8")

        result = self.prepare("--source-dir", str(source_dir))

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--source-dir must be clean", result.stderr)

    def test_stale_git_metadata_in_generated_worktree_fails_closed(self) -> None:
        first = self.prepare()
        self.assertEqual(first.returncode, 0, first.stderr)
        stale_git = self.build_root / "worktree" / ".git"
        stale_git.mkdir()
        (stale_git / "config").write_text("stale\n", encoding="utf-8")

        result = self.prepare("--skip-fetch")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("generated worktree contains forbidden .git metadata", result.stderr)

    def test_patch_symlink_fails_before_overlay(self) -> None:
        outside = self.root / "outside.txt"
        outside.write_text("unchanged\n", encoding="utf-8")
        common_patch = self.patch_dir / "common"
        common_patch.mkdir()
        (common_patch / "build-manifest.json").symlink_to(outside)

        result = self.prepare()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("symbolic links", result.stderr)
        self.assertEqual(outside.read_text(encoding="utf-8"), "unchanged\n")

    def test_patch_digest_is_deterministic_and_content_sensitive(self) -> None:
        first = self.prepare()
        self.assertEqual(first.returncode, 0, first.stderr)
        first_manifest = self.manifest()

        second = self.prepare("--skip-fetch")
        self.assertEqual(second.returncode, 0, second.stderr)
        second_manifest = self.manifest()
        self.assertEqual(first_manifest["patch_sha256"], second_manifest["patch_sha256"])
        self.assertEqual(first_manifest["source_digest"], second_manifest["source_digest"])

        (self.patch_dir / "overlay.txt").write_text("changed overlay\n", encoding="utf-8")
        third = self.prepare("--skip-fetch")
        self.assertEqual(third.returncode, 0, third.stderr)
        third_manifest = self.manifest()
        self.assertNotEqual(first_manifest["patch_sha256"], third_manifest["patch_sha256"])
        self.assertNotEqual(first_manifest["source_digest"], third_manifest["source_digest"])

    def test_repository_contract_pins_approved_upstream(self) -> None:
        lock = (SERVICE_DIR / "UPSTREAM.lock").read_text(encoding="utf-8")
        patch_base = (SERVICE_DIR / "PATCH_BASE").read_text(encoding="utf-8").strip()

        self.assertIn("UPSTREAM_REPO=https://github.com/QuantumNous/new-api.git", lock)
        self.assertIn(f"UPSTREAM_COMMIT={APPROVED_UPSTREAM}", lock)
        self.assertEqual(patch_base, APPROVED_UPSTREAM)

    def test_prepare_script_has_no_dynamic_pull_or_tag_fetch(self) -> None:
        script = SCRIPT.read_text(encoding="utf-8")

        self.assertNotIn("pull --ff-only", script)
        self.assertNotIn("fetch --tags", script)
        self.assertIn('fetch --force --no-tags origin "$UPSTREAM_REF"', script)

    def test_generated_manifest_is_embedded_in_status_version(self) -> None:
        common_patch = self.patch_dir / "common"
        common_patch.mkdir()
        for name in ("build_info.go", "build_info_test.go"):
            source = SERVICE_DIR / "src-patch" / "common" / name
            (common_patch / name).write_bytes(source.read_bytes())

        result = self.prepare("--", "go", "test", "./common", "-run", "TestBuildInfo", "-count=1")

        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)


if __name__ == "__main__":
    unittest.main()
