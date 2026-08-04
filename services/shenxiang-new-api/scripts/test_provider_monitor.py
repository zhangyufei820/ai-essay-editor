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
    def __init__(self, completed_padding: int = 0) -> None:
        completed = {"type": "response.completed", "response": {"status": "completed"}}
        if completed_padding:
            completed["response"]["metadata"] = "x" * completed_padding
        self.completed_line = b"data: " + json.dumps(completed).encode("utf-8") + b"\n"
        self.lines = [
            b"event: response.created\n",
            b'data: {"type":"response.created"}\n',
            b"event: response.completed\n",
            self.completed_line,
        ]
        self.pending = b""

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback) -> None:
        return None

    def getcode(self) -> int:
        return 200

    def readline(self, _limit: int) -> bytes:
        if self.pending:
            line = self.pending
            self.pending = b""
        elif self.lines:
            line = self.lines.pop(0)
        else:
            return b""
        if _limit >= 0 and len(line) > _limit:
            self.pending = line[_limit:]
            return line[:_limit]
        return line


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
        self.assertEqual(
            families["discount_text"].models,
            ("gpt-5.4-mini", "gpt-5.5", "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra"),
        )
        self.assertEqual(families["discount_text"].expected_tags[28], "xingren-discount-text-aihub")
        self.assertEqual(
            families["discount_text"].probe_models_by_tag,
            {"xingren-discount-text-aihub": ("gpt-5.6-sol",)},
        )
        self.assertEqual(families["discount_text"].ability_group, "discount")
        self.assertEqual(families["plus_text"].channel_ids, ())
        self.assertEqual(
            families["plus_text"].managed_tag_priorities,
            (
                ("xingren-plus-text-pdhlzy", 30),
                ("xingren-plus-text-aihub", 20),
                ("xingren-plus-text-wangwang", 10),
            ),
        )
        self.assertEqual(families["plus_text"].ability_group, "plus")
        self.assertEqual(families["plus_text"].request_format, "responses")
        self.assertEqual(
            families["plus_text"].probe_models_by_tag,
            {"xingren-plus-text-aihub": ("gpt-5.6-sol",)},
        )
        self.assertTrue(families["discount_text"].manage_model_abilities)
        self.assertTrue(families["plus_text"].manage_model_abilities)

    def test_aihub_probe_override_does_not_reduce_other_channel_models(self) -> None:
        family = self.module.TextFamily(
            name="test_aihub_override",
            models=("gpt-5.5", "gpt-5.6-sol"),
            channel_ids=(43, 44),
            baseline_priorities={43: 20, 44: 10},
            allow_disable=False,
            standalone=True,
            request_format="responses",
            expected_tags={43: "test-aihub", 44: "test-fallback"},
            ability_group="plus",
            manage_model_abilities=True,
            probe_models_by_tag={"test-aihub": ("gpt-5.6-sol",)},
        )
        channels = {
            43: {
                "id": 43,
                "status": 1,
                "priority": 20,
                "weight": 100,
                "group": "plus",
                "models": "gpt-5.5,gpt-5.6-sol",
                "model_mapping": "{}",
                "tag": "test-aihub",
                "key": "test-aihub-key",
                "base_url": "https://aihub.invalid",
            },
            44: {
                "id": 44,
                "status": 1,
                "priority": 10,
                "weight": 100,
                "group": "plus",
                "models": "gpt-5.5,gpt-5.6-sol",
                "model_mapping": "{}",
                "tag": "test-fallback",
                "key": "test-fallback-key",
                "base_url": "https://fallback.invalid",
            },
        }
        abilities = {
            (channel_id, model): {"enabled": 1, "tag": channels[channel_id]["tag"]}
            for channel_id in (43, 44)
            for model in family.models
        }
        with (
            mock.patch.object(self.module, "load_abilities", return_value=abilities),
            mock.patch.object(
                self.module,
                "request_responses",
                return_value={"ok": True, "status": 200, "first_token_ms": 10, "reason": "ok"},
            ) as request,
            mock.patch.object(self.module, "set_model_ability_enabled") as update,
            mock.patch.object(self.module, "write_event"),
        ):
            result = self.module.evaluate_managed_model_family(
                family, channels, {}, {}, False, False
            )

        probed = {(call.args[0], call.args[2]) for call in request.call_args_list}
        self.assertEqual(
            probed,
            {
                ("https://aihub.invalid", "gpt-5.6-sol"),
                ("https://fallback.invalid", "gpt-5.5"),
                ("https://fallback.invalid", "gpt-5.6-sol"),
            },
        )
        self.assertNotIn("gpt-5.5:43", result["routes"])
        self.assertIn("gpt-5.6-sol:43", result["routes"])
        update.assert_not_called()

    def test_plus_family_resolves_channel_ids_by_managed_tags(self) -> None:
        family = next(family for family in self.module.TEXT_FAMILIES if family.name == "plus_text")
        rows = [
            {"id": 44, "tag": "xingren-plus-text-pdhlzy"},
            {"id": 143, "tag": "xingren-plus-text-aihub"},
            {"id": 43, "tag": "xingren-plus-text-wangwang"},
        ]

        with mock.patch.object(self.module, "mysql_json", return_value=rows):
            resolved = self.module.resolve_dynamic_text_families({}, (family,))[0]

        self.assertEqual(resolved.channel_ids, (44, 143, 43))
        self.assertEqual(resolved.baseline_priorities, {44: 30, 143: 20, 43: 10})
        self.assertEqual(resolved.expected_tags[143], "xingren-plus-text-aihub")
        self.assertEqual(
            self.module.probe_models_for_channel(resolved, 143),
            ("gpt-5.6-sol",),
        )
        self.assertEqual(
            self.module.probe_models_for_channel(resolved, 43),
            resolved.models,
        )

    def test_plus_family_resolution_fails_closed_on_missing_or_duplicate_tags(self) -> None:
        family = next(family for family in self.module.TEXT_FAMILIES if family.name == "plus_text")
        cases = (
            ([{"id": 43, "tag": "xingren-plus-text-wangwang"}], "missing tags"),
            (
                [
                    {"id": 143, "tag": "xingren-plus-text-aihub"},
                    {"id": 144, "tag": "xingren-plus-text-aihub"},
                    {"id": 43, "tag": "xingren-plus-text-wangwang"},
                    {"id": 44, "tag": "xingren-plus-text-pdhlzy"},
                ],
                "duplicate tags",
            ),
        )
        for rows, message in cases:
            with self.subTest(message=message), mock.patch.object(
                self.module, "mysql_json", return_value=rows
            ):
                with self.assertRaisesRegex(RuntimeError, message):
                    self.module.resolve_dynamic_text_families({}, (family,))

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

    def test_responses_probe_accepts_large_completed_event(self) -> None:
        stream = FakeResponsesStream(completed_padding=24_000)
        self.assertGreater(len(stream.completed_line), 8192)
        with mock.patch.object(self.module.urllib.request, "urlopen", return_value=stream):
            result = self.module.request_responses("https://example.invalid", "test-secret", "gpt-5.5")

        self.assertTrue(result["ok"])

    def test_codex_auto_review_maps_to_gpt_55(self) -> None:
        mapping = self.module.parse_model_mapping(
            {"model_mapping": '{"codex-auto-review":"gpt-5.5","gpt-5.6-sol":"gpt-5.6-sol"}'}
        )
        self.assertEqual(mapping["codex-auto-review"], "gpt-5.5")

    def test_managed_family_does_not_probe_or_recover_unpublished_model(self) -> None:
        family = self.managed_family()
        channel = self.managed_channel()
        channel[43]["models"] = "other-model"
        state = {
            "managed_abilities": {
                "test_managed:gpt-test:43": {
                    "auto_disabled": True,
                    "disabled_at": 0,
                }
            }
        }
        with (
            mock.patch.object(
                self.module,
                "load_abilities",
                return_value={(43, "gpt-test"): {"enabled": 0, "tag": "test-plus-tag"}},
            ),
            mock.patch.object(self.module, "request_responses") as request,
            mock.patch.object(self.module, "set_model_ability_enabled") as update,
            mock.patch.object(self.module, "write_event"),
        ):
            result = self.module.evaluate_managed_model_family(
                family, channel, state, {}, False, False
            )

        request.assert_not_called()
        update.assert_not_called()
        self.assertEqual(
            result["channels"][43]["models"]["gpt-test"]["action"],
            "not_published",
        )

    def test_managed_family_disables_enabled_unpublished_model(self) -> None:
        family = self.managed_family()
        channel = self.managed_channel()
        channel[43]["models"] = "other-model"
        with (
            mock.patch.object(
                self.module,
                "load_abilities",
                return_value={(43, "gpt-test"): {"enabled": 1, "tag": "test-plus-tag"}},
            ),
            mock.patch.object(self.module, "request_responses") as request,
            mock.patch.object(
                self.module, "set_model_ability_enabled", return_value=True
            ) as update,
            mock.patch.object(self.module, "write_event"),
        ):
            result = self.module.evaluate_managed_model_family(
                family, channel, {}, {}, False, False
            )

        request.assert_not_called()
        update.assert_called_once_with(
            {},
            family,
            43,
            "gpt-test",
            True,
            False,
            "test_managed_model_not_published",
            False,
        )
        self.assertEqual(
            result["channels"][43]["models"]["gpt-test"]["action"],
            "disabled_not_published",
        )

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
