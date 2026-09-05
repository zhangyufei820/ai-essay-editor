from __future__ import annotations

import importlib.util
import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_gpt6_astra_channel.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_gpt6_astra_channel", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load GPT-6 Astra channel module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigureGpt6AstraChannelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_normalize_base_url_allows_only_expected_origin(self) -> None:
        self.assertEqual(self.module.normalize_base_url("https://aihub.top/"), "https://aihub.top")
        for value in ("http://aihub.top", "https://aihub.top/v1", "https://example.test"):
            with self.subTest(value=value):
                with self.assertRaises(self.module.ConfigurationError):
                    self.module.normalize_base_url(value)

    def test_verify_upstream_requires_models_responses_and_chat(self) -> None:
        models = {"data": [{"id": "gpt-6-astra"}]}
        response = {"status": "completed", "output": [{"content": [{"type": "output_text", "text": "OK"}]}]}
        completion = {"choices": [{"message": {"role": "assistant", "content": "OK"}}]}
        with mock.patch.object(self.module, "fetch_json", side_effect=[models, response, completion]):
            self.module.verify_upstream("https://aihub.top", "test-astra-key-123456")

        with mock.patch.object(self.module, "fetch_json", return_value={"data": []}):
            with self.assertRaisesRegex(self.module.ConfigurationError, "required GPT-6 Astra model"):
                self.module.verify_upstream("https://aihub.top", "test-astra-key-123456")

    def test_fetch_json_retries_transient_rate_limit(self) -> None:
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"data":[]}'
        opener = mock.MagicMock()
        opener.open.side_effect = [
            urllib.error.HTTPError("https://aihub.top/v1/models", 429, "rate limited", {}, None),
            response,
        ]
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener), mock.patch.object(
            self.module.time, "sleep"
        ) as sleep:
            payload = self.module.fetch_json("https://aihub.top/v1/models", "test-astra-key-123456")

        self.assertEqual(payload, {"data": []})
        sleep.assert_called_once_with(1)

    def test_apply_sql_uses_isolated_channel_and_disables_duplicates(self) -> None:
        secret = "test-astra-key-123456"
        sql = self.module.build_apply_sql(secret, "https://aihub.top")

        self.assertIn("'xingren-gpt6-astra'", sql)
        self.assertIn("'astra'", sql)
        self.assertIn("model = 'gpt-6-astra' AND channel_id <> @astra_channel_id", sql)
        self.assertIn("id <> @astra_channel_id AND FIND_IN_SET('gpt-6-astra'", sql)
        self.assertIn("channel_id = @astra_channel_id AND model <> 'gpt-6-astra'", sql)
        self.assertNotIn("channel_id = @astra_channel_id;", sql)
        self.assertNotIn("kimi", sql.lower())
        self.assertIn(secret, sql)

    def test_main_output_never_contains_credential(self) -> None:
        secret = "test-astra-key-123456"
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
