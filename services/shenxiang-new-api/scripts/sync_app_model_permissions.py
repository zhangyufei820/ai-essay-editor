#!/usr/bin/env python3
from __future__ import annotations

import json
import hashlib
import hmac
import os
import stat
import subprocess
import sys
import time
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path("/opt/shenxiang-new-api")
CODEX_ROOT = Path("/opt/shenxiang-codex-workspace")
CODEX_ENV_BACKUP_ROOT = Path("/data/ai-essay-editor-quarantine/model-sync-env-backups")
ADMIN_SYSTEM_TOKEN_USER_ID = 1
MYSQL_QUERY_TIMEOUT_SECONDS = 15
MYSQL_UPDATE_TIMEOUT_SECONDS = 60
REDIS_UPDATE_TIMEOUT_SECONDS = 15
CODEX_REFRESH_TIMEOUT_SECONDS = 180
TOKEN_CACHE_INVALIDATION_ATTEMPTS = 3

TOKEN_PROFILES = {
    "codex": ("星人 Codex 文本令牌", "星人 Codex 自动令牌"),
    "claude": ("星人 Claude 高阶令牌",),
    "image": ("星人图像生成令牌",),
    "video": ("星人视频生成令牌",),
}
USER_CODEX_TOKEN_NAME_PREFIXES = ("星人Codex ",)
MONTHLY_CARD_TOKEN_NAMES = ("月卡专用 Key", "¥500 月卡专用")

RAW_GPT_IMAGE2_MODEL = "gpt-image-2"
GPT_IMAGE2_PRODUCT_MODEL = "gpt-image-2-4K"
INTERNAL_DISCOUNT_IMAGE2_MODEL = "geek2api-image-2"
DISCOUNT_IMAGE2_PUBLIC_MODEL = "特价 image-2"
DISCOUNT_IMAGE2_DESCRIPTION = "特价 image-2：支持 1K/2K/4K 输出，人民币 1K ¥0.03、2K ¥0.06、4K ¥0.10/张。"
DISCOUNT_IMAGE2_TAGS = "image,openai"
DISCOUNT_IMAGE2_ENDPOINTS = '{"image-generation":"/v1/images/generations","image-edit":"/v1/images/edits"}'
CODEX_IMAGE_15K_MODEL = "image 2电商商品图快速通道(1.5K)"
CODEX_IMAGE_15K_PUBLIC_TAGS = "image,openai,ecommerce,1.5k"
SUPPLIER_EXPOSED_MODELS = {
    INTERNAL_DISCOUNT_IMAGE2_MODEL,
}
PUBLIC_ALIAS_BACKING_MODELS = {
    INTERNAL_DISCOUNT_IMAGE2_MODEL: DISCOUNT_IMAGE2_PUBLIC_MODEL,
}
DISCOUNT_TEXT_GROUP = "discount"
DISCOUNT_TEXT_CHANNEL_TAG = "xingren-discount-text"
DISCOUNT_TEXT_ALLOWED_MODELS = (
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
    "gpt-5.5-openai-compact",
    "gpt-5.6-luna",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
)
_DISCOUNT_TEXT_MODEL_REGEX_ALTERNATION = "|".join(
    model.replace(".", "[.]") for model in DISCOUNT_TEXT_ALLOWED_MODELS
)
DISCOUNT_TEXT_MODELS_REGEX = (
    "^(" + _DISCOUNT_TEXT_MODEL_REGEX_ALTERNATION + ")(,(" + _DISCOUNT_TEXT_MODEL_REGEX_ALTERNATION + "))*$"
)
GROK45_MODEL = "grok-4.5"
GROK45_GROUP = "grok45"
GROK45_CHANNEL_TAG = "xingren-grok45"
SUPPLIER_EXPOSED_MARKERS = (
    "ccapi",
    "drag tokens",
    "dragtokens",
    "geek2api",
    "moonapix",
    "relay dance",
    "relaydance",
)
DISABLED_ABILITY_PAIRS = {
    ("12", GPT_IMAGE2_PRODUCT_MODEL),
    ("21", RAW_GPT_IMAGE2_MODEL),
}
TOKEN_MODEL_REPLACEMENTS = {
    RAW_GPT_IMAGE2_MODEL: GPT_IMAGE2_PRODUCT_MODEL,
}

CODEX_ALLOWED_MODELS = [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.6-luna",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
    "gpt-5.5-openai-compact",
    CODEX_IMAGE_15K_MODEL,
]
CODEX_DEFAULT_MODEL = "gpt-5.5"
CODEX_CHAT_FALLBACK_MODEL = "gpt-5.4-mini"
CLAUDE_ALLOWED_MODELS = [
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
]
PUBLIC_SEEDANCE_VIDEO_MODELS = [
    "seedance-2.0-cl-mini",
]
DISABLED_PUBLIC_VIDEO_MODELS = [
    "grok-video-super-720p",
    "seedance-2.0",
    "seedance-2.0-ld-17",
    "seedance-2.0-kz-fast",
    "seedance-2.0-cl-fast",
    "seedance-2.0-cl",
]
PUBLIC_SEEDANCE_MODEL_DESCRIPTIONS = {
    "seedance-2.0-cl-mini": "星人 Seedance 2.0 CL Mini 视频生成｜支持 4-15 秒｜支持图片参考，也可传 1 个视频参考，生成后请及时下载",
}
PUBLIC_SEEDANCE_CHANNEL_ID = "5"
PUBLIC_SEEDANCE_CHANNEL_MODELS = [
    *PUBLIC_SEEDANCE_VIDEO_MODELS,
]
PUBLIC_SEEDANCE_MODEL_MAPPING = '{"seedance-2.0-cl-mini":"seedance-2.0-cl-mini"}'
CODEX_TEXT_CHANNEL_ID = "21"
CODEX_TEXT_CHANNEL_REQUIRED_MODELS = [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.6-luna",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
]
RETIRED_CODEX_TEXT_MODELS = ("gpt-5.3-codex-spark", "gpt-5.3-spark", "gpt-5.4-openai-compact", "codex-auto-review")
PUBLIC_SEEDANCE_TOKEN_PRICES_CNY_PER_1M = {
    # Customer price = official RMB token price * 1.08.
    # New API ratio formula: input CNY per 1M = model_ratio * 2 * USDExchangeRate.
    "seedance-2.0-cl-mini": {
        "input_with_video": Decimal("11.90") * Decimal("1.08"),
        "output": Decimal("19.55") * Decimal("1.08"),
    }
}
OPENAI_TEXT_LONG_CONTEXT_THRESHOLD_TOKENS = 272_000
PUBLIC_OPENAI_TEXT_MODELS = {
    "gpt-5.4": {
        "description": "OpenAI GPT-5.4 文本模型，适合高质量写作、分析和通用推理。",
        "input_cny": Decimal("2.3760"),
        "output_cny": Decimal("14.5800"),
        "cache_read_cny": Decimal("0.2376"),
        "cache_create_cny": Decimal("2.9700"),
        "longcontext_input_cny": Decimal("4.7520"),
        "longcontext_output_cny": Decimal("21.8700"),
        "longcontext_cache_read_cny": Decimal("0.4752"),
        "longcontext_cache_create_cny": Decimal("5.9400"),
    },
    "gpt-5.5": {
        "description": "OpenAI GPT-5.5 文本模型，适合复杂推理、长文分析和高质量代码任务。",
        "input_cny": Decimal("5.4000"),
        "output_cny": Decimal("32.4000"),
        "cache_read_cny": Decimal("0.5400"),
        "cache_create_cny": Decimal("6.7500"),
        "longcontext_input_cny": Decimal("10.8000"),
        "longcontext_output_cny": Decimal("48.6000"),
        "longcontext_cache_read_cny": Decimal("1.0800"),
        "longcontext_cache_create_cny": Decimal("13.5000"),
    },
    "gpt-5.6-luna": {
        "description": "OpenAI GPT-5.6 Luna 文本模型，适合日常对话、写作和轻量推理。",
        "input_cny": Decimal("1.0000"),
        "output_cny": Decimal("6.0000"),
        "cache_read_cny": Decimal("0.1000"),
        "cache_create_cny": Decimal("1.2500"),
        "longcontext_input_cny": Decimal("2.0000"),
        "longcontext_output_cny": Decimal("9.0000"),
        "longcontext_cache_read_cny": Decimal("0.2000"),
        "longcontext_cache_create_cny": Decimal("2.5000"),
    },
    "gpt-5.6-terra": {
        "description": "OpenAI GPT-5.6 Terra 文本模型，适合更高质量的写作、分析和代码任务。",
        "input_cny": Decimal("2.5000"),
        "output_cny": Decimal("15.0000"),
        "cache_read_cny": Decimal("0.2500"),
        "cache_create_cny": Decimal("3.1250"),
        "longcontext_input_cny": Decimal("5.0000"),
        "longcontext_output_cny": Decimal("22.5000"),
        "longcontext_cache_read_cny": Decimal("0.5000"),
        "longcontext_cache_create_cny": Decimal("6.2500"),
    },
    "gpt-5.6-sol": {
        "description": "OpenAI GPT-5.6 Sol 文本模型，适合复杂推理、长文分析和高质量代码任务。",
        "input_cny": Decimal("5.0000"),
        "output_cny": Decimal("30.0000"),
        "cache_read_cny": Decimal("0.5000"),
        "cache_create_cny": Decimal("6.2500"),
        "longcontext_input_cny": Decimal("10.0000"),
        "longcontext_output_cny": Decimal("45.0000"),
        "longcontext_cache_read_cny": Decimal("1.0000"),
        "longcontext_cache_create_cny": Decimal("12.5000"),
    },
}


