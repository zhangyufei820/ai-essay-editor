from __future__ import annotations

import importlib.util
import json
import os
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_grok46_model.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_grok46_model_test", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_grok46_model.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigureGrok46ModelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()
        self.options = {
            "GroupRatio": '{"default":1}',
            "UserUsableGroups": '{"default":"默认"}',
            "AutoGroups": '["default","grok45"]',
            "GroupGroupRatio": '{"vip":{"default":0.8,"grok45":0.2}}',
            "ModelRatio": '{"grok-4.5":9,"grok-4.6":11}',
            "CompletionRatio": '{"grok-4.5":8,"grok-4.6":12}',
            "CacheRatio": '{"grok-4.5":7,"grok-4.6":13}',
            "CreateCacheRatio": '{"grok-4.6":1.25}',
            "ModelPrice": '{"grok-4.6":9}',
            "billing_setting.billing_mode": '{"grok-4.6":"tiered_expr"}',
            "billing_setting.billing_expr": '{"grok-4.6":"unsafe"}',
        }

    def test_normalize_base_url_is_exact_and_https_only(self) -> None:
        self.assertEqual(self.module.EXPECTED_UPSTREAM_BASE_URL, self.module.normalize_base_url("https://wangwang.sbs/"))
        for invalid in (
            "http://wangwang.sbs",
            "https://wangwang.sbs/v1",
            "https://wangwang.sbs.evil.example",
            "https://user@wangwang.sbs",
        ):
            with self.subTest(invalid=invalid), self.assertRaises(self.module.ConfigurationError):
                self.module.normalize_base_url(invalid)

    def test_option_updates_copy_grok45_pricing_exactly(self) -> None:
        updates = self.module.build_option_updates(self.options, Decimal("7.3"))
        model_ratio = json.loads(updates["ModelRatio"])
        completion_ratio = json.loads(updates["CompletionRatio"])
        cache_ratio = json.loads(updates["CacheRatio"])

        self.assertEqual(model_ratio["grok-4.5"], model_ratio["grok-4.6"])
        self.assertEqual(completion_ratio["grok-4.5"], completion_ratio["grok-4.6"])
        self.assertEqual(cache_ratio["grok-4.5"], cache_ratio["grok-4.6"])
        self.assertEqual("Grok 文本专用通道", json.loads(updates["UserUsableGroups"])["grok45"])
        self.assertNotIn("grok-4.6", json.loads(updates["CreateCacheRatio"]))
        self.assertNotIn("grok-4.6", json.loads(updates["ModelPrice"]))
        self.assertNotIn("grok-4.6", json.loads(updates["billing_setting.billing_mode"]))
        self.assertNotIn("grok-4.6", json.loads(updates["billing_setting.billing_expr"]))

    def test_apply_sql_creates_isolated_model_marketplace_and_channel(self) -> None:
        sql = self.module.build_apply_sql(
            "test-grok46-key-123456789",
            self.module.EXPECTED_UPSTREAM_BASE_URL,
            self.options,
            Decimal("7.3"),
        )

        self.assertIn("'grok45', 'grok-4.6', @grok46_channel_id", sql)
        self.assertIn("'xingren-grok46-primary'", sql)
        self.assertIn("可生图像", sql)
        self.assertIn("可生视频", sql)
        self.assertIn("/v1/chat/completions", sql)
        self.assertIn("/v1/responses", sql)
        self.assertIn("UPDATE abilities SET enabled = 0 WHERE model = 'grok-4.6'", sql)
        self.assertNotIn("UPDATE abilities SET enabled = 0 WHERE model = 'grok-4.5'", sql)
        self.assertNotIn("'default', 'grok-4.6'", sql)

    def test_verify_upstream_requires_models_chat_and_responses_text(self) -> None:
        payloads = [
            {
                "data": [
                    {"id": "grok-4.6"},
                    {"id": "grok-imagine-image"},
                    {"id": "grok-imagine-video"},
                ]
            },
            {"choices": [{"message": {"content": "OK"}}]},
            {"output": [{"content": [{"type": "output_text", "text": "OK"}]}]},
        ]
        with mock.patch.object(self.module, "fetch_json", side_effect=payloads) as fetch_json:
            self.module.verify_upstream(self.module.EXPECTED_UPSTREAM_BASE_URL, "test-grok46-key-123456789")

        self.assertEqual(3, fetch_json.call_count)

    def test_verify_upstream_rejects_missing_media_model(self) -> None:
        with mock.patch.object(
            self.module,
            "fetch_json",
            return_value={"data": [{"id": "grok-4.6"}, {"id": "grok-imagine-image"}]},
        ):
            with self.assertRaisesRegex(self.module.ConfigurationError, "text or media model"):
                self.module.verify_upstream(self.module.EXPECTED_UPSTREAM_BASE_URL, "test-grok46-key-123456789")

    def test_validate_channel_isolation_rejects_duplicate_or_foreign_route(self) -> None:
        with mock.patch.object(self.module.grok45, "mysql", side_effect=[[['2']]]):
            with self.assertRaisesRegex(self.module.ConfigurationError, "multiple channels"):
                self.module.validate_channel_isolation()

        with mock.patch.object(self.module.grok45, "mysql", side_effect=[[['1']], [['1']]]):
            with self.assertRaisesRegex(self.module.ConfigurationError, "another Grok channel"):
                self.module.validate_channel_isolation()

    def test_reconcile_not_configured_does_not_probe(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(
            self.module, "model_sync_lock", return_value=mock.MagicMock(__enter__=lambda _: None, __exit__=lambda *_: None)
        ), mock.patch.object(self.module, "load_existing_channel", return_value=None), mock.patch.object(
            self.module, "verify_upstream"
        ) as verify_upstream, mock.patch.object(sys, "argv", [str(MODULE_PATH), "--reconcile-if-configured"]):
            self.assertEqual(0, self.module.main())

        verify_upstream.assert_not_called()


if __name__ == "__main__":
    unittest.main()
