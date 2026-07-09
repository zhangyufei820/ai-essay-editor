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
        raw = "gpt-5.5,gpt-image-2,gpt-image-2-4K,gpt-image-2,geek2api-image-2"

        self.assertEqual(
            self.module.sanitize_model_limits(raw),
            "gpt-5.5,gpt-image-2-4K",
        )

    def test_codex_allowed_models_include_only_public_15k_image_model(self) -> None:
        self.assertIn("image 2电商商品图快速通道(1.5K)", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("geek2api-image-2", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-image-2-4K", self.module.CODEX_ALLOWED_MODELS)

    def test_ensure_codex_image_model_limits_adds_only_public_15k_image_model(self) -> None:
        raw = "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,banana-2,claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.4-mini,image 2电商商品图快速通道(1.5K)",
        )

    def test_ensure_codex_image_model_limits_defaults_empty_to_text_and_image(self) -> None:
        raw = "claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.5,image 2电商商品图快速通道(1.5K)",
        )

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
                ["4", "image 2电商商品图快速通道(1.5K)", "image,openai,ecommerce,1.5k,dragtokens"],
                ["5", "gpt-image-2-4K", "image,openai"],
                ["6", "geek2api-image-2", "image,openai,geek2api"],
            ]

        self.module.mysql = fake_mysql

        profiles = self.module.model_lists()

        self.assertEqual(
            profiles["codex"],
            ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "image 2电商商品图快速通道(1.5K)"],
        )
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

        self.module.sync_tokens(
            {
                "codex": ["gpt-5.5", "image 2电商商品图快速通道(1.5K)"],
                "claude": ["claude-opus-4-8"],
                "image": ["gpt-image-2-4K", "geek2api-image-2"],
                "video": ["seedance-2.0-cl-mini"],
            }
        )

        sql = "\n".join(captured)
        self.assertIn("AND user_id = 1", sql)
        self.assertEqual(sql.count("AND user_id = 1"), 5)
        self.assertIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("geek2api-image-2", sql)

    def test_sync_user_codex_tokens_updates_non_admin_codex_tokens(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("user_id <> 1", query)
            self.assertIn("name LIKE '星人Codex %'", query)
            self.assertNotIn("model_limits_enabled = 1", query)
            return [
                ["101", "gpt-5.5", "1"],
                ["102", "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,claude-opus-4-8,seedance-2.0-cl-mini", "1"],
                ["103", "gpt-5.5,image 2电商商品图快速通道(1.5K)", "1"],
                ["104", "", "0"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append

        result = self.module.sync_user_codex_tokens()

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 3})
        self.assertIn("WHERE id = '101'", sql)
        self.assertIn("WHERE id = '102'", sql)
        self.assertNotIn("WHERE id = '103'", sql)
        self.assertIn("WHERE id = '104'", sql)
        self.assertIn("model_limits_enabled = 1", sql)
        self.assertIn("gpt-5.5,image 2电商商品图快速通道(1.5K)", sql)
        self.assertIn("gpt-5.4-mini,image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertNotIn("gpt-image-2-4K", sql)
        self.assertNotIn("claude-opus-4-8", sql)
        self.assertNotIn("seedance-2.0-cl-mini", sql)

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


if __name__ == "__main__":
    unittest.main()
