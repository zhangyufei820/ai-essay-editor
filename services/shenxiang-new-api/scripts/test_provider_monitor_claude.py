import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("provider_monitor.py")


def load_module():
    spec = importlib.util.spec_from_file_location("provider_monitor", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load provider_monitor.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeStreamResponse:
    def __init__(self, *events) -> None:
        self.lines = iter(
            b"data: " + json.dumps(event).encode("utf-8") + b"\n" for event in events
        )

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        return None

    def getcode(self) -> int:
        return 200

    def readline(self, _limit: int) -> bytes:
        return next(self.lines, b"")


class ProviderMonitorClaudeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def test_claude_channels_are_monitored_as_isolated_families(self) -> None:
        families = {family.name: family for family in self.module.TEXT_FAMILIES}

        self.assertEqual(families["claude_kiro_text"].channel_ids, (50, 46))
        self.assertEqual(families["claude_kiro_stable_text"].channel_ids, (51, 47, 9))
        self.assertEqual(
            families["claude_kiro_stable_text"].baseline_priorities,
            {51: 30, 47: 20, 9: 10},
        )
        self.assertEqual(families["claude_opus5_kiro_stable_text"].channel_ids, (47,))
        self.assertEqual(families["claude_opus5_kiro_stable_text"].models, ("claude-opus-5",))
        self.assertNotIn("claude-opus-5", families["claude_kiro_text"].models)
        self.assertNotIn("claude-opus-5", families["claude_kiro_stable_text"].models)
        self.assertEqual(families["claude_ccmax_terminal_text"].channel_ids, (48,))
        self.assertEqual(families["claude_external_text"].channel_ids, (49,))
        self.assertEqual(families["claude_ccmax_terminal_text"].request_format, "messages")
        self.assertEqual(families["claude_external_text"].request_format, "messages")
        self.assertEqual(
            families["claude_kiro_text"].expected_tags,
            {
                50: "kiro-primary-20260724",
                46: "xingren-claude-pdhlzy-kiro",
            },
        )
        self.assertEqual(
            families["claude_kiro_stable_text"].expected_tags,
            {
                51: "kiro-stable-primary-20260724",
                47: "xingren-claude-pdhlzy-kiro-stable",
                9: "xingren-claude-moonapix-fallback",
            },
        )
        self.assertEqual(
            families["claude_ccmax_terminal_text"].expected_tags,
            {48: "xingren-claude-pdhlzy-ccmax-terminal"},
        )
        self.assertTrue(all(family.standalone for name, family in families.items() if name.startswith("claude_")))

    def test_messages_probe_uses_native_anthropic_request(self) -> None:
        with mock.patch.object(self.module.urllib.request, "urlopen", return_value=FakeStreamResponse(
            {"type": "message_start"},
            {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "OK"}},
            {"type": "message_stop"},
        )) as urlopen:
            result = self.module.request_messages("https://example.invalid", "test-secret", "claude-sonnet-5")

        request = urlopen.call_args.args[0]
        headers = {key.lower(): value for key, value in request.header_items()}
        body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.full_url, "https://example.invalid/v1/messages")
        self.assertEqual(headers["x-api-key"], "test-secret")
        self.assertEqual(headers["anthropic-version"], "2023-06-01")
        self.assertEqual(body["model"], "claude-sonnet-5")
        self.assertTrue(body["stream"])
        self.assertTrue(result["ok"])


    def test_messages_probe_rejects_partial_or_failed_stream(self) -> None:
        cases = [
            [{"type": "message_start"}],
            [{"type": "content_block_delta", "delta": {"type": "text_delta", "text": "  "}},
             {"type": "message_stop"}],
            [{"type": "content_block_delta", "delta": {"type": "text_delta", "text": "OK"}},
             {"type": "error"}, {"type": "message_stop"}],
        ]
        for events in cases:
            with self.subTest(events=events), mock.patch.object(
                self.module.urllib.request, "urlopen", return_value=FakeStreamResponse(*events),
            ):
                result = self.module.request_messages("https://example.invalid", "test-secret", "claude-sonnet-5")
                self.assertFalse(result["ok"])

    def disabled_channel(self, key: str, reason: str = "provider_monitor:test") -> dict:
        info = {
            "status_reason": reason,
            "status_time": 1,
            "monitor_circuit": {
                "owner": "test",
                "disabled_at": 1,
                "abilities": [{"model": "test-model", "group": "test-group", "tag": "test-tag"}],
            },
        }
        return {
            "key": key, "models": "test-model", "base_url": "https://example.invalid",
            "status": 3, "other_info": json.dumps(info),
        }

    def test_empty_probe_results_cannot_enable_a_channel(self) -> None:
        family = self.module.TextFamily("test", ("test-model",), (51,), {51: 10})
        channels = {51: self.disabled_channel("")}
        with mock.patch.object(self.module, "set_channel_status") as update, mock.patch.object(self.module, "write_event"):
            result = self.module.evaluate_text_family(family, channels, {}, {}, False)
        update.assert_not_called()
        self.assertTrue(result["channels"][51]["auto_disabled"])

    def test_guarded_recovery_restores_only_owned_published_abilities(self) -> None:
        channel = self.disabled_channel("synthetic-channel-secret")
        with (
            mock.patch.object(self.module, "docker_mysql", return_value="1\n") as query,
            mock.patch.object(self.module, "write_event"),
        ):
            self.assertTrue(self.module.set_channel_status({}, 51, channel, 1, "test", "recover", False))
        sql = query.call_args.kwargs["input_text"]
        self.assertIn("WHERE id = 51 AND status = 3", sql)
        self.assertIn("FOR UPDATE", sql)
        self.assertIn("SHA2(COALESCE(" + chr(96) + "other_info" + chr(96), sql)
        self.assertNotIn(channel["key"], sql)
        self.assertIn("FIND_IN_SET(a.model, COALESCE(c.models, '')) > 0", sql)
        self.assertIn("X'" + "test-group".encode().hex() + "'", sql)
        changed_by_operator = self.disabled_channel("synthetic-channel-secret", reason="operator")
        with mock.patch.object(self.module, "docker_mysql") as query:
            self.assertFalse(self.module.set_channel_status({}, 51, changed_by_operator, 1, "test", "recover", False))
        query.assert_not_called()

    def test_opus_only_probe_cannot_rewrite_kiro_stable_ranking(self) -> None:
        family = next(f for f in self.module.TEXT_FAMILIES if f.name == "claude_opus5_kiro_stable_text")
        channels = {47: {"tag": family.expected_tags[47], "key": "test", "models": "claude-opus-5",
                         "base_url": "https://example.invalid", "status": 1, "priority": 10, "weight": 50}}
        with (
            mock.patch.object(self.module, "request_chat", return_value={"ok": True, "status": 200}) as probe,
            mock.patch.object(self.module, "set_channel_priority") as priority,
            mock.patch.object(self.module, "set_channel_weight") as weight,
            mock.patch.object(self.module, "write_event"),
        ):
            self.module.evaluate_text_family(family, channels, {}, {}, False)
        probe.assert_called_once()
        priority.assert_not_called()
        weight.assert_not_called()

    def test_cli_dry_run_does_not_persist_monitor_state(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                mock.patch.object(sys, "argv", ["provider_monitor.py", "--family", "claude_kiro_text", "--dry-run"]),
                mock.patch.object(self.module, "ROOT", root),
                mock.patch.object(self.module, "LOCK_PATH", root / "lock"),
                mock.patch.object(self.module, "MODEL_SYNC_LOCK_PATH", root / "sync-lock"),
                mock.patch.object(self.module, "load_dotenv", return_value={"MYSQL_ROOT_PASSWORD": "test", "MYSQL_DATABASE": "test"}),
                mock.patch.object(self.module, "load_channels", return_value={}),
                mock.patch.object(self.module, "load_state", return_value={}),
                mock.patch.object(self.module, "save_state") as save,
                mock.patch.object(self.module, "reconcile_managed_codex_token_routes", return_value={"ok": True}),
                mock.patch.object(self.module, "write_event"),
            ):
                self.assertEqual(self.module.main(), 0)
        save.assert_not_called()


if __name__ == "__main__":
    unittest.main()
