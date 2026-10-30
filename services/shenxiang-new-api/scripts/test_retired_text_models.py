from __future__ import annotations

import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RetiredTextModelsTest(unittest.TestCase):
    def setUp(self):
        self.sync = load("sync_app_model_permissions")

    def test_periodic_writers_do_not_regrant_retired_products(self):
        guard = load("ensure_codex_entry")
        for writer in (self.sync, guard):
            for model in ("gpt-5.5", "gpt-5.6"):
                self.assertTrue(writer.is_retired_codex_text_model(model))
                self.assertNotIn(model, writer.CODEX_ALLOWED_MODELS)
            for model in ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5-openai-compact", "gpt-6.1-sol"):
                self.assertFalse(writer.is_retired_codex_text_model(model))
                self.assertIn(model, writer.CODEX_ALLOWED_MODELS)
        self.assertEqual(self.sync.CODEX_DEFAULT_MODEL, "gpt-6.1-sol")

    def test_retirement_cleans_all_channels_and_keeps_review_and_prices(self):
        def rows(query):
            if "COUNT(*) FROM models" in query:
                return [["2"]]
            if "COUNT(*) FROM abilities" in query:
                return [["12"]]
            if "FROM tokens" in query:
                self.assertNotIn("model_limits_enabled = 1", query)
                return [["9", "test-key", "gpt-5.5, gpt-5.6,gpt-5.6-sol,gpt-5.5-openai-compact"]]
            if "FROM channels" in query:
                return [["21", "gpt-5.5,gpt-5.6,gpt-5.6-sol,codex-auto-review,legacy-alias", '{"codex-auto-review":"gpt-5.5","legacy-alias":"gpt-5.6","untouched":"gpt-5.5-openai-compact"}']]
            return []

        with mock.patch.object(self.sync, "mysql", side_effect=rows), mock.patch.object(self.sync, "mysql_exec") as execute, mock.patch.object(self.sync, "parse_json_option", return_value={"gpt-5.5": 1, "gpt-5.6": 2, "gpt-5.6-sol": 3}), mock.patch.object(self.sync, "upsert_json_option") as options, mock.patch.object(self.sync, "delete_token_caches", return_value=1) as caches:
            result = self.sync.retire_codex_text_models()
        sql = execute.call_args.args[0]
        self.assertIn("models = 'gpt-5.6-sol,codex-auto-review'", sql)
        self.assertIn('"codex-auto-review":"gpt-5.6-sol"', sql)
        self.assertIn('"untouched":"gpt-5.5-openai-compact"', sql)
        self.assertIn("model_limits = 'gpt-5.6-sol,gpt-5.5-openai-compact'", sql)
        self.assertIn("model IN ('legacy-alias')", sql)
        self.assertEqual(result["channels_rewritten"], 1)
        caches.assert_called_once_with(["test-key"])
        for call in options.call_args_list:
            self.assertEqual(call.args[1], {"gpt-5.6-sol": 3})
        review = self.sync.PUBLIC_OPENAI_TEXT_MODELS["codex-auto-review"]
        self.assertEqual(str(review["input_cny"]), "5.4000")
        self.assertEqual(str(review["output_cny"]), "32.4000")

    def test_catalog_reconcile_does_not_republish_retired_products(self):
        with mock.patch.object(self.sync, "mysql_exec") as execute:
            self.sync.ensure_public_openai_text_models()
        sql = execute.call_args.args[0]
        for model in ("gpt-5.5", "gpt-5.6"):
            self.assertNotIn("SET @openai_text_model := '" + model + "'", sql)
            self.assertFalse(self.sync.should_sync_ability_model(model))
        self.assertIn("SET @openai_text_model := 'gpt-6.1-sol'", sql)

    def test_classic_filters_stale_and_fallback_model_lists(self):
        source = (ROOT / "src-patch/web/classic/src/pages/Home/textModelFilter.js").read_text()
        import base64
        uri = "data:text/javascript;base64," + base64.b64encode(source.encode()).decode()
        js = 'const m=await import(' + json.dumps(uri) + '); console.log(JSON.stringify([m.toTextModelOptions(["gpt-5.5","gpt-5.6","gpt-5.6-sol","gpt-6.1-sol"]),m.toTextModelOptions([])]));'
        data = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", js], text=True))
        self.assertEqual([x["value"] for x in data[0]], ["gpt-5.6-sol", "gpt-6.1-sol"])
        self.assertTrue(all(x["value"] not in ("gpt-5.5", "gpt-5.6") for x in data[1]))


if __name__ == "__main__":
    unittest.main()
