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
        self.assertEqual(self.module.PRIMARY_PRIORITY, 30)
        self.assertEqual(
            self.module.FALLBACKS,
            (("xingren-discount-text-aihub", 20), ("xingren-discount-text-wangwang", 10)),
        )
        self.assertEqual(self.module.MODELS, ("gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra"))

    def test_apply_sql_guards_ratio_and_existing_fallbacks(self) -> None:
        sql = self.module.build_apply_sql("test-key", "https://www.geek2api.com")
        self.assertIn("GroupRatio", sql)
        self.assertIn("group_ratio_invalid", sql)
        self.assertIn("fallback_invalid", sql)
        self.assertIn("FOR UPDATE", sql)
        self.assertIn("@route_apply_allowed=1", sql)
        self.assertIn("UPDATE abilities SET enabled=0", sql)
        self.assertNotIn("UPDATE options SET", sql)

    def test_primary_url_is_host_locked(self) -> None:
        self.assertEqual(self.module.normalize_base_url("https://www.geek2api.com/"), "https://www.geek2api.com")
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://example.test")
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://www.geek2api.com/v1")


if __name__ == "__main__":
    unittest.main()
