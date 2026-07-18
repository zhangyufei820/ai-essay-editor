#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import unittest
from decimal import Decimal
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("setup_monthly_card_plans.py")


def load_setup_module():
    spec = importlib.util.spec_from_file_location("setup_monthly_card_plans", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load setup_monthly_card_plans.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class SetupMonthlyCardPlansTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_setup_module()

    def test_monthly_card_quota_value_never_exceeds_price_cny(self) -> None:
        for plan in self.module.PLANS:
            with self.subTest(plan=plan.title):
                exact_cny_value = (
                    Decimal(plan.monthly_quota)
                    / self.module.QUOTA_PER_UNIT
                    * self.module.USD_EXCHANGE_RATE
                )
                self.assertLessEqual(
                    exact_cny_value,
                    Decimal(str(plan.price_cny)),
                )
                self.assertLessEqual(
                    plan.monthly_cny_value,
                    Decimal(str(plan.price_cny)),
                )
                self.assertGreater(plan.monthly_quota, 0)

    def test_generated_sql_uses_cny_currency_and_disables_legacy_vip_sales(self) -> None:
        sql = self.module.build_sql()
        first_plan_sql = self.module.build_plan_sql(self.module.PLANS[0])
        legacy_plan_sql = self.module.build_legacy_plan_sql()

        self.assertIn("currency = 'CNY'", sql)
        self.assertIn("100, 'CNY'", first_plan_sql)
        self.assertIn("allow_balance_pay = 0", sql)
        self.assertIn("allow_wallet_overflow = 0", sql)
        self.assertIn("UPDATE subscription_plans", sql)
        self.assertIn("WHERE title LIKE 'VIP 旧版%'", sql)
        self.assertIn("price_amount = 500", legacy_plan_sql)
        self.assertIn("currency = 'CNY'", legacy_plan_sql)
        self.assertIn("total_amount = 34246575", legacy_plan_sql)
        self.assertIn("monthly_amount_total = 34246575", legacy_plan_sql)
        self.assertIn("enabled = 0", legacy_plan_sql)
        self.assertNotIn("sp.enabled = 0 OR sp.title LIKE 'VIP 旧版%'", sql)
        self.assertNotIn("currency = 'USD'", sql)
        self.assertNotIn("折", sql)

    def test_monthly_card_concurrency_tiers(self) -> None:
        concurrency_by_title = {
            plan.title: plan.concurrency_limit for plan in self.module.PLANS
        }

        self.assertEqual(concurrency_by_title["¥300 月卡"], 5)
        self.assertEqual(concurrency_by_title["¥500 月卡"], 8)
        self.assertEqual(
            self.module.LEGACY_MONTHLY_CARD_CONCURRENCY["VIP 旧版 ¥500 月卡"],
            8,
        )
        self.assertEqual(
            self.module.LEGACY_MONTHLY_CARD_PLAN.monthly_quota,
            34246575,
        )

        sql = self.module.build_sql()
        self.assertIn("并发 5", sql)
        self.assertIn("并发 8", sql)
        self.assertIn("sp.title = 'VIP 旧版 ¥500 月卡'", sql)
        self.assertIn("us.concurrency_limit <> 8", sql)


if __name__ == "__main__":
    unittest.main()
