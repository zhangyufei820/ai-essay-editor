#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


ROOT = Path(os.environ.get("SHENXIANG_NEW_API_ROOT", "/opt/shenxiang-new-api"))
MODEL_NAME = "image 2电商商品图快速通道(1.5K)"
UPSTREAM_MODEL = "gpt-image-2"
CHANNEL_TAG = "dragtokens-image2-ecommerce"
DEFAULT_BASE_URL = "https://dragtokens.com"
DISPLAY_PRICE_CNY = 0.055
DEFAULT_USD_EXCHANGE_RATE = 7.3
CHANNEL_PRIORITY = 17
CHANNEL_WEIGHT = 100
CLASSIC_UTILS_PATH = ROOT / "build/src-20260606-143624/web/classic/src/helpers/utils.jsx"
DEFAULT_DISPLAY_OVERRIDE_PATH = ROOT / "build/src-20260606-143624/web/default/src/features/pricing/lib/display-overrides.ts"


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


def option_value(key: str) -> str:
    key_column = "name" if "name" in table_columns("options") else "key"
    return scalar(
        f"SELECT value FROM options WHERE `{key_column}` = {sql_quote(key)} LIMIT 1;"
    )


def update_option_json(key: str, updater) -> dict[str, float]:
    option_columns = table_columns("options")
    key_column = "name" if "name" in option_columns else "key"
    raw = scalar(
        f"SELECT value FROM options WHERE `{key_column}` = {sql_quote(key)} LIMIT 1;"
    )
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    updated = updater(data)
    value = json.dumps(updated, ensure_ascii=False, separators=(",", ":"))
    mysql(
        f"""
SET NAMES utf8mb4;
INSERT INTO options (`{key_column}`, value)
VALUES ({sql_quote(key)}, {sql_quote(value)})
ON DUPLICATE KEY UPDATE value = VALUES(value);
"""
    )
    return updated


def model_price_usd() -> float:
    raw_rate = option_value("USDExchangeRate")
    try:
        rate = float(raw_rate)
    except (TypeError, ValueError):
        rate = DEFAULT_USD_EXCHANGE_RATE
    if rate <= 0:
        rate = DEFAULT_USD_EXCHANGE_RATE
    return DISPLAY_PRICE_CNY / rate


def upsert_channel(api_key: str, base_url: str) -> int:
    groups = "default,standard,pro,code,internal"
    mapping = json.dumps({MODEL_NAME: UPSTREAM_MODEL}, ensure_ascii=False, separators=(",", ":"))
    channel_id = scalar(f"SELECT id FROM channels WHERE tag = {sql_quote(CHANNEL_TAG)} ORDER BY id DESC LIMIT 1;")
    if channel_id:
        mysql(
            f"""
SET NAMES utf8mb4;
UPDATE channels
SET type = 1,
    `key` = {sql_quote(api_key)},
    status = 1,
    name = {sql_quote(MODEL_NAME)},
    base_url = {sql_quote(base_url)},
    models = {sql_quote(MODEL_NAME)},
    model_mapping = {sql_quote(mapping)},
    `group` = {sql_quote(groups)},
    priority = {CHANNEL_PRIORITY},
    weight = {CHANNEL_WEIGHT},
    tag = {sql_quote(CHANNEL_TAG)}
WHERE id = {int(channel_id)};
"""
        )
        return int(channel_id)
    mysql(
        f"""
SET NAMES utf8mb4;
INSERT INTO channels
  (type, `key`, status, name, base_url, models, model_mapping, `group`, priority, weight, tag, created_time)
VALUES
  (1, {sql_quote(api_key)}, 1, {sql_quote(MODEL_NAME)}, {sql_quote(base_url)}, {sql_quote(MODEL_NAME)}, {sql_quote(mapping)}, {sql_quote(groups)}, {CHANNEL_PRIORITY}, {CHANNEL_WEIGHT}, {sql_quote(CHANNEL_TAG)}, UNIX_TIMESTAMP());
"""
    )
    channel_id = scalar(f"SELECT id FROM channels WHERE tag = {sql_quote(CHANNEL_TAG)} ORDER BY id DESC LIMIT 1;")
    if not channel_id:
        raise SystemExit("failed to find dragtokens ecommerce image channel after insert")
    return int(channel_id)


