import importlib.util
import json
import sys
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("provider_monitor.py")


def load_module():
    spec = importlib.util.spec_from_file_location("provider_monitor_model_circuit", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load provider_monitor.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeResponsesStream:
    def __init__(self) -> None:
        self.lines = iter(
            [
                b"event: response.created\n",
                b'data: {"type":"response.created"}\n',
                b"event: response.completed\n",
                b'data: {"type":"response.completed","response":{"status":"completed"}}\n',
            ]
        )

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        return None

    def getcode(self) -> int:
        return 200

    def readline(self, _limit: int) -> bytes:
        return next(self.lines, b"")


class ProviderMonitorModelCircuitTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module()

    def managed_family(self):
        return self.module.TextFamily(
            name="test_managed",
            models=("gpt-test",),
            channel_ids=(43,),
            baseline_priorities={43: 20},
            allow_disable=False,
            standalone=True,
            request_format="responses",
            expected_tags={43: "test-plus-tag"},
            ability_group="plus",
            manage_model_abilities=True,
        )

    def managed_channel(self, enabled_status: int = 1):
        return {
            43: {
                "id": 43,
                "status": enabled_status,
                "priority": 20,
                "weight": 100,
                "group": "plus",
                "models": "gpt-test",
                "model_mapping": '{"gpt-test":"upstream-test"}',
                "tag": "test-plus-tag",
                "key": "test-secret-value",
                "base_url": "https://example.invalid",
            }
        }

    def test_discount_and_plus_families_use_responses_model_circuits(self) -> None:
        families = {family.name: family for family in self.module.TEXT_FAMILIES}

        self.assertEqual(families["discount_text"].channel_ids, (28, 42, 41))
        self.assertEqual(families["discount_text"].ability_group, "discount")
        self.assertEqual(families["plus_text"].channel_ids, (43, 44))
        self.assertEqual(families["plus_text"].ability_group, "plus")
        self.assertEqual(families["plus_text"].request_format, "responses")
        self.assertTrue(families["discount_text"].manage_model_abilities)
        self.assertTrue(families["plus_text"].manage_model_abilities)

    def test_responses_probe_uses_native_request(self) -> None:
        with mock.patch.object(self.module.urllib.request, "urlopen", return_value=FakeResponsesStream()) as urlopen:
            result = self.module.request_responses("https://example.invalid", "test-secret", "gpt-5.6-sol")

        request = urlopen.call_args.args[0]
        headers = {key.lower(): value for key, value in request.header_items()}
        body = json.loads(request.data.decode("utf-8"))
        self.assertEqual(request.full_url, "https://example.invalid/v1/responses")
        self.assertEqual(headers["authorization"], "Bearer test-secret")
        self.assertEqual(body["model"], "gpt-5.6-sol")
        self.assertEqual(body["input"], "Reply with OK only.")
        self.assertTrue(body["stream"])
        self.assertFalse(body["store"])
        self.assertTrue(result["ok"])

    def test_codex_auto_review_maps_to_gpt_55(self) -> None:
        mapping = self.module.parse_model_mapping(
            {"model_mapping": '{"codex-auto-review":"gpt-5.5","gpt-5.6-sol":"gpt-5.6-sol"}'}
        )
        self.assertEqual(mapping["codex-auto-review"], "gpt-5.5")

    def test_model_ability_update_has_exact_identity_guards(self) -> None:
        captured: list[str] = []
        family = self.managed_family()
        with (
            mock.patch.object(
                self.module,
                "execute_guarded_update",
                side_effect=lambda _env, sql, _dry_run: captured.append(sql) or True,
            ),
            mock.patch.object(self.module, "write_event"),
        ):
            updated = self.module.set_model_ability_enabled(
                {}, family, 43, "gpt-test", True, False, "test_open", False
            )

        self.assertTrue(updated)
        sql = captured[0]
        self.assertIn("ability.channel_id = 43", sql)
        self.assertIn("ability.`group` = 'plus'", sql)
        self.assertIn("ability.model = 'gpt-test'", sql)
        self.assertIn("ability.tag = 'test-plus-tag'", sql)
        self.assertIn("ability.enabled = 1", sql)
        self.assertIn("channel.status = 1", sql)
        self.assertIn("channel.tag = 'test-plus-tag'", sql)

    def test_two_failures_open_only_the_failed_model_ability(self) -> None:
        family = self.managed_family()
        state = {
            "routes": {
                "test_managed:gpt-test:43": {
                    "samples": [
                        {
                            "ts": self.module.now_ts(),
                            "ok": False,
                            "status": 503,
                            "first_token_ms": 10,
                            "reason": "upstream_5xx",
                            "source": "canary",
                        }
                    ]
                }
            }
        }
        updates: list[tuple[bool, bool]] = []
        with (
            mock.patch.object(
                self.module,
                "load_abilities",
                return_value={(43, "gpt-test"): {"enabled": 1, "tag": "test-plus-tag"}},
            ),
            mock.patch.object(
                self.module,
                "request_responses",
                return_value={"ok": False, "status": 503, "first_token_ms": 12, "reason": "upstream_5xx"},
            ),
            mock.patch.object(
                self.module,
                "set_model_ability_enabled",
                side_effect=lambda _env, _family, _channel, _model, current, target, _reason, _dry: updates.append(
                    (current, target)
                )
                or True,
            ),
            mock.patch.object(self.module, "write_event"),
        ):
            result = self.module.evaluate_managed_model_family(
                family, self.managed_channel(), state, {}, False, False
            )

        self.assertEqual(updates, [(True, False)])
        self.assertEqual(result["channels"][43]["models"]["gpt-test"]["action"], "circuit_open")
        self.assertTrue(state["managed_abilities"]["test_managed:gpt-test:43"]["auto_disabled"])

    def test_slow_success_does_not_open_model_circuit(self) -> None:
        summary = {
            "state": "open",
            "p95_ms": self.module.P95_OPEN_MS + 1,
            "consecutive_failures": 0,
            "consecutive_successes": 3,
        }
        self.assertFalse(self.module.should_open_managed_model_circuit(summary))

    def test_recovery_reenables_only_monitor_owned_ability(self) -> None:
        family = self.managed_family()
        state = {
            "routes": {
                "test_managed:gpt-test:43": {
                    "samples": [
                        {
                            "ts": self.module.now_ts(),
                            "ok": True,
                            "status": 200,
                            "first_token_ms": 10,
                            "reason": "ok",
                            "source": "canary",
                        }
                    ]
                }
            },
            "managed_abilities": {
                "test_managed:gpt-test:43": {
                    "auto_disabled": True,
                    "disabled_at": self.module.now_ts() - self.module.RECOVER_COOLDOWN_SECONDS - 1,
                }
            },
        }
        updates: list[tuple[bool, bool]] = []
        with (
            mock.patch.object(
                self.module,
                "load_abilities",
                return_value={(43, "gpt-test"): {"enabled": 0, "tag": "test-plus-tag"}},
            ),
            mock.patch.object(
                self.module,
                "request_responses",
                return_value={"ok": True, "status": 200, "first_token_ms": 12, "reason": "ok"},
            ),
            mock.patch.object(
                self.module,
                "set_model_ability_enabled",
                side_effect=lambda _env, _family, _channel, _model, current, target, _reason, _dry: updates.append(
                    (current, target)
                )
                or True,
            ),
            mock.patch.object(self.module, "write_event"),
        ):
            result = self.module.evaluate_managed_model_family(
                family, self.managed_channel(), state, {}, False, False
            )

        self.assertEqual(updates, [(False, True)])
        self.assertEqual(result["channels"][43]["models"]["gpt-test"]["action"], "recovered")
        self.assertFalse(state["managed_abilities"]["test_managed:gpt-test:43"]["auto_disabled"])

    def test_manual_disabled_ability_is_not_reenabled(self) -> None:
        family = self.managed_family()
        with (
            mock.patch.object(
                self.module,
                "load_abilities",
                return_value={(43, "gpt-test"): {"enabled": 0, "tag": "test-plus-tag"}},
            ),
            mock.patch.object(
                self.module,
                "request_responses",
                return_value={"ok": True, "status": 200, "first_token_ms": 12, "reason": "ok"},
            ),
            mock.patch.object(self.module, "set_model_ability_enabled") as update,
            mock.patch.object(self.module, "write_event"),
        ):
            result = self.module.evaluate_managed_model_family(
                family, self.managed_channel(), {}, {}, False, False
            )

        update.assert_not_called()
        self.assertEqual(result["channels"][43]["models"]["gpt-test"]["action"], "manual_disabled_noop")

    def test_family_filter_rejects_unknown_names(self) -> None:
        selected = self.module.select_text_families(["discount_text,plus_text"])
        self.assertEqual([family.name for family in selected], ["discount_text", "plus_text"])
        with self.assertRaises(ValueError):
            self.module.select_text_families(["unknown"])

    def test_events_redact_keys_and_supplier_urls(self) -> None:
        bearer = "Bearer " + "test-secret-value"
        value = self.module.sanitize_for_event(
            {
                "key": "test-secret-value",
                "base_url": "https://supplier.example/v1",
                "error": f"Authorization: {bearer} request to https://supplier.example/v1 failed",
            }
        )
        encoded = json.dumps(value)
        self.assertNotIn("supplier.example", encoded)
        self.assertNotIn("test-secret-value", encoded)


if __name__ == "__main__":
    unittest.main()
