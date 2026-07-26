import importlib.util
import json
import os
import unittest
from decimal import Decimal
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("configure_pdhlzy_claude.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_pdhlzy_claude", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_pdhlzy_claude.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ConfigurePdhlzyClaudeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def test_verified_channel_model_matrix_and_ratios(self) -> None:
        channels = self.module.CHANNELS

        self.assertEqual([channel["ratio"] for channel in channels], [
            Decimal("0.18"), Decimal("0.22"), Decimal("0.75"), Decimal("0.9")
        ])
        self.assertEqual([channel["type"] for channel in channels], [1, 1, 14, 14])
        self.assertEqual([channel["group_label"] for channel in channels], [
            "Kiro", "Kiro 稳定版", "ccmax 终端专用", "Claude 外接"
        ])
        self.assertEqual([len(channel["models"]) for channel in channels], [7, 10, 7, 7])
        self.assertEqual(tuple(channels[1]["models"]), self.module.ALL_MODELS)
        self.assertIn("claude-opus-5", channels[1]["models"])
        for channel in (channels[0], channels[2], channels[3]):
            self.assertNotIn("claude-opus-4-5-20251101", channel["models"])
            self.assertNotIn("claude-opus-5", channel["models"])
        for channel in (channels[2], channels[3]):
            self.assertNotIn("claude-sonnet-4-5-20250929", channel["models"])

    def test_option_updates_encode_cny_prices_and_cache_ratios(self) -> None:
        options = {
            "GroupRatio": {"default": 1},
            "UserUsableGroups": {"default": "默认"},
            "AutoGroups": ["default", "kiro", "ccmax-terminal"],
            "GroupGroupRatio": {},
            "ModelRatio": {},
            "CompletionRatio": {},
            "CacheRatio": {},
            "CreateCacheRatio": {},
        }

        updates = self.module.option_updates(options, Decimal("7"))
        group_ratios = json.loads(updates["GroupRatio"])
        user_groups = json.loads(updates["UserUsableGroups"])
        model_ratios = json.loads(updates["ModelRatio"])
        completion_ratios = json.loads(updates["CompletionRatio"])
        cache_ratios = json.loads(updates["CacheRatio"])
        create_cache_ratios = json.loads(updates["CreateCacheRatio"])

        self.assertEqual(group_ratios["kiro"], 0.18)
        self.assertEqual(group_ratios["kiro-stable"], 0.22)
        self.assertEqual(group_ratios["ccmax-terminal"], 0.75)
        self.assertEqual(group_ratios["claude-external"], 0.9)
        self.assertEqual(user_groups["kiro"], "Kiro")
        self.assertEqual(user_groups["kiro-stable"], "Kiro 稳定版")
        self.assertEqual(user_groups["ccmax-terminal"], "ccmax 终端专用")
        self.assertEqual(user_groups["claude-external"], "Claude 外接")
        self.assertAlmostEqual(model_ratios["claude-fable-5"], 10 / 14)
        self.assertEqual(completion_ratios["claude-fable-5"], 5)
        self.assertEqual(cache_ratios["claude-fable-5"], 0.1)
        self.assertEqual(create_cache_ratios["claude-fable-5"], 1.25)
        self.assertAlmostEqual(model_ratios["claude-opus-5"], 5 / 14)
        self.assertEqual(completion_ratios["claude-opus-5"], 5)
        self.assertEqual(cache_ratios["claude-opus-5"], 0.1)
        self.assertEqual(create_cache_ratios["claude-opus-5"], 1.25)
        self.assertEqual(json.loads(updates["AutoGroups"]), ["default"])

    def test_sql_disables_legacy_channels_and_pins_claude_tokens(self) -> None:
        keys = {
            channel["tag"]: f"test-key-{index}-not-a-secret"
            for index, channel in enumerate(self.module.CHANNELS)
        }

        sql = self.module.build_sql({}, keys, {"GroupRatio": "{}"})

        self.assertIn("status = 0, weight = 0, priority = 99", sql)
        self.assertIn("xingren-claude-moonapix-fallback", sql)
        self.assertIn("xingren-claude-geek2api-primary", sql)
        self.assertIn("`group` = 'kiro-stable'", sql)
        self.assertIn("claude-opus-5", sql)
        self.assertIn("cross_group_retry = 0", sql)

    def test_existing_enabled_channel_key_is_used_when_environment_key_is_absent(self) -> None:
        previous_mysql = self.module.mysql
        try:
            self.module.mysql = lambda _env, query: [["stored-channel-key-not-printed"]] if "SELECT COALESCE(`key`, '')" in query else []
            with unittest.mock.patch.dict(os.environ, {channel["env"]: "" for channel in self.module.CHANNELS}, clear=False):
                keys = self.module.require_keys({"MYSQL_ROOT_PASSWORD": "test", "MYSQL_DATABASE": "test"})
        finally:
            self.module.mysql = previous_mysql

        self.assertEqual(set(keys), {channel["tag"] for channel in self.module.CHANNELS})
        self.assertTrue(all(key == "stored-channel-key-not-printed" for key in keys.values()))


if __name__ == "__main__":
    unittest.main()