def upsert_model_and_abilities(channel_id: int) -> None:
    endpoints = json.dumps(
        {"image-generation": "/v1/images/generations"},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    description = f"{MODEL_NAME}：电商商品图快速通道，实测约 1.5K 输出，按 ¥0.055/张计费。"
    model_id = scalar(f"SELECT id FROM models WHERE model_name = {sql_quote(MODEL_NAME)} AND deleted_at IS NULL ORDER BY id DESC LIMIT 1;")
    statements = ["SET NAMES utf8mb4;"]
    if model_id:
        statements.append(
            f"""
UPDATE models
SET description = {sql_quote(description)},
    icon = 'OpenAI',
    tags = 'image,openai,ecommerce,1.5k,dragtokens',
    endpoints = {sql_quote(endpoints)},
    status = 1,
    sync_official = 0,
    updated_time = UNIX_TIMESTAMP()
WHERE id = {int(model_id)};
"""
        )
    else:
        statements.append(
            f"""
INSERT INTO models (model_name, description, icon, tags, endpoints, status, sync_official, created_time, updated_time)
VALUES ({sql_quote(MODEL_NAME)}, {sql_quote(description)}, 'OpenAI', 'image,openai,ecommerce,1.5k,dragtokens', {sql_quote(endpoints)}, 1, 0, UNIX_TIMESTAMP(), UNIX_TIMESTAMP());
"""
        )
    for group in active_groups():
        statements.append(
            f"""
INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag)
VALUES ({sql_quote(group)}, {sql_quote(MODEL_NAME)}, {channel_id}, 1, {CHANNEL_PRIORITY}, {CHANNEL_WEIGHT}, {sql_quote(CHANNEL_TAG)})
ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = VALUES(weight), tag = VALUES(tag);
"""
        )
    mysql("\n".join(statements))


def upsert_pricing() -> float:
    price = model_price_usd()

    def update_model_price(data: dict[str, float]) -> dict[str, float]:
        data[MODEL_NAME] = price
        return data

    update_option_json("ModelPrice", update_model_price)
    return price


def patch_file(path: Path, needle: str, marker: str, insert: str) -> bool:
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8", errors="replace")
    if marker in text:
        return False
    if needle not in text:
        return False
    path.write_text(text.replace(needle, insert + needle, 1), encoding="utf-8")
    return True


def patch_pricing_display_overrides() -> dict[str, bool]:
    default_insert = """  'image 2电商商品图快速通道(1.5K)': {
    display_name: 'image 2电商商品图快速通道(1.5K)',
    description:
      'image 2电商商品图快速通道(1.5K)：电商商品图快速通道，实测约 1.5K 输出，人民币 ¥0.055/张。',
    fixed_price_label: '¥0.055',
    price_unit_label: '张',
  },
"""
    classic_insert = """  'image 2电商商品图快速通道(1.5K)': {
    display_name: 'image 2电商商品图快速通道(1.5K)',
    description: 'image 2电商商品图快速通道(1.5K)：电商商品图快速通道，实测约 1.5K 输出，人民币 ¥0.055/张。',
    fixed_price_label: '¥0.055',
    price_unit_label: '张',
    billing_label: '按张计费',
  },
"""
    return {
        "default_pricing_override": patch_file(
            DEFAULT_DISPLAY_OVERRIDE_PATH,
            "  'gpt-image-2-4K': {",
            MODEL_NAME,
            default_insert,
        ),
        "classic_pricing_override": patch_file(
            CLASSIC_UTILS_PATH,
            "  'gpt-image-2-4K': {",
            MODEL_NAME,
            classic_insert,
        ),
    }


def main() -> None:
    load_dotenv(ROOT / ".env")
    api_key = require_env("DRAGTOKENS_API_KEY")
    base_url = os.environ.get("DRAGTOKENS_IMAGE_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
    channel_id = upsert_channel(api_key, base_url)
    upsert_model_and_abilities(channel_id)
    price = upsert_pricing()
    patched_files = patch_pricing_display_overrides()
    print(
        json.dumps(
            {
                "ok": True,
                "model": MODEL_NAME,
                "upstream_model": UPSTREAM_MODEL,
                "channel_id": channel_id,
                "price_cny": DISPLAY_PRICE_CNY,
                "model_price": price,
                "patched_files": patched_files,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
