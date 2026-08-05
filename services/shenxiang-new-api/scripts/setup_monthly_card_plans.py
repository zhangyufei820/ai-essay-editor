#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
from dataclasses import dataclass
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP
from pathlib import Path


ROOT = Path(os.environ.get("SHENXIANG_NEW_API_ROOT", "/opt/shenxiang-new-api"))
QUOTA_PER_UNIT = Decimal("500000")
USD_EXCHANGE_RATE = Decimal("7.3")
QUOTA_PER_CNY = QUOTA_PER_UNIT / USD_EXCHANGE_RATE


@dataclass(frozen=True)
class MonthlyCardPlan:
    title: str
    price_cny: int
    concurrency_limit: int
    sort_order: int

    @property
    def monthly_quota(self) -> int:
        return int(
            (Decimal(self.price_cny) * QUOTA_PER_CNY).quantize(
                Decimal("1"),
                rounding=ROUND_FLOOR,
            )
        )

    @property
    def monthly_cny_value(self) -> Decimal:
        return (
            Decimal(self.monthly_quota) / QUOTA_PER_UNIT * USD_EXCHANGE_RATE
        ).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

    @property
    def subtitle(self) -> str:
        return (
            f"月总 ¥{self.price_cny} 可消费额度｜30 天有效｜并发 {self.concurrency_limit}｜"
            "本月额度用完为止"
        )


PLANS = [
    MonthlyCardPlan("¥100 月卡", 100, 3, 100),
    MonthlyCardPlan("¥200 月卡", 200, 2, 200),
    MonthlyCardPlan("¥300 月卡", 300, 5, 300),
    MonthlyCardPlan("¥500 月卡", 500, 8, 500),
    MonthlyCardPlan("¥1000 月卡", 1000, 10, 1000),
]

LEGACY_MONTHLY_CARD_PLAN = MonthlyCardPlan("VIP 旧版 ¥500 月卡", 500, 8, 500)

LEGACY_MONTHLY_CARD_CONCURRENCY = {
    LEGACY_MONTHLY_CARD_PLAN.title: LEGACY_MONTHLY_CARD_PLAN.concurrency_limit,
}

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
  {title}, {subtitle}, {plan.price_cny}, 'CNY', 'day', 30, 0,
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
    currency = 'CNY',
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


def build_legacy_plan_sql() -> str:
    plan = LEGACY_MONTHLY_CARD_PLAN
    title = sql_quote(plan.title)
    subtitle = sql_quote(plan.subtitle)
    return f"""
UPDATE subscription_plans
SET subtitle = {subtitle},
    price_amount = {plan.price_cny},
    currency = 'CNY',
    duration_unit = 'day',
    duration_value = 30,
    custom_seconds = 0,
    enabled = 0,
    allow_balance_pay = 0,
    allow_wallet_overflow = 0,
    total_amount = {plan.monthly_quota},
    monthly_amount_total = {plan.monthly_quota},
    concurrency_limit = {plan.concurrency_limit},
    quota_reset_period = 'never',
    quota_reset_custom_seconds = 0,
    updated_at = @now
WHERE title = {title};
"""


def build_active_subscription_sql() -> str:
    plan_titles = ", ".join(
        sql_quote(plan.title) for plan in (*PLANS, LEGACY_MONTHLY_CARD_PLAN)
    )
    legacy_updates = "\n".join(
        f"""
UPDATE user_subscriptions us
JOIN subscription_plans sp ON sp.id = us.plan_id
SET us.concurrency_limit = {concurrency},
    us.updated_at = @now
WHERE us.status = 'active'
  AND us.end_time > @now
  AND sp.title = {sql_quote(title)}
  AND us.concurrency_limit <> {concurrency};
"""
        for title, concurrency in LEGACY_MONTHLY_CARD_CONCURRENCY.items()
    )
    return f"""
UPDATE user_subscriptions us
JOIN subscription_plans sp ON sp.id = us.plan_id
SET us.amount_total = sp.monthly_amount_total,
    us.monthly_amount_total = sp.monthly_amount_total,
    us.concurrency_limit = sp.concurrency_limit,
    us.allow_wallet_overflow = sp.allow_wallet_overflow,
    us.next_reset_time = 0,
    us.updated_at = @now
WHERE us.status = 'active'
  AND us.end_time > @now
  AND us.monthly_amount_total > 0
  AND sp.title IN ({plan_titles})
  AND GREATEST(us.amount_used, us.monthly_amount_used) < sp.monthly_amount_total
  AND (
    us.amount_total <> sp.monthly_amount_total
    OR us.monthly_amount_total <> sp.monthly_amount_total
    OR us.concurrency_limit <> sp.concurrency_limit
    OR COALESCE(us.allow_wallet_overflow, -1) <> COALESCE(sp.allow_wallet_overflow, -1)
    OR us.next_reset_time > 0
  );

UPDATE user_subscriptions us
JOIN subscription_plans sp ON sp.id = us.plan_id
SET us.amount_total = sp.monthly_amount_total,
    us.monthly_amount_total = sp.monthly_amount_total,
    us.concurrency_limit = sp.concurrency_limit,
    us.allow_wallet_overflow = sp.allow_wallet_overflow,
    us.next_reset_time = 0,
    us.status = 'expired',
    us.end_time = @now,
    us.updated_at = @now
WHERE us.status = 'active'
  AND us.end_time > @now
  AND us.monthly_amount_total > 0
  AND sp.title IN ({plan_titles})
  AND GREATEST(us.amount_used, us.monthly_amount_used) >= sp.monthly_amount_total;

{legacy_updates}

UPDATE subscription_plans
SET enabled = 0,
    updated_at = @now
WHERE title LIKE 'VIP 旧版%';
"""


def build_sql() -> str:
    plan_sql = "\n".join(build_plan_sql(plan) for plan in PLANS)
    return f"""
SET NAMES utf8mb4;
SET @now := UNIX_TIMESTAMP();
START TRANSACTION;

{plan_sql}

{build_legacy_plan_sql()}

{build_active_subscription_sql()}

COMMIT;
"""


def print_summary() -> None:
    print(
        "title\tprice_cny\tcurrency\tmonthly_quota\tmonthly_cny_value"
        "\tquota_reset"
    )
    for plan in PLANS:
        print(
            f"{plan.title}\t{plan.price_cny}\tCNY\t{plan.monthly_quota}\t"
            f"{plan.monthly_cny_value}\tnever"
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
