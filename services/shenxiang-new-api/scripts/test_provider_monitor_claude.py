import importlib.util
import json
import sys
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
    def __init__(self) -> None:
        self.lines = iter([b"event: message_start\n", b'data: {"type":"message_start"}\n'])

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
        with mock.patch.object(self.module.urllib.request, "urlopen", return_value=FakeStreamResponse()) as urlopen:
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


if __name__ == "__main__":
    unittest.main()
