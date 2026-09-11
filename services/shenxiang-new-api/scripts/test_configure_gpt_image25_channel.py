from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("configure_gpt_image25_channel.py")


def load_module():
    scripts_dir = str(SCRIPT_PATH.parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    spec = importlib.util.spec_from_file_location("configure_gpt_image25_channel", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_gpt_image25_channel.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ConfigureGPTImage25ChannelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_normalize_base_url_only_accepts_allowlisted_origin(self) -> None:
        self.assertEqual(self.module.normalize_base_url("https://moonapix.com/"), self.module.EXPECTED_BASE_URL)
        for value in (
            "http://moonapix.com",
            "https://moonapix.com/v1",
            "https://moonapix.com:8443",
            "https://user@moonapix.com",
            "https://example.com",
        ):
            with self.subTest(value=value):
                with self.assertRaises(self.module.ConfigurationError):
                    self.module.normalize_base_url(value)

    def test_fetch_upstream_models_is_read_only(self) -> None:
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit: int) -> bytes:
                return json.dumps({"data": [{"id": "gpt-image-2.5-flare"}]}).encode()

        opener = mock.Mock()
        opener.open.return_value = Response()
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener):
            models = self.module.fetch_upstream_models(
                self.module.EXPECTED_BASE_URL,
                "sk-test-key-12345678901234567890",
            )

        self.assertEqual(models, {"gpt-image-2.5-flare"})
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "https://moonapix.com/v1/models")
        self.assertIsNone(request.data)

    def test_build_stage_sql_is_internal_and_contains_both_models(self) -> None:
        self.module.permissions.sanitize_token_models = lambda models: list(models)
        sql = self.module.build_stage_sql(
            "sk-test-key-12345678901234567890",
            self.module.EXPECTED_BASE_URL,
            "51",
            "banana-2",
        )

        self.assertIn("gpt-image-2.5-flare,gpt-image-2.5-sunburst", sql)
        self.assertIn("xingren-gpt-image25", sql)
        self.assertIn("banana-2,gpt-image-2.5-flare,gpt-image-2.5-sunburst", sql)
        self.assertNotIn("default,standard,pro,code,internal", sql)

    def test_channel_remark_distinguishes_fast_and_precision_models(self) -> None:
        self.assertIn("Flare 快速生成", self.module.CHANNEL_REMARK)
        self.assertIn("Sunburst 精细编辑", self.module.CHANNEL_REMARK)
        self.assertIn("¥0.17/张", self.module.CHANNEL_REMARK)

    def test_publish_requires_stage_and_syncs_image_tokens(self) -> None:
        calls: list[str] = []
        self.module.validate_channel_isolation = lambda: calls.append("isolation")
        self.module.require_staged_channel_ready = lambda: calls.append("ready")
        self.module.permissions.mysql_exec = lambda sql: calls.append("sql:" + sql)
        self.module.permissions.gpt_image25_release_state = lambda: "published"
        self.module.permissions.ensure_gpt_image25_models = lambda: calls.append("models")
        self.module.permissions.sync_public_image_pricing = lambda: calls.append("pricing")
        self.module.permissions.model_lists = lambda: {"image": list(self.module.permissions.GPT_IMAGE25_MODELS)}
        self.module.permissions.sync_abilities = lambda: calls.append("abilities")
        self.module.permissions.sync_user_image_tokens = lambda _profiles: {"tokens_rewritten": 2}

        result = self.module.publish()

        self.assertEqual(result, {"tokens_rewritten": 2})
        self.assertEqual(calls[:2], ["isolation", "ready"])
        self.assertIn("default,standard,pro,code,internal", calls[2])
        self.assertEqual(calls[3:], ["models", "pricing", "abilities"])


if __name__ == "__main__":
    unittest.main()
