from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("sync_app_model_permissions.py")


def load_module():
    spec = importlib.util.spec_from_file_location("sync_app_model_permissions_grok_test", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load sync_app_model_permissions.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class Grok45SyncIsolationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def mysql_rows(self, query: str) -> list[list[str]]:
        if "SELECT DISTINCT `group` FROM users" in query:
            return [["default"]]
        if "SELECT DISTINCT `group` FROM abilities" in query:
            return [["default"], [self.module.GROK45_GROUP]]
        if "FROM channels" in query:
            return [
                ["41", self.module.GROK45_MODEL, "0", "100", self.module.GROK45_CHANNEL_TAG, self.module.GROK45_GROUP],
                ["42", self.module.GROK45_MODEL, "100", "100", self.module.GROK45_PRIMARY_CHANNEL_TAG, self.module.GROK45_GROUP],
                ["21", f"gpt-5.5,{self.module.GROK45_MODEL}", "0", "100", "normal", "default"],
            ]
        if "SELECT model_name FROM models" in query:
            return [[self.module.GROK45_MODEL], ["gpt-5.5"]]
        raise AssertionError(f"unexpected query: {query}")

    def test_sync_abilities_never_broadcasts_grok_model_or_group(self) -> None:
        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=self.mysql_rows), mock.patch.object(
            self.module, "mysql_exec", side_effect=captured.append
        ):
            self.module.sync_abilities()

        sql = captured[0]
        self.assertIn("'grok45', 'grok-4.5', 41", sql)
        self.assertIn("'grok45', 'grok-4.5', 42", sql)
        self.assertNotIn("'default', 'grok-4.5'", sql)
        self.assertNotIn("'grok45', 'gpt-5.5'", sql)
        self.assertIn("model = 'grok-4.5' AND `group` <> 'grok45'", sql)
        self.assertIn("'xingren-grok45-primary', 'xingren-grok45'", sql)
        self.assertIn("status <> 1 AND tag IN", sql)

    def test_misgrouped_grok_channel_is_disabled_and_reported(self) -> None:
        def rows(query: str) -> list[list[str]]:
            if "SELECT DISTINCT `group` FROM users" in query:
                return [["default"]]
            if "SELECT DISTINCT `group` FROM abilities" in query:
                return []
            if "FROM channels" in query:
                return [["41", self.module.GROK45_MODEL, "100", "100", self.module.GROK45_PRIMARY_CHANNEL_TAG, "default"]]
            if "SELECT model_name FROM models" in query:
                return [[self.module.GROK45_MODEL]]
            raise AssertionError(f"unexpected query: {query}")

        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=rows), mock.patch.object(
            self.module, "mysql_exec", side_effect=captured.append
        ):
            with self.assertRaisesRegex(RuntimeError, "Grok group isolation violation"):
                self.module.sync_abilities()

        self.assertIn("UPDATE channels SET status = 2", captured[0])

    def test_non_managed_channel_cannot_claim_grok_group(self) -> None:
        def rows(query: str) -> list[list[str]]:
            if "SELECT DISTINCT `group` FROM users" in query:
                return [["default"]]
            if "SELECT DISTINCT `group` FROM abilities" in query:
                return []
            if "FROM channels" in query:
                return [["52", "gpt-5.5", "0", "100", "normal", self.module.GROK45_GROUP]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"]]
            raise AssertionError(f"unexpected query: {query}")

        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=rows), mock.patch.object(
            self.module, "mysql_exec", side_effect=captured.append
        ):
            with self.assertRaisesRegex(RuntimeError, "Grok group isolation violation"):
                self.module.sync_abilities()

        self.assertNotIn("'grok45', 'gpt-5.5', 52", captured[0])


if __name__ == "__main__":
    unittest.main()
