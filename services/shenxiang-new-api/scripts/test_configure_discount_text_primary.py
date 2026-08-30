from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("configure_discount_text_primary.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_discount_text_primary", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigureDiscountTextPrimaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def test_primary_and_fallback_order_is_fixed_by_tags(self) -> None:
        self.assertEqual(self.module.PRIMARY_PRIORITY, 40)
        self.assertEqual(self.module.LEGACY_PRIMARY_TAG, "xingren-discount-text-aihub-fallback")
        self.assertEqual(
            self.module.FALLBACKS,
            (
                ("xingren-discount-text-geek2api", 30),
                ("xingren-discount-text-aihub", 20),
                ("xingren-discount-text-wangwang", 10),
            ),
        )
        self.assertEqual(self.module.MODELS, ("gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra"))
        self.assertEqual(self.module.EXPECTED_RETRY_TIMES, 3)

    def test_apply_sql_guards_ratio_and_existing_fallbacks(self) -> None:
        sql = self.module.build_apply_sql("test-key", "https://pdhlzy.art")
        self.assertIn("GroupRatio", sql)
        self.assertIn("group_ratio_invalid", sql)
        self.assertIn("retry_option_invalid", sql)
        self.assertIn("fallback_invalid", sql)
        self.assertIn("FOR UPDATE", sql)
        self.assertIn("@route_apply_allowed=1", sql)
        self.assertIn("UPDATE abilities SET enabled=0", sql)
        self.assertIn("UPDATE options SET `value`='3'", sql)
        self.assertIn(self.module.LEGACY_PRIMARY_TAG, sql)
        self.assertIn("priority=40", sql)
        for tag, priority in self.module.FALLBACKS:
            self.assertIn("UPDATE channels SET priority=" + str(priority) + " WHERE tag='" + tag + "'", sql)

    def test_primary_url_is_host_locked(self) -> None:
        self.assertEqual(self.module.normalize_base_url("https://pdhlzy.art/"), "https://pdhlzy.art")
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://example.test")
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://pdhlzy.art/v1")


if __name__ == "__main__":
    unittest.main()
