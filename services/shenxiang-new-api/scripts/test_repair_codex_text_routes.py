import unittest
from unittest import mock

import repair_codex_text_routes as repair


class RepairCodexRoutesTests(unittest.TestCase):
    def setUp(self):
        self.sources = {tag: {"id": i, "key": "unit-test-secret", "base_url": "https://example.invalid"}
                        for i, tag in enumerate(repair.SOURCE_MODELS, 1)}

    def test_scope_and_no_credential_or_price_in_sql(self):
        sql = repair.build_sql(self.sources)
        self.assertNotIn("unit-test-secret", sql)
        self.assertNotIn("example.invalid", sql)
        self.assertNotIn("options", sql)
        self.assertNotIn("users", sql)
        self.assertNotIn("subscription", sql)
        for tag, group, source, _priority in repair.CLONES:
            self.assertIn(repair.q(tag), sql)
            self.assertIn(repair.q(group), sql)
            self.assertIn(repair.q(source), sql)
        self.assertEqual({entry[1] for entry in repair.CLONES}, {"discount", "plus", "default"})

    def test_native_56_is_not_an_alias(self):
        self.assertIn('"gpt-5.6":"gpt-5.6"', repair.build_sql(self.sources))
        self.assertNotIn('"gpt-5.6":"gpt-5.6-sol"', repair.build_sql(self.sources))

    def test_fail_closed_if_any_required_model_does_not_complete(self):
        with mock.patch.object(repair.monitor, "request_responses", return_value={"ok": False}), mock.patch.object(repair.sync, "mysql_exec") as execute:
            with self.assertRaises(RuntimeError):
                repair.verify_sources(self.sources)
            execute.assert_not_called()

    def test_exact_models_are_probed(self):
        with mock.patch.object(repair.monitor, "request_responses", return_value={"ok": True}) as request:
            report = repair.verify_sources(self.sources)
        self.assertEqual({r["model"] for r in report}, set(repair.MODELS))
        self.assertEqual(request.call_count, 9)

    def test_partial_apply_never_enables_a_failed_model(self):
        sql = repair.build_sql(self.sources, {("xingren-plus-text-wangwang", "gpt-5.4-mini")})
        self.assertIn("'discount','gpt-5.4-mini',@codex_repair_0,1", sql)
        self.assertIn("'discount','gpt-5.5',@codex_repair_0,0", sql)
        self.assertIn("'plus','gpt-5.6',@codex_repair_1,0", sql)


if __name__ == "__main__":
    unittest.main()
