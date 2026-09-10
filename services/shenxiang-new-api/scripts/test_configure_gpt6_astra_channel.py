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

    def test_public_groups_use_verified_order_without_reordering_legacy_groups(self) -> None:
        sources = tuple(
            self.module.SourceChannel(tag, "test-astra-key-123456", f"https://{index}.example", index)
            for index, tag in enumerate(self.module.SOURCE_CHANNEL_TAGS, start=1)
        )

        self.assertEqual(
            tuple(source.tag for source in self.module.sources_for_group("discount", sources)),
            (
                "xingren-plus-text-pdhlzy",
                "xingren-plus-text-wangwang",
                "xingren-discount-text-aihub",
                "xingren-gpt6-astra",
            ),
        )
        self.assertEqual(
            tuple(source.tag for source in self.module.sources_for_group("standard", sources)),
            self.module.SOURCE_CHANNEL_TAGS,
        )

    def test_probe_source_requires_responses_and_chat_completion(self) -> None:
        source = self.module.SourceChannel("source-a", "test-astra-key-123456", "https://aihub.top", 69)
        models = {"data": [{"id": "gpt-6-astra"}]}
        response = {"status": "completed", "output": [{"content": [{"text": "OK"}]}]}
        completion = {"choices": [{"message": {"content": "OK"}}]}
        with mock.patch.object(self.module, "fetch_json", side_effect=[models, completion]), mock.patch.object(self.module.provider_monitor, "request_responses", return_value={"ok": True}), mock.patch.object(self.module, "probe_discount_codex", return_value={"discount_healthy": False}):
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

    def test_partial_reconcile_enables_only_verified_source_routes(self) -> None:
        source_a = self.module.SourceChannel("source-a", "test-astra-key-123456", "https://a.example", 69)
        source_b = self.module.SourceChannel("source-b", "test-astra-key-654321", "https://b.example", 70)

        sql = self.module.build_apply_sql((source_a, source_b), {"source-b"})

        self.assertIn("status=2, name='GPT-6 Astra discount 链路 A'", sql)
        self.assertIn("status=1, name='GPT-6 Astra discount 链路 B'", sql)
        self.assertIn("'discount','gpt-6-astra',@astra_discount_1,0", sql)
        self.assertIn("'discount','gpt-6-astra',@astra_discount_2,1", sql)

    def test_probe_sources_keeps_verified_fallbacks_when_a_source_fails(self) -> None:
        source_a = self.module.SourceChannel("source-a", "test-astra-key-123456", "https://a.example", 69)
        source_b = self.module.SourceChannel("source-b", "test-astra-key-654321", "https://b.example", 70)
        verified = {"tag": "source-b", "channel_id": 70, "models": True, "responses": True, "chat": True}

        with mock.patch.object(
            self.module,
            "probe_source",
            side_effect=[self.module.ConfigurationError("timeout"), verified],
        ):
            results, unavailable = self.module.probe_sources((source_a, source_b))

        self.assertEqual(results, [verified])
        self.assertEqual(unavailable, ["source-a"])

    def test_probe_output_does_not_include_credentials(self) -> None:
        secret = "test-astra-key-123456"
        source = self.module.SourceChannel("source-a", secret, "https://aihub.top", 69)
        models = {"data": [{"id": "gpt-6-astra"}]}
        response = {"status": "completed", "output": [{"content": [{"text": "OK"}]}]}
        completion = {"choices": [{"message": {"content": "OK"}}]}
        with mock.patch.object(self.module, "fetch_json", side_effect=[models, completion]), mock.patch.object(self.module.provider_monitor, "request_responses", return_value={"ok": True}), mock.patch.object(self.module, "probe_discount_codex", return_value={"discount_healthy": False}):
            result = self.module.probe_source(source)
        self.assertNotIn(secret, json.dumps(result))

    def test_apply_rejects_duplicate_managed_tags_before_sql(self) -> None:
        with mock.patch.object(
            self.module,
            "validate_group_options",
        ), mock.patch.object(
            self.module,
            "sync",
        ) as sync_module:
            sync_module.mysql.return_value = [["xingren-gpt6-astra-default-1", "2"]]
            with self.assertRaisesRegex(self.module.ConfigurationError, "duplicated"):
                self.module.apply_sources(())
            sync_module.mysql_exec.assert_not_called()

    def test_same_origin_is_not_counted_as_two_enabled_fallbacks(self) -> None:
        sources = (
            self.module.SourceChannel("one", "test-key-123456789", "https://same.example", 1),
            self.module.SourceChannel("two", "test-key-987654321", "https://same.example", 2),
            self.module.SourceChannel("three", "test-key-333333333", "https://other.example", 3),
        )
        self.assertEqual(self.module.independent_enabled_sources(sources, {"one", "two", "three"}), {"one", "three"})

    def test_probe_rejects_stream_that_did_not_complete(self) -> None:
        source = self.module.SourceChannel("one", "test-key-123456789", "https://one.example", 1)
        with mock.patch.object(self.module, "fetch_json", side_effect=[{"data": [{"id": "gpt-6-astra"}]}, {"choices": [{"message": {"content": "OK"}}]}]), mock.patch.object(self.module.provider_monitor, "request_responses", return_value={"ok": False}):
            with self.assertRaises(self.module.ConfigurationError):
                self.module.probe_source(source)

    def policy_fixture(self):
        sources = tuple(self.module.SourceChannel(tag, "test-secret-key-123456", f"https://source-{i}.example", i)
                        for i, tag in enumerate(self.module.SOURCE_CHANNEL_TAGS, 1))
        reports = [{"tag": s.tag, "discount_healthy": True, "discount_ttft_ms": ms}
                   for s, ms in zip(sources, [9000, 1000, 5000, 3000])]
        return sources, reports

    def test_discount_pins_requested_primary_and_sorts_all_healthy_fallbacks(self):
        sources, reports = self.policy_fixture()
        priorities, healthy = self.module.discount_route_policy(sources, reports, {s.tag for s in sources})
        self.assertEqual(priorities, {"xingren-plus-text-wangwang": 40, "xingren-discount-text-aihub": 30,
                                     "xingren-plus-text-pdhlzy": 20, "xingren-gpt6-astra": 10})
        self.assertEqual(healthy, {s.tag for s in sources})

    def test_tool_unhealthy_only_disables_discount_not_other_groups(self):
        sources, reports = self.policy_fixture()
        reports[1]["discount_healthy"] = False
        sql = self.module.build_apply_sql(sources, {s.tag for s in sources}, probe_results=reports)
        self.assertIn("'discount','gpt-6-astra',@astra_discount_3,0,10", sql)
        self.assertIn("'plus','gpt-6-astra',@astra_plus_3,1,20", sql)
        self.assertIn("'discount','gpt-6-astra',@astra_discount_2,1,40", sql)

    def test_discount_only_sql_does_not_rewrite_other_groups_or_prices(self):
        sources, reports = self.policy_fixture()
        sql = self.module.build_apply_sql(sources, {s.tag for s in sources}, groups=("discount",), probe_results=reports)
        self.assertIn("AND `group` IN ('discount') AND channel_id NOT IN", sql)
        self.assertNotIn("@astra_plus_", sql)
        self.assertNotIn("@astra_default_", sql)
        self.assertNotIn("UPDATE channels SET status=2 WHERE tag='xingren-gpt6-astra'", sql)
        self.assertNotIn("UPDATE options", sql)
        self.assertNotIn("UPDATE tokens", sql)
        self.assertEqual(sql, self.module.build_apply_sql(sources, {s.tag for s in sources}, groups=("discount",), probe_results=reports))

    def test_discount_failure_cannot_be_turned_into_health_by_fast_latency(self):
        sources, reports = self.policy_fixture()
        reports[1].update(discount_healthy=False, discount_ttft_ms=1)
        priorities, healthy = self.module.discount_route_policy(sources, reports, {s.tag for s in sources})
        self.assertNotIn(sources[1].tag, healthy)
        self.assertEqual(priorities[sources[1].tag], 10)

    def test_codex_health_requires_three_successes_and_two_tool_roundtrips(self):
        source = self.policy_fixture()[0][0]
        with mock.patch.object(self.module.provider_monitor, "request_responses", side_effect=[{"ok": True,"first_token_ms":3000},{"ok":True,"first_token_ms":1000}]), mock.patch.object(self.module,"probe_codex_tool_roundtrip",side_effect=[True,False]) as tool:
            result = self.module.probe_discount_codex(source,{"ok":True,"first_token_ms":2000})
        self.assertFalse(result["discount_healthy"])
        self.assertEqual(result["discount_ttft_ms"],2000)
        self.assertEqual(tool.call_count,2)

    def test_codex_roundtrip_requires_tool_result_continuation(self):
        source = self.policy_fixture()[0][0]
        first = {"status":"completed","output":[{"type":"function_call","name":"audit_sum","call_id":"test-call","arguments":'{"a":1,"b":1}'}]}
        with mock.patch.object(self.module,"codex_completed_response",side_effect=[first,None]):
            self.assertFalse(self.module.probe_codex_tool_roundtrip(source))
        with mock.patch.object(self.module,"codex_completed_response",side_effect=[first,{"status":"completed","output":[{"content":[{"text":"2"}]}]}]) as request:
            self.assertTrue(self.module.probe_codex_tool_roundtrip(source))
            followup = request.call_args_list[1].args[1]
            self.assertEqual(followup["input"][-1],{"type":"function_call_output","call_id":"test-call","output":"2"})
            self.assertFalse(followup["store"])

    def test_codex_terminal_parser_does_not_accept_done_or_error_as_success(self):
        source = self.policy_fixture()[0][0]
        for lines in ([b'data: [DONE]\n',b''],[b'data: {"type":"error"}\n']):
            conn=mock.MagicMock()
            conn.getresponse.return_value.status=200
            conn.getresponse.return_value.readline.side_effect=lines
            with mock.patch.object(self.module.http.client,"HTTPSConnection",return_value=conn):
                self.assertIsNone(self.module.codex_completed_response(source,{}))
            conn.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
