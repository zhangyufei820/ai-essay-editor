from __future__ import annotations

import importlib.util
import io
import json
import sys
import tempfile
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
        self.options = {
            "GroupRatio": '{"default":1,"internal":1}',
            "UserUsableGroups": '{"default":"默认","internal":"内部兼容"}',
            "AutoGroups": '["default","discount"]',
            "GroupGroupRatio": '{"internal":{"discount":0.2,"default":1}}',
        }
        self.plans = {
            spec.slug: self.module.DiscountPlan(
                upstream_model_count=8,
                matched_models=self.module.DISCOUNT_TEXT_MODELS,
                missing_models=(),
            )
            for spec in self.module.DISCOUNT_CHANNEL_SPECS
        }
        self.keys = {
            spec.slug: f"fake-{spec.slug}-upstream-key-for-test"
            for spec in self.module.DISCOUNT_CHANNEL_SPECS
        }
        self.base_urls = {
            spec.slug: spec.default_base_url
            for spec in self.module.DISCOUNT_CHANNEL_SPECS
        }

    def build_sql(self, order: tuple[str, ...] | None = None) -> str:
        return self.module.build_apply_sql(
            self.plans,
            self.keys,
            self.base_urls,
            order or self.module.DEFAULT_CHANNEL_ORDER,
            self.options,
        )

    def test_build_discount_plan_requires_exact_supported_models(self) -> None:
        upstream = set(self.module.DISCOUNT_TEXT_MODELS) | {"gpt-5.4", "supplier-private-model"}

        plan = self.module.build_discount_plan(upstream)

        self.assertEqual(plan.matched_models, self.module.DISCOUNT_TEXT_MODELS)
        self.assertEqual(plan.missing_models, ())
        self.assertEqual(plan.upstream_model_count, 5)

    def test_build_discount_plan_rejects_missing_required_model(self) -> None:
        upstream = set(self.module.DISCOUNT_TEXT_MODELS)
        upstream.remove("gpt-5.6-terra")

        with self.assertRaisesRegex(self.module.ConfigurationError, "gpt-5.6-terra"):
            self.module.build_discount_plan(upstream)

    def test_build_discount_plan_allows_fallback_model_subset(self) -> None:
        plan = self.module.build_discount_plan(
            {"gpt-5.5", "gpt-5.6-sol", "supplier-private-model"},
            require_all=False,
        )

        self.assertEqual(plan.matched_models, ("gpt-5.5", "gpt-5.6-sol"))
        self.assertIn("gpt-5.6-terra", plan.missing_models)

        with self.assertRaisesRegex(self.module.ConfigurationError, "none"):
            self.module.build_discount_plan({"supplier-private-model"}, require_all=False)

    def test_build_group_option_updates_sets_runtime_ratio_and_hides_auto_group(self) -> None:
        updates = self.module.build_group_option_updates(self.options)

        self.assertEqual(
            self.module.json.loads(updates["GroupRatio"]),
            {"default": 1, "discount": 0.25, "internal": 1},
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

    def test_parse_channel_order_accepts_any_exact_permutation(self) -> None:
        self.assertEqual(
            self.module.parse_channel_order("aihub,zwaca,tkfora"),
            ("aihub", "zwaca", "tkfora"),
        )
        with self.assertRaises(self.module.ConfigurationError):
            self.module.parse_channel_order("tkfora,aihub,aihub")

    def test_tkfora_fallback_uses_chat_completions_upstream(self) -> None:
        spec = next(spec for spec in self.module.DISCOUNT_CHANNEL_SPECS if spec.slug == "tkfora")

        self.assertEqual(spec.channel_type, self.module.OPENAI_CHANNEL_TYPE)
        self.assertEqual(spec.expected_channel_id, 42)
        self.assertEqual(spec.wire_api, "chat_completions")
        self.assertFalse(spec.require_all_models)
        self.assertNotIn("gpt-5.6-luna", self.module.DISCOUNT_TEXT_MODELS)

    def test_probe_output_reports_each_upstream_wire_api(self) -> None:
        plan = self.module.DiscountPlan(
            upstream_model_count=5,
            matched_models=self.module.DISCOUNT_TEXT_MODELS,
            missing_models=(),
        )
        stdout = io.StringIO()
        with mock.patch.object(self.module, "require_upstream_key", return_value="fake-upstream-key"), mock.patch.object(
            self.module, "resolve_upstream_base_url", return_value="https://example.test"
        ), mock.patch.object(
            self.module, "fetch_upstream_models", return_value=set(self.module.DISCOUNT_TEXT_MODELS)
        ), mock.patch.object(
            self.module, "build_discount_plan", return_value=plan
        ), mock.patch.object(
            sys, "argv", ["configure_discount_text_channel.py", "--order", "zwaca,tkfora,aihub"]
        ), mock.patch(
            "sys.stdout", stdout
        ):
            self.assertEqual(self.module.main(), 0)

        payload = self.module.json.loads(stdout.getvalue())
        self.assertEqual(payload["channel_order"], ["zwaca", "tkfora", "aihub"])
        self.assertEqual(payload["channels"]["zwaca"]["wire_api"], "responses")
        self.assertEqual(payload["channels"]["tkfora"]["wire_api"], "chat_completions")
        self.assertEqual(payload["channels"]["aihub"]["wire_api"], "responses")

    def test_build_apply_sql_creates_three_isolated_priority_channels(self) -> None:
        sql = self.build_sql()

        self.assertIn("@discount_channel_id_tkfora", sql)
        self.assertIn("@discount_channel_id_aihub", sql)
        self.assertIn("@discount_channel_id_zwaca", sql)
        self.assertIn("priority = 30", sql)
        self.assertIn("priority = 20", sql)
        self.assertIn("priority = 10", sql)
        self.assertNotIn("type = 58", sql)
        self.assertNotIn("openai_responses_to_openai_chat_completions", sql)
        self.assertIn(self.module.LEGACY_DISCOUNT_CHANNEL_TAG, sql)
        for spec in self.module.DISCOUNT_CHANNEL_SPECS:
            self.assertIn(spec.tag, sql)
        for model in self.module.DISCOUNT_TEXT_MODELS:
            self.assertIn("'discount', '" + model + "'", sql)
        self.assertNotIn("'discount', 'gpt-5.4'", sql)
        self.assertNotIn("'discount', 'gpt-5.6-luna'", sql)
        self.assertNotIn("'discount', 'codex-auto-review'", sql)

    def test_build_apply_sql_uses_each_fallback_model_subset(self) -> None:
        self.plans["tkfora"] = self.module.DiscountPlan(
            upstream_model_count=2,
            matched_models=("gpt-5.5", "gpt-5.6-sol"),
            missing_models=("gpt-5.6-terra",),
        )

        sql = self.build_sql()

        self.assertIn("'discount', 'gpt-5.6-terra', @discount_channel_id_zwaca", sql)
        self.assertNotIn("'discount', 'gpt-5.6-terra', @discount_channel_id_tkfora", sql)

    def test_build_apply_sql_clears_managed_channel_settings_and_legacy_other(self) -> None:
        sql = self.build_sql()

        self.assertIn("remark, settings) SELECT", sql)
        self.assertIn(", settings = ", sql)
        self.assertIn(", other = '{}'", sql)
        self.assertNotIn("remark, other) SELECT", sql)

    def test_build_apply_sql_preserves_dedicated_kimi_ability(self) -> None:
        sql = self.build_sql()

        self.assertIn("AND NOT (model = 'kimi-k3'", sql)
        self.assertIn("tag = 'xingren-kimi-k3'", sql)
        self.assertIn("REPLACE(COALESCE(`group`, ''), ' ', '') = 'kimi'", sql)

    def test_build_apply_sql_guards_every_mutation(self) -> None:
        sql = self.build_sql()

        self.assertIn("FOR UPDATE", sql)
        self.assertIn("@discount_options_match <> 4", sql)
        self.assertIn("@discount_duplicate_count", sql)
        self.assertIn(
            "tag IN ('xingren-discount-text-aihub','xingren-discount-text-reserve','xingren-discount-text')) > 1, 1, 0)",
            sql,
        )
        mutations = [
            statement
            for statement in sql.splitlines()
            if statement.startswith(("UPDATE options", "INSERT INTO channels", "UPDATE channels", "UPDATE abilities", "INSERT INTO abilities"))
        ]
        self.assertGreater(len(mutations), 0)
        for statement in mutations:
            with self.subTest(statement=statement):
                self.assertIn("@discount_apply_allowed = 1", statement)

    def test_apply_discount_plan_uses_single_guarded_transaction(self) -> None:
        with mock.patch.object(self.module, "load_group_options", return_value=self.options), mock.patch.object(
            self.module, "mysql_exec", return_value=["discount_apply_status=ok"]
        ), mock.patch.object(
            self.module,
            "mysql",
            side_effect=AssertionError("channel preflight must stay inside the write transaction"),
        ):
            self.module.apply_discount_plan(
                self.plans,
                self.keys,
                self.base_urls,
                self.module.DEFAULT_CHANNEL_ORDER,
            )

    def test_apply_discount_plan_surfaces_fail_closed_statuses(self) -> None:
        cases = (
            ("options_conflict", "group options changed concurrently"),
            ("channel_conflict", "unmanaged channel"),
            ("duplicate_channels", "same discount route identity"),
        )

        for status, message in cases:
            with self.subTest(status=status), mock.patch.object(
                self.module, "load_group_options", return_value=self.options
            ), mock.patch.object(
                self.module, "mysql_exec", return_value=["discount_apply_status=" + status]
            ):
                with self.assertRaisesRegex(self.module.ConfigurationError, message):
                    self.module.apply_discount_plan(
                        self.plans,
                        self.keys,
                        self.base_urls,
                        self.module.DEFAULT_CHANNEL_ORDER,
                    )

    def test_build_disable_sql_disables_all_managed_and_conflicting_channels(self) -> None:
        sql = self.module.build_disable_sql(None, None)

        for tag in self.module.ALL_DISCOUNT_CHANNEL_TAGS:
            self.assertIn(tag, sql)
        self.assertIn("FIND_IN_SET('discount'", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertIn("discount_disable_status=channel_only", sql)
        self.assertNotIn("UPDATE options", sql)

    def test_single_channel_apply_replaces_only_channel_42_and_disables_luna(self) -> None:
        spec = next(spec for spec in self.module.DISCOUNT_CHANNEL_SPECS if spec.slug == "tkfora")
        plan = self.module.DiscountPlan(
            upstream_model_count=8,
            matched_models=self.module.DISCOUNT_TEXT_MODELS,
            missing_models=(),
        )

        sql = self.module.build_single_channel_apply_sql(
            spec,
            plan,
            "fake-tkfora-key-for-test",
            "https://ai.tkfora.cn",
            20,
        )

        self.assertIn("WHERE id = 42 FOR UPDATE", sql)
        self.assertIn(self.module.LEGACY_PDHLZY_CHANNEL_TAG, sql)
        self.assertIn("id <> 42", sql)
        self.assertIn("WHERE id = 42 AND @discount_channel_apply_allowed = 1", sql)
        self.assertIn("channel_id = 42 AND @discount_channel_apply_allowed = 1", sql)
        self.assertNotIn("UPDATE options", sql)
        self.assertNotIn("WHERE id = 28", sql)
        self.assertNotIn("WHERE id = 41", sql)
        self.assertNotIn("'discount', 'gpt-5.6-luna'", sql)

    def test_single_channel_apply_fails_closed_on_identity_drift(self) -> None:
        spec = next(spec for spec in self.module.DISCOUNT_CHANNEL_SPECS if spec.slug == "tkfora")
        plan = self.plans["tkfora"]
        cases = (
            ("channel_missing", "does not exist"),
            ("channel_identity_mismatch", "identity changed"),
            ("duplicate_target_tag", "replacement route identity"),
        )
        for status, message in cases:
            with self.subTest(status=status), mock.patch.object(
                self.module,
                "mysql_exec",
                return_value=["discount_channel_apply_status=" + status],
            ):
                with self.assertRaisesRegex(self.module.ConfigurationError, message):
                    self.module.apply_single_discount_channel(
                        spec,
                        plan,
                        self.keys["tkfora"],
                        self.base_urls["tkfora"],
                        20,
                    )

    def test_provider_monitor_reset_removes_only_replaced_channel_state(self) -> None:
        state = {
            "routes": {
                "discount_text:gpt-5.5:42": {"samples": [{"ok": False}]},
                "discount_text:gpt-5.5:41": {"samples": [{"ok": True}]},
            },
            "managed_abilities": {
                "discount_text:gpt-5.5:42": {"auto_disabled": True},
                "discount_text:gpt-5.5:41": {"auto_disabled": False},
            },
            "managed_channels": {
                "discount_text:42": {"auto_disabled": True},
                "discount_text:41": {"auto_disabled": False},
            },
            "channels": {"42": {"auto_disabled": True}, "41": {"auto_disabled": False}},
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "provider-monitor-state.json"
            state_path.write_text(json.dumps(state), encoding="utf-8")
            with mock.patch.object(self.module, "PROVIDER_MONITOR_STATE_PATH", state_path):
                self.assertTrue(self.module.reset_provider_monitor_channel_state(42))
            updated = json.loads(state_path.read_text(encoding="utf-8"))

        self.assertNotIn("discount_text:gpt-5.5:42", updated["routes"])
        self.assertNotIn("discount_text:gpt-5.5:42", updated["managed_abilities"])
        self.assertNotIn("discount_text:42", updated["managed_channels"])
        self.assertNotIn("42", updated["channels"])
        self.assertIn("discount_text:gpt-5.5:41", updated["routes"])
        self.assertIn("discount_text:gpt-5.5:41", updated["managed_abilities"])
        self.assertIn("discount_text:41", updated["managed_channels"])
        self.assertIn("41", updated["channels"])

    def test_normalize_base_url_rejects_paths_credentials_and_unapproved_hosts(self) -> None:
        spec = next(spec for spec in self.module.DISCOUNT_CHANNEL_SPECS if spec.slug == "aihub")

        self.assertEqual(
            self.module.normalize_base_url("https://aihub.top/", spec),
            "https://aihub.top",
        )
        for invalid in (
            "https://aihub.top/v1",
            "https://user:pass@aihub.top",
            "https://example.test",
            "https://aihub.top:444",
        ):
            with self.subTest(invalid=invalid), self.assertRaises(self.module.ConfigurationError):
                self.module.normalize_base_url(invalid, spec)

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
