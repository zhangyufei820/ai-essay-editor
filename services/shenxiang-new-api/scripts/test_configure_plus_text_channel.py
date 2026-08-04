from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_plus_text_channel.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_plus_text_channel", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_plus_text_channel.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigurePlusTextChannelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()
        self.options = {
            "GroupRatio": '{"default":1,"internal":1}',
            "UserUsableGroups": '{"default":"默认","internal":"内部兼容"}',
            "AutoGroups": '["default","plus"]',
            "GroupGroupRatio": '{"internal":{"plus":0.8,"default":1}}',
        }
        self.plans = {
            spec.slug: self.module.PlusPlan(
                upstream_model_count=9,
                matched_models=self.module.PLUS_UPSTREAM_MODELS,
                missing_models=(),
            )
            for spec in self.module.PLUS_CHANNEL_SPECS
        }
        self.keys = {
            spec.slug: f"fake-{spec.slug}-upstream-key-for-test"
            for spec in self.module.PLUS_CHANNEL_SPECS
        }
        self.base_urls = {
            spec.slug: spec.default_base_url
            for spec in self.module.PLUS_CHANNEL_SPECS
        }

    def build_sql(self) -> str:
        return self.module.build_apply_sql(
            self.plans,
            self.keys,
            self.base_urls,
            self.options,
        )

    def test_plus_models_match_default_openai_set_without_compact(self) -> None:
        self.assertEqual(
            self.module.PLUS_TEXT_MODELS,
            (
                "gpt-5.4",
                "gpt-5.4-mini",
                "gpt-5.5",
                "gpt-5.6-luna",
                "gpt-5.6-sol",
                "gpt-5.6-terra",
                "codex-auto-review",
            ),
        )
        self.assertNotIn("gpt-5.5-openai-compact", self.module.PLUS_TEXT_MODELS)

    def test_build_plus_plan_requires_six_raw_upstream_models(self) -> None:
        upstream = set(self.module.PLUS_UPSTREAM_MODELS) | {
            "gpt-5.5-openai-compact",
            "supplier-private-model",
        }

        plan = self.module.build_plus_plan(upstream)

        self.assertEqual(plan.matched_models, self.module.PLUS_UPSTREAM_MODELS)
        self.assertEqual(plan.missing_models, ())
        self.assertEqual(plan.upstream_model_count, 8)

    def test_build_plus_plan_rejects_missing_required_model(self) -> None:
        upstream = set(self.module.PLUS_UPSTREAM_MODELS)
        upstream.remove("gpt-5.6-terra")

        with self.assertRaisesRegex(self.module.ConfigurationError, "gpt-5.6-terra"):
            self.module.build_plus_plan(upstream)

    def test_build_plus_plan_allows_fallback_to_publish_only_real_intersection(self) -> None:
        upstream = {"gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"}

        plan = self.module.build_plus_plan(upstream, allow_partial=True)

        self.assertEqual(plan.missing_models, ("gpt-5.4", "gpt-5.4-mini"))
        self.assertEqual(
            self.module.published_models_for_plan(plan),
            (
                "gpt-5.5",
                "gpt-5.6-luna",
                "gpt-5.6-sol",
                "gpt-5.6-terra",
                "codex-auto-review",
            ),
        )

    def test_default_order_promotes_pdhlzy_then_aihub(self) -> None:
        self.assertEqual(
            self.module.DEFAULT_CHANNEL_ORDER,
            ("pdhlzy", "aihub", "wangwang"),
        )
        self.assertEqual(
            self.module.channel_priorities(self.module.DEFAULT_CHANNEL_ORDER),
            {"pdhlzy": 30, "aihub": 20, "wangwang": 10},
        )

    def test_partial_primary_is_valid_when_fallbacks_cover_every_public_model(self) -> None:
        self.plans["pdhlzy"] = self.module.PlusPlan(
            upstream_model_count=4,
            matched_models=("gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"),
            missing_models=("gpt-5.4", "gpt-5.4-mini"),
        )

        self.module.validate_public_model_coverage(self.plans)

    def test_partial_routes_fail_closed_when_a_public_model_is_uncovered(self) -> None:
        for slug in self.plans:
            self.plans[slug] = self.module.PlusPlan(
                upstream_model_count=5,
                matched_models=("gpt-5.4-mini", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"),
                missing_models=("gpt-5.4",),
            )

        with self.assertRaisesRegex(self.module.ConfigurationError, "gpt-5.4"):
            self.module.validate_public_model_coverage(self.plans)

    def test_partial_primary_sql_does_not_create_missing_model_abilities(self) -> None:
        self.plans["pdhlzy"] = self.module.PlusPlan(
            upstream_model_count=4,
            matched_models=("gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"),
            missing_models=("gpt-5.4", "gpt-5.4-mini"),
        )

        sql = self.build_sql()

        self.assertNotIn("'plus', 'gpt-5.4', @plus_channel_id_pdhlzy", sql)
        self.assertNotIn("'plus', 'gpt-5.4-mini', @plus_channel_id_pdhlzy", sql)
        self.assertIn("'plus', 'gpt-5.5', @plus_channel_id_pdhlzy", sql)
        self.assertIn("'plus', 'codex-auto-review', @plus_channel_id_pdhlzy", sql)

    def test_channel_order_requires_all_three_routes_exactly_once(self) -> None:
        self.assertEqual(
            self.module.parse_channel_order("pdhlzy,aihub,wangwang"),
            ("pdhlzy", "aihub", "wangwang"),
        )
        for invalid in ("aihub,wangwang", "aihub,wangwang,wangwang"):
            with self.subTest(invalid=invalid), self.assertRaises(self.module.ConfigurationError):
                self.module.parse_channel_order(invalid)

    def test_group_options_pin_ratio_and_remove_plus_from_auto_and_overrides(self) -> None:
        updates = self.module.build_group_option_updates(self.options)

        self.assertEqual(self.module.PLUS_GROUP_DESCRIPTION, "Plus 0.5x 通道")
        self.assertEqual(
            self.module.json.loads(updates["GroupRatio"]),
            {"default": 1, "internal": 1, "plus": 0.5},
        )
        self.assertEqual(
            self.module.json.loads(updates["UserUsableGroups"]),
            {
                "default": self.module.DEFAULT_GROUP_DESCRIPTION,
                "internal": "内部兼容",
                "plus": self.module.PLUS_GROUP_DESCRIPTION,
            },
        )
        self.assertEqual(self.module.json.loads(updates["AutoGroups"]), ["default"])
        self.assertEqual(
            self.module.json.loads(updates["GroupGroupRatio"]),
            {"internal": {"default": 1}},
        )

    def test_build_apply_sql_creates_three_direct_openai_channels_in_fixed_order(self) -> None:
        sql = self.build_sql()

        self.assertIn("@plus_channel_id_aihub", sql)
        self.assertIn("@plus_channel_id_wangwang", sql)
        self.assertIn("@plus_channel_id_pdhlzy", sql)
        self.assertIn("priority = 30", sql)
        self.assertIn("priority = 20", sql)
        self.assertIn("priority = 10", sql)
        self.assertNotIn("type = 58", sql)
        self.assertNotIn("openai_responses_to_openai_chat_completions", sql)
        for spec in self.module.PLUS_CHANNEL_SPECS:
            self.assertEqual(spec.channel_type, self.module.OPENAI_CHANNEL_TYPE)
            self.assertIn(spec.tag, sql)
        for model in self.module.PLUS_TEXT_MODELS:
            self.assertIn("'plus', '" + model + "'", sql)
        self.assertNotIn("gpt-5.5-openai-compact", sql)
        self.assertIn('"codex-auto-review":"gpt-5.5"', sql)

    def test_build_apply_sql_guards_every_mutation(self) -> None:
        sql = self.build_sql()

        self.assertIn("FOR UPDATE", sql)
        self.assertIn("@plus_options_match <> 4", sql)
        self.assertIn("@plus_duplicate_count", sql)
        mutations = [
            statement
            for statement in sql.splitlines()
            if statement.startswith(
                ("UPDATE options", "INSERT INTO channels", "UPDATE channels", "UPDATE abilities", "INSERT INTO abilities")
            )
        ]
        self.assertGreater(len(mutations), 0)
        for statement in mutations:
            with self.subTest(statement=statement):
                self.assertIn("@plus_apply_allowed = 1", statement)

    def test_apply_plus_plan_uses_single_guarded_transaction(self) -> None:
        with mock.patch.object(self.module, "load_group_options", return_value=self.options), mock.patch.object(
            self.module, "mysql_exec", return_value=["plus_apply_status=ok"]
        ), mock.patch.object(
            self.module,
            "mysql",
            side_effect=AssertionError("channel preflight must stay inside the write transaction"),
        ):
            self.module.apply_plus_plan(self.plans, self.keys, self.base_urls)

    def test_apply_plus_plan_surfaces_fail_closed_statuses(self) -> None:
        cases = (
            ("options_conflict", "group options changed concurrently"),
            ("channel_conflict", "unmanaged channel"),
            ("duplicate_channels", "same plus route identity"),
        )
        for status, message in cases:
            with self.subTest(status=status), mock.patch.object(
                self.module, "load_group_options", return_value=self.options
            ), mock.patch.object(
                self.module, "mysql_exec", return_value=["plus_apply_status=" + status]
            ):
                with self.assertRaisesRegex(self.module.ConfigurationError, message):
                    self.module.apply_plus_plan(self.plans, self.keys, self.base_urls)

    def test_normalize_base_url_rejects_paths_credentials_and_unapproved_hosts(self) -> None:
        spec = next(spec for spec in self.module.PLUS_CHANNEL_SPECS if spec.slug == "pdhlzy")

        self.assertEqual(
            self.module.normalize_base_url("https://pdhlzy.com/", spec),
            "https://pdhlzy.com",
        )
        for invalid in (
            "https://pdhlzy.com/v1",
            "https://user:pass@pdhlzy.com",
            "https://example.test",
            "https://pdhlzy.com:444",
        ):
            with self.subTest(invalid=invalid), self.assertRaises(self.module.ConfigurationError):
                self.module.normalize_base_url(invalid, spec)

    def test_aihub_base_url_is_pinned_to_approved_https_origin(self) -> None:
        spec = next(spec for spec in self.module.PLUS_CHANNEL_SPECS if spec.slug == "aihub")

        self.assertEqual(
            self.module.normalize_base_url("https://aihub.top/", spec),
            "https://aihub.top",
        )
        for invalid in (
            "http://aihub.top",
            "https://www.aihub.top",
            "https://aihub.top/v1",
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
