#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


ROOT = Path(os.environ.get("SHENXIANG_NEW_API_ROOT", "/opt/shenxiang-new-api"))
DEFAULT_BASE_URL = "https://dragtokens.com/v1"
DEFAULT_MODEL = "gpt-5.5"
DEFAULT_MODELS = "gpt-5.5,gpt-5.4,gpt-5.4-mini"
CHANNEL_TAG = "dragtokens-gpt55-responses"
PLAN_TITLE = "¥500 月卡"
QUOTA_PER_USD = 500_000
DAILY_USD = 160
MONTHLY_USD = 4_800
DAILY_QUOTA = DAILY_USD * QUOTA_PER_USD
MONTHLY_QUOTA = MONTHLY_USD * QUOTA_PER_USD
CONCURRENCY_LIMIT = 5
PRIMARY_PRIORITY = 90


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


def mysql(input_sql: str, *, capture: bool = False) -> str:
    password = require_env("MYSQL_ROOT_PASSWORD")
    database = require_env("MYSQL_DATABASE")
    cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        f"MYSQL_PWD={password}",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "--batch",
        "--raw",
        "--skip-column-names",
        "-uroot",
        database,
    ]
    kwargs = {
        "input": input_sql,
        "text": True,
        "check": True,
        "stderr": subprocess.DEVNULL,
    }
    if capture:
        kwargs["stdout"] = subprocess.PIPE
    result = subprocess.run(cmd, **kwargs)
    return result.stdout if capture else ""


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def scalar(query: str) -> str:
    out = mysql(f"SET NAMES utf8mb4;\n{query}", capture=True)
    lines = [line.strip() for line in out.splitlines() if line.strip()]
    return lines[-1] if lines else ""


def table_columns(table: str) -> set[str]:
    out = mysql(f"SHOW COLUMNS FROM `{table}`;", capture=True)
    columns: set[str] = set()
    for line in out.splitlines():
        parts = line.split("\t")
        if parts:
            columns.add(parts[0])
    return columns


def active_groups() -> list[str]:
    out = mysql(
        """
SET NAMES utf8mb4;
SELECT DISTINCT `group` FROM abilities WHERE `group` <> ''
UNION
SELECT DISTINCT `group` FROM users WHERE status = 1 AND `group` <> ''
ORDER BY `group`;
""",
        capture=True,
    )
    groups = {line.strip() for line in out.splitlines() if line.strip()}
    groups.update({"default", "standard", "pro", "code", "internal"})
    return sorted(groups)


def upsert_schema() -> None:
    plan_columns = table_columns("subscription_plans")
    sub_columns = table_columns("user_subscriptions")
    redemption_columns = table_columns("redemptions")
    statements: list[str] = []
    if "monthly_amount_total" not in plan_columns:
        statements.append("ALTER TABLE subscription_plans ADD COLUMN monthly_amount_total BIGINT NOT NULL DEFAULT 0;")
    if "concurrency_limit" not in plan_columns:
        statements.append("ALTER TABLE subscription_plans ADD COLUMN concurrency_limit INT NOT NULL DEFAULT 0;")
    if "monthly_amount_total" not in sub_columns:
        statements.append("ALTER TABLE user_subscriptions ADD COLUMN monthly_amount_total BIGINT NOT NULL DEFAULT 0;")
    if "monthly_amount_used" not in sub_columns:
        statements.append("ALTER TABLE user_subscriptions ADD COLUMN monthly_amount_used BIGINT NOT NULL DEFAULT 0;")
    if "concurrency_limit" not in sub_columns:
        statements.append("ALTER TABLE user_subscriptions ADD COLUMN concurrency_limit INT NOT NULL DEFAULT 0;")
    if "plan_id" not in redemption_columns:
        statements.append("ALTER TABLE redemptions ADD COLUMN plan_id INT NOT NULL DEFAULT 0;")
        statements.append("CREATE INDEX idx_redemptions_plan_id ON redemptions (plan_id);")
    if statements:
        mysql("\n".join(statements))