def mysql(query: str) -> list[list[str]]:
    password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE", "")
    if not password or not database:
        raise RuntimeError("model permission MySQL environment is not loaded")
    env = os.environ.copy()
    env["MYSQL_PWD"] = password
    cmd = [
        "docker",
        "exec",
        "-e",
        "MYSQL_PWD",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "--raw",
        "-uroot",
        "-N",
        "-B",
        database,
        "-e",
        query,
    ]
    try:
        output = subprocess.check_output(
            cmd,
            env=env,
            stderr=subprocess.DEVNULL,
            timeout=MYSQL_QUERY_TIMEOUT_SECONDS,
        ).decode("utf-8", errors="replace")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        raise RuntimeError("model permission MySQL query failed") from None
    rows: list[list[str]] = []
    for line in output.splitlines():
        rows.append(line.split("\t"))
    return rows


def mysql_raw(query: str) -> list[list[str]]:
    password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE", "")
    if not password or not database:
        raise RuntimeError("model permission MySQL environment is not loaded")
    env = os.environ.copy()
    env["MYSQL_PWD"] = password
    cmd = [
        "docker",
        "exec",
        "-e",
        "MYSQL_PWD",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "--raw",
        "-uroot",
        "-N",
        "-B",
        database,
        "-e",
        query,
    ]
    try:
        output = subprocess.check_output(
            cmd,
            env=env,
            stderr=subprocess.DEVNULL,
            timeout=MYSQL_QUERY_TIMEOUT_SECONDS,
        ).decode("utf-8", errors="replace")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        raise RuntimeError("model permission MySQL query failed") from None
    rows: list[list[str]] = []
    for line in output.splitlines():
        rows.append(line.split("\t"))
    return rows


def mysql_exec(query: str) -> list[str]:
    password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE", "")
    if not password or not database:
        raise RuntimeError("model permission MySQL environment is not loaded")
    env = os.environ.copy()
    env["MYSQL_PWD"] = password
    cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        "MYSQL_PWD",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        database,
    ]
    try:
        completed = subprocess.run(
            cmd,
            input=query.encode("utf-8"),
            env=env,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=MYSQL_UPDATE_TIMEOUT_SECONDS,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        raise RuntimeError("model permission MySQL update failed") from None
    return completed.stdout.decode("utf-8", errors="replace").splitlines()


def mysql_status(output: list[str] | None, prefix: str) -> str:
    for line in reversed(output or []):
        if line.startswith(prefix):
            return line.removeprefix(prefix)
    raise RuntimeError("model ability sync returned no completion status")


def token_cache_key(token_key: str) -> str:
    secret = os.environ.get("CRYPTO_SECRET", "")
    if not secret:
        raise RuntimeError("CRYPTO_SECRET is required to invalidate token cache")
    digest = hmac.new(secret.encode("utf-8"), token_key.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"token:{digest}"


def delete_token_caches(token_keys: list[str]) -> int:
    unique_keys = []
    seen: set[str] = set()
    for token_key in token_keys:
        token_key = token_key.strip()
        if not token_key or token_key in seen:
            continue
        seen.add(token_key)
        unique_keys.append(token_key)
    if not unique_keys:
        return 0

    password = os.environ.get("REDIS_PASSWORD", "")
    if not password:
        raise RuntimeError("REDIS_PASSWORD is required to invalidate token cache")
    redis_container = os.environ.get("REDIS_CONTAINER", "shenxiang-new-api-redis")
    env = os.environ.copy()
    env["REDISCLI_AUTH"] = password
    payload = "".join(f"DEL {token_cache_key(token_key)}\n" for token_key in unique_keys)
    for _attempt in range(TOKEN_CACHE_INVALIDATION_ATTEMPTS):
        try:
            subprocess.run(
                ["docker", "exec", "-i", "-e", "REDISCLI_AUTH", redis_container, "redis-cli", "--pipe"],
                input=payload.encode("utf-8"),
                env=env,
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=REDIS_UPDATE_TIMEOUT_SECONDS,
            )
            return len(unique_keys)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
            if _attempt + 1 < TOKEN_CACHE_INVALIDATION_ATTEMPTS:
                time.sleep(_attempt + 1)
    raise RuntimeError("token cache invalidation failed") from None


def active_token_keys() -> list[str]:
    rows = mysql(
        "SELECT COALESCE(`key`, '') FROM tokens "
        "WHERE deleted_at IS NULL AND COALESCE(`key`, '') <> '';"
    )
    return [row[0] for row in rows if row and row[0].strip()]


def invalidate_all_active_token_caches() -> int:
    return delete_token_caches(active_token_keys())


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def whitelisted_sql_identifier(identifier: str, allowed: frozenset[str]) -> str:
    if identifier not in allowed:
        raise ValueError("unsafe SQL identifier")
    return identifier


def binary_string_equals_sql(column: str, value: str) -> str:
    column = whitelisted_sql_identifier(
        column,
        frozenset(
            {
                "tag",
                "current_channel.tag",
                "`group`",
                "current_channel.`group`",
                "models",
                "current_channel.models",
                "model_name",
                "current_model.model_name",
            }
        ),
    )
    return "BINARY COALESCE(" + column + ", '') = BINARY " + sql_quote(value)


def discount_text_models_allowed_sql(column: str) -> str:
    column = whitelisted_sql_identifier(
        column,
        frozenset({"models", "channel.models", "current_channel.models"}),
    )
    return (
        "REPLACE(COALESCE(" + column + ", ''), ' ', '') REGEXP BINARY "
        + sql_quote(DISCOUNT_TEXT_MODELS_REGEX)
    )


def is_retired_codex_text_model(model: str) -> bool:
    return model.strip() in RETIRED_CODEX_TEXT_MODELS


def is_claude_model(model: str) -> bool:
    return model.strip().lower().startswith("claude-")


def is_retired_claude_model(model: str) -> bool:
    model = model.strip()
    return is_claude_model(model) and model not in CLAUDE_ALLOWED_MODELS


def sanitize_token_models(models: list[str]) -> list[str]:
    sanitized: list[str] = []
    seen: set[str] = set()
    for model in models:
        model = model.strip()
        if not model:
            continue
        model = TOKEN_MODEL_REPLACEMENTS.get(model, model)
        if is_retired_codex_text_model(model):
            continue
        if is_retired_claude_model(model):
            continue
        if is_supplier_exposed_model(model):
            continue
        if model in seen:
            continue
        seen.add(model)
        sanitized.append(model)
    return sanitized


def sanitize_model_limits(raw: str) -> str:
    return ",".join(sanitize_token_models(raw.split(",")))


def is_codex_disallowed_image_model(model: str) -> bool:
    normalized = model.strip().lower()
    if model == CODEX_IMAGE_15K_MODEL:
        return False
    return (
        normalized.startswith("gpt-image-")
        or normalized.startswith("dall-e-")
        or normalized.startswith("imagen-")
        or normalized.startswith("banana-")
        or normalized.startswith("grok-imagine-image")
        or normalized.startswith("image 2")
        or "image-preview" in normalized
    )


def sanitize_codex_token_models(models: list[str]) -> list[str]:
    allowed = set(CODEX_ALLOWED_MODELS)
    return [model for model in sanitize_token_models(models) if model in allowed]


def ensure_codex_image_model_limits(raw: str, required_models: list[str] | None = None) -> str:
    models = sanitize_codex_token_models(raw.split(","))
    required = sanitize_codex_token_models(required_models or CODEX_ALLOWED_MODELS)
    if not required:
        required = [CODEX_DEFAULT_MODEL, CODEX_IMAGE_15K_MODEL]
    for model in required:
        if model not in models:
            models.append(model)
    return ",".join(models)


def is_supplier_exposed_model(model: str) -> bool:
    normalized = model.strip().lower()
    if normalized in SUPPLIER_EXPOSED_MODELS:
        return True
    return any(marker in normalized for marker in SUPPLIER_EXPOSED_MARKERS)


def is_public_alias_backing_model(model: str) -> bool:
    return model.strip().lower() in PUBLIC_ALIAS_BACKING_MODELS


def should_sync_ability_model(model: str) -> bool:
    if is_retired_codex_text_model(model):
        return False
    if is_retired_claude_model(model):
        return False
    return is_public_alias_backing_model(model) or not is_supplier_exposed_model(model)


def is_hidden_pricing_model(model: str) -> bool:
    return (
        model.strip() == RAW_GPT_IMAGE2_MODEL
        or is_retired_codex_text_model(model)
        or is_retired_claude_model(model)
        or is_supplier_exposed_model(model)
    )


def supplier_exposed_model_limit_predicate() -> str:
    terms = [RAW_GPT_IMAGE2_MODEL, *SUPPLIER_EXPOSED_MARKERS]
    clauses = [
        "COALESCE(model_limits, '') LIKE " + sql_quote(f"%{term}%")
        for term in terms
    ]
    return " OR ".join(clauses)


def retired_codex_text_model_limit_predicate() -> str:
    clauses = [
        "FIND_IN_SET(" + sql_quote(model) + ", COALESCE(model_limits, '')) > 0"
        for model in RETIRED_CODEX_TEXT_MODELS
    ]
    return " OR ".join(clauses)


def retired_claude_model_limit_predicate() -> str:
    return (
        "LOWER(COALESCE(model_limits, '')) LIKE '%claude%' "
        + "AND NOT ("
        + " AND ".join(
            "COALESCE(model_limits, '') NOT LIKE " + sql_quote(f"%{model}%")
            for model in CLAUDE_ALLOWED_MODELS
        )
        + ")"
    )


def supplier_exposed_model_name_predicate(column: str = "model", *, exclude_public_alias_backing: bool = False) -> str:
    column = whitelisted_sql_identifier(column, frozenset({"model", "model_name"}))
    terms = [*SUPPLIER_EXPOSED_MODELS, *SUPPLIER_EXPOSED_MARKERS]
    clauses = [
        f"COALESCE({column}, '') LIKE " + sql_quote(f"%{term}%")
        for term in terms
    ]
    predicate = " OR ".join(clauses)
    if not exclude_public_alias_backing:
        return predicate
    backing_models = ", ".join(sql_quote(model) for model in PUBLIC_ALIAS_BACKING_MODELS)
    return (
        "("
        + predicate
        + f") AND LOWER(TRIM(COALESCE({column}, ''))) NOT IN ("
        + backing_models
        + ")"
    )


def is_disabled_ability_pair(channel_id: str, model: str) -> bool:
    return (str(channel_id).strip(), model.strip()) in DISABLED_ABILITY_PAIRS


def option_value(key: str) -> str | None:
    rows = mysql_raw(f"SELECT `value` FROM options WHERE `key` = {sql_quote(key)} LIMIT 1")
    if not rows:
        return None
    return rows[0][0]


def parse_json_option(key: str) -> dict[str, float]:
    raw = option_value(key)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in option {key}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"option {key} must be a JSON object")
    result: dict[str, float] = {}
    for name, value in parsed.items():
        if isinstance(name, str) and isinstance(value, (int, float)):
            result[name] = float(value)
    return result


def parse_json_string_option(key: str) -> dict[str, str]:
    raw = option_value(key)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON in option {key}") from exc
    if not isinstance(parsed, dict):
        raise ValueError(f"option {key} must be a JSON object")
    result: dict[str, str] = {}
    for name, value in parsed.items():
        if isinstance(name, str) and isinstance(value, str):
            result[name] = value
    return result


def upsert_json_option(key: str, values: dict[str, float]) -> None:
    payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    mysql_exec(
        "INSERT INTO options (`key`, `value`) VALUES ("
        + sql_quote(key)
        + ", "
        + sql_quote(payload)
        + ") ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);"
    )


def upsert_json_string_option(key: str, values: dict[str, str]) -> None:
    payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    mysql_exec(
        "INSERT INTO options (`key`, `value`) VALUES ("
        + sql_quote(key)
        + ", "
        + sql_quote(payload)
        + ") ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);"
    )


def decimal_to_float(value: Decimal, places: str = "0.000000000001") -> float:
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def decimal_to_expr_literal(value: Decimal) -> str:
    quantized = value.quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP)
    return format(quantized.normalize(), "f")


