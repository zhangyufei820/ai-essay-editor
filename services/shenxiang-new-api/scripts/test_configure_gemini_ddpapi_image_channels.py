from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("configure_gemini_ddpapi_image_channels.py")


def load_module():
    scripts_dir = str(SCRIPT_PATH.parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    spec = importlib.util.spec_from_file_location("configure_gemini_ddpapi_image_channels", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_gemini_ddpapi_image_channels.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ConfigureGeminiDDPAPIImageChannelsTest(unittest.TestCase):
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
                return json.dumps({"data": [{"id": "gemini-3-pro-image"}]}).encode()

        opener = mock.Mock()
        opener.open.return_value = Response()
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener):
            models = self.module.fetch_upstream_models(
                self.module.EXPECTED_BASE_URL,
                "sk-test-key-12345678901234567890",
                "TEST_KEY",
            )

        self.assertEqual(models, {"gemini-3-pro-image"})
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://new.ddpapi.top/v1/models")
        self.assertIsNone(request.data)

    def test_build_stage_sql_is_internal_only_and_uses_separate_channels(self) -> None:
        self.module.permissions.sanitize_token_models = lambda models: list(models)
        api_keys = {
            "gemini-3.1-flash-image": "sk-flash-test-key-12345678901234567890",
            "gemini-3-pro-image": "sk-pro-test-key-1234567890123456789012",
        }
        sql = self.module.build_stage_sql(
            api_keys,
            self.module.EXPECTED_BASE_URL,
            {
                "ModelPrice": {"gemini-3.1-flash-image": 0.013698630137, "gemini-3-pro-image": 0.020547945205},
                "ModelRatio": {},
                "CompletionRatio": {},
            },
            "51",
            "banana-2",
        )

        self.assertIn("xingren-gemini31-flash-image-ddpapi", sql)
        self.assertIn("xingren-gemini3-pro-image-ddpapi", sql)
        self.assertIn("banana-2,gemini-3.1-flash-image,gemini-3-pro-image", sql)
        self.assertEqual(sql.count("'internal'"), 6)
        self.assertNotIn("default,standard,pro,code,internal", sql)

    def test_staging_prices_convert_cny_once(self) -> None:
        self.module.permissions.usd_exchange_rate = lambda: self.module.Decimal("7.3")
        self.module.option_map = lambda key: {
            "ModelPrice": {"other": 1.0},
            "ModelRatio": {"gemini-3.1-flash-image": 9.0},
            "CompletionRatio": {"gemini-3-pro-image": 2.0},
        }[key].copy()

        options = self.module.staging_price_options()

        self.assertAlmostEqual(options["ModelPrice"]["gemini-3.1-flash-image"], 0.013698630137, places=12)
        self.assertAlmostEqual(options["ModelPrice"]["gemini-3-pro-image"], 0.020547945205, places=12)
        self.assertNotIn("gemini-3.1-flash-image", options["ModelRatio"])
        self.assertNotIn("gemini-3-pro-image", options["CompletionRatio"])

    def test_publish_requires_stage_then_syncs_global_image_tokens(self) -> None:
        calls: list[str] = []
        self.module.validate_channel_isolation = lambda: calls.append("isolation")
        self.module.require_staged_channels_ready = lambda: calls.append("ready")
        self.module.permissions.mysql_exec = lambda sql: calls.append("sql:" + sql)
        self.module.permissions.gemini_ddpapi_release_state = lambda: "published"
        self.module.permissions.ensure_gemini_ddpapi_image_models = lambda: calls.append("models")
        self.module.permissions.sync_public_image_pricing = lambda: calls.append("pricing")
        self.module.permissions.model_lists = lambda: {"image": list(self.module.CHANNEL_CONFIGS)}
        self.module.permissions.sync_abilities = lambda: calls.append("abilities")
        self.module.permissions.sync_user_image_tokens = lambda _profiles: {"tokens_rewritten": 2, "token_caches_deleted": 2}

        result = self.module.publish()

        self.assertEqual(result, {"tokens_rewritten": 2, "token_caches_deleted": 2})
        self.assertEqual(calls[:2], ["isolation", "ready"])
        self.assertIn("default,standard,pro,code,internal", calls[2])
        self.assertEqual(calls[3:], ["models", "pricing", "abilities"])


if __name__ == "__main__":
    unittest.main()
