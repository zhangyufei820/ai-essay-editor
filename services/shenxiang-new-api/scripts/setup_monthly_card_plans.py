#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(os.environ.get("SHENXIANG_NEW_API_ROOT", "/opt/shenxiang-new-api"))
QUOTA_PER_USD = 500_000
PAYG_CNY_PER_USD = Decimal("1.08")


@dataclass(frozen=True)
class MonthlyCardPlan:
    title: str
    price_cny: int
    monthly_usd: int
    concurrency_limit: int
    sort_order: int

    @property
    def monthly_quota(self) -> int:
        return self.monthly_usd * QUOTA_PER_USD

    @property
    def payg_usd_same_money(self) -> Decimal:
        return (Decimal(self.price_cny) / PAYG_CNY_PER_USD).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    @property
    def monthly_vs_payg_multiple(self) -> Decimal:
        return (Decimal(self.monthly_usd) / self.payg_usd_same_money).quantize(
            Decimal("0.1"),
            rounding=ROUND_HALF_UP,
        )

    @property
    def payg_cost_same_quota(self) -> Decimal:
        return (Decimal(self.monthly_usd) * PAYG_CNY_PER_USD).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    @property
    def monthly_discount(self) -> Decimal:
        return (Decimal(self.price_cny) / self.payg_cost_same_quota * Decimal("10")).quantize(
            Decimal("0.1"),
            rounding=ROUND_HALF_UP,
        )

    @property
    def subtitle(self) -> str:
        return (
            f"月总 ${self.monthly_usd} 模型额度｜30 天有效｜并发 {self.concurrency_limit}｜"
            f"本月额度用完为止｜约等于按量 {self.monthly_discount} 折"
        )


PLANS = [
    MonthlyCardPlan("¥100 月卡", 100, 350, 1, 100),
    MonthlyCardPlan("¥200 月卡", 200, 830, 2, 200),
    MonthlyCardPlan("¥300 月卡", 300, 1350, 3, 300),
    MonthlyCardPlan("¥500 月卡", 500, 2300, 5, 500),
    MonthlyCardPlan("¥1000 月卡", 1000, 4600, 10, 1000),
]

LEGACY_TITLE = "VIP 旧版 ¥500 月卡"
LEGACY_SUBTITLE = "历史权益｜月总 $4800 模型额度｜30 天有效｜本月额度用完为止｜不再新购"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(key: str) -> str:
    value = os.environ.get(key, "").strip()
    if not value:
        raise SystemExit(f"missing required env: {key}")
    return value


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def mysql_exec(sql: str, *, capture: bool = False) -> str:
    env = os.environ.copy()
    env["MYSQL_PWD"] = require_env("MYSQL_ROOT_PASSWORD")
    cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        f"MYSQL_PWD={env['MYSQL_PWD']}",
        os.environ.get("MYSQL_CONTAINER", "shenxiang-new-api-mysql"),
        "mysql",
        "--default-character-set=utf8mb4",
        "--batch",
        "--raw",
        "-uroot",
        require_env("MYSQL_DATABASE"),
    ]
    kwargs = {
        "input": sql,
        "text": True,
        "check": True,
        "stderr": subprocess.DEVNULL,
    }
    if capture:
        kwargs["stdout"] = subprocess.PIPE
    result = subprocess.run(cmd, **kwargs)
    return result.stdout if capture else ""


