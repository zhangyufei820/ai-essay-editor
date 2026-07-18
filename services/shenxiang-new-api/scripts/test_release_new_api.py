#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("release_new_api.py")
SPEC = importlib.util.spec_from_file_location("release_new_api", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseNewApiTest(unittest.TestCase):
    def test_replace_compose_image_changes_only_application(self) -> None:
        source = """services:
  shenxiang-new-api:
    image: old-app
    environment:
      TZ: Asia/Shanghai
  shenxiang-new-api-mysql:
    image: mysql:8.2
"""
        result = MODULE.replace_compose_image(source, "new-app")
        self.assertIn("    image: new-app\n", result)
        self.assertIn("    image: mysql:8.2\n", result)
        self.assertNotIn("old-app", result)

    def test_replace_compose_image_rejects_missing_service(self) -> None:
        with self.assertRaises(MODULE.ReleaseError):
            MODULE.replace_compose_image("services:\n  mysql:\n    image: mysql:8.2\n", "new-app")

    def test_validate_sha_requires_full_commit(self) -> None:
        value = "a" * 40
        self.assertEqual(MODULE.validate_sha(value, "commit"), value)
        with self.assertRaises(MODULE.ReleaseError):
            MODULE.validate_sha("a" * 12, "commit")

    def test_validate_hash_requires_sha256(self) -> None:
        value = "b" * 64
        self.assertEqual(MODULE.validate_hash(value, "policy"), value)
        with self.assertRaises(MODULE.ReleaseError):
            MODULE.validate_hash("b" * 40, "policy")

    def test_atomic_write_replaces_content_and_mode(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "manifest.json"
            MODULE.atomic_write(target, b"one\n", 0o640)
            MODULE.atomic_write(target, b"two\n", 0o600)
            self.assertEqual(target.read_bytes(), b"two\n")
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_parse_args_rejects_noncanonical_branch(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                MODULE.parse_args(["--branch", "feature/old", "--policy-ack", "a" * 64])

    def test_parse_args_uses_app_relative_state_directory(self) -> None:
        args = MODULE.parse_args(["--app-dir", "/tmp/new-api", "--policy-ack", "a" * 64])
        self.assertEqual(args.state_dir, Path("/tmp/new-api/release-state"))

    def test_load_test_contracts_validates_packages(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            contracts = Path(directory) / "contracts.json"
            contracts.write_text('[{"package":"./middleware","run":"^TestRoute$"}]', encoding="utf-8")
            self.assertEqual(
                MODULE.load_test_contracts(contracts),
                [{"package": "./middleware", "run": "^TestRoute$"}],
            )
            contracts.write_text('[{"package":"../../escape","run":""}]', encoding="utf-8")
            with self.assertRaises(MODULE.ReleaseError):
                MODULE.load_test_contracts(contracts)


if __name__ == "__main__":
    unittest.main()
