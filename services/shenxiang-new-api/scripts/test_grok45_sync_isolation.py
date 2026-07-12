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
                ["21", "gpt-5.5", "0", "100", "normal", "default"],
            ]
        if "SELECT model_name FROM models" in query:
            return [[self.module.GROK45_MODEL], ["gpt-5.5"]]
        raise AssertionError(f"unexpected query: {query}")

    def test_sync_abilities_never_broadcasts_grok_model_or_group(self) -> None:
        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=self.mysql_rows), mock.patch.object(
            self.module,
            "mysql_exec",
            side_effect=lambda query: captured.append(query) or ["ability_sync_status=ok"],
        ):
            self.module.sync_abilities()

        sql = captured[0]
        self.assertIn("'grok45', 'grok-4.5', 41", sql)
        self.assertNotIn("'default', 'grok-4.5'", sql)
        self.assertNotIn("'grok45', 'gpt-5.5'", sql)
        self.assertIn("`group` IN ('discount', 'grok45') OR model = 'grok-4.5'", sql)
        self.assertIn("BINARY COALESCE(tag, '') = BINARY 'xingren-grok45'", sql)
        self.assertIn("@grok_tag_count", sql)
        self.assertIn("NOT (BINARY COALESCE(models, '') = BINARY 'grok-4.5')", sql)
        self.assertIn("@grok_sync_allowed = 1", sql)

    def test_misgrouped_grok_channel_is_disabled_and_reported(self) -> None:
        def rows(query: str) -> list[list[str]]:
            if "SELECT DISTINCT `group` FROM users" in query:
                return [["default"]]
            if "SELECT DISTINCT `group` FROM abilities" in query:
                return []
            if "FROM channels" in query:
                return [["41", self.module.GROK45_MODEL, "0", "100", self.module.GROK45_CHANNEL_TAG, "default"]]
            if "SELECT model_name FROM models" in query:
                return [[self.module.GROK45_MODEL]]
            raise AssertionError(f"unexpected query: {query}")

        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=rows), mock.patch.object(
            self.module,
            "mysql_exec",
            side_effect=lambda query: captured.append(query)
            or ["ability_sync_status=grok_invalid_profile"],
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
            self.module,
            "mysql_exec",
            side_effect=lambda query: captured.append(query)
            or ["ability_sync_status=grok_channel_conflict"],
        ):
            with self.assertRaisesRegex(RuntimeError, "Grok group isolation violation"):
                self.module.sync_abilities()

        self.assertNotIn("'grok45', 'gpt-5.5', 52", captured[0])

    def test_duplicate_grok_tag_disables_all_managed_channels_and_fails_closed(self) -> None:
        def rows(query: str) -> list[list[str]]:
            if "SELECT DISTINCT `group` FROM users" in query:
                return [["default"]]
            if "SELECT DISTINCT `group` FROM abilities" in query:
                return []
            if "FROM channels" in query:
                return [
                    ["41", self.module.GROK45_MODEL, "0", "100", self.module.GROK45_CHANNEL_TAG, self.module.GROK45_GROUP],
                    ["42", self.module.GROK45_MODEL, "0", "100", self.module.GROK45_CHANNEL_TAG, self.module.GROK45_GROUP],
                ]
            if "SELECT model_name FROM models" in query:
                return [[self.module.GROK45_MODEL]]
            raise AssertionError(f"unexpected query: {query}")

        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=rows), mock.patch.object(
            self.module,
            "mysql_exec",
            side_effect=lambda query: captured.append(query)
            or ["ability_sync_status=grok_duplicate_tag"],
        ):
            with self.assertRaisesRegex(RuntimeError, "multiple channels use the Grok isolation tag"):
                self.module.sync_abilities()

        sql = captured[0]
        self.assertIn("@grok_tag_count > 1", sql)
        self.assertIn("UPDATE channels SET status = 2", sql)
        self.assertIn("ability_sync_status=", sql)

    def test_wrong_grok_channel_model_is_disabled_and_reported(self) -> None:
        def rows(query: str) -> list[list[str]]:
            if "SELECT DISTINCT `group` FROM users" in query:
                return [["default"]]
            if "SELECT DISTINCT `group` FROM abilities" in query:
                return []
            if "FROM channels" in query:
                return [["41", "grok-4.5-preview", "0", "100", self.module.GROK45_CHANNEL_TAG, self.module.GROK45_GROUP]]
            if "SELECT model_name FROM models" in query:
                return [[self.module.GROK45_MODEL], ["grok-4.5-preview"]]
            raise AssertionError(f"unexpected query: {query}")

        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=rows), mock.patch.object(
            self.module,
            "mysql_exec",
            side_effect=lambda query: captured.append(query)
            or ["ability_sync_status=grok_invalid_profile"],
        ):
            with self.assertRaisesRegex(RuntimeError, "exactly grok-4.5"):
                self.module.sync_abilities()

        sql = captured[0]
        self.assertIn("NOT (BINARY COALESCE(models, '') = BINARY 'grok-4.5')", sql)
        self.assertNotIn("'grok45', 'grok-4.5-preview'", sql)

    def test_missing_active_grok_model_disables_channel_and_fails_closed(self) -> None:
        def rows(query: str) -> list[list[str]]:
            if "SELECT DISTINCT `group` FROM users" in query:
                return [["default"]]
            if "SELECT DISTINCT `group` FROM abilities" in query:
                return []
            if "FROM channels" in query:
                return [["41", self.module.GROK45_MODEL, "0", "100", self.module.GROK45_CHANNEL_TAG, self.module.GROK45_GROUP]]
            if "SELECT model_name FROM models" in query:
                return []
            raise AssertionError(f"unexpected query: {query}")

        captured: list[str] = []
        with mock.patch.object(self.module, "mysql", side_effect=rows), mock.patch.object(
            self.module,
            "mysql_exec",
            side_effect=lambda query: captured.append(query)
            or ["ability_sync_status=grok_model_cardinality"],
        ):
            with self.assertRaisesRegex(RuntimeError, "exactly one active grok-4.5 model"):
                self.module.sync_abilities()

        sql = captured[0]
        self.assertIn("@grok_active_model_count <> 1", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)


if __name__ == "__main__":
    unittest.main()