def normalize_models(raw: str) -> list[str]:
    models: list[str] = []
    seen: set[str] = set()
    for item in raw.replace("\n", ",").split(","):
        model = item.strip()
        if not model or model in seen:
            continue
        seen.add(model)
        models.append(model)
    if not models:
        models.append(DEFAULT_MODEL)
    return models


def upsert_channel(api_key: str, base_url: str, models: list[str]) -> int:
    groups = "default,standard,pro,code,internal"
    models_value = ",".join(models)
    channel_id = scalar(f"SELECT id FROM channels WHERE tag = {sql_quote(CHANNEL_TAG)} ORDER BY id DESC LIMIT 1;")
    if channel_id:
        mysql(
            f"""
SET NAMES utf8mb4;
UPDATE channels
SET type = 1,
    `key` = {sql_quote(api_key)},
    status = 1,
    name = '星人文本 Dragtokens 月卡链路',
    base_url = {sql_quote(base_url)},
    models = {sql_quote(models_value)},
    `group` = {sql_quote(groups)},
    priority = {PRIMARY_PRIORITY},
    weight = 100,
    tag = {sql_quote(CHANNEL_TAG)}
WHERE id = {int(channel_id)};
"""
        )
        return int(channel_id)
    mysql(
        f"""
SET NAMES utf8mb4;
INSERT INTO channels
  (type, `key`, status, name, base_url, models, `group`, priority, weight, tag, created_time)
VALUES
  (1, {sql_quote(api_key)}, 1, '星人文本 Dragtokens 月卡链路', {sql_quote(base_url)}, {sql_quote(models_value)}, {sql_quote(groups)}, {PRIMARY_PRIORITY}, 100, {sql_quote(CHANNEL_TAG)}, UNIX_TIMESTAMP());
"""
    )
    channel_id = scalar(f"SELECT id FROM channels WHERE tag = {sql_quote(CHANNEL_TAG)} ORDER BY id DESC LIMIT 1;")
    if not channel_id:
        raise SystemExit("failed to find dragtokens channel after insert")
    return int(channel_id)