def usd_exchange_rate() -> Decimal:
    raw = option_value("USDExchangeRate") or "7.3"
    try:
        rate = Decimal(raw)
    except Exception as exc:
        raise ValueError("USDExchangeRate must be a decimal number") from exc
    if not rate.is_finite() or rate <= 0:
        raise ValueError("USDExchangeRate must be greater than 0")
    return rate


def sync_public_seedance_pricing() -> None:
    model_ratios = parse_json_option("ModelRatio")
    completion_ratios = parse_json_option("CompletionRatio")
    model_prices = parse_json_option("ModelPrice")
    exchange_rate = usd_exchange_rate()

    for model, prices in PUBLIC_SEEDANCE_TOKEN_PRICES_CNY_PER_1M.items():
        input_cny = prices["input_with_video"]
        output_cny = prices["output"]
        model_ratio = input_cny / (Decimal("2") * exchange_rate)
        completion_ratio = output_cny / input_cny
        model_ratios[model] = decimal_to_float(model_ratio)
        completion_ratios[model] = decimal_to_float(completion_ratio)
        model_prices.pop(model, None)

    upsert_json_option("ModelRatio", model_ratios)
    upsert_json_option("CompletionRatio", completion_ratios)
    upsert_json_option("ModelPrice", model_prices)


def openai_text_price_usd_literal(prices: dict[str, object], key: str, exchange_rate: Decimal) -> str:
    value = prices[key]
    if not isinstance(value, Decimal):
        raise TypeError(f"{key} must be Decimal")
    return decimal_to_expr_literal(value / exchange_rate)


def openai_text_tier_expr(prices: dict[str, object], exchange_rate: Decimal, prefix: str = "") -> str:
    tier_name = prefix.rstrip("_") or "base"
    return (
        "tier("
        + json.dumps(tier_name)
        + ", p * "
        + openai_text_price_usd_literal(prices, f"{prefix}input_cny", exchange_rate)
        + " + c * "
        + openai_text_price_usd_literal(prices, f"{prefix}output_cny", exchange_rate)
        + " + cr * "
        + openai_text_price_usd_literal(prices, f"{prefix}cache_read_cny", exchange_rate)
        + " + cc * "
        + openai_text_price_usd_literal(prices, f"{prefix}cache_create_cny", exchange_rate)
        + ")"
    )


def openai_text_billing_expr(prices: dict[str, object], exchange_rate: Decimal) -> str:
    base_expr = openai_text_tier_expr(prices, exchange_rate)
    longcontext_expr = openai_text_tier_expr(prices, exchange_rate, "longcontext_")
    return (
        f"len <= {OPENAI_TEXT_LONG_CONTEXT_THRESHOLD_TOKENS} ? "
        + base_expr
        + " : "
        + longcontext_expr
    )


