from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("configure_grok45_model.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_grok45_model", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_grok45_model.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class ConfigureGrok45ModelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def base_options(self) -> dict[str, str]:
        return {
            "GroupRatio": '{"default":1}',
            "UserUsableGroups": '{"default":"默认"}',
            "AutoGroups": '["default","grok45"]',
            "GroupGroupRatio": '{"vip":{"default":0.8,"grok45":0.2}}',
            "ModelRatio": '{"existing":1}',
            "CompletionRatio": '{"existing":2}',
            "CacheRatio": '{"existing":0.5}',
            "CreateCacheRatio": '{"grok-4.5":1.25}',
            "ModelPrice": '{"grok-4.5":9}',
            "billing_setting.billing_mode": '{"grok-4.5":"tiered_expr"}',
            "billing_setting.billing_expr": '{"grok-4.5":"unsafe"}',
        }

    def test_exact_model_is_required(self) -> None:
        self.module.require_exact_model({"grok-4.5"})
        with self.assertRaisesRegex(self.module.ConfigurationError, "required Grok model"):
            self.module.require_exact_model({"grok-4.5-preview"})

    def test_real_inference_is_required(self) -> None:
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(
            {
                "id": "chatcmpl-test",
                "choices": [{"message": {"role": "assistant", "content": "OK"}}],
            }
        ).encode("utf-8")
        opener = mock.MagicMock()
        opener.open.return_value = response
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener):
            self.module.require_upstream_inference(
                self.module.EXPECTED_UPSTREAM_BASE_URL,
                "fake-grok-key-for-unit-tests",
            )

        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, self.module.EXPECTED_UPSTREAM_BASE_URL + "/v1/chat/completions")
        self.assertEqual(json.loads(request.data)["model"], self.module.MODEL_NAME)

    def test_inference_probe_error_is_generic_and_secret_free(self) -> None:
        secret = "fake-grok-secret-for-inference-test"
        opener = mock.MagicMock()
        opener.open.side_effect = self.module.urllib.error.HTTPError(
            self.module.EXPECTED_UPSTREAM_BASE_URL + "/v1/chat/completions",
            502,
            "upstream error containing " + secret,
            {},
            None,
        )
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener):
            with self.assertRaises(self.module.ConfigurationError) as raised:
                self.module.require_upstream_inference(self.module.EXPECTED_UPSTREAM_BASE_URL, secret)

        self.assertEqual(str(raised.exception), "Grok inference probe returned HTTP 502")
        self.assertNotIn(secret, str(raised.exception))

    def test_inference_probe_rejects_empty_assistant_content(self) -> None:
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(
            {"choices": [{"message": {"role": "assistant", "content": ""}}]}
        ).encode("utf-8")
        opener = mock.MagicMock()
        opener.open.return_value = response
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener):
            with self.assertRaisesRegex(self.module.ConfigurationError, "verification prompt"):
                self.module.require_upstream_inference(
                    self.module.EXPECTED_UPSTREAM_BASE_URL,
                    "fake-grok-key-for-unit-tests",
                )

    def test_only_expected_https_origin_is_allowed(self) -> None:
        self.assertEqual(
            self.module.normalize_base_url(self.module.EXPECTED_UPSTREAM_BASE_URL + "/"),
            self.module.EXPECTED_UPSTREAM_BASE_URL,
        )
        for value in (
            "http://www.geek2api.com",
            "https://www.geek2api.com/v1",
            "https://www.geek2api.com:443",
            "https://user:pass@www.geek2api.com",
            "https://example.test",
        ):
            with self.subTest(value=value):
                with self.assertRaises(self.module.ConfigurationError):
                    self.module.normalize_base_url(value)

    def test_option_updates_encode_exact_rmb_prices_and_isolation(self) -> None:
        updates = self.module.build_option_updates(self.base_options(), Decimal("7.3"))

        model_ratio = json.loads(updates["ModelRatio"])[self.module.MODEL_NAME]
        self.assertAlmostEqual(model_ratio * 2 * 7.3, 2.0, places=9)
        self.assertEqual(json.loads(updates["CompletionRatio"])[self.module.MODEL_NAME], 3.0)
        self.assertEqual(json.loads(updates["CacheRatio"])[self.module.MODEL_NAME], 0.25)
        self.assertEqual(json.loads(updates["GroupRatio"])[self.module.PRICING_GROUP], 1)
        self.assertEqual(
            json.loads(updates["UserUsableGroups"])[self.module.PRICING_GROUP],
            self.module.PRICING_GROUP_DESCRIPTION,
        )
        self.assertNotIn(self.module.PRICING_GROUP, json.loads(updates["AutoGroups"]))
        self.assertNotIn(self.module.PRICING_GROUP, json.loads(updates["GroupGroupRatio"])["vip"])
        for key in (
            "CreateCacheRatio",
            "ModelPrice",
            "billing_setting.billing_mode",
            "billing_setting.billing_expr",
        ):
            self.assertNotIn(self.module.MODEL_NAME, json.loads(updates[key]))

    def test_apply_sql_keeps_model_and_abilities_in_dedicated_group(self) -> None:
        sql = self.module.build_apply_sql(
            "fake-grok-key-for-unit-tests",
            self.module.EXPECTED_UPSTREAM_BASE_URL,
            self.base_options(),
            Decimal("7.3"),
        )

        self.assertIn("`group` = 'grok45'", sql)
        self.assertIn("'grok45', 'grok-4.5', @grok_channel_id", sql)
        self.assertIn("model = 'grok-4.5' AND `group` <> 'grok45'", sql)
        self.assertIn("INSERT INTO vendors", sql)
        self.assertIn("vendor_id = @grok_vendor_id", sql)
        self.assertIn("'XAI'", sql)
        self.assertIn('openai-response', sql)
        self.assertNotIn("'default', 'grok-4.5'", sql)
        self.assertNotIn("INSERT INTO tokens", sql)
        self.assertNotIn("UPDATE tokens", sql)

    def test_reconcile_without_channel_needs_no_upstream_key(self) -> None:
        stdout = io.StringIO()
        with mock.patch.object(self.module, "load_existing_channel", return_value=None), mock.patch.object(
            sys, "argv", [str(MODULE_PATH), "--reconcile-if-configured"]
        ), contextlib.redirect_stdout(stdout):
            result = self.module.main()

        self.assertEqual(result, 0)
        self.assertEqual(json.loads(stdout.getvalue())["action"], "not_configured")

    def test_command_output_never_contains_the_credential(self) -> None:
        secret = "fake-grok-secret-for-unit-tests"
        stdout = io.StringIO()
        with mock.patch.dict(self.module.os.environ, {self.module.UPSTREAM_KEY_ENV: secret}), mock.patch.object(
            self.module, "fetch_upstream_models", return_value={self.module.MODEL_NAME}
        ), mock.patch.object(self.module, "require_upstream_inference"), mock.patch.object(
            self.module, "apply_grok45"
        ), mock.patch.object(
            sys, "argv", [str(MODULE_PATH), "--apply"]
        ), contextlib.redirect_stdout(stdout):
            result = self.module.main()

        self.assertEqual(result, 0)
        self.assertNotIn(secret, stdout.getvalue())

    def test_model_probe_redirects_are_disabled(self) -> None:
        handler = self.module.NoRedirectHandler()
        redirected = handler.redirect_request(
            self.module.urllib.request.Request(self.module.EXPECTED_UPSTREAM_BASE_URL + "/v1/models"),
            None,
            302,
            "Found",
            {},
            "https://example.test/v1/models",
        )
        self.assertIsNone(redirected)

    def test_model_sync_lock_rejects_concurrent_writer(self) -> None:
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(
            self.module, "MODEL_SYNC_LOCK_PATH", str(Path(directory) / "model-sync.lock")
        ), mock.patch.dict(self.module.os.environ, {}, clear=True):
            with self.module.model_sync_lock():
                with self.assertRaisesRegex(self.module.ConfigurationError, "already running"):
                    with self.module.model_sync_lock():
                        self.fail("concurrent lock unexpectedly acquired")

    def test_mysql_timeout_uses_generic_error_without_secret(self) -> None:
        secret = "fake-grok-secret-for-timeout-test"
        environment = {
            "MYSQL_ROOT_PASSWORD": "fake-database-password",
            "MYSQL_DATABASE": "new-api",
            self.module.UPSTREAM_KEY_ENV: secret,
        }
        with mock.patch.dict(self.module.os.environ, environment, clear=True), mock.patch.object(
            self.module.subprocess,
            "check_output",
            side_effect=self.module.subprocess.TimeoutExpired(["docker"], 15),
        ):
            with self.assertRaises(self.module.ConfigurationError) as raised:
                self.module.mysql("SELECT 1")

        self.assertEqual(str(raised.exception), "production MySQL query failed")
        self.assertNotIn(secret, str(raised.exception))


if __name__ == "__main__":
    unittest.main()
