from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("configure_stable_image2_enterprise_fallback.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_stable_image2_enterprise_fallback", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_stable_image2_enterprise_fallback.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class StableImage2EnterpriseFallbackTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_apply_sql_uses_hidden_model_and_lowest_priority(self) -> None:
        sql = self.module.build_apply_sql(
            "test-key-1234567890",
            self.module.stable.EXPECTED_BASE_URL,
        )

        self.assertIn("xingren-stable-image2-enterprise-fallback", sql)
        self.assertIn("internal-image2-stable-v1", sql)
        self.assertIn('{"internal-image2-stable-v1":"gpt-image-2"}', sql)
        self.assertIn("priority = 0", sql)
        self.assertNotIn("官转image 2稳定", sql)

    def test_topology_requires_one_primary_and_allows_one_fallback(self) -> None:
        self.module.stable.mysql = mock.Mock(
            side_effect=[
                [["xingren-stable-image2", "1"], ["xingren-stable-image2-enterprise-fallback", "1"]],
                [["0"]],
            ]
        )

        self.module.validate_channel_topology()

    def test_topology_rejects_unmanaged_internal_model(self) -> None:
        self.module.stable.mysql = mock.Mock(
            side_effect=[
                [["xingren-stable-image2", "1"]],
                [["1"]],
            ]
        )

        with self.assertRaisesRegex(self.module.ConfigurationError, "unmanaged"):
            self.module.validate_channel_topology()

    def test_apply_runs_probe_then_reconciles_abilities(self) -> None:
        calls: list[str] = []
        self.module.require_upstream_key = lambda: "test-key-1234567890"
        self.module.stable.require_upstream_image = lambda base_url, key: calls.append("probe")
        self.module.stable.model_sync_lock = mock.MagicMock()
        self.module.stable.model_sync_lock.return_value.__enter__.return_value = None
        self.module.stable.model_sync_lock.return_value.__exit__.return_value = None
        self.module.validate_channel_topology = lambda: calls.append("topology")
        self.module.stable.mysql_exec = lambda sql: calls.append("sql")
        self.module.permissions.ensure_stable_image2_channel_order = lambda: calls.append("order")
        self.module.permissions.sync_abilities = lambda: calls.append("abilities")

        result = self.module.apply()

        self.assertEqual(result["action"], "applied")
        self.assertEqual(calls, ["probe", "topology", "sql", "order", "abilities"])


if __name__ == "__main__":
    unittest.main()
