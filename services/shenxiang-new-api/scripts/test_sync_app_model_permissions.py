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
        raw = "gpt-5.5,gpt-image-2,gpt-image-2-4K,gpt-image-2,geek2api-image-2,gpt-5.3-codex-spark,gpt-5.3-spark"

        self.assertEqual(
            self.module.sanitize_model_limits(raw),
            "gpt-5.5,gpt-image-2-4K",
        )

    def test_codex_allowed_models_include_only_public_15k_image_model(self) -> None:
        self.assertIn("image 2电商商品图快速通道(1.5K)", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-luna", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-terra", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-sol", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.5-openai-compact", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.3-codex-spark", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.3-spark", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.4-openai-compact", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("codex-auto-review", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("geek2api-image-2", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-image-2-4K", self.module.CODEX_ALLOWED_MODELS)

    def test_ensure_codex_image_model_limits_adds_only_public_15k_image_model(self) -> None:
        raw = "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,banana-2,claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.4-mini,gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)",
        )

    def test_ensure_codex_image_model_limits_defaults_empty_to_text_and_image(self) -> None:
        raw = "claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)",
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
                "image 2电商商品图快速通道(1.5K)",
            ],
        )
        self.assertNotIn("gpt-5.3-codex-spark", profiles["codex"])
        self.assertNotIn("gpt-5.3-spark", profiles["codex"])
        self.assertNotIn("gpt-5.4-openai-compact", profiles["codex"])
        self.assertNotIn("codex-auto-review", profiles["codex"])
        self.assertNotIn("gpt-image-2-4K", profiles["codex"])
        self.assertIn("特价 image-2", profiles["image"])
        self.assertNotIn("geek2api-image-2", profiles["image"])

    def test_disabled_image2_ability_pairs_are_not_synced(self) -> None:
        self.assertTrue(self.module.is_disabled_ability_pair("12", "gpt-image-2-4K"))
        self.assertTrue(self.module.is_disabled_ability_pair("21", "gpt-image-2"))
        self.assertFalse(self.module.is_disabled_ability_pair("8", "gpt-image-2-4K"))

    def test_sync_abilities_allows_discount_image2_backing_model_only(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [["27", "geek2api-image-2,custom-geek2api-leak,image 2电商商品图快速通道(1.5K)", "0", "100", "test"]]
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

    def test_ensure_discount_image2_backing_model_uses_public_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_discount_image2_backing_model()

        sql = "\n".join(captured)
        self.assertIn("geek2api-image-2", sql)
        self.assertIn("特价 image-2", sql)
        self.assertIn("image,openai", sql)
        self.assertNotIn("image,openai,geek2api", sql)

    def test_sync_tokens_updates_admin_system_tokens_only(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append
        self.module.mysql = lambda query: [["admin-key-1"], ["admin-key-2"]]
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        self.module.sync_tokens(
            {
                "codex": [
                    "gpt-5.5",
                    "gpt-5.6-luna",
                    "gpt-5.6-terra",
                    "gpt-5.6-sol",
                    "image 2电商商品图快速通道(1.5K)",
                ],
                "claude": ["claude-opus-4-8"],
                "image": ["gpt-image-2-4K", "geek2api-image-2"],
                "video": ["seedance-2.0-cl-mini"],
            }
        )

        sql = "\n".join(captured)
        self.assertIn("AND user_id = 1", sql)
        self.assertEqual(sql.count("AND user_id = 1"), 5)
        self.assertIn("gpt-5.6-luna", sql)
        self.assertIn("gpt-5.6-terra", sql)
        self.assertIn("gpt-5.6-sol", sql)
        self.assertIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertIn("CACHE:admin-key-1,admin-key-2", sql)

    def test_sync_user_codex_tokens_updates_non_admin_codex_tokens(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("user_id <> 1", query)
            self.assertIn("name LIKE '星人Codex %'", query)
            self.assertIn("'月卡专用 Key'", query)
            self.assertIn("COALESCE(`key`, '')", query)
            self.assertNotIn("model_limits_enabled = 1", query)
            full_limits = (
                "gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.3-codex-spark,gpt-5.3-spark,gpt-5.4-openai-compact,codex-auto-review,"
                "gpt-5.5-openai-compact,codex-auto-review,image 2电商商品图快速通道(1.5K)"
            )
            return [
                ["101", "key-101", "gpt-5.5", "1"],
                ["102", "key-102", "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,claude-opus-4-8,seedance-2.0-cl-mini", "1"],
                ["103", "key-103", "gpt-5.5,image 2电商商品图快速通道(1.5K)", "1"],
                ["104", "key-104", "", "0"],
                ["105", "key-105", full_limits, "1"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_codex_tokens()

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 5, "token_caches_deleted": 5})
        self.assertIn("WHERE id = '101'", sql)
        self.assertIn("WHERE id = '102'", sql)
        self.assertIn("WHERE id = '103'", sql)
        self.assertIn("WHERE id = '104'", sql)
        self.assertIn("WHERE id = '105'", sql)
        self.assertIn("CACHE:key-101,key-102,key-103,key-104,key-105", sql)
        self.assertIn("model_limits_enabled = 1", sql)
        self.assertIn("gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)", sql)
        self.assertIn("gpt-5.4-mini,gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("gpt-5.3-codex-spark", sql)
        self.assertNotIn("gpt-5.3-spark", sql)
        self.assertNotIn("gpt-5.4-openai-compact", sql)
        self.assertNotIn("codex-auto-review", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertNotIn("gpt-image-2-4K", sql)
        self.assertNotIn("claude-opus-4-8", sql)
        self.assertNotIn("seedance-2.0-cl-mini", sql)

    def test_ensure_public_openai_text_models_uses_public_chat_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_public_openai_text_models()

        sql = "\n".join(captured)
        for model in ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]:
            self.assertIn(model, sql)
        self.assertIn("text,openai,codex", sql)
        self.assertIn('{"openai":"/v1/chat/completions"}', sql)
        self.assertIn("vendor_id = 1", sql)

    def test_sync_public_openai_text_pricing_sets_ratio_prices(self) -> None:
        captured_options: dict[str, dict[str, float]] = {}
        self.module.parse_json_option = lambda _key: {}
        self.module.option_value = lambda key: "7.3" if key == "USDExchangeRate" else ""
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})

        self.module.sync_public_openai_text_pricing()

        self.assertEqual(captured_options["ModelRatio"]["gpt-5.6-luna"], 0.068493150685)
        self.assertEqual(captured_options["ModelRatio"]["gpt-5.6-terra"], 0.171232876712)
        self.assertEqual(captured_options["ModelRatio"]["gpt-5.6-sol"], 0.342465753425)
        for model in ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]:
            self.assertEqual(captured_options["CompletionRatio"][model], 6.0)
            self.assertEqual(captured_options["CacheRatio"][model], 0.1)
            self.assertEqual(captured_options["CreateCacheRatio"][model], 1.25)
            self.assertNotIn(model, captured_options["ModelPrice"])

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
            self.assertEqual(values, {"gpt-5.5": 1.0})
        sql = "\n".join(captured_sql)
        self.assertIn("UPDATE models SET status = 0", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'gpt-5.5' WHERE id = '201'", sql)
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
        self.assertEqual(result["channel_models_removed"], 2)
        self.assertEqual(result["channel_mapping_removed"], 1)
        self.assertEqual(result["pricing_options_sanitized"], 5)
        self.assertEqual(result["tokens_rewritten"], 2)
        self.assertEqual(result["token_caches_deleted"], 2)
        for values in captured_options.values():
            self.assertEqual(values, {"claude-sonnet-5": 1.0})
        sql = "\n".join(captured_sql)
        self.assertIn("UPDATE models SET status = 0", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertIn("UPDATE channels SET models = 'claude-sonnet-5,claude-opus-4-8'", sql)
        self.assertIn("model_mapping = '{\"custom\":\"target\"}'", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'claude-sonnet-5' WHERE id = '301'", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'claude-opus-4-6' WHERE id = '302'", sql)
        self.assertEqual(captured_caches, ["key-301", "key-302"])

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
            {"channel_found": 1, "models_updated": 1, "mapping_updated": 1, "models_retired": 3, "mapping_retired": 1},
        )
        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET models", sql)
        self.assertIn("gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol", sql)
        self.assertNotIn("gpt-5.3-codex-spark", sql)
        self.assertNotIn("gpt-5.3-spark", sql)
        self.assertNotIn("gpt-5.4-openai-compact", sql)
        self.assertNotIn("codex-auto-review", sql)
        self.assertIn('"custom":"target"', sql)
        self.assertIn("WHERE id = 21", sql)

    def test_ensure_codex_text_channel_models_preserves_existing_models_and_mapping(self) -> None:
        captured: list[str] = []
        self.module.mysql = lambda query: [[
            "gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol",
            '{"custom":"target"}'
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
