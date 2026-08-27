from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("configure_gemini3_pro_image_primary.py")


def load_module():
    scripts_dir = str(SCRIPT_PATH.parent)
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    spec = importlib.util.spec_from_file_location("configure_gemini3_pro_image_primary", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_gemini3_pro_image_primary.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    def __init__(self, payload: dict[str, object]):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self, _limit: int) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class Gemini3ProImagePrimaryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_apply_sql_copies_original_credential_only_to_fallback(self) -> None:
        sql = self.module.build_apply_sql("test-key-1234567890")

        self.assertIn("FROM channels WHERE id = 18 AND @fallback_channel_id IS NULL", sql)
        self.assertIn("xingren-gemini3-pro-image-moonapix-fallback", sql)
        self.assertIn("priority = 16", sql)
        self.assertIn("priority = 0", sql)
        self.assertIn('{"gemini-3-pro-image-preview":"gemini-3-pro-image-preview"}', sql)
        self.assertEqual(sql.count("test-key-1234567890"), 1)

    def test_topology_requires_exactly_one_primary_and_one_or_zero_fallback(self) -> None:
        self.module.stable.mysql = mock.Mock(
            side_effect=[
                [[self.module.PRIMARY_CHANNEL_TAG, "1"]],
                [["0"]],
            ]
        )

        self.module.validate_channel_topology()

    def test_topology_rejects_unmanaged_model_channel(self) -> None:
        self.module.stable.mysql = mock.Mock(
            side_effect=[
                [[self.module.PRIMARY_CHANNEL_TAG, "1"]],
                [["1"]],
            ]
        )

        with self.assertRaisesRegex(self.module.ConfigurationError, "unmanaged"):
            self.module.validate_channel_topology()

    def test_async_probe_uses_media_workshop_shape_and_waits_for_url(self) -> None:
        opener = mock.Mock()
        opener.open.side_effect = [
            FakeResponse({"id": "task_1", "status": "submitted"}),
            FakeResponse({"id": "task_1", "status": "succeeded", "data": [{"url": "https://example.test/image.png"}]}),
        ]
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener), mock.patch.object(
            self.module.time, "sleep"
        ):
            self.module.require_upstream_image("test-key-1234567890")

        submit_request = opener.open.call_args_list[0].args[0]
        payload = json.loads(submit_request.data)
        self.assertEqual(payload["model"], self.module.UPSTREAM_MODEL)
        self.assertEqual(payload["size"], "16:9")
        self.assertEqual(payload["resolution"], "4K")
        self.assertEqual(payload["n"], 1)

    def test_apply_probes_before_copying_and_syncing(self) -> None:
        calls: list[str] = []
        self.module.require_upstream_key = lambda: "test-key-1234567890"
        self.module.require_upstream_image = lambda key: calls.append("probe")
        self.module.stable.model_sync_lock = mock.MagicMock()
        self.module.stable.model_sync_lock.return_value.__enter__.return_value = None
        self.module.stable.model_sync_lock.return_value.__exit__.return_value = None
        self.module.validate_channel_topology = lambda: calls.append("topology")
        self.module.stable.mysql_exec = lambda sql: calls.append("sql")
        self.module.permissions.sync_abilities = lambda: calls.append("abilities")
        self.module.validate_applied_topology = lambda: calls.append("verify")

        result = self.module.apply()

        self.assertEqual(result["action"], "applied")
        self.assertEqual(calls, ["probe", "topology", "sql", "abilities", "verify"])


if __name__ == "__main__":
    unittest.main()
