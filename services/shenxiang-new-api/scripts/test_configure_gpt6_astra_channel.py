from __future__ import annotations

import importlib.util
import json
import sys
import unittest
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

    def test_managed_groups_are_independent(self) -> None:
        self.assertEqual(len(self.module.MANAGED_GROUPS), 8)
        self.assertEqual(len(self.module.managed_tags()), 32)
        self.assertEqual(len(set(self.module.managed_tags())), 32)
        self.assertEqual(self.module.managed_tag("discount", 0), "xingren-gpt6-astra-discount-1")

    def test_probe_source_requires_responses_and_chat_completion(self) -> None:
        source = self.module.SourceChannel("source-a", "test-astra-key-123456", "https://aihub.top", 69)
        models = {"data": [{"id": "gpt-6-astra"}]}
        response = {"status": "completed", "output": [{"content": [{"text": "OK"}]}]}
        completion = {"choices": [{"message": {"content": "OK"}}]}
        with mock.patch.object(self.module, "fetch_json", side_effect=[models, response, completion]):
            result = self.module.probe_source(source)
        self.assertEqual(result["tag"], "source-a")
        self.assertTrue(result["responses"])
        self.assertTrue(result["chat"])

    def test_apply_sql_has_exact_group_and_tag_for_each_chain_entry(self) -> None:
        source = self.module.SourceChannel("source-a", "test-astra-key-123456", "https://aihub.top", 69)
        sql = self.module.build_apply_sql((source,))
        for group in self.module.MANAGED_GROUPS:
            tag = self.module.managed_tag(group, 0)
            self.assertIn(f"{group} 链路 A", sql)
            self.assertIn(f"'{tag}'", sql)
            self.assertIn(f"'{group}'", sql)
        self.assertIn("UPDATE channels SET status=2 WHERE tag='xingren-gpt6-astra'", sql)
        self.assertIn("UPDATE abilities SET enabled=0 WHERE model='gpt-6-astra'", sql)
        self.assertNotIn("'astra'", sql)

    def test_probe_output_does_not_include_credentials(self) -> None:
        secret = "test-astra-key-123456"
        source = self.module.SourceChannel("source-a", secret, "https://aihub.top", 69)
        models = {"data": [{"id": "gpt-6-astra"}]}
        response = {"status": "completed", "output": [{"content": [{"text": "OK"}]}]}
        completion = {"choices": [{"message": {"content": "OK"}}]}
        with mock.patch.object(self.module, "fetch_json", side_effect=[models, response, completion]):
            result = self.module.probe_source(source)
        self.assertNotIn(secret, json.dumps(result))


if __name__ == "__main__":
    unittest.main()
