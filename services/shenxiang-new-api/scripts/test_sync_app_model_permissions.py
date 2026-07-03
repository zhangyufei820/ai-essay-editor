#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("sync_app_model_permissions.py")


def load_sync_module():
    spec = importlib.util.spec_from_file_location("sync_app_model_permissions", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load sync_app_model_permissions.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SyncAppModelPermissionsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_sync_module()

    def test_sanitize_model_limits_replaces_raw_gpt_image2(self) -> None:
        raw = "gpt-5.5,gpt-image-2,gpt-image-2-4K,gpt-image-2"

        self.assertEqual(
            self.module.sanitize_model_limits(raw),
            "gpt-5.5,gpt-image-2-4K",
        )

    def test_disabled_image2_ability_pairs_are_not_synced(self) -> None:
        self.assertTrue(self.module.is_disabled_ability_pair("12", "gpt-image-2-4K"))
        self.assertTrue(self.module.is_disabled_ability_pair("21", "gpt-image-2"))
        self.assertFalse(self.module.is_disabled_ability_pair("8", "gpt-image-2-4K"))


if __name__ == "__main__":
    unittest.main()
