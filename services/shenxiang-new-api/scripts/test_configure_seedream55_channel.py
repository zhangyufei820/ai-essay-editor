from decimal import Decimal
import json
from pathlib import Path
import sys
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).parent))
import configure_seedream55_channel as cfg


class Seedream55CatalogTests(unittest.TestCase):
    def test_stage_only_provisions_unadvertised_channel(self):
        with (
            mock.patch.object(cfg, "channel_state", side_effect=[(0, "absent"), (90, "staged")]),
            mock.patch.object(cfg.permissions, "mysql", return_value=[["0"]]),
            mock.patch.object(cfg.permissions, "usd_exchange_rate", return_value=Decimal("7.3")),
            mock.patch.object(cfg.permissions, "mysql_exec") as write,
        ):
            result = cfg.stage("synthetic-channel-credential")
        sql = write.call_args.args[0]
        self.assertEqual(result["state"], "staged")
        self.assertIn(f"{cfg.q(cfg.BASE_URL)},'','internal'", sql)
        self.assertNotIn("INSERT INTO abilities", sql)
        self.assertNotIn("INSERT INTO models", sql)
        self.assertNotIn("UPDATE tokens", sql)
        self.assertNotIn("credential", repr(result))

    def test_stage_does_not_unpublish(self):
        with mock.patch.object(cfg, "channel_state", return_value=(90, "published")), self.assertRaises(cfg.ConfigurationError):
            cfg.stage("synthetic-channel-credential")

    def test_publish_requires_matching_wallet_receipt(self):
        # ¥0.1092 × 500000 / 7.3 rounds to 7479 quota.
        correct = {
            "billing_source": "wallet", "image_price_version": "seedream55-cny-20261120",
            "image_input_count": 0, "image_output_count": 1, "image_output_cap": 1,
            "image_output_tier": "low", "image_output_unit_cny": "0.1092",
            "image_input_unit_cny": "0.042", "image_total_cny": "0.1092",
            "reserved_quota": 7479, "charged_quota": 7479,
        }
        for delta, charge, valid in [
            ({}, "7479", True), ({"image_input_count": 1}, "7479", False),
            ({"billing_source": "subscription"}, "7479", False), ({}, "7480", False),
            ({"image_output_count": 0}, "7479", False),
        ]:
            with (
                self.subTest(delta=delta, charge=charge),
                mock.patch.object(cfg.permissions, "mysql_raw", return_value=[[charge, json.dumps(correct | delta)]]) as query,
                mock.patch.object(cfg.permissions, "usd_exchange_rate", return_value=Decimal("7.3")),
                mock.patch.object(cfg.permissions, "option_value", return_value="500000"),
            ):
                if valid:
                    cfg.check_smoke(90, 22)
                else:
                    with self.assertRaises(cfg.ConfigurationError):
                        cfg.check_smoke(90, 22)
                self.assertIn("t.user_id = 1", query.call_args.args[0])
                self.assertIn("l.channel_id = 90", query.call_args.args[0])

    def test_publish_only_amends_managed_image_tokens(self):
        sql = cfg.publish_sql(90)
        self.assertTrue(sql.startswith("START TRANSACTION;"))
        self.assertTrue(sql.endswith("COMMIT;"))
        self.assertIn(f"WHERE name={cfg.q(cfg.TOKEN_NAME)} AND deleted_at IS NULL AND model_limits_enabled=1", sql)
        self.assertIn("UPDATE models SET vendor_id=4", sql)
        self.assertIn("'Doubao.Color','image,doubao,seedream',4,", sql)
        self.assertNotIn("UPDATE users", sql)
        self.assertNotIn("subscription", sql)
        for group in ("discount", "plus", "special", "astra"):
            self.assertNotIn(cfg.q(group), sql)

    def test_reconcile_cannot_widen_groups_or_revive_staged_ability(self):
        rows = [
            ["90", cfg.MODEL, "0", "100", cfg.TAG, cfg.GROUPS],
            ["91", "", "0", "100", cfg.TAG, "internal"],
            ["92", cfg.MODEL, "0", "100", "unrelated-tag", "default"],
        ]
        def read(query):
            if "FROM channels" in query and "ORDER BY id" in query:
                return rows
            if "SELECT model_name FROM models" in query:
                return [[cfg.MODEL]]
            return []

        with (
            mock.patch.object(cfg.permissions, "mysql", side_effect=read),
            mock.patch.object(cfg.permissions, "active_groups", return_value=["default", "discount", "special", "astra"]),
            mock.patch.object(cfg.permissions, "monitor_disabled_ability_pairs", return_value=set()),
            mock.patch.object(cfg.permissions, "mysql_exec") as write,
        ):
            cfg.permissions.sync_abilities()
        sql = write.call_args.args[0]
        for group in cfg.permissions.SEEDREAM55_PUBLIC_GROUPS:
            self.assertIn(f"SELECT '{group}', '{cfg.MODEL}', 90,", sql)
        for group in ("discount", "special", "astra"):
            self.assertNotIn(f"SELECT '{group}', '{cfg.MODEL}', 90,", sql)
        self.assertNotIn(f"'{cfg.MODEL}', 91,", sql)
        self.assertNotIn(f"'{cfg.MODEL}', 92,", sql)


if __name__ == "__main__":
    unittest.main()
