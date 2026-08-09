#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
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
        raw = "gpt-5.5,gpt-image-2,gpt-image-2-4K,gpt-image-2,geek2api-image-2,internal-image2-stable-v1,gpt-5.3-codex-spark,gpt-5.3-spark"

        self.assertEqual(
            self.module.sanitize_model_limits(raw),
            "gpt-5.5,gpt-image-2-4K",
        )

    def test_codex_allowed_models_include_controlled_review_alias(self) -> None:
        self.assertIn("image 2电商商品图快速通道(1.5K)", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-luna", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-terra", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-sol", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("kimi-k3", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.5-openai-compact", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.3-codex-spark", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.3-spark", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.4-openai-compact", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("codex-auto-review", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("geek2api-image-2", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-image-2-4K", self.module.CODEX_ALLOWED_MODELS)

    def test_kimi_k3_price_config_is_exact_rmb_sale_price(self) -> None:
        prices = self.module.PUBLIC_OPENAI_TEXT_MODELS["kimi-k3"]

        self.assertEqual(prices["input_cny"], self.module.Decimal("13"))
        self.assertEqual(prices["output_cny"], self.module.Decimal("65"))
        self.assertEqual(prices["cache_read_cny"], self.module.Decimal("1.30"))
        self.assertEqual(prices["cache_create_cny"], self.module.Decimal("13"))
        self.assertEqual(prices["longcontext_input_cny"], self.module.Decimal("13"))
        self.assertEqual(prices["longcontext_output_cny"], self.module.Decimal("65"))

    def test_kimi_k3_uses_a_dedicated_fixed_price_group(self) -> None:
        self.assertEqual(self.module.KIMI_K3_MODEL, "kimi-k3")
        self.assertEqual(self.module.KIMI_K3_GROUP, "kimi")
        self.assertEqual(self.module.KIMI_K3_CHANNEL_TAG, "xingren-kimi-k3")
        self.module.mysql = lambda _query: []
        self.assertIn(self.module.KIMI_K3_GROUP, self.module.active_groups())

    def test_kimi_k3_ability_sync_preserves_discount_and_plus_visibility(self) -> None:
        source = SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("kimi_enabled_channel_sql", source)
        self.assertGreaterEqual(source.count("AND NOT (model = "), 2)

    def test_discount_text_models_are_exactly_the_public_text_aliases(self) -> None:
        self.assertEqual(
            self.module.DISCOUNT_TEXT_ALLOWED_MODELS,
            (
                "gpt-5.4-mini",
                "gpt-5.5",
                "gpt-5.6",
                "gpt-5.6-sol",
                "gpt-5.6-terra",
            ),
        )
        self.assertEqual(
            self.module.DISCOUNT_TEXT_CHANNEL_TAGS,
            (
                "xingren-discount-text-aihub",
                "xingren-discount-text-aihub-fallback",
                "xingren-discount-text-wangwang",
            ),
        )

    def test_public_video_models_are_full_price_and_callable_only(self) -> None:
        self.assertEqual(
            self.module.PUBLIC_VIDEO_MODELS,
            (
                "grok-video-super-720p",
                "seedance-2.0-ld-17",
                "seedance-sd2-fast-720p",
                "grok-video-1.5",
                "grok-video-1.5-1080p",
            ),
        )
        self.assertTrue(
            set(self.module.PUBLIC_VIDEO_MODELS).isdisjoint(
                self.module.DISCOUNT_TEXT_ALLOWED_MODELS
            )
        )
        self.assertNotIn("seedance-2.0", self.module.PUBLIC_VIDEO_MODELS)
        self.assertNotIn("seedance-nsfw", self.module.PUBLIC_VIDEO_MODELS)
        self.assertNotIn("seedance-2.0-wc-b-720p", self.module.PUBLIC_VIDEO_MODELS)
        self.assertNotIn("sd2-fast-720p", self.module.PUBLIC_VIDEO_MODELS)
        self.assertNotIn("grok-imagine-1.5-video", self.module.PUBLIC_VIDEO_MODELS)

    def test_staged_grok1080_is_admin_only_until_published(self) -> None:
        self.module.grok15_1080_video_release_state = lambda: "staged"
        self.module.discount_image2_release_state = lambda: "unavailable"
        self.module.gemini_ddpapi_release_state = lambda: "unavailable"
        profiles = {
            "codex": ["gpt-5.5"],
            "claude": ["claude-opus-4-8"],
            "image": ["gpt-image-2-4K"],
            "video": ["grok-video-1.5"],
        }

        system_profiles = self.module.system_token_profiles(profiles)

        self.assertNotIn("grok-video-1.5-1080p", profiles["video"])
        self.assertIn("grok-video-1.5-1080p", system_profiles["video"])

    def test_grok1080_release_state_requires_exact_managed_groups(self) -> None:
        for rows, expected in (
            ([], "unavailable"),
            ([['1', 'internal']], "staged"),
            ([['1', 'default,standard,pro,code,internal']], "published"),
            ([['1', 'default,internal']], "invalid"),
            ([['2', 'default,standard,pro,code,internal']], "unavailable"),
        ):
            self.module.mysql = lambda _query, rows=rows: rows
            self.assertEqual(self.module.grok15_1080_video_release_state(), expected)

    def test_discount_image2_release_state_requires_exact_managed_groups(self) -> None:
        for rows, expected in (
            ([], "unavailable"),
            ([["1", "internal"]], "staged"),
            ([["1", "default,standard,pro,code,internal"]], "published"),
            ([["1", "default,internal"]], "invalid"),
            ([["2", "default,standard,pro,code,internal"]], "unavailable"),
        ):
            self.module.mysql = lambda _query, rows=rows: rows
            self.assertEqual(self.module.discount_image2_release_state(), expected)

    def test_staged_discount_image2_is_admin_only_until_published(self) -> None:
        self.module.grok15_1080_video_release_state = lambda: "unavailable"
        self.module.discount_image2_release_state = lambda: "staged"
        self.module.gemini_ddpapi_release_state = lambda: "unavailable"
        profiles = {
            "codex": ["gpt-5.5"],
            "claude": ["claude-opus-4-8"],
            "image": ["gpt-image-2-4K"],
            "video": ["grok-video-1.5"],
        }

        system_profiles = self.module.system_token_profiles(profiles)

        self.assertNotIn("特价 image-2", profiles["image"])
        self.assertIn("特价 image-2", system_profiles["image"])

    def test_gemini_ddpapi_release_state_requires_both_exact_channels(self) -> None:
        staged_rows = [
            ["xingren-gemini31-flash-image-ddpapi", "1", "internal", "gemini-3.1-flash-image"],
            ["xingren-gemini3-pro-image-ddpapi", "1", "internal", "gemini-3-pro-image"],
        ]
        published_rows = [
            ["xingren-gemini31-flash-image-ddpapi", "1", "default,standard,pro,code,internal", "gemini-3.1-flash-image"],
            ["xingren-gemini3-pro-image-ddpapi", "1", "default,standard,pro,code,internal", "gemini-3-pro-image"],
        ]
        for rows, expected in (
            ([], "unavailable"),
            (staged_rows, "staged"),
            (published_rows, "published"),
            (staged_rows[:1], "unavailable"),
            ([staged_rows[0], published_rows[1]], "invalid"),
        ):
            self.module.mysql = lambda _query, rows=rows: rows
            self.assertEqual(self.module.gemini_ddpapi_release_state(), expected)

    def test_staged_gemini_ddpapi_models_are_admin_only_until_published(self) -> None:
        self.module.grok15_1080_video_release_state = lambda: "unavailable"
        self.module.discount_image2_release_state = lambda: "unavailable"
        self.module.gemini_ddpapi_release_state = lambda: "staged"
        profiles = {
            "codex": ["gpt-5.5"],
            "claude": ["claude-opus-4-8"],
            "image": ["gpt-image-2-4K"],
            "video": ["grok-video-1.5"],
        }

        system_profiles = self.module.system_token_profiles(profiles)

        for model in self.module.GEMINI_DDPAPI_MODELS:
            self.assertNotIn(model, profiles["image"])
            self.assertIn(model, system_profiles["image"])

    def test_new_video_catalog_describes_price_inputs_and_face_support_without_provider_details(self) -> None:
        sd_description = self.module.PUBLIC_VIDEO_MODEL_CONFIGS["seedance-sd2-fast-720p"]["description"]
        grok_description = self.module.PUBLIC_VIDEO_MODEL_CONFIGS["grok-video-1.5"]["description"]
        grok_1080_description = self.module.PUBLIC_VIDEO_MODEL_CONFIGS["grok-video-1.5-1080p"]["description"]

        for expected in ("¥0.25/秒", "720P", "5/10/15", "文生视频", "图生视频", "图片", "不支持视频或音频", "人脸能力未承诺"):
            self.assertIn(expected, sd_description)
        for expected in ("¥0.20/次", "720P", "6/10", "文生视频", "图生视频", "可上传 1 张图片", "不支持视频或音频", "人脸能力未承诺"):
            self.assertIn(expected, grok_description)
        for expected in ("¥0.40/次", "1080P", "1-15", "仅支持图生视频", "必须上传 1 张图片", "不支持视频或音频"):
            self.assertIn(expected, grok_1080_description)
        combined = f"{sd_description}\n{grok_description}\n{grok_1080_description}".lower()
        for forbidden in ("smile-ai", "api.smile", "sd2-fast-720p", "grok-imagine-1.5-video", "grok-imagine-video-1.5", "provider", "supplier", "上游", "渠道"):
            self.assertNotIn(forbidden, combined)

    def test_ensure_codex_image_model_limits_adds_only_public_15k_image_model(self) -> None:
        raw = "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,banana-2,claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.4-mini,gpt-5.5,gpt-5.4,gpt-5.6,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,kimi-k3,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)",
        )

    def test_ensure_codex_image_model_limits_defaults_empty_to_text_and_image(self) -> None:
        raw = "claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,kimi-k3,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)",
        )

    def test_token_cache_key_uses_crypto_secret_hmac(self) -> None:
        old_secret = os.environ.get("CRYPTO_SECRET")
        os.environ["CRYPTO_SECRET"] = "test-secret"
        try:
            self.assertEqual(
                self.module.token_cache_key("token-value"),
                "token:aa900acb34c6e64089ce061bb6e53053ecc0af1e03fd3a9aa63540d874843147",
            )
        finally:
            if old_secret is None:
                os.environ.pop("CRYPTO_SECRET", None)
            else:
                os.environ["CRYPTO_SECRET"] = old_secret

    def test_supplier_exposed_model_limit_predicate_covers_known_markers(self) -> None:
        predicate = self.module.supplier_exposed_model_limit_predicate()

        for marker in ["gpt-image-2", "ccapi", "drag tokens", "dragtokens", "geek2api", "moonapix", "relay dance", "relaydance"]:
            self.assertIn(marker, predicate)

    def test_supplier_exposed_model_name_predicate_covers_known_markers(self) -> None:
        predicate = self.module.supplier_exposed_model_name_predicate("model")

        for marker in ["ccapi", "drag tokens", "dragtokens", "geek2api", "moonapix", "relay dance", "relaydance"]:
            self.assertIn(marker, predicate)

    def test_supplier_exposed_model_name_predicate_can_exclude_public_alias_backing_model(self) -> None:
        predicate = self.module.supplier_exposed_model_name_predicate("model", exclude_public_alias_backing=True)

        self.assertIn("geek2api", predicate)
        self.assertIn("NOT IN", predicate)
        self.assertIn("geek2api-image-2", predicate)

    def test_parse_json_string_option_preserves_escaped_quotes(self) -> None:
        self.module.option_value = lambda _key: '{"geek2api-image-2":"param(\\"resolution\\") == \\"4K\\" ? tier(\\"4K\\", 1) : tier(\\"1K\\", 0)"}'

        parsed = self.module.parse_json_string_option("billing_setting.billing_expr")

        self.assertEqual(
            parsed["geek2api-image-2"],
            'param("resolution") == "4K" ? tier("4K", 1) : tier("1K", 0)',
        )

    def test_option_value_reads_raw_mysql_output(self) -> None:
        captured: list[str] = []

        def fake_mysql_raw(query: str) -> list[list[str]]:
            captured.append(query)
            return [['{"model":"tier(\\"base\\", 1)"}']]

        self.module.mysql_raw = fake_mysql_raw

        self.assertEqual(self.module.option_value("billing_setting.billing_expr"), '{"model":"tier(\\"base\\", 1)"}')
        self.assertIn("billing_setting.billing_expr", captured[0])

    def test_model_lists_allows_codex_to_use_public_15k_image_model(self) -> None:
        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM models" not in query:
                return []
            return [
                ["1", "gpt-5.5", "text,openai,codex"],
                ["2", "gpt-5.4", "text,openai,codex"],
                ["3", "gpt-5.4-mini", "text,openai,codex"],
                ["4", "gpt-5.6-luna", "text,openai,codex"],
                ["5", "gpt-5.6-terra", "text,openai,codex"],
                ["6", "gpt-5.6-sol", "text,openai,codex"],
                ["7", "gpt-5.3-codex-spark", "text,codex"],
                ["8", "gpt-5.3-spark", "text,codex"],
                ["9", "gpt-5.4-openai-compact", "text,openai,codex"],
                ["10", "gpt-5.5-openai-compact", "text,codex"],
                ["11", "codex-auto-review", "text,codex"],
                ["12", "image 2电商商品图快速通道(1.5K)", "image,openai,ecommerce,1.5k,dragtokens"],
                ["13", "gpt-image-2-4K", "image,openai"],
                ["14", "geek2api-image-2", "image,openai,geek2api"],
                ["15", "seedance-nsfw", "video,seedance"],
                ["16", "internal-image2-stable-v1", "image,openai"],
            ]

        self.module.mysql = fake_mysql

        profiles = self.module.model_lists()

        self.assertEqual(
            profiles["codex"],
            [
                "gpt-5.5",
                "gpt-5.4",
                "gpt-5.4-mini",
                "gpt-5.6-luna",
                "gpt-5.6-terra",
                "gpt-5.6-sol",
                "gpt-5.5-openai-compact",
                "codex-auto-review",
                "image 2电商商品图快速通道(1.5K)",
            ],
        )
        self.assertNotIn("gpt-5.3-codex-spark", profiles["codex"])
        self.assertNotIn("gpt-5.3-spark", profiles["codex"])
        self.assertNotIn("gpt-5.4-openai-compact", profiles["codex"])
        self.assertIn("codex-auto-review", profiles["codex"])
        self.assertNotIn("gpt-image-2-4K", profiles["codex"])
        self.assertNotIn("特价 image-2", profiles["image"])
        self.assertIn("官转image 2稳定", profiles["image"])
        self.assertNotIn("geek2api-image-2", profiles["image"])
        self.assertNotIn("internal-image2-stable-v1", profiles["image"])
        self.assertNotIn("seedance-nsfw", profiles["video"])

    def test_model_lists_adds_discount_image2_only_after_publish(self) -> None:
        self.module.grok15_1080_video_release_state = lambda: "unavailable"
        self.module.discount_image2_release_state = lambda: "published"
        self.module.mysql = lambda query: (
            [["1", "internal-image2-discount-v2", "image,openai,internal-hidden"]]
            if "FROM models" in query
            else []
        )

        profiles = self.module.model_lists()

        self.assertIn("特价 image-2", profiles["image"])
        self.assertNotIn("internal-image2-discount-v2", profiles["image"])

    def test_disabled_image2_ability_pairs_are_not_synced(self) -> None:
        self.assertTrue(self.module.is_disabled_ability_pair("12", "gpt-image-2-4K"))
        self.assertTrue(self.module.is_disabled_ability_pair("21", "gpt-image-2"))
        self.assertFalse(self.module.is_disabled_ability_pair("8", "gpt-image-2-4K"))

    def test_sync_abilities_allows_primary_discount_image2_model(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [["27", "geek2api-image-2,custom-geek2api-leak,image 2电商商品图快速通道(1.5K)", "0", "100", "test", "default"]]
            if "SELECT model_name FROM models" in query:
                return [["geek2api-image-2"], ["custom-geek2api-leak"], ["image 2电商商品图快速通道(1.5K)"]]
            return []

        self.module.active_groups = lambda: ["default"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("geek2api-image-2", sql)
        self.assertIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("custom-geek2api-leak", sql)

    def test_sync_abilities_keeps_discount_channel_isolated(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [
                    ["31", "gpt-5.5", "30", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAGS[0], "discount"],
                    ["32", "gpt-5.5", "20", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAGS[1], "discount"],
                    ["33", "gpt-5.5", "10", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAGS[2], "discount"],
                    ["21", "gpt-5.5", "0", "100", "stable", "default,internal"],
                    ["7", "grok-video-super-720p", "15", "100", "xingren-grok-video", "default,internal"],
                ]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"], ["grok-video-super-720p"]]
            return []

        self.module.active_groups = lambda: ["default", "internal", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        for channel_id, tag in zip(("31", "32", "33"), self.module.DISCOUNT_TEXT_CHANNEL_TAGS):
            self.assertIn("SELECT 'discount', 'gpt-5.5', " + channel_id, sql)
            self.assertNotIn("'default', 'gpt-5.5', " + channel_id, sql)
            self.assertIn("COALESCE(current_channel.tag, '') = '" + tag + "'", sql)
        self.assertNotIn("'discount', 'gpt-5.5', 21", sql)
        self.assertIn("'default', 'gpt-5.5', 21", sql)
        self.assertIn("'internal', 'gpt-5.5', 21", sql)
        self.assertIn("'default', 'grok-video-super-720p', 7", sql)
        self.assertIn("'internal', 'grok-video-super-720p', 7", sql)
        self.assertNotIn("'discount', 'grok-video-super-720p', 7", sql)
        self.assertIn("FIND_IN_SET(ability.model", sql)
        self.assertNotIn("INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES", sql)
        self.assertIn("FROM channels AS current_channel", sql)
        self.assertIn("current_channel.id = 31", sql)
        self.assertIn("current_channel.status = 1", sql)
        self.assertIn("REPLACE(COALESCE(current_channel.`group`, ''), ' ', '') = 'discount'", sql)
        self.assertIn(
            "FIND_IN_SET('gpt-5.5', REPLACE(COALESCE(current_channel.models, ''), ' ', '')) > 0",
            sql,
        )
        self.assertIn("REGEXP BINARY", sql)
        self.assertGreater(sql.index("UPDATE abilities SET enabled = 0"), sql.rindex("ON DUPLICATE KEY UPDATE"))
        discount_insert = next(
            statement
            for statement in sql.splitlines()
            if "SELECT 'discount', 'gpt-5.5', 31" in statement
        )
        self.assertNotIn("enabled = 1", discount_insert.split("ON DUPLICATE KEY UPDATE", 1)[1])

    def test_sync_abilities_keeps_special_channels_isolated(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                special_models = ",".join(self.module.SPECIAL_TEXT_ALLOWED_MODELS)
                return [
                    ["61", special_models, "40", "100", self.module.SPECIAL_TEXT_CHANNEL_TAGS[0], "special"],
                    ["21", "gpt-5.5", "0", "100", "stable", "default"],
                ]
            if "SELECT model_name FROM models" in query:
                return [[model] for model in self.module.SPECIAL_TEXT_ALLOWED_MODELS]
            return []

        self.module.active_groups = lambda: ["default", "special"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        for model in self.module.SPECIAL_TEXT_ALLOWED_MODELS:
            self.assertIn(f"SELECT 'special', '{model}', 61", sql)
        self.assertNotIn("SELECT 'default', 'gpt-5.5', 61", sql)
        self.assertNotIn("SELECT 'special', 'gpt-5.5', 21", sql)
        self.assertIn("SELECT 'default', 'gpt-5.5', 21", sql)
        special_insert = next(
            statement
            for statement in sql.splitlines()
            if "SELECT 'special', 'gpt-5.5', 61" in statement
        )
        self.assertNotIn("enabled = 1", special_insert.split("ON DUPLICATE KEY UPDATE", 1)[1])

    def test_sync_abilities_rejects_special_channel_with_extra_model(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "61",
                    "gpt-5.5,gpt-5.7-preview",
                    "40",
                    "100",
                    self.module.SPECIAL_TEXT_CHANNEL_TAGS[0],
                    "special",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"], ["gpt-5.7-preview"]]
            return []

        self.module.active_groups = lambda: ["default", "special"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        with self.assertRaisesRegex(RuntimeError, "special group isolation violation"):
            self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET status = 2", sql)
        self.assertNotIn("SELECT 'special', 'gpt-5.5', 61", sql)
        self.assertNotIn("gpt-5.7-preview', 61", sql)

    def test_sync_abilities_keeps_managed_claude_channels_isolated(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [
                    [
                        "47",
                        "claude-opus-4-5-20251101,claude-sonnet-4-6",
                        "20",
                        "100",
                        "xingren-claude-pdhlzy-kiro-stable",
                        "kiro-stable",
                    ],
                    [
                        "50",
                        "claude-haiku-4-5-20251001,claude-sonnet-4-6",
                        "50",
                        "100",
                        "xingren-claude-geek2api-welfare",
                        "welfare",
                    ],
                    [
                        "51",
                        "claude-haiku-4-5-20251001,claude-sonnet-4-6",
                        "60",
                        "100",
                        "xingren-claude-pdhlzy-welfare",
                        "welfare-001",
                    ],
                ]
            if "SELECT model_name FROM models" in query:
                return [["claude-haiku-4-5-20251001"], ["claude-opus-4-5-20251101"], ["claude-sonnet-4-6"]]
            return []

        self.module.active_groups = lambda: [
            "default",
            "kiro",
            "kiro-stable",
            "claude-external",
            "welfare",
            "welfare-001",
        ]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("SELECT 'kiro-stable', 'claude-opus-4-5-20251101', 47", sql)
        self.assertIn("SELECT 'kiro-stable', 'claude-sonnet-4-6', 47", sql)
        self.assertNotIn("SELECT 'default', 'claude-sonnet-4-6', 47", sql)
        self.assertNotIn("SELECT 'kiro', 'claude-sonnet-4-6', 47", sql)
        self.assertIn("WHERE `group` = 'kiro-stable'", sql)
        self.assertIn("SELECT 'welfare', 'claude-haiku-4-5-20251001', 50", sql)
        self.assertIn("SELECT 'welfare', 'claude-sonnet-4-6', 50", sql)
        self.assertNotIn("SELECT 'default', 'claude-sonnet-4-6', 50", sql)
        self.assertIn("WHERE `group` = 'welfare'", sql)
        self.assertIn("SELECT 'welfare-001', 'claude-haiku-4-5-20251001', 51", sql)
        self.assertIn("SELECT 'welfare-001', 'claude-sonnet-4-6', 51", sql)
        self.assertNotIn("SELECT 'default', 'claude-sonnet-4-6', 51", sql)
        self.assertIn("WHERE `group` = 'welfare-001'", sql)
        managed_claude_insert = next(
            statement
            for statement in sql.splitlines()
            if "SELECT 'kiro-stable', 'claude-sonnet-4-6', 47" in statement
        )
        self.assertNotIn("current_channel.tag, '') NOT IN", managed_claude_insert)

    def test_sync_abilities_keeps_plus_channels_isolated_without_compact(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                plus_models = ",".join(self.module.PLUS_TEXT_ALLOWED_MODELS)
                return [
                    ["45", plus_models, "30", "100", self.module.PLUS_TEXT_CHANNEL_TAGS[0], "plus"],
                    ["41", plus_models, "20", "100", self.module.PLUS_TEXT_CHANNEL_TAGS[1], "plus"],
                    ["42", plus_models, "10", "100", self.module.PLUS_TEXT_CHANNEL_TAGS[2], "plus"],
                    ["21", "gpt-5.5,gpt-5.5-openai-compact,claude-sonnet-5", "0", "100", "stable", "default,internal"],
                ]
            if "SELECT model_name FROM models" in query:
                return [[model] for model in (*self.module.PLUS_TEXT_ALLOWED_MODELS, "gpt-5.5-openai-compact", "claude-sonnet-5")]
            return []

        self.module.active_groups = lambda: ["default", "internal", "plus"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        for channel_id, tag in zip(("45", "41", "42"), self.module.PLUS_TEXT_CHANNEL_TAGS):
            for model in self.module.PLUS_TEXT_ALLOWED_MODELS:
                self.assertIn(f"SELECT 'plus', '{model}', {channel_id}", sql)
            self.assertNotIn(f"'default', 'gpt-5.5', {channel_id}", sql)
            self.assertIn("COALESCE(current_channel.tag, '') = '" + tag + "'", sql)
        self.assertNotIn("'plus', 'gpt-5.5-openai-compact', 21", sql)
        self.assertNotIn("'plus', 'claude-sonnet-5', 21", sql)
        self.assertIn("'default', 'gpt-5.5-openai-compact', 21", sql)
        self.assertIn("'internal', 'claude-sonnet-5', 21", sql)
        self.assertIn("FIND_IN_SET('plus'", sql)
        self.assertIn("ability.model NOT IN", sql)
        plus_insert = next(
            statement
            for statement in sql.splitlines()
            if "SELECT 'plus', 'gpt-5.5', 41" in statement
        )
        self.assertNotIn("enabled = 1", plus_insert.split("ON DUPLICATE KEY UPDATE", 1)[1])

    def test_sync_abilities_rejects_plus_channel_with_compact(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "41",
                    "gpt-5.5,gpt-5.5-openai-compact",
                    "20",
                    "100",
                    self.module.PLUS_TEXT_CHANNEL_TAGS[0],
                    "plus",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"], ["gpt-5.5-openai-compact"]]
            return []

        self.module.active_groups = lambda: ["default", "plus"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        with self.assertRaisesRegex(RuntimeError, "Plus group isolation violation"):
            self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET status = 2 WHERE tag IN", sql)
        self.assertNotIn("SELECT 'plus', 'gpt-5.5', 41", sql)
        self.assertNotIn("SELECT 'plus', 'gpt-5.5-openai-compact', 41", sql)

    def test_ensure_public_video_models_restores_only_callable_models(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_public_video_models()

        sql = "\n".join(captured)
        for model in self.module.PUBLIC_VIDEO_MODELS:
            self.assertIn(model, sql)
        self.assertIn("status = 1", sql)
        self.assertIn("deleted_at = NULL", sql)
        self.assertNotIn("models = 'seedance-2.0-cl-mini'", sql)
        self.assertIn("models = 'seedance-2.0-ld-17'", sql)
        self.assertIn(
            "model_mapping = '{\"seedance-2.0-ld-17\":\"seedance-2.0-wc-b-720p\"}' WHERE id = 26",
            sql,
        )
        self.assertIn("models = 'seedance-sd2-fast-720p'", sql)
        self.assertIn("model_mapping = '{\"seedance-sd2-fast-720p\":\"sd2-fast-720p\"}'", sql)
        self.assertIn("models = 'grok-video-1.5'", sql)
        self.assertIn("model_mapping = '{\"grok-video-1.5\":\"grok-imagine-1.5-video\"}'", sql)
        self.assertIn("models = 'grok-video-1.5-1080p'", sql)
        self.assertIn("model_mapping = '{\"grok-video-1.5-1080p\":\"grok-imagine-video-1.5\"}'", sql)
        self.assertIn("UPDATE channels SET status = 2 WHERE id IN (5, 25)", sql)
        self.assertNotIn(
            "SET @public_video_model := 'seedance-2.0-wc-b-720p'",
            sql,
        )
        self.assertIn("'seedance-2.0'", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertNotIn("seedance-nsfw", sql)

    def test_sync_public_video_pricing_keeps_video_models_at_full_price(self) -> None:
        captured_options: dict[str, dict[str, float]] = {}
        self.module.parse_json_option = lambda key: {
            "ModelRatio": {
                "grok-video-super-720p": 0.05,
                "seedance-2.0-dj-fast": 0.05,
                "seedance-2.0-ld-17": 0.05,
            },
            "CompletionRatio": {
                "grok-video-super-720p": 0.05,
                "seedance-2.0-dj-fast": 0.05,
                "seedance-2.0-ld-17": 0.05,
            },
            "ModelPrice": {"seedance-2.0-cl-mini": 0.05},
        }[key].copy()
        self.module.option_value = lambda key: "7.3" if key == "USDExchangeRate" else ""
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})

        self.module.sync_public_video_pricing()

        self.assertEqual(
            captured_options["ModelPrice"]["grok-video-super-720p"],
            0.890410958904,
        )
        self.assertEqual(
            captured_options["ModelPrice"]["seedance-sd2-fast-720p"],
            0.034246575342,
        )
        self.assertEqual(
            captured_options["ModelPrice"]["seedance-2.0-ld-17"],
            0.887671232877,
        )
        self.assertEqual(
            captured_options["ModelPrice"]["grok-video-1.5"],
            0.027397260274,
        )
        self.assertEqual(
            captured_options["ModelPrice"]["grok-video-1.5-1080p"],
            0.054794520548,
        )
        for model in self.module.PUBLIC_VIDEO_FIXED_PRICES_CNY:
            self.assertNotIn(model, captured_options["ModelRatio"])
            self.assertNotIn(model, captured_options["CompletionRatio"])
        self.assertNotIn("seedance-2.0-cl-mini", captured_options["ModelPrice"])
        self.assertNotIn("seedance-2.0-dj-fast", captured_options["ModelPrice"])
        self.assertNotIn("seedance-2.0-cl-mini", captured_options["ModelPrice"])

    def test_sync_abilities_fails_closed_for_discount_channel_with_extra_model(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "31",
                    "gpt-5.5,gpt-5.7-preview",
                    "0",
                    "100",
                    self.module.DISCOUNT_TEXT_CHANNEL_TAGS[0],
                    "discount",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"], ["gpt-5.7-preview"]]
            return []

        self.module.active_groups = lambda: ["default", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        with self.assertRaisesRegex(RuntimeError, "discount group isolation violation"):
            self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET status = 2 WHERE tag IN", sql)
        for tag in self.module.DISCOUNT_TEXT_CHANNEL_TAGS:
            self.assertIn("'" + tag + "'", sql)
        self.assertIn("REGEXP BINARY", sql)
        self.assertNotIn("SELECT 'discount', 'gpt-5.5', 31", sql)
        self.assertNotIn("gpt-5.7-preview', 31", sql)

    def test_sync_abilities_rejects_misgrouped_discount_channel(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [["31", "gpt-5.5", "0", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAGS[0], "default"]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"]]
            return []

        self.module.active_groups = lambda: ["default", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        with self.assertRaisesRegex(RuntimeError, "discount group isolation violation"):
            self.module.sync_abilities()
        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET status = 2", sql)
        self.assertIn("WHERE status <> 1", sql)
        self.assertNotIn("'discount', 'gpt-5.5', 31", sql)

    def test_sync_abilities_disables_nonisolated_channel_using_discount_group(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [["21", "gpt-5.5", "0", "100", "stable", "default,discount"]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"]]
            return []

        self.module.active_groups = lambda: ["default", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        with self.assertRaisesRegex(RuntimeError, "disabled channel count: 1"):
            self.module.sync_abilities()
        sql = "\n".join(captured)
        self.assertIn("FIND_IN_SET('discount'", sql)
        self.assertNotIn("'default', 'gpt-5.5', 21", sql)
        self.assertNotIn("'discount', 'gpt-5.5', 21", sql)

    def test_primary_discount_image2_is_not_retired(self) -> None:
        self.assertFalse(self.module.is_retired_image_model("geek2api-image-2"))

    def test_ensure_discount_image2_backing_model_uses_public_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_discount_image2_backing_model()

        sql = "\n".join(captured)
        self.assertIn("geek2api-image-2", sql)
        self.assertIn("特价 image-2", sql)
        self.assertIn("1K ¥0.06、2K ¥0.09、4K ¥0.10", sql)
        self.assertNotIn("new.ddpapi.top", sql)
        self.assertIn('/v1/images/generations', sql)
        self.assertNotIn('/v1/images/edits', sql)

    def test_ensure_stable_image2_backing_model_uses_public_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_stable_image2_backing_model()

        sql = "\n".join(captured)
        self.assertIn("internal-image2-stable-v1", sql)
        self.assertIn("官转image 2稳定", sql)
        self.assertIn("¥0.135/张", sql)
        self.assertNotIn("smile-ai-studio", sql)
        self.assertIn('/v1/images/generations', sql)
        self.assertNotIn('/v1/images/edits', sql)

    def test_ensure_gemini_ddpapi_models_uses_public_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_gemini_ddpapi_image_models()

        sql = "\n".join(captured)
        for marker in ("gemini-3.1-flash-image", "gemini-3-pro-image", "¥0.10/张", "¥0.15/张"):
            self.assertIn(marker, sql)
        self.assertNotIn("new.ddpapi.top", sql)
        self.assertIn('/v1/images/generations', sql)
        self.assertIn('/v1/images/edits', sql)

    def test_sync_public_image_pricing_sets_fixed_cny_price(self) -> None:
        captured_options: dict[str, dict[str, float]] = {}
        self.module.parse_json_option = lambda key: {
            "ModelRatio": {"官转image 2稳定": 9.9, "grok-imagine-image": 8.8},
            "CompletionRatio": {"官转image 2稳定": 2.0, "grok-imagine-image": 3.0},
            "ModelPrice": {"gpt-image-2-4K": 0.01},
        }[key].copy()
        self.module.option_value = lambda key: "7.3" if key == "USDExchangeRate" else ""
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})

        self.module.sync_public_image_pricing()

        self.assertAlmostEqual(
            captured_options["ModelPrice"]["特价 image-2"],
            0.008219178082,
            places=12,
        )
        self.assertNotIn("特价 image-2", captured_options["ModelRatio"])
        self.assertNotIn("特价 image-2", captured_options["CompletionRatio"])
        self.assertAlmostEqual(
            captured_options["ModelPrice"]["官转image 2稳定"],
            0.018493150685,
            places=12,
        )
        self.assertNotIn("官转image 2稳定", captured_options["ModelRatio"])
        self.assertNotIn("官转image 2稳定", captured_options["CompletionRatio"])
        self.assertAlmostEqual(
            captured_options["ModelPrice"]["grok-imagine-image"],
            0.007534246575,
            places=12,
        )
        self.assertNotIn("grok-imagine-image", captured_options["ModelRatio"])
        self.assertNotIn("grok-imagine-image", captured_options["CompletionRatio"])
        self.assertAlmostEqual(
            captured_options["ModelPrice"]["gemini-3.1-flash-image"],
            0.013698630137,
            places=12,
        )
        self.assertAlmostEqual(
            captured_options["ModelPrice"]["gemini-3-pro-image"],
            0.020547945205,
            places=12,
        )
        for model in ("gemini-3.1-flash-image", "gemini-3-pro-image"):
            self.assertNotIn(model, captured_options["ModelRatio"])
            self.assertNotIn(model, captured_options["CompletionRatio"])

    def test_sync_grok_image_metadata_sets_verified_capability_description(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.sync_grok_image_metadata()

        sql = "\n".join(captured)
        self.assertIn("grok-imagine-image", sql)
        self.assertIn("实际仅返回约 1K", sql)
        self.assertNotIn("2K", sql)
        self.assertIn("仅支持文生图", sql)
        self.assertNotIn("图生图", sql)
        self.assertIn("¥0.055/张", sql)
        self.assertIn('/v1/images/generations', sql)
        self.assertNotIn('/v1/images/edits', sql)

    def test_sync_tokens_updates_all_managed_system_tokens_exactly(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append
        self.module.mysql = lambda query: [
            ["101", "admin-codex-key", "星人 Codex 文本令牌", "gpt-5.4", "1", "default"],
            ["102", "user-claude-key", "星人 Claude 高阶令牌", "", "0", "claude-external"],
            ["103", "user-image-key", "星人图像生成令牌", "gpt-image-2-4K", "1", "default"],
            ["104", "user-video-key", "星人视频生成令牌", "seedance-2.0-cl-mini", "1", "default"],
            ["105", "user-special-codex-key", "星人 Codex 文本令牌", "gpt-5.4,codex-auto-review", "1", "special"],
        ]
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_tokens(
            {
                "codex": [
                    "gpt-5.5",
                    "gpt-5.6-luna",
                    "gpt-5.6-terra",
                    "gpt-5.6-sol",
                    "codex-auto-review",
                    "image 2电商商品图快速通道(1.5K)",
                ],
                "claude": list(self.module.CLAUDE_ALLOWED_MODELS),
                "image": ["gpt-image-2-4K", "特价 image-2", "官转image 2稳定", "geek2api-image-2"],
                "video": ["seedance-2.0-cl-mini"],
            }
        )

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 4, "token_caches_deleted": 4})
        self.assertNotIn("user_id = 1", sql)
        self.assertIn("WHERE id = '101'", sql)
        self.assertIn("WHERE id = '102'", sql)
        self.assertIn("WHERE id = '103'", sql)
        self.assertNotIn("WHERE id = '104'", sql)
        self.assertIn("WHERE id = '105'", sql)
        self.assertIn("gpt-5.6-luna", sql)
        self.assertIn("gpt-5.6-terra", sql)
        self.assertIn("gpt-5.6-sol", sql)
        self.assertIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertIn("codex-auto-review", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertIn("官转image 2稳定", sql)
        self.assertIn("claude-haiku-4-5-20251001", sql)
        self.assertIn("claude-opus-4-5-20251101", sql)
        self.assertIn("claude-opus-5", sql)
        self.assertIn("`group` = 'kiro-stable'", sql)
        self.assertIn("claude-sonnet-4-5-20250929", sql)
        special_update = next(statement for statement in sql.splitlines() if "WHERE id = '105'" in statement)
        self.assertIn("model_limits = '" + self.module.SPECIAL_TEXT_MODEL_LIMITS + "'", special_update)
        self.assertNotIn("codex-auto-review", special_update)
        self.assertIn("CACHE:admin-codex-key,user-claude-key,user-image-key,user-special-codex-key", sql)

    def test_sync_user_codex_tokens_updates_non_admin_codex_tokens(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("user_id <> 1", query)
            self.assertIn("name LIKE '星人Codex %'", query)
            self.assertIn("'月卡专用 Key'", query)
            self.assertIn("'¥500 月卡专用'", query)
            self.assertIn("COALESCE(`key`, '')", query)
            self.assertNotIn("model_limits_enabled = 1", query)
            full_limits = (
                "gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.3-codex-spark,gpt-5.3-spark,gpt-5.4-openai-compact,codex-auto-review,"
                "gpt-5.5-openai-compact,codex-auto-review,image 2电商商品图快速通道(1.5K)"
            )
            return [
                ["101", "key-101", "gpt-5.5", "1", "default"],
                ["102", "key-102", "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,claude-opus-4-8,seedance-2.0-cl-mini", "1", "default"],
                ["103", "key-103", "gpt-5.5,image 2电商商品图快速通道(1.5K)", "1", "default"],
                ["104", "key-104", "", "0", "default"],
                ["105", "key-105", full_limits, "1", "default"],
                ["106", "key-106", "gpt-image-2-4K,gpt-5.5,gpt-5.4-mini,gpt-5.4,gpt-5.5-openai-compact", "1", "default"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_codex_tokens()

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 6, "token_caches_deleted": 6})
        self.assertIn("WHERE id = '101'", sql)
        self.assertIn("WHERE id = '102'", sql)
        self.assertIn("WHERE id = '103'", sql)
        self.assertIn("WHERE id = '104'", sql)
        self.assertIn("WHERE id = '105'", sql)
        self.assertIn("WHERE id = '106'", sql)
        self.assertIn("CACHE:key-101,key-102,key-103,key-104,key-105,key-106", sql)
        self.assertIn("model_limits_enabled = 1", sql)
        self.assertIn("gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,kimi-k3,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)", sql)
        self.assertIn("gpt-5.4-mini,gpt-5.5,gpt-5.4,gpt-5.6,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,kimi-k3,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("gpt-5.3-codex-spark", sql)
        self.assertNotIn("gpt-5.3-spark", sql)
        self.assertNotIn("gpt-5.4-openai-compact", sql)
        self.assertIn("codex-auto-review", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertNotIn("gpt-image-2-4K", sql)
        self.assertNotIn("claude-opus-4-8", sql)
        self.assertNotIn("seedance-2.0-cl-mini", sql)

    def test_sync_user_codex_tokens_leaves_unchanged_cache_intact(self) -> None:
        captured: list[str] = []
        exact_limits = ",".join(self.module.CODEX_ALLOWED_MODELS)
        self.module.mysql = lambda query: [["107", "key-107", exact_limits, "1", "default"]]
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_codex_tokens(
            {"codex": list(self.module.CODEX_ALLOWED_MODELS)}
        )

        self.assertEqual(result, {"tokens_rewritten": 0, "token_caches_deleted": 0})
        self.assertIn("CACHE:", captured)
        self.assertNotIn("key-107", captured[-1])

    def test_sync_user_codex_tokens_scopes_special_group_exactly(self) -> None:
        captured: list[str] = []
        self.module.mysql = lambda query: [[
            "108",
            "key-108",
            "gpt-5.4,gpt-5.5,codex-auto-review,image 2电商商品图快速通道(1.5K)",
            "1",
            "special",
        ]]
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_codex_tokens()

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 1, "token_caches_deleted": 1})
        self.assertIn("model_limits = '" + self.module.SPECIAL_TEXT_MODEL_LIMITS + "'", sql)
        self.assertNotIn("codex-auto-review", sql)
        self.assertNotIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertIn("CACHE:key-108", sql)

    def test_sync_user_claude_tokens_replaces_unrestricted_limits(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("LOWER(TRIM(COALESCE(name, ''))) = 'claude'", query)
            return [
                ["201", "key-201", "", "0", "", "1"],
                ["202", "key-202", "claude-opus-4-6", "1", "kiro-stable", "0"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_claude_tokens(
            {"claude": ["claude-opus-4-6", "claude-sonnet-5"]}
        )

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 2, "token_caches_deleted": 2})
        self.assertIn("WHERE id = '201'", sql)
        self.assertIn("WHERE id = '202'", sql)
        self.assertIn("model_limits_enabled = 1", sql)
        self.assertIn("claude-opus-4-6,claude-sonnet-5", sql)
        self.assertNotIn("`group` = 'claude-external'", sql)
        self.assertIn("`group` = 'kiro-stable'", sql)
        self.assertIn("cross_group_retry = 0", sql)
        self.assertIn("CACHE:key-201,key-202", sql)

    def test_claude_token_models_follow_verified_group_matrix(self) -> None:
        available = list(self.module.CLAUDE_ALLOWED_MODELS)

        kiro_models = self.module.claude_token_models_for_group(available, "kiro")
        stable_models = self.module.claude_token_models_for_group(available, "kiro-stable")
        external_models = self.module.claude_token_models_for_group(available, "claude-external")

        self.assertEqual(kiro_models, self.module.CLAUDE_KIRO_MODELS)
        self.assertEqual(stable_models, self.module.CLAUDE_ALLOWED_MODELS)
        self.assertEqual(external_models, self.module.CLAUDE_EXTERNAL_MODELS)
        self.assertIn("claude-sonnet-4-5-20250929", kiro_models)
        self.assertNotIn("claude-haiku-4-5-20251001", kiro_models)
        self.assertIn("claude-haiku-4-5-20251001", external_models)
        self.assertNotIn("claude-sonnet-4-5-20250929", external_models)
        self.assertIn("claude-opus-5", stable_models)
        self.assertNotIn("claude-opus-5", kiro_models)
        self.assertNotIn("claude-opus-5", external_models)

    def test_ensure_claude_opus5_stable_model_updates_only_verified_stable_channel(self) -> None:
        captured: list[str] = []
        option_updates: dict[str, dict[str, float]] = {}

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels WHERE tag" in query:
                return [["47", "claude-opus-4-8", '{"claude-opus-4-8":"claude-opus-4-8"}']]
            if "FROM options WHERE `key`" in query:
                return [["7.3"]]
            raise AssertionError(query)

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.parse_json_option = lambda _key: {}
        self.module.upsert_json_option = lambda key, values: option_updates.setdefault(key, values)
        self.module.usd_exchange_rate = lambda: self.module.Decimal("7.3")

        self.module.ensure_claude_opus5_stable_model()

        sql = "\n".join(captured)
        self.assertIn("WHERE id = '47'", sql)
        self.assertIn("claude-opus-5", sql)
        self.assertIn("xingren-claude-pdhlzy-kiro-stable", sql)
        self.assertNotIn("xingren-claude-pdhlzy-kiro'", sql)
        self.assertIn("Kiro 稳定版 0.22x", sql)
        self.assertIn("输入人民币 ¥1.1000/M Tokens", sql)
        self.assertIn("缓存写入人民币 ¥1.3750/M Tokens", sql)
        self.assertAlmostEqual(option_updates["ModelRatio"]["claude-opus-5"], 5 / 14.6)
        self.assertEqual(option_updates["CompletionRatio"]["claude-opus-5"], 5.0)
        self.assertEqual(option_updates["CacheRatio"]["claude-opus-5"], 0.1)
        self.assertEqual(option_updates["CreateCacheRatio"]["claude-opus-5"], 1.25)

    def test_sync_user_video_tokens_replaces_all_public_video_limits(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("name IN ('星人视频生成令牌')", query)
            self.assertIn("user_id <> 1", query)
            self.assertNotIn("Seedance 私测视频令牌", query)
            return [
                ["211", "key-211", "seedance-2.0-cl-mini,seedance-2.0", "1"],
                ["212", "key-212", "", "0"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_video_tokens(
            {
                "video": [
                    "grok-video-super-720p",
                    "seedance-2.0-ld-17",
                    "seedance-sd2-fast-720p",
                    "grok-video-1.5",
                    "grok-video-1.5-1080p",
                ]
            }
        )

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 2, "token_caches_deleted": 2})
        self.assertIn("WHERE id = '211'", sql)
        self.assertIn("WHERE id = '212'", sql)
        self.assertIn("model_limits_enabled = 1", sql)
        self.assertIn(
            "grok-video-super-720p,seedance-2.0-ld-17,seedance-sd2-fast-720p,grok-video-1.5,grok-video-1.5-1080p",
            sql,
        )
        self.assertNotIn("seedance-2.0'", sql)
        self.assertNotIn("seedance-nsfw", sql)
        self.assertIn("CACHE:key-211,key-212", sql)

    def test_sync_abilities_keeps_staged_grok1080_internal_only(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "44",
                    "grok-video-1.5-1080p",
                    "0",
                    "100",
                    "xingren-grok15-video-1080p",
                    "internal",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["grok-video-1.5-1080p"]]
            return []

        self.module.active_groups = lambda: ["default", "internal", "pro"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("SELECT 'internal', 'grok-video-1.5-1080p', 44", sql)
        self.assertNotIn("SELECT 'default', 'grok-video-1.5-1080p', 44", sql)
        self.assertNotIn("SELECT 'pro', 'grok-video-1.5-1080p', 44", sql)
        self.assertIn("ability.`group` <> 'internal'", sql)

    def test_sync_abilities_keeps_staged_discount_image2_internal_only(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "45",
                    "geek2api-image-2",
                    "0",
                    "100",
                    "geek2api-image2",
                    "internal",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["geek2api-image-2"]]
            return []

        self.module.active_groups = lambda: ["default", "internal", "pro"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("SELECT 'internal', 'geek2api-image-2', 45", sql)
        self.assertNotIn("SELECT 'default', 'geek2api-image-2', 45", sql)
        self.assertNotIn("SELECT 'pro', 'geek2api-image-2', 45", sql)
        self.assertIn("ability.`group` <> 'internal'", sql)

    def test_sync_abilities_publishes_discount_image2_to_public_groups(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "45",
                    "geek2api-image-2",
                    "0",
                    "100",
                    "geek2api-image2",
                    "default,standard,pro,code,internal",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["geek2api-image-2"]]
            return []

        self.module.active_groups = lambda: ["code", "default", "discount", "grok45", "internal", "pro", "standard"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        self.module.sync_abilities()

        sql = "\n".join(captured)
        for group in ("default", "standard", "pro", "code", "internal"):
            self.assertIn(f"SELECT '{group}', 'geek2api-image-2', 45", sql)
        self.assertNotIn("SELECT 'discount', 'geek2api-image-2', 45", sql)
        self.assertNotIn("SELECT 'grok45', 'geek2api-image-2', 45", sql)

    def test_sync_abilities_disables_invalid_discount_image2_channel(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "45",
                    "geek2api-image-2",
                    "0",
                    "100",
                    "geek2api-image2",
                    "default,internal",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["geek2api-image-2"]]
            return []

        self.module.active_groups = lambda: ["default", "internal"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        with self.assertRaisesRegex(RuntimeError, "invalid channel count: 1"):
            self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET status = 2", sql)
        self.assertNotIn("SELECT 'default', 'geek2api-image-2', 45", sql)
        self.assertNotIn("SELECT 'internal', 'geek2api-image-2', 45", sql)

    def test_sync_user_image_tokens_replaces_all_public_image_limits(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("name IN ('星人图像生成令牌')", query)
            self.assertNotIn("user_id = 1", query)
            return [
                ["221", "key-221", "gpt-image-2-4K", "1"],
                ["222", "key-222", "", "0"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_image_tokens(
            {
                "image": [
                    "gpt-image-2-4K",
                    "特价 image-2",
                    "官转image 2稳定",
                    "internal-image2-stable-v1",
                ]
            }
        )

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 2, "token_caches_deleted": 2})
        self.assertIn("gpt-image-2-4K,特价 image-2,官转image 2稳定", sql)
        self.assertNotIn("internal-image2-stable-v1", sql)
        self.assertIn("CACHE:key-221,key-222", sql)

    def test_sync_controlled_codex_alias_tokens_requires_backing_entitlement(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("status = 1", query)
            self.assertIn("model_limits_enabled = 1", query)
            self.assertIn("FIND_IN_SET('gpt-5.5'", query)
            return [
                ["301", "key-301", "gpt-5.5,gpt-5.4"],
                ["302", "key-302", "gpt-5.5,codex-auto-review"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_controlled_codex_alias_tokens()

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 1, "token_caches_deleted": 1})
        self.assertIn("model_limits = 'gpt-5.5,gpt-5.4,codex-auto-review'", sql)
        self.assertIn("WHERE id = '301' AND status = 1 AND model_limits_enabled = 1", sql)
        self.assertIn("FIND_IN_SET('gpt-5.5'", sql)
        self.assertIn("BINARY COALESCE(model_limits, '') = BINARY 'gpt-5.5,gpt-5.4'", sql)
        self.assertNotIn("WHERE id = '302'", sql)
        self.assertIn("CACHE:key-301", sql)

    def test_ensure_public_openai_text_models_uses_public_chat_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_public_openai_text_models()

        sql = "\n".join(captured)
        for model in ["gpt-5.4", "gpt-5.5", "gpt-5.6", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]:
            self.assertIn(model, sql)
        self.assertIn("text,openai,codex", sql)
        self.assertIn('{"openai":"/v1/chat/completions"}', sql)
        self.assertIn("Codex 自动审批审查模型", sql)
        self.assertIn("text,codex,approval", sql)
        self.assertIn('{"openai-response":"/v1/responses"}', sql)
        self.assertIn("vendor_id = 1", sql)

    def test_sync_public_openai_text_pricing_sets_ratio_and_tiered_prices(self) -> None:
        captured_options: dict[str, dict[str, float] | dict[str, str]] = {}
        self.module.parse_json_option = lambda _key: {}
        self.module.parse_json_string_option = lambda _key: {}
        self.module.option_value = lambda key: "7.3" if key == "USDExchangeRate" else ""
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.upsert_json_string_option = lambda key, values: captured_options.update({key: values})

        self.module.sync_public_openai_text_pricing()

        expected_model_ratios = {
            "gpt-5.4": 0.162739726027,
            "gpt-5.5": 0.369863013699,
            "gpt-5.6": 0.342465753425,
            "gpt-5.6-luna": 0.068493150685,
            "gpt-5.6-terra": 0.171232876712,
            "gpt-5.6-sol": 0.342465753425,
        }
        expected_completion_ratios = {
            "gpt-5.4": 6.136363636364,
            "gpt-5.5": 6.0,
            "gpt-5.6": 6.0,
            "gpt-5.6-luna": 6.0,
            "gpt-5.6-terra": 6.0,
            "gpt-5.6-sol": 6.0,
        }
        for model, ratio in expected_model_ratios.items():
            self.assertEqual(captured_options["ModelRatio"][model], ratio)
            self.assertEqual(captured_options["CompletionRatio"][model], expected_completion_ratios[model])
            self.assertEqual(captured_options["CacheRatio"][model], 0.1)
            self.assertEqual(captured_options["CreateCacheRatio"][model], 1.25)
            self.assertNotIn(model, captured_options["ModelPrice"])
            self.assertEqual(captured_options["billing_setting.billing_mode"][model], "tiered_expr")

        for option_name in (
            "ModelRatio",
            "CompletionRatio",
            "CacheRatio",
            "CreateCacheRatio",
            "billing_setting.billing_mode",
            "billing_setting.billing_expr",
        ):
            self.assertEqual(
                captured_options[option_name]["codex-auto-review"],
                captured_options[option_name]["gpt-5.5"],
            )

        gpt54_expr = captured_options["billing_setting.billing_expr"]["gpt-5.4"]
        gpt55_expr = captured_options["billing_setting.billing_expr"]["gpt-5.5"]
        gpt56_expr = captured_options["billing_setting.billing_expr"]["gpt-5.6"]
        luna_expr = captured_options["billing_setting.billing_expr"]["gpt-5.6-luna"]
        terra_expr = captured_options["billing_setting.billing_expr"]["gpt-5.6-terra"]
        sol_expr = captured_options["billing_setting.billing_expr"]["gpt-5.6-sol"]

        for expr in [gpt54_expr, gpt55_expr, gpt56_expr, luna_expr, terra_expr, sol_expr]:
            self.assertIn("len <= 272000", expr)
            self.assertIn('tier("base"', expr)
            self.assertIn('tier("longcontext"', expr)

        self.assertIn("p * 0.325479452055", gpt54_expr)
        self.assertIn("c * 1.997260273973", gpt54_expr)
        self.assertIn("cr * 0.032547945205", gpt54_expr)
        self.assertIn("cc * 0.406849315068", gpt54_expr)
        self.assertIn("p * 0.65095890411", gpt54_expr)
        self.assertIn("c * 2.995890410959", gpt54_expr)
        self.assertIn("cr * 0.065095890411", gpt54_expr)
        self.assertIn("cc * 0.813698630137", gpt54_expr)

        self.assertIn("p * 0.739726027397", gpt55_expr)
        self.assertIn("c * 4.438356164384", gpt55_expr)
        self.assertIn("cr * 0.07397260274", gpt55_expr)
        self.assertIn("cc * 0.924657534247", gpt55_expr)
        self.assertIn("p * 1.479452054795", gpt55_expr)
        self.assertIn("c * 6.657534246575", gpt55_expr)

        self.assertEqual(gpt56_expr, sol_expr)
        self.assertIn("cr * 0.147945205479", gpt55_expr)
        self.assertIn("cc * 1.849315068493", gpt55_expr)

        self.assertIn("p * 0.13698630137", luna_expr)
        self.assertIn("c * 0.821917808219", luna_expr)
        self.assertIn("cr * 0.013698630137", luna_expr)
        self.assertIn("cc * 0.171232876712", luna_expr)
        self.assertIn("p * 0.27397260274", luna_expr)
        self.assertIn("c * 1.232876712329", luna_expr)

        self.assertIn("p * 0.342465753425", terra_expr)
        self.assertIn("c * 2.054794520548", terra_expr)
        self.assertIn("p * 0.684931506849", terra_expr)
        self.assertIn("c * 3.082191780822", terra_expr)

        self.assertIn("p * 0.684931506849", sol_expr)
        self.assertIn("c * 4.109589041096", sol_expr)
        self.assertIn("cr * 0.068493150685", sol_expr)
        self.assertIn("cc * 0.856164383562", sol_expr)
        self.assertIn("p * 1.369863013699", sol_expr)
        self.assertIn("c * 6.164383561644", sol_expr)
        self.assertIn("cr * 0.13698630137", sol_expr)
        self.assertIn("cc * 1.712328767123", sol_expr)

    def test_sync_supplier_safe_public_metadata_removes_supplier_price_keys(self) -> None:
        captured_options: dict[str, dict[str, float]] = {}
        captured_sql: list[str] = []

        def fake_parse_json_option(key: str) -> dict[str, float]:
            if key == "ModelPrice":
                return {
                    "geek2api-image-2": 0.1,
                    "gpt-image-2": 0.2,
                    "image 2电商商品图快速通道(1.5K)": 1500.0,
                }
            return {"gpt-5.5": 1.0}

        self.module.parse_json_option = fake_parse_json_option
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.mysql_exec = captured_sql.append

        result = self.module.sync_supplier_safe_public_metadata()

        self.assertEqual(result, {"pricing_options_sanitized": 1, "public_model_tags_synced": 1})
        self.assertNotIn("geek2api-image-2", captured_options["ModelPrice"])
        self.assertNotIn("gpt-image-2", captured_options["ModelPrice"])
        self.assertIn("image 2电商商品图快速通道(1.5K)", captured_options["ModelPrice"])
        sql = "\n".join(captured_sql)
        self.assertIn("image,openai,ecommerce,1.5k", sql)
        self.assertNotIn("dragtokens", sql)

    def test_retire_codex_text_models_disables_db_rows_and_token_limits(self) -> None:
        captured_sql: list[str] = []
        captured_options: dict[str, dict[str, float]] = {}
        captured_caches: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "COUNT(*) FROM models" in query:
                return [["2"]]
            if "COUNT(*) FROM abilities" in query:
                return [["7"]]
            if "FROM tokens" in query:
                self.assertIn("FIND_IN_SET('gpt-5.3-codex-spark'", query)
                self.assertIn("FIND_IN_SET('gpt-5.3-spark'", query)
                return [
                    ["201", "key-201", "gpt-5.5,gpt-5.3-codex-spark,codex-auto-review"],
                    ["202", "key-202", "gpt-5.3-spark,gpt-5.4,gpt-5.4-openai-compact"],
                ]
            return []

        def fake_parse_json_option(_key: str) -> dict[str, float]:
            return {
                "gpt-5.5": 1.0,
                "gpt-5.3-codex-spark": 2.0,
                "gpt-5.3-spark": 3.0,
                "gpt-5.4-openai-compact": 4.0,
                "codex-auto-review": 5.0,
            }

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured_sql.append
        self.module.parse_json_option = fake_parse_json_option
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.delete_token_caches = lambda keys: captured_caches.extend(keys) or len(keys)

        result = self.module.retire_codex_text_models()

        self.assertEqual(
            result,
            {
                "active_models_retired": 2,
                "abilities_disabled": 7,
                "pricing_options_sanitized": 5,
                "tokens_rewritten": 2,
                "token_caches_deleted": 2,
            },
        )
        for values in captured_options.values():
            self.assertEqual(values, {"gpt-5.5": 1.0, "codex-auto-review": 5.0})
        sql = "\n".join(captured_sql)
        self.assertIn("UPDATE models SET status = 0", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'gpt-5.5,codex-auto-review' WHERE id = '201'", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'gpt-5.4' WHERE id = '202'", sql)
        self.assertEqual(captured_caches, ["key-201", "key-202"])

    def test_retire_claude_models_keeps_only_allowed_models(self) -> None:
        captured_sql: list[str] = []
        captured_options: dict[str, dict[str, float]] = {}
        captured_caches: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "COUNT(*) FROM models" in query:
                return [["4"]]
            if "COUNT(*) FROM abilities" in query:
                return [["12"]]
            if "FROM tokens" in query:
                return [
                    ["301", "key-301", "claude-sonnet-5,claude-fable-5,claude-opus-4-8-fast"],
                    ["302", "key-302", "claude-opus-4-6,claude-sonnet-4-5-20250929"],
                ]
            if "FROM channels" in query:
                return [
                    [
                        "9",
                        "claude-sonnet-5,claude-fable-5,claude-opus-4-8-fast,claude-opus-4-8",
                        '{"claude-opus-4-8-fast":"claude-opus-4-8","custom":"target"}',
                    ],
                ]
            return []

        def fake_parse_json_option(_key: str) -> dict[str, float]:
            return {
                "claude-sonnet-5": 1.0,
                "claude-fable-5": 2.0,
                "claude-opus-4-8-fast": 3.0,
            }

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured_sql.append
        self.module.parse_json_option = fake_parse_json_option
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.delete_token_caches = lambda keys: captured_caches.extend(keys) or len(keys)

        result = self.module.retire_claude_models()

        self.assertEqual(result["active_models_retired"], 4)
        self.assertEqual(result["abilities_disabled"], 12)
        self.assertEqual(result["channel_models_removed"], 1)
        self.assertEqual(result["channel_mapping_removed"], 1)
        self.assertEqual(result["pricing_options_sanitized"], 5)
        self.assertEqual(result["tokens_rewritten"], 1)
        self.assertEqual(result["token_caches_deleted"], 1)
        for values in captured_options.values():
            self.assertEqual(values, {"claude-sonnet-5": 1.0, "claude-fable-5": 2.0})
        sql = "\n".join(captured_sql)
        self.assertIn("UPDATE models SET status = 0", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertIn("UPDATE channels SET models = 'claude-sonnet-5,claude-fable-5,claude-opus-4-8'", sql)
        self.assertIn("model_mapping = '{\"custom\":\"target\"}'", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'claude-sonnet-5,claude-fable-5' WHERE id = '301'", sql)
        self.assertNotIn("UPDATE tokens SET model_limits = 'claude-opus-4-6' WHERE id = '302'", sql)
        self.assertEqual(captured_caches, ["key-301"])

    def test_ensure_codex_text_channel_models_adds_openai_models_and_retires_spark_mapping(self) -> None:
        captured: list[str] = []
        self.module.mysql = lambda query: [[
            "gpt-5.5,gpt-5.4,gpt-5.3-codex-spark,gpt-5.4-openai-compact,codex-auto-review",
            '{"custom":"target","gpt-5.3-codex-spark":"gpt-5.3-spark"}',
        ]]
        self.module.mysql_exec = captured.append

        result = self.module.ensure_codex_text_channel_models()

        self.assertEqual(
            result,
            {"channel_found": 1, "models_updated": 1, "mapping_updated": 1, "models_retired": 2, "mapping_retired": 1},
        )
        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET models", sql)
        self.assertIn("gpt-5.5,gpt-5.4,codex-auto-review,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol", sql)
        self.assertNotIn("gpt-5.3-codex-spark", sql)
        self.assertNotIn("gpt-5.3-spark", sql)
        self.assertNotIn("gpt-5.4-openai-compact", sql)
        self.assertIn("codex-auto-review", sql)
        self.assertIn('"codex-auto-review":"gpt-5.5"', sql)
        self.assertIn('"custom":"target"', sql)
        self.assertIn("WHERE id = 21", sql)

    def test_ensure_codex_text_channel_models_preserves_existing_models_and_mapping(self) -> None:
        captured: list[str] = []
        self.module.mysql = lambda query: [[
            "gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,codex-auto-review",
            '{"codex-auto-review":"gpt-5.5","custom":"target"}'
        ]]
        self.module.mysql_exec = captured.append

        result = self.module.ensure_codex_text_channel_models()

        self.assertEqual(
            result,
            {"channel_found": 1, "models_updated": 0, "mapping_updated": 0, "models_retired": 0, "mapping_retired": 0},
        )
        self.assertEqual(captured, [])


if __name__ == "__main__":
    unittest.main()
