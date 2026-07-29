from __future__ import annotations

import importlib.util
import io
import sys
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_special_text_channels.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_special_text_channels", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_special_text_channels.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigureSpecialTextChannelsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()
        self.options = {
            "GroupRatio": '{"default":1,"special":0.5}',
            "UserUsableGroups": '{"default":"原价"}',
            "AutoGroups": '["default","special"]',
            "GroupGroupRatio": '{"vip":{"default":1,"special":0.2}}',
        }
        self.plans = {
            index: self.module.SpecialPlan(
                upstream_model_count=8,
                matched_models=(
                    self.module.SPECIAL_MODELS
                    if index in {0, 2}
                    else tuple(model for model in self.module.SPECIAL_MODELS if model != "gpt-5.6")
                ),
                missing_models=(() if index in {0, 2} else ("gpt-5.6",)),
            )
            for index in range(4)
        }
        self.keys = {index: f"fake-special-key-{index}-for-test" for index in range(4)}

    def test_plan_keeps_only_approved_models_and_allows_partial_channel(self) -> None:
        upstream = {"gpt-5.5", "gpt-5.6-sol", "private-model"}

        plan = self.module.build_special_plan(upstream)

        self.assertEqual(plan.matched_models, ("gpt-5.5", "gpt-5.6-sol"))
        self.assertIn("gpt-5.6", plan.missing_models)
        self.assertNotIn("private-model", plan.matched_models)

    def test_group_options_pin_ratio_and_remove_overrides(self) -> None:
        updates = self.module.build_group_option_updates(self.options)

        self.assertEqual(self.module.json.loads(updates["GroupRatio"])["special"], 0.06)
        self.assertEqual(
            self.module.json.loads(updates["UserUsableGroups"])["special"],
            self.module.SPECIAL_GROUP_DESCRIPTION,
        )
        self.assertEqual(self.module.json.loads(updates["AutoGroups"]), ["default"])
        self.assertEqual(self.module.json.loads(updates["GroupGroupRatio"]), {"vip": {"default": 1}})

    def test_apply_sql_creates_four_isolated_priority_channels(self) -> None:
        sql = self.module.build_apply_sql(
            self.plans,
            self.keys,
            self.module.SPECIAL_DEFAULT_BASE_URL,
            self.options,
        )

        for index, tag in enumerate(self.module.SPECIAL_CHANNEL_TAGS):
            self.assertIn(tag, sql)
            self.assertIn(f"@special_channel_id_{index}", sql)
        for priority in self.module.SPECIAL_CHANNEL_PRIORITIES:
            self.assertIn(f"priority = {priority}", sql)
        self.assertIn("`group` = 'special'", sql)
        self.assertIn("'special','gpt-5.6'", sql)
        self.assertNotIn("'special','private-model'", sql)
        fallback_one_var = self.module.channel_variable(1)
        fallback_one_lines = [line for line in sql.splitlines() if fallback_one_var in line and "INSERT INTO abilities" in line]
        self.assertFalse(any("gpt-5.6'" in line for line in fallback_one_lines))

    def test_apply_uses_one_guarded_transaction(self) -> None:
        with mock.patch.object(self.module, "load_options", return_value=self.options), mock.patch.object(
            self.module, "mysql_exec", return_value=["special_apply_status=ok"]
        ):
            self.module.apply_special_plans(
                self.plans,
                self.keys,
                self.module.SPECIAL_DEFAULT_BASE_URL,
            )

    def test_base_url_rejects_paths_credentials_and_other_hosts(self) -> None:
        self.assertEqual(self.module.normalize_base_url("https://aihub.top/"), "https://aihub.top")
        for value in (
            "https://aihub.top/v1",
            "https://user:pass@aihub.top",
            "https://example.test",
            "http://aihub.top",
        ):
            with self.subTest(value=value), self.assertRaises(self.module.ConfigurationError):
                self.module.normalize_base_url(value)

    def test_probe_reports_fixed_order_and_per_channel_capabilities(self) -> None:
        stdout = io.StringIO()
        plans = iter(self.plans.values())
        with mock.patch.object(self.module, "read_key", return_value="fake-special-key"), mock.patch.object(
            self.module, "fetch_upstream_models", return_value=set(self.module.SPECIAL_MODELS)
        ), mock.patch.object(
            self.module, "build_special_plan", side_effect=lambda _models: next(plans)
        ), mock.patch.object(
            sys, "argv", ["configure_special_text_channels.py"]
        ), mock.patch(
            "sys.stdout", stdout
        ):
            self.assertEqual(self.module.main(), 0)

        payload = self.module.json.loads(stdout.getvalue())
        self.assertEqual(payload["ratio"], 0.06)
        self.assertEqual(payload["channel_order"], list(self.module.SPECIAL_CHANNEL_TAGS))
        self.assertEqual([item["priority"] for item in payload["channels"].values()], [40, 30, 20, 10])


if __name__ == "__main__":
    unittest.main()
