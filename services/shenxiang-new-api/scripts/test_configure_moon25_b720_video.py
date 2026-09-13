from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("configure_moon25_b720_video.py")


def load_module():
    scripts_dir = str(SCRIPT_PATH.parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    spec = importlib.util.spec_from_file_location("configure_moon25_b720_video", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_moon25_b720_video.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ConfigureMoon25B720VideoTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_contract_constants_use_public_alias_upstream_id_and_cny_price(self) -> None:
        self.assertEqual(self.module.MODEL, "moon-video-2.5-720p")
        self.assertEqual(self.module.UPSTREAM, "moon-2.5-ac-b-720p")
        self.assertEqual(self.module.TAG, "xingren-moon25-video-720p")
        self.assertEqual(self.module.PRICE_CNY, self.module.permissions.Decimal("0.55"))

    def test_publish_requires_success_and_promotes_all_public_groups(self) -> None:
        mapping = json.dumps({self.module.MODEL: self.module.UPSTREAM}, separators=(",", ":"))
        self.module.channel_rows = lambda: [["52", "1", "internal", self.module.MODEL, mapping, "https://moonapix.com"]]
        calls: list[str] = []

        def fake_mysql(query: str):
            if "FROM tasks" in query:
                return [["1"]]
            return []

        self.module.permissions.mysql = fake_mysql
        self.module.permissions.mysql_exec = lambda sql: calls.append(sql)
        self.module.permissions.ensure_public_video_models = lambda: calls.append("models")
        self.module.permissions.sync_public_video_pricing = lambda: calls.append("pricing")
        self.module.permissions.sync_abilities = lambda: calls.append("abilities")
        self.module.permissions.model_lists = lambda: {"video": [self.module.MODEL]}
        self.module.permissions.sync_user_video_tokens = lambda profiles: {"tokens_rewritten": 3}

        result = self.module.publish()

        self.assertEqual(result, {"action": "published", "model": self.module.MODEL, "tokens_rewritten": 3})
        self.assertIn("default,standard,pro,code,internal", calls[0])
        self.assertEqual(calls[1:], ["models", "pricing", "abilities"])


if __name__ == "__main__":
    unittest.main()
