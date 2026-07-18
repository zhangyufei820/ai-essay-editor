#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("configure_stable_image2_channel.py")


def load_module():
    spec = importlib.util.spec_from_file_location("configure_stable_image2_channel", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load configure_stable_image2_channel.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self, _limit: int) -> bytes:
        return b'{"data":[{"b64_json":"image-data"}]}'


class StableImage2ChannelTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_module()

    def test_base_url_is_exactly_allowlisted(self) -> None:
        self.assertEqual(
            self.module.normalize_base_url("https://api.smile-ai-studio.com/"),
            "https://api.smile-ai-studio.com",
        )
        for value in (
            "http://api.smile-ai-studio.com",
            "https://api.smile-ai-studio.com/v1",
            "https://api.smile-ai-studio.com.evil.test",
        ):
            with self.assertRaises(self.module.ConfigurationError):
                self.module.normalize_base_url(value)

    def test_probe_uses_media_workshop_request_shape(self) -> None:
        opener = mock.Mock()
        opener.open.return_value = FakeResponse()
        with mock.patch.object(self.module.urllib.request, "build_opener", return_value=opener):
            self.module.require_upstream_image(
                self.module.EXPECTED_BASE_URL,
                "test-key-1234567890",
            )

        request = opener.open.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "gpt-image-2")
        self.assertEqual(payload["size"], "1024x1024")
        self.assertEqual(payload["resolution"], "1K")
        self.assertEqual(payload["quality"], "auto")
        self.assertEqual(payload["output_format"], "png")
        self.assertEqual(payload["n"], 1)

    def test_apply_sql_uses_hidden_model_and_public_safe_channel_metadata(self) -> None:
        sql = self.module.build_apply_sql(
            "test-key-1234567890",
            self.module.EXPECTED_BASE_URL,
        )

        self.assertIn("internal-image2-stable-v1", sql)
        self.assertIn('{"internal-image2-stable-v1":"gpt-image-2"}', sql)
        self.assertIn("xingren-stable-image2", sql)
        self.assertNotIn("官转image 2稳定", sql)

    def test_uniqueness_allows_same_endpoint_for_other_models(self) -> None:
        queries: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            queries.append(query)
            return [["0"]]

        self.module.mysql = fake_mysql

        self.module.validate_channel_uniqueness()

        self.assertEqual(len(queries), 2)
        self.assertIn("xingren-stable-image2", queries[0])
        self.assertIn("internal-image2-stable-v1", queries[1])
        self.assertNotIn("base_url", queries[1])

    def test_uniqueness_rejects_internal_model_on_another_channel(self) -> None:
        self.module.mysql = mock.Mock(side_effect=[[["0"]], [["1"]]])

        with self.assertRaisesRegex(
            self.module.ConfigurationError,
            "internal image model is already assigned",
        ):
            self.module.validate_channel_uniqueness()


if __name__ == "__main__":
    unittest.main()
