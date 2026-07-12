from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_discount_text_channel.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_discount_text_channel", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_discount_text_channel.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigureDiscountTextChannelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_build_discount_plan_uses_only_current_public_aliases(self) -> None:
        plan = self.module.build_discount_plan({"gpt-5.5", "gpt-5.4-mini", "supplier-private-model"})

        self.assertEqual(plan.matched_models, ("gpt-5.4-mini", "gpt-5.5"))
        self.assertNotIn("supplier-private-model", plan.matched_models)
        self.assertEqual(plan.upstream_model_count, 3)

    def test_build_discount_plan_rejects_no_compatible_models(self) -> None:
        with self.assertRaisesRegex(self.module.ConfigurationError, "does not expose any"):
            self.module.build_discount_plan({"supplier-private-model"})

    def test_build_group_option_updates_preserves_legacy_authorization(self) -> None:
        updates = self.module.build_group_option_updates(
            {
                "GroupRatio": '{"default":1,"internal":1}',
                "UserUsableGroups": '{"default":"默认","internal":"内部兼容"}',
                "AutoGroups": '["default","discount"]',
                "GroupGroupRatio": '{"internal":{"discount":0.2,"default":1}}',
            }
        )

        self.assertEqual(
            self.module.json.loads(updates["GroupRatio"]),
            {"default": 1, "discount": 0.05, "internal": 1},
        )
        self.assertEqual(
            self.module.json.loads(updates["UserUsableGroups"]),
            {
                "default": self.module.DEFAULT_GROUP_DESCRIPTION,
                "discount": self.module.DISCOUNT_GROUP_DESCRIPTION,
                "internal": "内部兼容",
            },
        )
        self.assertEqual(self.module.json.loads(updates["AutoGroups"]), ["default"])
        self.assertEqual(
            self.module.json.loads(updates["GroupGroupRatio"]),
            {"internal": {"default": 1}},
        )

    def test_build_apply_sql_keeps_channel_and_abilities_in_discount_only(self) -> None:
        plan = self.module.DiscountPlan(
            upstream_model_count=2,
            matched_models=("gpt-5.4", "gpt-5.5"),
            missing_models=(),
        )
        sql = self.module.build_apply_sql(
            plan,
            "fake-upstream-key-for-test",
            "https://example.test",
            {
                "GroupRatio": '{"default":1}',
                "UserUsableGroups": '{"default":"默认"}',
                "AutoGroups": "[]",
                "GroupGroupRatio": "{}",
            },
        )

        self.assertIn("`group` = 'discount'", sql)
        self.assertIn("'discount', 'gpt-5.4', @discount_channel_id", sql)
        self.assertIn("'discount', 'gpt-5.5', @discount_channel_id", sql)
        self.assertNotIn("'default', 'gpt-5.4', @discount_channel_id", sql)
        self.assertIn(self.module.DISCOUNT_CHANNEL_TAG, sql)

    def test_build_apply_sql_guards_against_concurrent_option_updates(self) -> None:
        options = {
            "GroupRatio": '{"default":1}',
            "UserUsableGroups": '{"default":"默认"}',
            "AutoGroups": "[]",
            "GroupGroupRatio": "{}",
        }
        plan = self.module.DiscountPlan(
            upstream_model_count=1,
            matched_models=("gpt-5.5",),
            missing_models=(),
        )

        sql = self.module.build_apply_sql(plan, "fake-upstream-key-for-test", "https://example.test", options)

        self.assertIn("FOR UPDATE", sql)
        self.assertIn("@discount_options_match <> 4", sql)
        self.assertIn("@discount_apply_allowed = 1", sql)
        self.assertIn("discount_apply_status=", sql)
        self.assertNotIn("INSERT INTO options", sql)

    def test_build_apply_sql_locks_channel_conflicts_and_reports_exact_statuses(self) -> None:
        options = {
            "GroupRatio": '{"default":1}',
            "UserUsableGroups": '{"default":"默认"}',
            "AutoGroups": "[]",
            "GroupGroupRatio": "{}",
        }
        plan = self.module.DiscountPlan(
            upstream_model_count=1,
            matched_models=("gpt-5.5",),
            missing_models=(),
        )

        sql = self.module.build_apply_sql(plan, "fake-upstream-key-for-test", "https://example.test", options)

        channel_lock = "SELECT id FROM channels WHERE"
        self.assertIn(channel_lock, sql)
        self.assertIn("FIND_IN_SET('discount'", sql)
        self.assertIn("FOR UPDATE;", sql[sql.index(channel_lock) :])
        self.assertIn("@discount_tag_channel_count", sql)
        self.assertIn("@discount_group_conflict_count", sql)
        self.assertIn("@discount_apply_allowed", sql)
        for status in ("options_conflict", "channel_conflict", "duplicate_channels", "ok"):
            with self.subTest(status=status):
                self.assertIn("'" + status + "'", sql)

    def test_build_apply_sql_conditions_every_mutation_on_apply_allowed(self) -> None:
        plan = self.module.DiscountPlan(
            upstream_model_count=1,
            matched_models=("gpt-5.5",),
            missing_models=(),
        )
        sql = self.module.build_apply_sql(
            plan,
            "fake-upstream-key-for-test",
            "https://example.test",
            {
                "GroupRatio": '{"default":1}',
                "UserUsableGroups": '{"default":"默认"}',
                "AutoGroups": "[]",
                "GroupGroupRatio": "{}",
            },
        )

        mutations = [
            statement
            for statement in sql.splitlines()
            if statement.startswith(
                (
                    "UPDATE options",
                    "INSERT INTO channels",
                    "UPDATE channels",
                    "UPDATE abilities",
                    "INSERT INTO abilities",
                )
            )
        ]
        self.assertGreater(len(mutations), 0)
        for statement in mutations:
            with self.subTest(statement=statement):
                self.assertIn("@discount_apply_allowed = 1", statement)

    def test_apply_discount_plan_performs_no_transaction_external_channel_preflight(self) -> None:
        options = {
            "GroupRatio": '{"default":1}',
            "UserUsableGroups": '{"default":"默认"}',
            "AutoGroups": "[]",
            "GroupGroupRatio": "{}",
        }
        plan = self.module.DiscountPlan(
            upstream_model_count=1,
            matched_models=("gpt-5.5",),
            missing_models=(),
        )

        with mock.patch.object(self.module, "load_group_options", return_value=options), mock.patch.object(
            self.module, "mysql_exec", return_value=["discount_apply_status=ok"]
        ), mock.patch.object(
            self.module,
            "mysql",
            side_effect=AssertionError("channel preflight must be inside the write transaction"),
        ):
            self.module.apply_discount_plan(plan, "fake-upstream-key-for-test", "https://example.test")

    def test_apply_discount_plan_surfaces_fail_closed_conflict_statuses(self) -> None:
        options = {
            "GroupRatio": '{"default":1}',
            "UserUsableGroups": '{"default":"默认"}',
            "AutoGroups": "[]",
            "GroupGroupRatio": "{}",
        }
        plan = self.module.DiscountPlan(
            upstream_model_count=1,
            matched_models=("gpt-5.5",),
            missing_models=(),
        )
        cases = (
            ("options_conflict", "group options changed concurrently"),
            ("channel_conflict", "non-isolated channel"),
            ("duplicate_channels", "multiple discount channels"),
        )

        for status, message in cases:
            with self.subTest(status=status), mock.patch.object(
                self.module, "load_group_options", return_value=options
            ), mock.patch.object(
                self.module, "mysql_exec", return_value=["discount_apply_status=" + status]
            ), mock.patch.object(
                self.module,
                "mysql",
                side_effect=AssertionError("channel preflight must be inside the write transaction"),
            ):
                with self.assertRaisesRegex(self.module.ConfigurationError, message):
                    self.module.apply_discount_plan(
                        plan,
                        "fake-upstream-key-for-test",
                        "https://example.test",
                    )

    def test_build_disable_sql_still_disables_channel_when_options_are_unavailable(self) -> None:
        sql = self.module.build_disable_sql(None, None)

        self.assertIn("UPDATE channels SET status = 2", sql)
        channel_update = next(
            statement for statement in sql.splitlines() if statement.startswith("UPDATE channels")
        )
        self.assertIn("FIND_IN_SET('discount'", channel_update)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        ability_update = next(
            statement for statement in sql.splitlines() if statement.startswith("UPDATE abilities")
        )
        self.assertIn("`group` = 'discount'", ability_update)
        self.assertIn("OR channel_id IN", ability_update)
        self.assertIn("discount_disable_status=channel_only", sql)
        self.assertNotIn("UPDATE options", sql)

    def test_normalize_base_url_rejects_paths_and_credentials(self) -> None:
        self.assertEqual(
            self.module.normalize_base_url("https://www.geek2api.com/"),
            "https://www.geek2api.com",
        )
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://www.geek2api.com/v1")
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://user:pass@www.geek2api.com")
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://example.test")
        with self.assertRaises(self.module.ConfigurationError):
            self.module.normalize_base_url("https://www.geek2api.com:444")

    def test_model_probe_redirects_are_disabled(self) -> None:
        handler = self.module.NoRedirectHandler()

        redirected = handler.redirect_request(
            self.module.urllib.request.Request("https://example.test/v1/models"),
            None,
            302,
            "Found",
            {},
            "https://other.test/v1/models",
        )

        self.assertIsNone(redirected)


if __name__ == "__main__":
    unittest.main()