def upsert_model_and_abilities(channel_id: int, model: str) -> None:
    endpoints = json.dumps(
        {
            "chat-completion": "/v1/chat/completions",
            "responses": "/v1/responses",
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    model_id = scalar(f"SELECT id FROM models WHERE model_name = {sql_quote(model)} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;")
    statements = ["SET NAMES utf8mb4;"]
    if model_id:
        statements.append(
            f"""
UPDATE models
SET endpoints = {sql_quote(endpoints)},
    status = 1,
    tags = CASE
      WHEN tags IS NULL OR tags = '' THEN 'text,openai,codex'
      WHEN tags LIKE '%codex%' THEN tags
      ELSE CONCAT(tags, ',codex')
    END,
    updated_time = UNIX_TIMESTAMP()
WHERE id = {int(model_id)};
"""
        )
    else:
        statements.append(
            f"""
INSERT INTO models (model_name, description, tags, endpoints, status, sync_official, created_time, updated_time)
VALUES ({sql_quote(model)}, 'Codex/Pro 号池通道，优先 Responses API', 'text,openai,codex', {sql_quote(endpoints)}, 1, 0, UNIX_TIMESTAMP(), UNIX_TIMESTAMP());
"""
        )
    for group in active_groups():
        statements.append(
            f"""
INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag)
VALUES ({sql_quote(group)}, {sql_quote(model)}, {channel_id}, 1, {PRIMARY_PRIORITY}, 100, {sql_quote(CHANNEL_TAG)})
ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = VALUES(weight), tag = VALUES(tag);
"""
        )
    mysql("\n".join(statements))


def upsert_responses_policy(channel_id: int, model: str) -> None:
    option_columns = table_columns("options")
    option_key_column = "name" if "name" in option_columns else "key"
    quoted_option_key_column = f"`{option_key_column}`"
    raw = scalar(
        "SELECT value FROM options "
        f"WHERE {quoted_option_key_column} = 'global.chat_completions_to_responses_policy' LIMIT 1;"
    )
    try:
        policy = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        policy = {}
    policy["enabled"] = True
    policy["all_channels"] = False
    channel_ids = {int(item) for item in policy.get("channel_ids", []) if str(item).isdigit()}
    channel_ids.add(channel_id)
    policy["channel_ids"] = sorted(channel_ids)
    patterns = set(policy.get("model_patterns", []))
    patterns.add("^" + model.replace(".", "\\.") + "$")
    policy["model_patterns"] = sorted(patterns)
    policy.setdefault("channel_types", [])
    value = json.dumps(policy, ensure_ascii=False, separators=(",", ":"))
    mysql(
        f"""
SET NAMES utf8mb4;
INSERT INTO options ({quoted_option_key_column}, value)
VALUES ('global.chat_completions_to_responses_policy', {sql_quote(value)})
ON DUPLICATE KEY UPDATE value = VALUES(value);
"""
    )


def upsert_plan() -> None:
    subtitle = "每日 $160 官网等值额度｜月总 $4800｜30 天有效｜并发 5｜适合 Codex 重度开发使用"
    plan_id = scalar(f"SELECT id FROM subscription_plans WHERE title = {sql_quote(PLAN_TITLE)} ORDER BY id DESC LIMIT 1;")
    if plan_id:
        mysql(
            f"""
SET NAMES utf8mb4;
UPDATE subscription_plans
SET subtitle = {sql_quote(subtitle)},
    price_amount = 500,
    currency = 'USD',
    duration_unit = 'day',
    duration_value = 30,
    custom_seconds = 0,
    enabled = 1,
    sort_order = 950,
    allow_balance_pay = 0,
    max_purchase_per_user = 0,
    upgrade_group = '',
    total_amount = {DAILY_QUOTA},
    monthly_amount_total = {MONTHLY_QUOTA},
    concurrency_limit = {CONCURRENCY_LIMIT},
    quota_reset_period = 'daily',
    quota_reset_custom_seconds = 0,
    updated_at = UNIX_TIMESTAMP()
WHERE id = {int(plan_id)};
UPDATE subscription_plans
SET enabled = 0, updated_at = UNIX_TIMESTAMP()
WHERE title = {sql_quote(PLAN_TITLE)} AND id <> {int(plan_id)};
"""
        )
        return
    mysql(
        f"""
SET NAMES utf8mb4;
INSERT INTO subscription_plans
  (title, subtitle, price_amount, currency, duration_unit, duration_value, custom_seconds, enabled, sort_order,
   allow_balance_pay, max_purchase_per_user, upgrade_group, total_amount, monthly_amount_total, concurrency_limit,
   quota_reset_period, quota_reset_custom_seconds, created_at, updated_at)
VALUES
  ({sql_quote(PLAN_TITLE)}, {sql_quote(subtitle)}, 500, 'USD', 'day', 30, 0, 1, 950,
   0, 0, '', {DAILY_QUOTA}, {MONTHLY_QUOTA}, {CONCURRENCY_LIMIT},
   'daily', 0, UNIX_TIMESTAMP(), UNIX_TIMESTAMP());
"""
    )


def main() -> None:
    load_dotenv(ROOT / ".env")
    api_key = require_env("DRAGTOKENS_API_KEY")
    base_url = os.environ.get("DRAGTOKENS_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
    models_raw = os.environ.get("DRAGTOKENS_MODELS", "").strip()
    if not models_raw:
        models_raw = os.environ.get("DRAGTOKENS_MODEL", DEFAULT_MODELS)
    models = normalize_models(models_raw)
    upsert_schema()
    channel_id = upsert_channel(api_key, base_url, models)
    for model in models:
        upsert_model_and_abilities(channel_id, model)
        upsert_responses_policy(channel_id, model)
    upsert_plan()
    print(json.dumps({"ok": True, "channel_id": channel_id, "models": models, "plan": PLAN_TITLE}, ensure_ascii=False))


if __name__ == "__main__":
    main()
