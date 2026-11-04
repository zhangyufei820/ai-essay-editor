import json
import unittest
from unittest.mock import patch

import configure_upscale_channels as config
import sync_app_model_permissions as permissions


class UpscaleConfigurationTests(unittest.TestCase):
    def test_pixel_price_config_preserves_all_scale_units(self):
        sample = {"mode": "per_credit_by_scale", "per_credit_cny_by_scale": {"2": .613 / 90, "4": 2.252 / 360, "8": 8.508 / 1440, "16": 8.921 / 1530}}
        config.validate_pricing(sample)
        parsed = permissions.upscale_pricing_config(json.dumps(sample))
        self.assertEqual(set(parsed["units"]), {2, 4, 8, 16})
        self.assertAlmostEqual(float(parsed["units"][16] * 1530), 8.921)

    def test_rejects_unconfirmed_or_incomplete_prices(self):
        for sample in [{}, {"mode": "fixed_by_scale", "prices_cny": {"2": .613}}, {"mode": "per_credit", "per_credit_cny": -1}, {"mode": "per_credit_by_scale", "per_credit_cny_by_scale": {"2": .01}}, {"mode": "per_credit", "per_credit_cny": float("nan")}]:
            with self.subTest(sample=sample), self.assertRaises(ValueError):
                config.validate_pricing(sample)

    def test_staging_uses_distinct_credentials_and_admin_token_only(self):
        sql = config.stage_sql({"精准放大": "precision-test-key", "创意放大": "creative-test-key"}, "https://example.invalid", {"mode": "per_credit", "per_credit_cny": .01}, "54", "gpt-image-2-4K")
        self.assertIn("precision-test-key", sql)
        self.assertIn("creative-test-key", sql)
        self.assertIn("AND user_id=1", sql)
        self.assertIn("'internal'", sql)
        self.assertIn("magnific-upscaler-precision-v2", sql)
        self.assertNotIn("UPDATE users", sql)
        self.assertNotIn("monthly", sql)

    def test_directory_describes_dynamic_pixel_prices(self):
        sample = {"mode": "per_credit", "per_credit_cny": .01}
        statements = []
        with patch.object(permissions, "option_value", return_value=json.dumps(sample)), patch.object(permissions, "mysql_exec", side_effect=statements.append):
            result = permissions.ensure_upscale_models()
        self.assertEqual(result["models_published"], 2)
        self.assertIn("按原图像素与倍数累计积分计费", statements[0])
        self.assertIn("500×500", statements[0])
        self.assertNotIn("api_key", statements[0])


if __name__ == "__main__":
    unittest.main()