def ensure_public_openai_text_models() -> None:
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    for model, config in PUBLIC_OPENAI_TEXT_MODELS.items():
        statements.append(
            "SET @openai_text_model := "
            + sql_quote(model)
            + " COLLATE utf8mb4_unicode_ci;"
            "SET @keep_model_id := ("
            "SELECT MIN(id) FROM models WHERE model_name = @openai_text_model AND deleted_at IS NULL"
            ");"
            "SET @keep_model_id := IFNULL(@keep_model_id, ("
            "SELECT MIN(id) FROM models WHERE model_name = @openai_text_model"
            "));"
            "INSERT INTO models "
            "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
            "SELECT "
            + ", ".join(
                [
                    "@openai_text_model",
                    sql_quote(str(config["description"])),
                    sql_quote("OpenAI"),
                    sql_quote("text,openai,codex"),
                    "1",
                    sql_quote(str(config.get("endpoints", '{"openai":"/v1/chat/completions"}'))),
                    "1",
                    "0",
                    "@now",
                    "@now",
                    "0",
                ]
            )
            + " WHERE @keep_model_id IS NULL;"
            "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());"
            "UPDATE models SET "
            "description = "
            + sql_quote(str(config["description"]))
            + ", icon = "
            + sql_quote("OpenAI")
            + ", tags = "
            + sql_quote("text,openai,codex")
            + ", vendor_id = 1, endpoints = "
            + sql_quote(str(config.get("endpoints", '{"openai":"/v1/chat/completions"}')))
            + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
            "WHERE id = @keep_model_id;"
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            "WHERE model_name = @openai_text_model AND id <> @keep_model_id;"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def sync_public_openai_text_pricing() -> None:
    model_ratios = parse_json_option("ModelRatio")
    completion_ratios = parse_json_option("CompletionRatio")
    cache_ratios = parse_json_option("CacheRatio")
    create_cache_ratios = parse_json_option("CreateCacheRatio")
    model_prices = parse_json_option("ModelPrice")
    billing_modes = parse_json_string_option("billing_setting.billing_mode")
    billing_exprs = parse_json_string_option("billing_setting.billing_expr")
    exchange_rate = usd_exchange_rate()

    for model, prices in PUBLIC_OPENAI_TEXT_MODELS.items():
        input_cny = prices["input_cny"]
        # Model plaza prices are the actual RMB sale prices. New API displays
        # input CNY per 1M as model_ratio * 2 * USDExchangeRate.
        model_ratios[model] = decimal_to_float(input_cny / (Decimal("2") * exchange_rate))
        completion_ratios[model] = decimal_to_float(prices["output_cny"] / input_cny)
        cache_ratios[model] = decimal_to_float(prices["cache_read_cny"] / input_cny)
        create_cache_ratios[model] = decimal_to_float(prices["cache_create_cny"] / input_cny)
        model_prices.pop(model, None)
        billing_modes[model] = "tiered_expr"
        billing_exprs[model] = openai_text_billing_expr(prices, exchange_rate)

    upsert_json_option("ModelRatio", model_ratios)
    upsert_json_option("CompletionRatio", completion_ratios)
    upsert_json_option("CacheRatio", cache_ratios)
    upsert_json_option("CreateCacheRatio", create_cache_ratios)
    upsert_json_option("ModelPrice", model_prices)
    upsert_json_string_option("billing_setting.billing_mode", billing_modes)
    upsert_json_string_option("billing_setting.billing_expr", billing_exprs)


def ensure_codex_text_channel_models() -> dict[str, int]:
    rows = mysql(
        "SELECT COALESCE(models, ''), COALESCE(model_mapping, '') FROM channels WHERE id = "
        + CODEX_TEXT_CHANNEL_ID
        + " LIMIT 1;"
    )
    if not rows:
        return {"channel_found": 0, "models_updated": 0, "mapping_updated": 0, "models_retired": 0, "mapping_retired": 0}

    raw_models = rows[0][0].strip()
    models = [item.strip() for item in raw_models.split(",") if item.strip()]
    models_changed = False
    retired_models = [model for model in models if is_retired_codex_text_model(model)]
    if retired_models:
        models = [model for model in models if not is_retired_codex_text_model(model)]
        models_changed = True
    for model in CODEX_TEXT_CHANNEL_REQUIRED_MODELS:
        if model not in models:
            models.append(model)
            models_changed = True

    raw_mapping = rows[0][1].strip()
    mapping: dict[str, str] = {}
    if raw_mapping:
        try:
            parsed = json.loads(raw_mapping)
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid JSON model_mapping for channel {CODEX_TEXT_CHANNEL_ID}") from exc
        if not isinstance(parsed, dict):
            raise ValueError(f"model_mapping for channel {CODEX_TEXT_CHANNEL_ID} must be a JSON object")
        mapping = {str(key): str(value) for key, value in parsed.items() if str(key).strip()}

    mapping_changed = False
    retired_mapping_keys = [
        key
        for key, value in mapping.items()
        if is_retired_codex_text_model(key) or is_retired_codex_text_model(value)
    ]
    if retired_mapping_keys:
        for key in retired_mapping_keys:
            mapping.pop(key, None)
        mapping_changed = True

    if models_changed or mapping_changed:
        payload = json.dumps(mapping, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        mysql_exec(
            "UPDATE channels SET models = "
            + sql_quote(",".join(models))
            + ", model_mapping = "
            + sql_quote(payload)
            + " WHERE id = "
            + CODEX_TEXT_CHANNEL_ID
            + ";"
        )
    return {
        "channel_found": 1,
        "models_updated": int(models_changed),
        "mapping_updated": int(mapping_changed),
        "models_retired": len(retired_models),
        "mapping_retired": len(retired_mapping_keys),
    }


def retire_codex_text_models() -> dict[str, int]:
    retired_models = ", ".join(sql_quote(model) for model in RETIRED_CODEX_TEXT_MODELS)
    active_model_rows = mysql(
        "SELECT COUNT(*) FROM models WHERE deleted_at IS NULL AND status = 1 AND model_name IN ("
        + retired_models
        + ");"
    )
    ability_rows = mysql(
        "SELECT COUNT(*) FROM abilities WHERE enabled = 1 AND model IN ("
        + retired_models
        + ");"
    )
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND model_limits_enabled = 1 "
        "AND ("
        + retired_codex_text_model_limit_predicate()
        + ");"
    )
    token_updates: list[tuple[str, str, str]] = []
    for token_id, token_key, raw_limits in token_rows:
        next_limits = sanitize_model_limits(raw_limits)
        if next_limits != raw_limits:
            token_updates.append((token_id, next_limits, token_key))

    pricing_options_sanitized = 0
    for key in ("ModelRatio", "CompletionRatio", "CacheRatio", "CreateCacheRatio", "ModelPrice"):
        values = parse_json_option(key)
        sanitized = {
            model: value
            for model, value in values.items()
            if not is_retired_codex_text_model(model)
        }
        if sanitized != values:
            upsert_json_option(key, sanitized)
            pricing_options_sanitized += 1

    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    statements.append(
        "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
        "WHERE model_name IN ("
        + retired_models
        + ");"
    )
    statements.append(
        "UPDATE abilities SET enabled = 0 WHERE model IN ("
        + retired_models
        + ");"
    )
    for token_id, next_limits, _token_key in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits = "
            + sql_quote(next_limits)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches([token_key for _token_id, _next_limits, token_key in token_updates])
    return {
        "active_models_retired": int(active_model_rows[0][0]) if active_model_rows else 0,
        "abilities_disabled": int(ability_rows[0][0]) if ability_rows else 0,
        "pricing_options_sanitized": pricing_options_sanitized,
        "tokens_rewritten": len(token_updates),
        "token_caches_deleted": caches_deleted,
    }


def retire_claude_models() -> dict[str, int]:
    allowed_models = ", ".join(sql_quote(model) for model in CLAUDE_ALLOWED_MODELS)
    active_model_rows = mysql(
        "SELECT COUNT(*) FROM models WHERE deleted_at IS NULL AND status = 1 "
        "AND LOWER(model_name) LIKE 'claude-%' AND model_name NOT IN ("
        + allowed_models
        + ");"
    )
    ability_rows = mysql(
        "SELECT COUNT(*) FROM abilities WHERE enabled = 1 "
        "AND LOWER(model) LIKE 'claude-%' AND model NOT IN ("
        + allowed_models
        + ");"
    )
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND model_limits_enabled = 1 "
        "AND LOWER(COALESCE(model_limits, '')) LIKE '%claude%';"
    )
    token_updates: list[tuple[str, str, str]] = []
    for token_id, token_key, raw_limits in token_rows:
        next_limits = sanitize_model_limits(raw_limits)
        if next_limits != raw_limits:
            token_updates.append((token_id, next_limits, token_key))

    channel_rows = mysql(
        "SELECT id, COALESCE(models, ''), COALESCE(model_mapping, '') FROM channels "
        "WHERE LOWER(COALESCE(models, '')) LIKE '%claude%' OR LOWER(COALESCE(model_mapping, '')) LIKE '%claude%';"
    )
    channel_updates: list[tuple[str, str, str]] = []
    channel_models_removed = 0
    channel_mapping_removed = 0
    for channel_id, raw_models, raw_mapping in channel_rows:
        models = [model.strip() for model in raw_models.split(",") if model.strip()]
        next_models = [model for model in models if not is_retired_claude_model(model)]
        channel_models_removed += len(models) - len(next_models)

        mapping: dict[str, str] = {}
        if raw_mapping.strip():
            try:
                parsed = json.loads(raw_mapping)
            except json.JSONDecodeError as exc:
                raise ValueError(f"invalid JSON model_mapping for channel {channel_id}") from exc
            if not isinstance(parsed, dict):
                raise ValueError(f"model_mapping for channel {channel_id} must be a JSON object")
            mapping = {str(key): str(value) for key, value in parsed.items() if str(key).strip()}
        next_mapping = {
            key: value
            for key, value in mapping.items()
            if not is_retired_claude_model(key) and not is_retired_claude_model(value)
        }
        channel_mapping_removed += len(mapping) - len(next_mapping)

        if next_models != models or next_mapping != mapping:
            channel_updates.append(
                (
                    channel_id,
                    ",".join(next_models),
                    json.dumps(next_mapping, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
                )
            )

    pricing_options_sanitized = 0
    for key in ("ModelRatio", "CompletionRatio", "CacheRatio", "CreateCacheRatio", "ModelPrice"):
        values = parse_json_option(key)
        sanitized = {
            model: value
            for model, value in values.items()
            if not is_retired_claude_model(model)
        }
        if sanitized != values:
            upsert_json_option(key, sanitized)
            pricing_options_sanitized += 1

    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    statements.append(
        "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
        "WHERE LOWER(model_name) LIKE 'claude-%' AND model_name NOT IN ("
        + allowed_models
        + ");"
    )
    statements.append(
        "UPDATE abilities SET enabled = 0 WHERE LOWER(model) LIKE 'claude-%' AND model NOT IN ("
        + allowed_models
        + ");"
    )
    for channel_id, next_models, next_mapping in channel_updates:
        statements.append(
            "UPDATE channels SET models = "
            + sql_quote(next_models)
            + ", model_mapping = "
            + sql_quote(next_mapping)
            + " WHERE id = "
            + sql_quote(channel_id)
            + ";"
        )
    for token_id, next_limits, _token_key in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits = "
            + sql_quote(next_limits)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches([token_key for _token_id, _next_limits, token_key in token_updates])
    return {
        "active_models_retired": int(active_model_rows[0][0]) if active_model_rows else 0,
        "abilities_disabled": int(ability_rows[0][0]) if ability_rows else 0,
        "channel_models_removed": channel_models_removed,
        "channel_mapping_removed": channel_mapping_removed,
        "pricing_options_sanitized": pricing_options_sanitized,
        "tokens_rewritten": len(token_updates),
        "token_caches_deleted": caches_deleted,
    }


def sync_supplier_safe_public_metadata() -> dict[str, int]:
    sanitized_options = 0
    for key in ("ModelRatio", "CompletionRatio", "ModelPrice"):
        values = parse_json_option(key)
        sanitized = {
            model: value
            for model, value in values.items()
            if not is_hidden_pricing_model(model)
        }
        if sanitized != values:
            upsert_json_option(key, sanitized)
            sanitized_options += 1

    mysql_exec(
        "UPDATE models SET tags = "
        + sql_quote(CODEX_IMAGE_15K_PUBLIC_TAGS)
        + ", updated_time = UNIX_TIMESTAMP() "
        "WHERE deleted_at IS NULL AND model_name = "
        + sql_quote(CODEX_IMAGE_15K_MODEL)
        + ";"
    )
    return {"pricing_options_sanitized": sanitized_options, "public_model_tags_synced": 1}


def model_lists() -> dict[str, list[str]]:
    rows = mysql(
        """
        SELECT id, model_name, COALESCE(tags, '')
        FROM models
        WHERE deleted_at IS NULL AND status = 1
        ORDER BY id
        """
    )
    profiles = {"codex": [], "claude": [], "image": [], "video": []}

    def append_model(profile: str, model: str) -> None:
        if is_retired_codex_text_model(model):
            return
        if is_retired_claude_model(model):
            return
        if model in TOKEN_MODEL_REPLACEMENTS:
            return
        if model not in profiles[profile]:
            profiles[profile].append(model)

    for _id, model, raw_tags in rows:
        tags = {item.strip().lower() for item in raw_tags.split(",") if item.strip()}
        if "internal-hidden" in tags:
            continue
        if "video" in tags:
            append_model("video", model)
            continue
        if "image" in tags:
            if is_supplier_exposed_model(model):
                continue
            append_model("image", model)
            continue
        if "claude" in tags or model.startswith("claude-"):
            append_model("claude", model)
            continue
        if "text" in tags and ("openai" in tags or "codex" in tags or model.startswith("gpt-") or model == "codex-auto-review"):
            append_model("codex", model)
    available_codex_models = set(profiles["codex"]) | set(profiles["image"])
    profiles["codex"] = [model for model in CODEX_ALLOWED_MODELS if model in available_codex_models]
    if DISCOUNT_IMAGE2_PUBLIC_MODEL not in profiles["image"]:
        profiles["image"].append(DISCOUNT_IMAGE2_PUBLIC_MODEL)
    for model in PUBLIC_SEEDANCE_VIDEO_MODELS:
        if model not in profiles["video"]:
            profiles["video"].append(model)
    return profiles


def active_groups() -> list[str]:
    groups = {"default", "standard", "pro", "code", "internal"}
    for row in mysql("SELECT DISTINCT `group` FROM users WHERE status = 1 AND `group` <> ''"):
        if row and row[0]:
            groups.add(row[0])
    for row in mysql("SELECT DISTINCT `group` FROM abilities WHERE `group` <> ''"):
        if row and row[0]:
            groups.add(row[0])
    return sorted(groups)


def ensure_public_seedance_models() -> None:
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    if DISABLED_PUBLIC_VIDEO_MODELS:
        disabled_models = ", ".join(sql_quote(model) for model in DISABLED_PUBLIC_VIDEO_MODELS)
        statements.append(
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            f"WHERE model_name IN ({disabled_models});"
        )
        statements.append(
            f"UPDATE abilities SET enabled = 0 WHERE model IN ({disabled_models});"
        )
    for model in PUBLIC_SEEDANCE_VIDEO_MODELS:
        description = PUBLIC_SEEDANCE_MODEL_DESCRIPTIONS[model]
        statements.append(
            "SET @seedance_model := "
            + sql_quote(model)
            + " COLLATE utf8mb4_unicode_ci;"
            "SET @keep_model_id := ("
            "SELECT MIN(id) FROM models WHERE model_name = @seedance_model AND deleted_at IS NULL"
            ");"
            "SET @keep_model_id := IFNULL(@keep_model_id, ("
            "SELECT MIN(id) FROM models WHERE model_name = @seedance_model"
            "));"
            "INSERT INTO models "
            "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
            "SELECT "
            + ", ".join(
                [
                    "@seedance_model",
                    sql_quote(description),
                    sql_quote("Doubao.Color"),
                    sql_quote("video,seedance"),
                    "4",
                    sql_quote('{"openai-video":"/v1/videos"}'),
                    "1",
                    "0",
                    "@now",
                    "@now",
                    "0",
                ]
            )
            + " WHERE @keep_model_id IS NULL;"
            "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());"
            "UPDATE models SET "
            "description = "
            + sql_quote(description)
            + ", icon = "
            + sql_quote("Doubao.Color")
            + ", tags = "
            + sql_quote("video,seedance")
            + ", vendor_id = 4, endpoints = "
            + sql_quote('{"openai-video":"/v1/videos"}')
            + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
            "WHERE id = @keep_model_id;"
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            "WHERE model_name = @seedance_model AND id <> @keep_model_id;"
        )
    statements.append(
        "UPDATE channels SET models = "
        + sql_quote(",".join(PUBLIC_SEEDANCE_CHANNEL_MODELS))
        + ", model_mapping = "
        + sql_quote(PUBLIC_SEEDANCE_MODEL_MAPPING)
        + " WHERE id = "
        + PUBLIC_SEEDANCE_CHANNEL_ID
        + ";"
    )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def ensure_discount_image2_backing_model() -> None:
    statements = [
        "START TRANSACTION;",
        "SET @now := UNIX_TIMESTAMP();",
        "SET @discount_image2_model := "
        + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
        + " COLLATE utf8mb4_unicode_ci;",
        "SET @keep_model_id := ("
        "SELECT MIN(id) FROM models WHERE model_name = @discount_image2_model AND deleted_at IS NULL"
        ");",
        "SET @keep_model_id := IFNULL(@keep_model_id, ("
        "SELECT MIN(id) FROM models WHERE model_name = @discount_image2_model"
        "));",
        "INSERT INTO models "
        "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
        "SELECT "
        + ", ".join(
            [
                "@discount_image2_model",
                sql_quote(DISCOUNT_IMAGE2_DESCRIPTION),
                sql_quote("OpenAI"),
                sql_quote(DISCOUNT_IMAGE2_TAGS),
                "1",
                sql_quote(DISCOUNT_IMAGE2_ENDPOINTS),
                "1",
                "0",
                "@now",
                "@now",
                "0",
            ]
        )
        + " WHERE @keep_model_id IS NULL;",
        "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());",
        "UPDATE models SET "
        "description = "
        + sql_quote(DISCOUNT_IMAGE2_DESCRIPTION)
        + ", icon = "
        + sql_quote("OpenAI")
        + ", tags = "
        + sql_quote(DISCOUNT_IMAGE2_TAGS)
        + ", vendor_id = 1, endpoints = "
        + sql_quote(DISCOUNT_IMAGE2_ENDPOINTS)
        + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
        "WHERE id = @keep_model_id;",
        "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
        "WHERE model_name = @discount_image2_model AND id <> @keep_model_id;",
        "COMMIT;",
    ]
    mysql_exec("\n".join(statements))


def sync_tokens(profiles: dict[str, list[str]]) -> None:
    statements = ["START TRANSACTION;"]
    for profile, names in TOKEN_PROFILES.items():
        models = ",".join(sanitize_token_models(profiles[profile]))
        for name in names:
            statements.append(
                "UPDATE tokens "
                "SET model_limits_enabled = 1, model_limits = "
                + sql_quote(models)
                + " WHERE deleted_at IS NULL AND name = "
                + sql_quote(name)
                + " AND user_id = "
                + str(ADMIN_SYSTEM_TOKEN_USER_ID)
                + ";"
            )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    managed_names = [name for names in TOKEN_PROFILES.values() for name in names]
    token_rows = mysql(
        "SELECT COALESCE(`key`, '') FROM tokens WHERE user_id = "
        + str(ADMIN_SYSTEM_TOKEN_USER_ID)
        + " AND name IN ("
        + ", ".join(sql_quote(name) for name in managed_names)
        + ");"
    )
    delete_token_caches([row[0] for row in token_rows])


def sync_user_codex_tokens(profiles: dict[str, list[str]] | None = None) -> dict[str, int]:
    names = TOKEN_PROFILES["codex"]
    required_models = profiles["codex"] if profiles and profiles.get("codex") else CODEX_ALLOWED_MODELS
    name_predicates = [
        "name IN (" + ", ".join(sql_quote(name) for name in (*names, *MONTHLY_CARD_TOKEN_NAMES)) + ")",
        *[
            "name LIKE " + sql_quote(prefix + "%")
            for prefix in USER_CODEX_TOKEN_NAME_PREFIXES
        ],
    ]
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, ''), COALESCE(model_limits_enabled, 0) FROM tokens "
        "WHERE deleted_at IS NULL "
        "AND (" + " OR ".join(name_predicates) + ") "
        "AND user_id <> "
        + str(ADMIN_SYSTEM_TOKEN_USER_ID)
        + ";"
    )
    all_token_keys = [row[1] for row in token_rows]
    token_updates: list[tuple[str, str, str]] = []
    for token_id, token_key, raw_limits, raw_enabled in token_rows:
        next_limits = ensure_codex_image_model_limits(raw_limits, required_models)
        if next_limits != raw_limits or raw_enabled != "1":
            token_updates.append((token_id, next_limits, token_key))

    statements = ["START TRANSACTION;"]
    for token_id, next_limits, _token_key in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
            + sql_quote(next_limits)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches(all_token_keys)
    return {"tokens_rewritten": len(token_updates), "token_caches_deleted": caches_deleted}