def build_plan_sql(plan: MonthlyCardPlan) -> str:
    title = sql_quote(plan.title)
    subtitle = sql_quote(plan.subtitle)
    return f"""
INSERT INTO subscription_plans
  (title, subtitle, price_amount, currency, duration_unit, duration_value, custom_seconds,
   enabled, sort_order, allow_balance_pay, allow_wallet_overflow, stripe_price_id,
   creem_product_id, waffo_pancake_product_id, max_purchase_per_user, upgrade_group,
   downgrade_group, total_amount, monthly_amount_total, concurrency_limit,
   quota_reset_period, quota_reset_custom_seconds, created_at, updated_at)
SELECT
  {title}, {subtitle}, {plan.price_cny}, 'USD', 'day', 30, 0,
  1, {plan.sort_order}, 0, 0, '',
  '', '', 0, '',
  '', {plan.monthly_quota}, {plan.monthly_quota}, {plan.concurrency_limit},
  'never', 0, @now, @now
WHERE NOT EXISTS (
  SELECT 1 FROM subscription_plans
  WHERE title = {title} AND ABS(price_amount - {plan.price_cny}) < 0.000001
);

UPDATE subscription_plans
SET subtitle = {subtitle},
    currency = 'USD',
    duration_unit = 'day',
    duration_value = 30,
    custom_seconds = 0,
    enabled = 1,
    sort_order = {plan.sort_order},
    allow_balance_pay = 0,
    allow_wallet_overflow = 0,
    max_purchase_per_user = 0,
    total_amount = {plan.monthly_quota},
    monthly_amount_total = {plan.monthly_quota},
    concurrency_limit = {plan.concurrency_limit},
    quota_reset_period = 'never',
    quota_reset_custom_seconds = 0,
    updated_at = @now
WHERE title = {title} AND ABS(price_amount - {plan.price_cny}) < 0.000001;
"""


def build_active_subscription_sql() -> str:
    plan_titles = ", ".join(sql_quote(plan.title) for plan in PLANS)
    return f"""
UPDATE user_subscriptions us
JOIN subscription_plans sp ON sp.id = us.plan_id
SET us.amount_used = LEAST(GREATEST(us.amount_used, us.monthly_amount_used), us.monthly_amount_total),
    us.monthly_amount_used = LEAST(GREATEST(us.amount_used, us.monthly_amount_used), us.monthly_amount_total),
    us.amount_total = us.monthly_amount_total,
    us.next_reset_time = 0,
    us.updated_at = @now
WHERE us.status = 'active'
  AND us.end_time > @now
  AND us.monthly_amount_total > 0
  AND sp.title IN ({plan_titles}, {sql_quote(LEGACY_TITLE)})
  AND (
    us.amount_total < us.monthly_amount_total
    OR us.next_reset_time > 0
    OR us.amount_used <> us.monthly_amount_used
  );
"""


def build_sql() -> str:
    plan_sql = "\n".join(build_plan_sql(plan) for plan in PLANS)
    return f"""
SET NAMES utf8mb4;
SET @now := UNIX_TIMESTAMP();
START TRANSACTION;

UPDATE subscription_plans
SET title = {sql_quote(LEGACY_TITLE)},
    subtitle = {sql_quote(LEGACY_SUBTITLE)},
    enabled = 0,
    sort_order = 950,
    allow_balance_pay = 0,
    allow_wallet_overflow = 0,
    total_amount = monthly_amount_total,
    quota_reset_period = 'never',
    quota_reset_custom_seconds = 0,
    updated_at = @now
WHERE id = 1
  AND ABS(price_amount - 500) < 0.000001
  AND total_amount >= 80000000;

{plan_sql}

{build_active_subscription_sql()}

COMMIT;
"""


def print_summary() -> None:
    print(
        "title\tprice_cny\tmonthly_usd\tquota_reset\tpayg_usd_same_money"
        "\tpayg_cost_same_quota\tmonthly_discount\tmonthly_vs_payg"
    )
    for plan in PLANS:
        print(
            f"{plan.title}\t{plan.price_cny}\t{plan.monthly_usd}\tnever"
            f"\t{plan.payg_usd_same_money}\t{plan.payg_cost_same_quota}"
            f"\t{plan.monthly_discount}折\t{plan.monthly_vs_payg_multiple}x"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="apply changes to MySQL")
    parser.add_argument("--print-sql", action="store_true", help="print SQL")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    sql = build_sql()
    if args.print_sql:
        print(sql)
    print_summary()
    if args.apply:
        mysql_exec(sql)
        print("applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
