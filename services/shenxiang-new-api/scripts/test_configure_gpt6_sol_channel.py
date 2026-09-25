from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_gpt6_astra_channel.py")


def load_sol_module():
    module_name = "configure_gpt6_sol_channel_test_target"
    spec = importlib.util.spec_from_file_location(module_name, MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load GPT-6 Sol channel module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    with mock.patch.dict(os.environ, {"GPT6_MODEL_PROFILE": "sol"}):
        spec.loader.exec_module(module)
    return module


class ConfigureGpt6SolChannelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_sol_module()

    def sources(self):
        return tuple(
            self.module.SourceChannel(tag, "test-sol-key-123456", f"https://{index}.example", index)
            for index, tag in enumerate(self.module.SOURCE_CHANNEL_TAGS, start=1)
        )

    def test_sol_profile_is_isolated_from_astra(self) -> None:
        self.assertEqual(self.module.MODEL_NAME, "gpt-6-sol")
        self.assertEqual(self.module.DISPLAY_NAME, "GPT-6 Sol")
        self.assertEqual(self.module.DISCOUNT_PRIMARY_SOURCE_TAG, "xingren-discount-text-aihub")
        self.assertEqual(self.module.managed_tag("discount", 0), "xingren-gpt6-sol-discount-1")
        self.assertEqual(len(self.module.managed_tags()), 32)

        sql = self.module.build_apply_sql(self.sources(), {"xingren-discount-text-aihub"})
        self.assertIn("model='gpt-6-sol'", sql)
        self.assertIn("GPT-6 Sol discount", sql)
        self.assertNotIn("models='gpt-6-astra'", sql)
        self.assertNotIn("UPDATE channels SET status=2 WHERE tag='xingren-gpt6-astra'", sql)

    def test_sol_never_enables_a_source_that_failed_the_baseline_probe(self) -> None:
        sources = self.sources()
        priorities, routable = self.module.discount_route_policy(
            sources,
            [],
            {tag for tag in self.module.SOURCE_CHANNEL_TAGS if tag != self.module.DISCOUNT_PRIMARY_SOURCE_TAG},
        )

        self.assertEqual(priorities[self.module.DISCOUNT_PRIMARY_SOURCE_TAG], 40)
        self.assertNotIn(self.module.DISCOUNT_PRIMARY_SOURCE_TAG, routable)

    def test_sol_primary_requires_repeated_codex_tool_verification(self) -> None:
        sources = self.sources()
        primary = self.module.DISCOUNT_PRIMARY_SOURCE_TAG
        priorities, routable = self.module.discount_route_policy(
            sources,
            [{"tag": primary, "discount_healthy": False, "discount_ttft_ms": None}],
            {primary},
        )

        self.assertEqual(priorities[primary], 40)
        self.assertNotIn(primary, routable)

    def test_sol_apply_sql_only_enables_verified_sources(self) -> None:
        sources = self.sources()
        verified = {"xingren-discount-text-aihub"}
        sql = self.module.build_apply_sql(sources, verified)

        self.assertIn("status=1, name='GPT-6 Sol discount", sql)
        self.assertIn("status=2, name='GPT-6 Sol discount", sql)
        self.assertIn("'discount','gpt-6-sol'", sql)


if __name__ == "__main__":
    unittest.main()