def sync_abilities() -> None:
    groups = active_groups()
    channel_rows = mysql(
        """
        SELECT id, COALESCE(models, ''), COALESCE(priority, 0), COALESCE(weight, 0),
               COALESCE(tag, ''), COALESCE(`group`, '')
        FROM channels
        WHERE status = 1 AND COALESCE(models, '') <> ''
        ORDER BY id
        """
    )
    existing_models = {
        row[0]
        for row in mysql("SELECT model_name FROM models WHERE deleted_at IS NULL AND status = 1")
        if should_sync_ability_model(row[0])
    }
    discount_allowed_models = set(DISCOUNT_TEXT_ALLOWED_MODELS)
    discount_tag_matches = binary_string_equals_sql("tag", DISCOUNT_TEXT_CHANNEL_TAG)
    grok_tag_matches = binary_string_equals_sql("tag", GROK45_CHANNEL_TAG)
    discount_group_matches = binary_string_equals_sql("`group`", DISCOUNT_TEXT_GROUP)
    grok_group_matches = binary_string_equals_sql("`group`", GROK45_GROUP)
    grok_models_match = binary_string_equals_sql("models", GROK45_MODEL)
    managed_channel_condition = (
        "("
        + discount_tag_matches
        + " OR "
        + grok_tag_matches
        + ") OR FIND_IN_SET("
        + sql_quote(DISCOUNT_TEXT_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0"
        + " OR FIND_IN_SET("
        + sql_quote(GROK45_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0"
        + " OR FIND_IN_SET("
        + sql_quote(GROK45_MODEL)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0"
    )
    model_lock_names = sorted(existing_models | {GROK45_MODEL})
    statements = [
        "START TRANSACTION;",
        "SELECT id FROM channels WHERE "
        + managed_channel_condition
        + " ORDER BY id FOR UPDATE;",
        "SELECT id FROM models WHERE model_name IN ("
        + ", ".join(sql_quote(model) for model in model_lock_names)
        + ") AND deleted_at IS NULL ORDER BY id FOR UPDATE;",
        "SET @discount_tag_count := (SELECT COUNT(*) FROM channels WHERE "
        + discount_tag_matches
        + ");",
        "SET @discount_valid_channel_count := (SELECT COUNT(*) FROM channels WHERE "
        + discount_tag_matches
        + " AND "
        + discount_group_matches
        + " AND "
        + discount_text_models_allowed_sql("models")
        + ");",
        "SET @discount_group_conflict_count := (SELECT COUNT(*) FROM channels WHERE NOT ("
        + discount_tag_matches
        + ") AND FIND_IN_SET("
        + sql_quote(DISCOUNT_TEXT_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0);",
        "SET @grok_tag_count := (SELECT COUNT(*) FROM channels WHERE "
        + grok_tag_matches
        + ");",
        "SET @grok_valid_channel_count := (SELECT COUNT(*) FROM channels WHERE "
        + grok_tag_matches
        + " AND "
        + grok_group_matches
        + " AND "
        + grok_models_match
        + ");",
        "SET @grok_group_conflict_count := (SELECT COUNT(*) FROM channels WHERE NOT ("
        + grok_tag_matches
        + ") AND FIND_IN_SET("
        + sql_quote(GROK45_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0);",
        "SET @grok_model_channel_conflict_count := (SELECT COUNT(*) FROM channels WHERE NOT ("
        + grok_tag_matches
        + ") AND FIND_IN_SET("
        + sql_quote(GROK45_MODEL)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0);",
        "SET @grok_active_model_count := (SELECT COUNT(*) FROM models WHERE "
        + binary_string_equals_sql("model_name", GROK45_MODEL)
        + " AND deleted_at IS NULL AND status = 1);",
        "SET @discount_sync_status := CASE "
        "WHEN @discount_tag_count > 1 THEN 'discount_duplicate_tag' "
        "WHEN @discount_tag_count = 1 AND @discount_valid_channel_count <> 1 THEN 'discount_invalid_profile' "
        "WHEN @discount_group_conflict_count > 0 THEN 'discount_group_conflict' "
        "ELSE 'ok' END;",
        "SET @grok_sync_status := CASE "
        "WHEN @grok_tag_count > 1 THEN 'grok_duplicate_tag' "
        "WHEN @grok_tag_count = 1 AND @grok_valid_channel_count <> 1 THEN 'grok_invalid_profile' "
        "WHEN @grok_group_conflict_count > 0 OR @grok_model_channel_conflict_count > 0 "
        "THEN 'grok_channel_conflict' "
        "WHEN @grok_tag_count = 1 AND @grok_active_model_count <> 1 THEN 'grok_model_cardinality' "
        "ELSE 'ok' END;",
        "SET @ability_sync_status := CASE "
        "WHEN @discount_sync_status <> 'ok' THEN @discount_sync_status "
        "WHEN @grok_sync_status <> 'ok' THEN @grok_sync_status ELSE 'ok' END;",
        "SET @discount_sync_allowed := IF(@discount_sync_status = 'ok' AND @discount_tag_count = 1, 1, 0);",
        "SET @grok_sync_allowed := IF(@grok_sync_status = 'ok' AND @grok_tag_count = 1 "
        "AND @grok_active_model_count = 1, 1, 0);",
        "UPDATE channels SET status = 2 WHERE "
        + discount_tag_matches
        + " AND (@discount_tag_count > 1 OR NOT ("
        + discount_group_matches
        + ")"
        + " OR NOT ("
        + discount_text_models_allowed_sql("models")
        + "));",
        "UPDATE channels SET status = 2 WHERE NOT ("
        + discount_tag_matches
        + ") AND FIND_IN_SET("
        + sql_quote(DISCOUNT_TEXT_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
        "UPDATE channels SET status = 2 WHERE "
        + grok_tag_matches
        + " AND (@grok_tag_count > 1 OR NOT ("
        + grok_group_matches
        + ") OR NOT ("
        + grok_models_match
        + ")"
        + " OR @grok_active_model_count <> 1)"
        + ";",
        "UPDATE channels SET status = 2 WHERE NOT ("
        + grok_tag_matches
        + ") AND (FIND_IN_SET("
        + sql_quote(GROK45_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0 OR FIND_IN_SET("
        + sql_quote(GROK45_MODEL)
        + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0);",
        "UPDATE abilities SET enabled = 0 WHERE `group` IN ("
        + sql_quote(DISCOUNT_TEXT_GROUP)
        + ", "
        + sql_quote(GROK45_GROUP)
        + ") OR model = "
        + sql_quote(GROK45_MODEL)
        + " OR tag IN ("
        + sql_quote(DISCOUNT_TEXT_CHANNEL_TAG)
        + ", "
        + sql_quote(GROK45_CHANNEL_TAG)
        + ") OR channel_id IN (SELECT id FROM channels WHERE "
        + managed_channel_condition
        + ");",
    ]
    for channel_id, raw_models, _priority, _weight, tag, raw_groups in channel_rows:
        channel_groups = [item.strip() for item in raw_groups.split(",") if item.strip()]
        channel_models = [item.strip() for item in raw_models.split(",") if item.strip()]
        if tag == DISCOUNT_TEXT_CHANNEL_TAG:
            if (
                channel_groups != [DISCOUNT_TEXT_GROUP]
                or not channel_models
                or any(model not in discount_allowed_models for model in channel_models)
            ):
                sync_groups = []
            else:
                sync_groups = channel_groups
        elif DISCOUNT_TEXT_GROUP in channel_groups:
            sync_groups = []
        elif tag == GROK45_CHANNEL_TAG:
            if channel_groups != [GROK45_GROUP] or channel_models != [GROK45_MODEL]:
                sync_groups = []
            else:
                sync_groups = channel_groups
        elif GROK45_GROUP in channel_groups or GROK45_MODEL in channel_models:
            sync_groups = []
        else:
            sync_groups = [
                group
                for group in groups
                if group not in {DISCOUNT_TEXT_GROUP, GROK45_GROUP}
            ]
        for model in channel_models:
            if model == GROK45_MODEL and tag != GROK45_CHANNEL_TAG:
                continue
            if tag == GROK45_CHANNEL_TAG and model != GROK45_MODEL:
                continue
            if not should_sync_ability_model(model):
                continue
            if model not in existing_models:
                continue
            if is_disabled_ability_pair(channel_id, model):
                continue
            for group in sync_groups:
                normalized_channel_id = str(int(channel_id))
                current_channel_conditions = [
                    "current_channel.id = " + normalized_channel_id,
                    "current_channel.status = 1",
                    binary_string_equals_sql("current_channel.tag", tag),
                    "BINARY REPLACE(COALESCE(current_channel.`group`, ''), ' ', '') = BINARY "
                    + sql_quote(",".join(channel_groups)),
                    "FIND_IN_SET("
                    + sql_quote(model)
                    + ", REPLACE(COALESCE(current_channel.models, ''), ' ', '')) > 0",
                    "EXISTS (SELECT 1 FROM models AS current_model WHERE "
                    + binary_string_equals_sql("current_model.model_name", model)
                    + " AND current_model.deleted_at IS NULL AND current_model.status = 1)",
                ]
                if tag == DISCOUNT_TEXT_CHANNEL_TAG:
                    current_channel_conditions.append(
                        discount_text_models_allowed_sql("current_channel.models")
                    )
                    current_channel_conditions.append("@discount_sync_allowed = 1")
                elif tag == GROK45_CHANNEL_TAG:
                    current_channel_conditions.extend(
                        [
                            binary_string_equals_sql("current_channel.models", GROK45_MODEL),
                            "@grok_sync_allowed = 1",
                        ]
                    )
                elif tag != GROK45_CHANNEL_TAG:
                    current_channel_conditions.extend(
                        [
                            "COALESCE(current_channel.tag, '') NOT IN ("
                            + sql_quote(DISCOUNT_TEXT_CHANNEL_TAG)
                            + ", "
                            + sql_quote(GROK45_CHANNEL_TAG)
                            + ")",
                            "FIND_IN_SET("
                            + sql_quote(DISCOUNT_TEXT_GROUP)
                            + ", REPLACE(COALESCE(current_channel.`group`, ''), ' ', '')) = 0",
                            "FIND_IN_SET("
                            + sql_quote(GROK45_GROUP)
                            + ", REPLACE(COALESCE(current_channel.`group`, ''), ' ', '')) = 0",
                            "FIND_IN_SET("
                            + sql_quote(GROK45_MODEL)
                            + ", REPLACE(COALESCE(current_channel.models, ''), ' ', '')) = 0",
                        ]
                    )
                statements.append(
                    "INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) SELECT "
                    + ", ".join(
                        [
                            sql_quote(group),
                            sql_quote(model),
                            normalized_channel_id,
                            "1",
                            "COALESCE(current_channel.priority, 0)",
                            "COALESCE(current_channel.weight, 100)",
                            "COALESCE(NULLIF(current_channel.tag, ''), 'xingren-auto')",
                        ]
                    )
                    + " FROM channels AS current_channel WHERE "
                    + " AND ".join(current_channel_conditions)
                    + " ON DUPLICATE KEY UPDATE enabled = 1, priority = VALUES(priority), weight = VALUES(weight), tag = VALUES(tag);"
                )
    statements.extend(
        [
            "COMMIT;",
            "SELECT CONCAT('ability_sync_status=', @ability_sync_status);",
        ]
    )
    status = mysql_status(mysql_exec("\n".join(statements)), "ability_sync_status=")
    errors = {
        "discount_duplicate_tag": "multiple channels use the discount isolation tag",
        "discount_invalid_profile": "discount group isolation violation; managed channel profile is invalid",
        "discount_group_conflict": "discount group isolation violation; a non-managed channel claims the group",
        "grok_duplicate_tag": "multiple channels use the Grok isolation tag",
        "grok_invalid_profile": "Grok group isolation violation; managed channel must expose exactly grok-4.5",
        "grok_channel_conflict": "Grok group isolation violation; a non-managed channel claims the model or group",
        "grok_model_cardinality": "Grok group isolation violation; expected exactly one active grok-4.5 model",
    }
    if status != "ok":
        raise RuntimeError(errors.get(status, "model ability sync failed closed"))


def enforce_gpt_image2_db_guard() -> dict[str, int]:
    disabled_ability_counts: dict[str, int] = {}
    for channel_id, model in DISABLED_ABILITY_PAIRS:
        rows = mysql(
            "SELECT COUNT(*) FROM abilities WHERE enabled = 1 AND channel_id = "
            + sql_quote(channel_id)
            + " AND model = "
            + sql_quote(model)
            + ";"
        )
        disabled_ability_counts[f"channel_{channel_id}_{model}"] = int(rows[0][0]) if rows else 0
    supplier_ability_rows = mysql(
        "SELECT COUNT(*) FROM abilities WHERE enabled = 1 AND ("
        + supplier_exposed_model_name_predicate("model", exclude_public_alias_backing=True)
        + ");"
    )
    supplier_model_rows = mysql(
        "SELECT COUNT(*) FROM models WHERE deleted_at IS NULL AND status = 1 AND ("
        + supplier_exposed_model_name_predicate("model_name", exclude_public_alias_backing=True)
        + ");"
    )
    disabled_ability_counts["supplier_exposed_abilities"] = int(supplier_ability_rows[0][0]) if supplier_ability_rows else 0
    disabled_ability_counts["supplier_exposed_models"] = int(supplier_model_rows[0][0]) if supplier_model_rows else 0
    token_rows = mysql(
        "SELECT id, COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND model_limits_enabled = 1 "
        "AND ("
        + supplier_exposed_model_limit_predicate()
        + ");"
    )
    token_updates: list[tuple[str, str]] = []
    for token_id, raw_limits in token_rows:
        next_limits = sanitize_model_limits(raw_limits)
        if next_limits != raw_limits:
            token_updates.append((token_id, next_limits))

    statements = ["START TRANSACTION;"]
    for channel_id, model in DISABLED_ABILITY_PAIRS:
        statements.append(
            "UPDATE abilities SET enabled = 0 WHERE channel_id = "
            + sql_quote(channel_id)
            + " AND model = "
            + sql_quote(model)
            + ";"
        )
    statements.append(
        "UPDATE abilities SET enabled = 0 WHERE "
        + supplier_exposed_model_name_predicate("model", exclude_public_alias_backing=True)
        + ";"
    )
    statements.append(
        "UPDATE models SET status = 0 WHERE deleted_at IS NULL AND "
        + supplier_exposed_model_name_predicate("model_name", exclude_public_alias_backing=True)
        + ";"
    )
    for token_id, next_limits in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits = "
            + sql_quote(next_limits)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    disabled_ability_counts["tokens_rewritten"] = len(token_updates)
    return disabled_ability_counts


def update_env_line(lines: list[str], key: str, value: str) -> tuple[list[str], bool]:
    changed = False
    seen = False
    output: list[str] = []
    needle = f"{key}="
    for line in lines:
        if line.startswith(needle):
            seen = True
            next_line = f"{key}={value}"
            output.append(next_line)
            changed = changed or line != next_line
        else:
            output.append(line)
    if not seen:
        output.append(f"{key}={value}")
        changed = True
    return output, changed


def write_private_file(path: Path, content: str, *, exclusive: bool) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW
    flags |= os.O_EXCL if exclusive else os.O_TRUNC
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
    except Exception:
        if exclusive:
            path.unlink(missing_ok=True)
        raise


def backup_codex_env(content: str) -> Path:
    CODEX_ENV_BACKUP_ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    if CODEX_ENV_BACKUP_ROOT.is_symlink():
        raise RuntimeError("Codex environment backup root must not be a symlink")
    CODEX_ENV_BACKUP_ROOT.chmod(0o700)
    raw_timestamp = os.environ.get("SYNC_TIMESTAMP", "") or str(time.time_ns())
    timestamp = "".join(character for character in raw_timestamp if character.isalnum() or character in "-_")
    if not timestamp:
        raise RuntimeError("invalid model sync timestamp")
    backup_path = CODEX_ENV_BACKUP_ROOT / f"shenxiang-codex-workspace.env.{timestamp}"
    write_private_file(backup_path, content, exclusive=True)
    return backup_path


def replace_codex_env(env_path: Path, content: str) -> None:
    current_mode = stat.S_IMODE(env_path.stat().st_mode) & 0o600
    temporary_path = env_path.with_name(f".env.model-sync.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        write_private_file(temporary_path, content, exclusive=True)
        temporary_path.chmod(current_mode or 0o600)
        os.replace(temporary_path, env_path)
    finally:
        temporary_path.unlink(missing_ok=True)


def sync_codex_env(profiles: dict[str, list[str]]) -> bool:
    env_path = CODEX_ROOT / ".env"
    if not env_path.exists():
        return False
    lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines()
    changed_any = False
    updates = {
        "DEFAULT_CHAT_MODEL": CODEX_DEFAULT_MODEL,
        "DEFAULT_CODE_MODEL": CODEX_DEFAULT_MODEL,
        "CODEX_CHAT_FALLBACK_MODEL": CODEX_CHAT_FALLBACK_MODEL,
        "CODEX_ALLOWED_MODELS": ",".join(profiles["codex"]),
        "CLAUDE_ALLOWED_MODELS": ",".join(profiles["claude"]),
        "IMAGE_ALLOWED_MODELS": ",".join(profiles["image"]),
        "VIDEO_ALLOWED_MODELS": ",".join(profiles["video"]),
    }
    for key, value in updates.items():
        lines, changed = update_env_line(lines, key, value)
        changed_any = changed_any or changed
    if changed_any:
        original = env_path.read_text(encoding="utf-8", errors="strict")
        backup_codex_env(original)
        replace_codex_env(env_path, "\n".join(lines) + "\n")
    return changed_any


def refresh_codex() -> None:
    if not (CODEX_ROOT / "docker-compose.yml").exists():
        return
    env = os.environ.copy()
    env.pop("HOST_BIND_IP", None)
    env.pop("HOST_BIND_PORT", None)
    env.pop("NEW_API_CONTAINER_PORT", None)
    try:
        subprocess.run(
            ["docker", "compose", "up", "-d", "shenxiang-codex-workspace", "shenxiang-codex-worker-fast", "shenxiang-codex-worker-heavy"],
            cwd=CODEX_ROOT,
            env=env,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=CODEX_REFRESH_TIMEOUT_SECONDS,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError):
        raise RuntimeError("Codex workspace refresh failed") from None


def run_model_permission_sync() -> int:
    ensure_public_seedance_models()
    ensure_discount_image2_backing_model()
    ensure_public_openai_text_models()
    sync_public_seedance_pricing()
    sync_public_openai_text_pricing()
    codex_text_channel_result = ensure_codex_text_channel_models()
    retired_codex_text_result = retire_codex_text_models()
    retired_claude_result = retire_claude_models()
    metadata_result = sync_supplier_safe_public_metadata()
    profiles = model_lists()
    missing = [name for name, values in profiles.items() if not values]
    if missing:
        print(f"refuse to sync empty model profiles: {', '.join(missing)}", file=sys.stderr)
        return 2
    sync_abilities()
    sync_tokens(profiles)
    codex_token_result = sync_user_codex_tokens(profiles)
    guard_result = enforce_gpt_image2_db_guard()
    env_changed = sync_codex_env(profiles)
    if env_changed or os.environ.get("SYNC_FORCE_CODEX_REFRESH") == "1":
        refresh_codex()
    print(
        "synced model permissions: "
        + ", ".join(f"{name}={len(values)}" for name, values in profiles.items())
        + f", codex_env_changed={env_changed}, codex_token_sync={codex_token_result}, gpt_image2_guard={guard_result}"
        + f", supplier_safe_metadata={metadata_result}, codex_text_channel={codex_text_channel_result}"
        + f", retired_codex_text={retired_codex_text_result}"
        + f", retired_claude={retired_claude_result}"
    )
    return 0


def main() -> int:
    invalidate_all_active_token_caches()
    try:
        return run_model_permission_sync()
    finally:
        invalidate_all_active_token_caches()


if __name__ == "__main__":
    raise SystemExit(main())
