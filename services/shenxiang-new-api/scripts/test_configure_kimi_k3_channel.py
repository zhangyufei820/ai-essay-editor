from __future__ import annotations

import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_kimi_k3_channel.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_kimi_k3_channel", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load Kimi K3 channel module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigureKimiK3ChannelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_normalize_base_url_allows_only_expected_origin(self) -> None:
        self.assertEqual(self.module.normalize_base_url("https://www.geek2api.com/"), "https://www.geek2api.com")
        for value in ("http://www.geek2api.com", "https://www.geek2api.com/v1", "https://example.test"):
            with self.subTest(value=value):
                with self.assertRaises(self.module.ConfigurationError):
                    self.module.normalize_base_url(value)

    def test_verify_upstream_requires_exact_model_and_completion_shape(self) -> None:
        models = {"data": [{"id": "kimi-k3"}]}
        completion = {"choices": [{"message": {"role": "assistant", "content": "OK"}}]}
        with mock.patch.object(self.module, "fetch_json", side_effect=[models, completion]):
            self.module.verify_upstream("https://www.geek2api.com", "test-kimi-key-123456")

        with mock.patch.object(self.module, "fetch_json", return_value={"data": []}):
            with self.assertRaisesRegex(self.module.ConfigurationError, "required Kimi K3 model"):
                self.module.verify_upstream("https://www.geek2api.com", "test-kimi-key-123456")

    def test_apply_sql_uses_dedicated_default_channel_and_does_not_leak_key(self) -> None:
        secret = "test-kimi-key-123456"
        sql = self.module.build_apply_sql(secret, "https://www.geek2api.com")

        self.assertIn("'xingren-kimi-k3'", sql)
        self.assertIn("'default'", sql)
        self.assertIn("model = 'kimi-k3' AND channel_id <> @kimi_channel_id", sql)
        self.assertNotIn("grok45", sql)
        self.assertIn(secret, sql)

    def test_main_output_never_contains_credential(self) -> None:
        secret = "test-kimi-key-123456"
        stdout = io.StringIO()
        with mock.patch.dict(self.module.os.environ, {self.module.UPSTREAM_KEY_ENV: secret}), mock.patch.object(
            self.module, "verify_upstream"
        ), mock.patch.object(self.module, "apply_channel"), mock.patch.object(
            sys, "argv", [str(MODULE_PATH), "--apply"]
        ), mock.patch.object(self.module, "channel_lock") as lock, mock.patch("sys.stdout", stdout):
            lock.return_value.__enter__.return_value = None
            lock.return_value.__exit__.return_value = None
            self.assertEqual(self.module.main(), 0)

        self.assertEqual(json.loads(stdout.getvalue())["action"], "applied")
        self.assertNotIn(secret, stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
