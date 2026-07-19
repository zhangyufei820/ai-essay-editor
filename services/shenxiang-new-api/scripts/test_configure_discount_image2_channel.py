from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("configure_discount_image2_channel.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_discount_image2_channel", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_discount_image2_channel.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ConfigureDiscountImage2ChannelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_normalize_base_url_only_accepts_allowlisted_origin(self) -> None:
        self.assertEqual(
            self.module.normalize_base_url("https://new.ddpapi.top/"),
            self.module.EXPECTED_BASE_URL,
        )
        for value in (
            "http://new.ddpapi.top",
            "https://new.ddpapi.top/v1",
            "https://new.ddpapi.top:8443",
            "https://user@new.ddpapi.top",
            "https://example.com",
        ):
            with self.subTest(value=value):
                with self.assertRaises(self.module.ConfigurationError):
                    self.module.normalize_base_url(value)

    def test_fetch_upstream_models_uses_models_endpoint_without_generation(self) -> None:
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit: int) -> bytes:
                return json.dumps({"data": [{"id": "gpt-image-2"}]}).encode()

        opener = mock.Mock()
        opener.open.return_value = Response()
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener):
            models = self.module.fetch_upstream_models(
                self.module.EXPECTED_BASE_URL,
                "sk-test-key-12345678901234567890",
            )

        self.assertEqual(models, {"gpt-image-2"})
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://new.ddpapi.top/v1/models")
        self.assertIsNone(request.data)

    def test_build_stage_sql_is_internal_only_and_preserves_legacy_channel(self) -> None:
        self.module.permissions.sanitize_token_models = lambda models: list(models)
        sql = self.module.build_stage_sql(
            "sk-test-key-12345678901234567890",
            self.module.EXPECTED_BASE_URL,
            {
                "ModelPrice": {"特价 image-2": 0.008219178082},
                "ModelRatio": {},
                "CompletionRatio": {},
            },
            "51",
            "gpt-image-2-4K",
        )

        self.assertIn("xingren-discount-image2-v2", sql)
        self.assertIn("internal-image2-discount-v2", sql)
        self.assertIn('{"internal-image2-discount-v2":"gpt-image-2"}', sql)
        self.assertIn("'internal', 'internal-image2-discount-v2', @managed_channel_id", sql)
        self.assertIn("gpt-image-2-4K,特价 image-2", sql)
        self.assertIn("AND user_id = 1", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertNotIn("default,standard,pro,code,internal", sql)

    def test_staging_price_options_converts_cny_once(self) -> None:
        self.module.permissions.usd_exchange_rate = lambda: self.module.Decimal("7.3")
        self.module.option_map = lambda key: {
            "ModelPrice": {"other": 1.0},
            "ModelRatio": {"特价 image-2": 9.0},
            "CompletionRatio": {"特价 image-2": 2.0},
        }[key].copy()

        options = self.module.staging_price_options()

        self.assertAlmostEqual(options["ModelPrice"]["特价 image-2"], 0.008219178082, places=12)
        self.assertNotIn("特价 image-2", options["ModelRatio"])
        self.assertNotIn("特价 image-2", options["CompletionRatio"])
        self.assertEqual(options["ModelPrice"]["other"], 1.0)

    def test_publish_requires_staged_state_then_syncs_non_admin_tokens(self) -> None:
        calls: list[str] = []
        self.module.validate_channel_isolation = lambda: calls.append("isolation")
        self.module.require_staged_channel_ready = lambda: calls.append("ready")
        self.module.permissions.mysql_exec = lambda sql: calls.append("publish:" + sql)
        self.module.permissions.discount_image2_release_state = lambda: "published"
        self.module.permissions.ensure_discount_image2_backing_model = lambda: calls.append("model")
        self.module.permissions.sync_public_image_pricing = lambda: calls.append("pricing")
        self.module.permissions.model_lists = lambda: {"image": ["特价 image-2"]}
        self.module.permissions.sync_abilities = lambda: calls.append("abilities")
        self.module.permissions.sync_user_image_tokens = lambda _profiles: {
            "tokens_rewritten": 2,
            "token_caches_deleted": 2,
        }

        result = self.module.publish()

        self.assertEqual(result, {"tokens_rewritten": 2, "token_caches_deleted": 2})
        self.assertEqual(calls[:2], ["isolation", "ready"])
        self.assertIn("default,standard,pro,code,internal", calls[2])
        self.assertEqual(calls[3:], ["model", "pricing", "abilities"])

    def test_publish_restores_internal_group_when_global_sync_fails(self) -> None:
        sql_calls: list[str] = []
        ability_calls = 0
        self.module.validate_channel_isolation = lambda: None
        self.module.require_staged_channel_ready = lambda: None
        self.module.permissions.mysql_exec = sql_calls.append
        self.module.permissions.discount_image2_release_state = lambda: "published"
        self.module.permissions.ensure_discount_image2_backing_model = lambda: None
        self.module.permissions.sync_public_image_pricing = lambda: None
        self.module.permissions.model_lists = lambda: {"image": ["特价 image-2"]}

        def sync_abilities() -> None:
            nonlocal ability_calls
            ability_calls += 1
            if ability_calls == 1:
                raise RuntimeError("sync failed")

        self.module.permissions.sync_abilities = sync_abilities

        with self.assertRaisesRegex(RuntimeError, "sync failed"):
            self.module.publish()

        self.assertEqual(ability_calls, 2)
        self.assertEqual(len(sql_calls), 2)
        self.assertIn("default,standard,pro,code,internal", sql_calls[0])
        self.assertIn("SET `group` = 'internal'", sql_calls[1])


if __name__ == "__main__":
    unittest.main()
