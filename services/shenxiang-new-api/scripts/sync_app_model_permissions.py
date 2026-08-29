#!/usr/bin/env python3
from __future__ import annotations

import json
import hashlib
import hmac
import os
import subprocess
import sys
from collections.abc import Callable
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


ROOT = Path("/opt/shenxiang-new-api")
CODEX_ROOT = Path("/opt/shenxiang-codex-workspace")
ADMIN_SYSTEM_TOKEN_USER_ID = 1

TOKEN_PROFILES = {
    "codex": ("星人 Codex 文本令牌", "星人 Codex 自动令牌"),
    "claude": ("星人 Claude 高阶令牌",),
    "image": ("星人图像生成令牌",),
    "video": ("星人视频生成令牌",),
}
USER_CODEX_TOKEN_NAME_PREFIXES = ("星人Codex ",)
CLAUDE_USER_TOKEN_NAME = "claude"

RAW_GPT_IMAGE2_MODEL = "gpt-image-2"
GPT_IMAGE2_PRODUCT_MODEL = "gpt-image-2-4K"
DISCOUNT_IMAGE2_PUBLIC_MODEL = "特价 image-2"
INTERNAL_DISCOUNT_IMAGE2_MODEL = "geek2api-image-2"
FALLBACK_DISCOUNT_IMAGE2_MODEL = "internal-image2-discount-v2"
DISCOUNT_IMAGE2_PRIMARY_CHANNEL_TAG = "xingren-discount-image2-pdhlzy-primary"
DISCOUNT_IMAGE2_DDPAPI_CHANNEL_TAG = "xingren-discount-image2-v2"
DISCOUNT_IMAGE2_GEEK2API_CHANNEL_TAG = "geek2api-image2"
# Keep the generic names for the staging script and older callers.  The
# primary is PDHLZY; DDPAPI and Geek2API are the ordered fallbacks.
DISCOUNT_IMAGE2_CHANNEL_TAG = DISCOUNT_IMAGE2_PRIMARY_CHANNEL_TAG
DISCOUNT_IMAGE2_FALLBACK_CHANNEL_TAG = DISCOUNT_IMAGE2_DDPAPI_CHANNEL_TAG
DISCOUNT_IMAGE2_CHANNEL_TAGS = (
    DISCOUNT_IMAGE2_CHANNEL_TAG,
    DISCOUNT_IMAGE2_FALLBACK_CHANNEL_TAG,
    DISCOUNT_IMAGE2_GEEK2API_CHANNEL_TAG,
)
DISCOUNT_IMAGE2_CHANNEL_PRIORITIES = {
    DISCOUNT_IMAGE2_PRIMARY_CHANNEL_TAG: 32,
    DISCOUNT_IMAGE2_DDPAPI_CHANNEL_TAG: 16,
    DISCOUNT_IMAGE2_GEEK2API_CHANNEL_TAG: 0,
}
DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS = "default,standard,pro,code,internal"
DISCOUNT_IMAGE2_DESCRIPTION = "特价 image-2：仅支持文生图；已验证 1K/2K/4K 方图，固定 high 质量与 PNG 输出。人民币 1K ¥0.06、2K ¥0.09、4K ¥0.13/张。"
DISCOUNT_IMAGE2_CHANNEL_REMARK = "Image 2 特价线路；人民币 1K ¥0.06、2K ¥0.09、4K ¥0.13/张"
DISCOUNT_IMAGE2_TAGS = "image,openai,internal-hidden"
DISCOUNT_IMAGE2_ENDPOINTS = '{"image-generation":"/v1/images/generations"}'
DISCOUNT_IMAGE2_BASE_PRICE_CNY = Decimal("0.06")
RETIRED_IMAGE_MODELS: tuple[str, ...] = ()
INTERNAL_STABLE_IMAGE2_MODEL = "internal-image2-stable-v1"
STABLE_IMAGE2_PUBLIC_MODEL = "官转image 2稳定"
STABLE_IMAGE2_DESCRIPTION = "官转image 2稳定：支持 1K/2K/4K 输出，人民币 ¥0.17/张。"
STABLE_IMAGE2_TAGS = "image,openai"
STABLE_IMAGE2_ENDPOINTS = '{"image-generation":"/v1/images/generations"}'
STABLE_IMAGE2_PRICE_CNY = Decimal("0.17")
STABLE_IMAGE2_PRIMARY_CHANNEL_TAG = "xingren-stable-image2"
STABLE_IMAGE2_ENTERPRISE_FALLBACK_CHANNEL_TAG = "xingren-stable-image2-enterprise-fallback"
STABLE_IMAGE2_CHANNEL_PRIORITIES = {
    STABLE_IMAGE2_PRIMARY_CHANNEL_TAG: 16,
    STABLE_IMAGE2_ENTERPRISE_FALLBACK_CHANNEL_TAG: 0,
}
STABLE_IMAGE2_CHANNEL_REMARK = "Image 2 稳定线路；人民币 ¥0.17/张"
STABLE_IMAGE2_ENTERPRISE_FALLBACK_REMARK = "Image 2 稳定备用线路；人民币 ¥0.17/张"
GROK_IMAGE_MODEL = "grok-imagine-image"
GROK_IMAGE_DESCRIPTION = "Grok Image Pro：当前供应商实际仅返回约 1K，仅支持文生图，人民币 ¥0.055/张。"
GROK_IMAGE_ENDPOINTS = '{"image-generation":"/v1/images/generations"}'
GROK_IMAGE_PRICE_CNY = Decimal("0.055")
GROK46_IMAGE_PUBLIC_MODEL = "grok 4.6图片"
GROK46_IMAGE_UPSTREAM_MODEL = "grok-imagine-image"
GROK46_IMAGE_CHANNEL_TAG = "xingren-grok46-image"
GROK46_IMAGE_DESCRIPTION = "grok 4.6图片：仅支持文生图，支持 1K/2K、low/medium 质量与多种画面比例，人民币 ¥0.10/张。"
GROK46_IMAGE_ENDPOINTS = '{"image-generation":"/v1/images/generations"}'
GROK46_IMAGE_PRICE_CNY = Decimal("0.10")
GROK46_MEDIA_PUBLIC_CHANNEL_GROUPS = "default,standard,pro,code,internal"
GEMINI_DDPAPI_PUBLIC_CHANNEL_GROUPS = "default,standard,pro,code,internal"
GEMINI_DDPAPI_ENDPOINTS = '{"image-generation":"/v1/images/generations","image-edit":"/v1/images/edits"}'
GEMINI_DDPAPI_MODEL_CONFIGS = {
    "gemini-3.1-flash-image": {
        "channel_tag": "xingren-gemini31-flash-image-ddpapi",
        "description": "Gemini 3.1 Flash Image：支持 1K/2K/4K 与图片编辑，人民币 ¥0.10/张。",
        "price_cny": Decimal("0.10"),
    },
    "gemini-3-pro-image": {
        "channel_tag": "xingren-gemini3-pro-image-ddpapi",
        "description": "Gemini 3 Pro Image：支持 1K/2K/4K 与图片编辑，人民币 ¥0.15/张。",
        "price_cny": Decimal("0.15"),
    },
}
GEMINI_DDPAPI_MODELS = tuple(GEMINI_DDPAPI_MODEL_CONFIGS)
GEMINI_DDPAPI_CHANNEL_TAGS = tuple(
    str(config["channel_tag"]) for config in GEMINI_DDPAPI_MODEL_CONFIGS.values()
)
CODEX_IMAGE_15K_MODEL = "image 2电商商品图快速通道(1.5K)"
CODEX_IMAGE_15K_PUBLIC_TAGS = "image,openai,ecommerce,1.5k"
SUPPLIER_EXPOSED_MODELS = {
    INTERNAL_DISCOUNT_IMAGE2_MODEL,
    FALLBACK_DISCOUNT_IMAGE2_MODEL,
    INTERNAL_STABLE_IMAGE2_MODEL,
}
PUBLIC_ALIAS_BACKING_MODELS = {
    INTERNAL_DISCOUNT_IMAGE2_MODEL: DISCOUNT_IMAGE2_PUBLIC_MODEL,
    INTERNAL_STABLE_IMAGE2_MODEL: STABLE_IMAGE2_PUBLIC_MODEL,
}
DISCOUNT_TEXT_GROUP = "discount"
DISCOUNT_TEXT_CHANNEL_TAGS = (
    "xingren-discount-text-aihub",
    "xingren-discount-text-aihub-fallback",
    "xingren-discount-text-wangwang",
)
DISCOUNT_TEXT_ALLOWED_MODELS = (
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
)
CODEX_AUTO_REVIEW_MODEL = "codex-auto-review"
CODEX_AUTO_REVIEW_BACKING_MODEL = "gpt-5.5"
CONTROLLED_CODEX_MODEL_ALIASES = {
    CODEX_AUTO_REVIEW_MODEL: CODEX_AUTO_REVIEW_BACKING_MODEL,
}
_DISCOUNT_TEXT_MODEL_REGEX_ALTERNATION = "|".join(
    model.replace(".", "[.]") for model in DISCOUNT_TEXT_ALLOWED_MODELS
)
DISCOUNT_TEXT_MODELS_REGEX = (
    "^(" + _DISCOUNT_TEXT_MODEL_REGEX_ALTERNATION + ")(,(" + _DISCOUNT_TEXT_MODEL_REGEX_ALTERNATION + "))*$"
)
SPECIAL_TEXT_GROUP = "special"
SPECIAL_TEXT_CHANNEL_TAGS = (
    "xingren-special-text-primary",
    "xingren-special-text-fallback-1",
    "xingren-special-text-fallback-2",
    "xingren-special-text-fallback-3",
)
SPECIAL_TEXT_ALLOWED_MODELS = (
    "gpt-5.4-mini",
    "gpt-5.5",
    "gpt-5.6",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
)
SPECIAL_TEXT_MODEL_LIMITS = ",".join(SPECIAL_TEXT_ALLOWED_MODELS)
_SPECIAL_TEXT_MODEL_REGEX_ALTERNATION = "|".join(
    model.replace(".", "[.]") for model in SPECIAL_TEXT_ALLOWED_MODELS
)
SPECIAL_TEXT_MODELS_REGEX = (
    "^(" + _SPECIAL_TEXT_MODEL_REGEX_ALTERNATION + ")(,(" + _SPECIAL_TEXT_MODEL_REGEX_ALTERNATION + "))*$"
)
PLUS_TEXT_GROUP = "plus"
PLUS_TEXT_CHANNEL_TAGS = (
    "xingren-plus-text-aihub",
    "xingren-plus-text-wangwang",
    "xingren-plus-text-pdhlzy",
)
PLUS_TEXT_ALLOWED_MODELS = (
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "codex-auto-review",
)
_PLUS_TEXT_MODEL_REGEX_ALTERNATION = "|".join(
    model.replace(".", "[.]") for model in PLUS_TEXT_ALLOWED_MODELS
)
PLUS_TEXT_MODELS_REGEX = (
    "^(" + _PLUS_TEXT_MODEL_REGEX_ALTERNATION + ")(,(" + _PLUS_TEXT_MODEL_REGEX_ALTERNATION + "))*$"
)
GROK45_MODEL = "grok-4.5"
GROK46_MODEL = "grok-4.6"
GROK45_GROUP = "grok45"
KIMI_K3_MODEL = "kimi-k3"
KIMI_K3_GROUP = "kimi"
KIMI_K3_CHANNEL_TAG = "xingren-kimi-k3"
GROK45_CHANNEL_TAG = "xingren-grok45"
GROK45_PRIMARY_CHANNEL_TAG = "xingren-grok45-primary"
GROK45_CHANNEL_TAGS = (GROK45_PRIMARY_CHANNEL_TAG, GROK45_CHANNEL_TAG)
GROK46_CHANNEL_TAG = "xingren-grok46-primary"
GROK_CHANNEL_MODEL_BY_TAG = {
    GROK45_PRIMARY_CHANNEL_TAG: GROK45_MODEL,
    GROK45_CHANNEL_TAG: GROK45_MODEL,
    GROK46_CHANNEL_TAG: GROK46_MODEL,
}
GROK_CHANNEL_TAGS = tuple(GROK_CHANNEL_MODEL_BY_TAG)
GROK_TEXT_MODELS = tuple(dict.fromkeys(GROK_CHANNEL_MODEL_BY_TAG.values()))
MANAGED_CLAUDE_CHANNEL_GROUPS = {
    "xingren-claude-pdhlzy-kiro": "kiro",
    "xingren-claude-pdhlzy-kiro-stable": "kiro-stable",
    "xingren-claude-moonapix-fallback": "kiro-stable",
    "xingren-claude-pdhlzy-ccmax-terminal": "ccmax-terminal",
    "xingren-claude-pdhlzy-claude-external": "claude-external",
    "xingren-claude-geek2api-welfare": "welfare",
    "xingren-claude-pdhlzy-welfare": "welfare-001",
}
WANGWANG_CLAUDE_CHANNEL_GROUPS = {
    "kiro-primary-20260724": "kiro",
    "kiro-stable-primary-20260724": "kiro-stable",
}
CLAUDE_CHANNEL_GROUPS = {
    **MANAGED_CLAUDE_CHANNEL_GROUPS,
    **WANGWANG_CLAUDE_CHANNEL_GROUPS,
}
CLAUDE_CHANNEL_TAGS_BY_GROUP = {
    group: tuple(tag for tag, tag_group in CLAUDE_CHANNEL_GROUPS.items() if tag_group == group)
    for group in set(CLAUDE_CHANNEL_GROUPS.values())
}
ISOLATED_CLAUDE_GROUPS = frozenset(MANAGED_CLAUDE_CHANNEL_GROUPS.values())
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
    "gpt-5.6",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
    "kimi-k3",
    "gpt-5.5-openai-compact",
    CODEX_AUTO_REVIEW_MODEL,
    CODEX_IMAGE_15K_MODEL,
]
CODEX_STANDARD_ALLOWED_MODELS = [
    model for model in CODEX_ALLOWED_MODELS if model not in CONTROLLED_CODEX_MODEL_ALIASES
]
CODEX_DEFAULT_MODEL = "gpt-5.5"
CODEX_CHAT_FALLBACK_MODEL = "gpt-5.4-mini"
CLAUDE_PRODUCT_GROUP = "kiro-stable"
CLAUDE_OPUS5_MODEL = "claude-opus-5"
CLAUDE_OPUS5_CHANNEL_TAG = "xingren-claude-pdhlzy-kiro-stable"
CLAUDE_OPUS5_STABLE_GROUP_RATIO = Decimal("0.22")
CLAUDE_OPUS5_INPUT_CNY_PER_M = Decimal("5")
CLAUDE_OPUS5_OUTPUT_CNY_PER_M = Decimal("25")
CLAUDE_OPUS5_CACHE_READ_CNY_PER_M = Decimal("0.5")
CLAUDE_OPUS5_CACHE_CREATE_CNY_PER_M = Decimal("6.25")
CLAUDE_ALLOWED_MODELS = [
    "claude-fable-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
]
CLAUDE_KIRO_MODELS = [
    "claude-fable-5",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
]
CLAUDE_EXTERNAL_MODELS = [
    "claude-fable-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
]
CLAUDE_TOKEN_MODELS_BY_GROUP = {
    "kiro": CLAUDE_KIRO_MODELS,
    "kiro-stable": CLAUDE_ALLOWED_MODELS,
    "ccmax-terminal": CLAUDE_EXTERNAL_MODELS,
    "claude-external": CLAUDE_EXTERNAL_MODELS,
}
PUBLIC_SD2_FAST_MODEL = "seedance-sd2-fast-720p"
UPSTREAM_SD2_FAST_MODEL = "sd2-fast-720p"
PUBLIC_GROK15_VIDEO_MODEL = "grok-video-1.5"
UPSTREAM_GROK15_VIDEO_MODEL = "grok-imagine-1.5-video"
PUBLIC_GROK15_1080_VIDEO_MODEL = "grok-video-1.5-1080p"
UPSTREAM_GROK15_1080_VIDEO_MODEL = "grok-imagine-video-1.5"
PUBLIC_GROK15_1080_VIDEO_CHANNEL_TAG = "xingren-grok15-video-1080p"
PUBLIC_GROK15_1080_VIDEO_CHANNEL_GROUPS = "default,standard,pro,code,internal"
PUBLIC_GROK46_VIDEO_MODEL = "grok4.6视频"
UPSTREAM_GROK46_VIDEO_MODEL = "grok-imagine-video"
PUBLIC_GROK46_VIDEO_CHANNEL_TAG = "xingren-grok46-video"
PUBLIC_VIDEO_MODEL_CONFIGS = {
    "grok-video-super-720p": {
        "description": "星人 Grok 视频生成｜人民币 ¥6.50/次｜固定按次计费，支持 5/10/15 秒，生成后请及时下载",
        "icon": "Grok",
        "tags": "video,grok",
        "vendor_id": 3,
    },
    "seedance-2.0-ld-17": {
        "description": "星人 Seedance 2.0 LD-17｜人民币 ¥6.48/次｜固定按次计费，支持 5-15 秒和多模态参考，生成后请及时下载",
        "icon": "Doubao.Color",
        "tags": "video,doubao,seedance",
        "vendor_id": 4,
    },
    PUBLIC_SD2_FAST_MODEL: {
        "description": "Seedance SD Fast 720P｜人民币 ¥0.25/秒｜固定 720P，支持 5/10/15 秒｜支持文生视频和图生视频，可上传图片（单个本地文件最大 20MB），不支持视频或音频参考｜人脸能力未承诺，不保证",
        "icon": "Doubao.Color",
        "tags": "video,seedance",
        "vendor_id": 4,
    },
    PUBLIC_GROK15_VIDEO_MODEL: {
        "description": "Grok Video 1.5｜人民币 ¥0.20/次｜固定 720P，支持 6/10 秒文生视频和图生视频｜图生模式可上传 1 张图片（最大 20MB），不支持视频或音频参考｜人脸能力未承诺，不保证",
        "icon": "Grok",
        "tags": "video,grok",
        "vendor_id": 3,
    },
    PUBLIC_GROK15_1080_VIDEO_MODEL: {
        "description": "Grok Video 1.5 1080P｜人民币 ¥0.40/次｜仅支持图生视频，固定 1080P｜官网 duration 开放 1-15 秒整数｜必须上传 1 张图片，不支持视频或音频参考",
        "icon": "Grok",
        "tags": "video,grok",
        "vendor_id": 3,
    },
    PUBLIC_GROK46_VIDEO_MODEL: {
        "description": "grok4.6视频｜人民币 ¥0.10/秒｜固定 720P，仅支持 6/10/15 秒文生视频，生成后请及时下载",
        "icon": "Grok",
        "tags": "video,grok",
        "vendor_id": 3,
    },
}
PUBLIC_VIDEO_MODELS = tuple(PUBLIC_VIDEO_MODEL_CONFIGS)
GROK46_MEDIA_CHANNEL_MODEL_BY_TAG = {
    GROK46_IMAGE_CHANNEL_TAG: GROK46_IMAGE_PUBLIC_MODEL,
    PUBLIC_GROK46_VIDEO_CHANNEL_TAG: PUBLIC_GROK46_VIDEO_MODEL,
}
PRIVATE_VIDEO_MODELS = {"seedance-nsfw"}
DISABLED_PUBLIC_VIDEO_MODELS = [
    "seedance-2.0",
    "seedance-2.0-kz-fast",
    "seedance-2.0-cl-fast",
    "seedance-2.0-cl",
    "seedance-2.0-dj-fast",
    "seedance-2.0-cl-mini",
]
DISABLED_PUBLIC_VIDEO_CHANNEL_IDS = ("5", "25")
PUBLIC_GROK_VIDEO_CHANNEL_ID = "7"
PUBLIC_GROK_VIDEO_CHANNEL_MODELS = ["grok-video-super-720p"]
PUBLIC_GROK_VIDEO_MODEL_MAPPING = '{"grok-video-super-720p":"grok-imagine-video-1.5-preview"}'
PUBLIC_LD17_CHANNEL_ID = "26"
PUBLIC_LD17_CHANNEL_MODELS = [
    "seedance-2.0-ld-17",
]
PUBLIC_LD17_MODEL_MAPPING = '{"seedance-2.0-ld-17":"seedance-2.0-wc-b-720p"}'
PUBLIC_VIDEO_CHANNEL_CONFIGS = (
    (
        "id",
        PUBLIC_GROK_VIDEO_CHANNEL_ID,
        PUBLIC_GROK_VIDEO_CHANNEL_MODELS,
        PUBLIC_GROK_VIDEO_MODEL_MAPPING,
    ),
    (
        "id",
        PUBLIC_LD17_CHANNEL_ID,
        PUBLIC_LD17_CHANNEL_MODELS,
        PUBLIC_LD17_MODEL_MAPPING,
    ),
    (
        "tag",
        "xingren-sd2-fast-video",
        [PUBLIC_SD2_FAST_MODEL],
        json.dumps({PUBLIC_SD2_FAST_MODEL: UPSTREAM_SD2_FAST_MODEL}, separators=(",", ":")),
    ),
    (
        "tag",
        "xingren-grok15-video",
        [PUBLIC_GROK15_VIDEO_MODEL],
        json.dumps({PUBLIC_GROK15_VIDEO_MODEL: UPSTREAM_GROK15_VIDEO_MODEL}, separators=(",", ":")),
    ),
    (
        "tag",
        PUBLIC_GROK15_1080_VIDEO_CHANNEL_TAG,
        [PUBLIC_GROK15_1080_VIDEO_MODEL],
        json.dumps(
            {PUBLIC_GROK15_1080_VIDEO_MODEL: UPSTREAM_GROK15_1080_VIDEO_MODEL},
            separators=(",", ":"),
        ),
    ),
    (
        "tag",
        PUBLIC_GROK46_VIDEO_CHANNEL_TAG,
        [PUBLIC_GROK46_VIDEO_MODEL],
        json.dumps(
            {PUBLIC_GROK46_VIDEO_MODEL: UPSTREAM_GROK46_VIDEO_MODEL},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
    ),
)
CODEX_TEXT_CHANNEL_ID = "21"
CODEX_TEXT_CHANNEL_REQUIRED_MODELS = [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
    CODEX_AUTO_REVIEW_MODEL,
]
RETIRED_CODEX_TEXT_MODELS = ("gpt-5.3-codex-spark", "gpt-5.3-spark", "gpt-5.4-openai-compact", "gpt-5.6-luna")
PUBLIC_SEEDANCE_TOKEN_PRICES_CNY_PER_1M: dict[str, dict[str, Decimal]] = {}
PUBLIC_VIDEO_FIXED_PRICES_CNY = {
    "grok-video-super-720p": Decimal("6.50"),
    "seedance-2.0-ld-17": Decimal("6.48"),
    PUBLIC_SD2_FAST_MODEL: Decimal("0.25"),
    PUBLIC_GROK15_VIDEO_MODEL: Decimal("0.20"),
    PUBLIC_GROK15_1080_VIDEO_MODEL: Decimal("0.40"),
    PUBLIC_GROK46_VIDEO_MODEL: Decimal("0.10"),
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
    "gpt-5.6": {
        "description": "OpenAI GPT-5.6 文本模型，按 GPT-5.6 Sol 基础价计费。",
        "input_cny": Decimal("5.0000"),
        "output_cny": Decimal("30.0000"),
        "cache_read_cny": Decimal("0.5000"),
        "cache_create_cny": Decimal("6.2500"),
        "longcontext_input_cny": Decimal("10.0000"),
        "longcontext_output_cny": Decimal("45.0000"),
        "longcontext_cache_read_cny": Decimal("1.0000"),
        "longcontext_cache_create_cny": Decimal("12.5000"),
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
    "kimi-k3": {
        "description": "Kimi K3 文本模型，适合复杂推理、长文写作、分析和代码任务。人民币输入 ¥13/M、输出 ¥65/M、缓存读取 ¥1.30/M。",
        "icon": "Kimi",
        "tags": "text,kimi,codex",
        "input_cny": Decimal("13"),
        "output_cny": Decimal("65"),
        "cache_read_cny": Decimal("1.30"),
        "cache_create_cny": Decimal("13"),
        "longcontext_input_cny": Decimal("13"),
        "longcontext_output_cny": Decimal("65"),
        "longcontext_cache_read_cny": Decimal("1.30"),
        "longcontext_cache_create_cny": Decimal("13"),
    },
}
PUBLIC_OPENAI_TEXT_MODELS[CODEX_AUTO_REVIEW_MODEL] = {
    **PUBLIC_OPENAI_TEXT_MODELS[CODEX_AUTO_REVIEW_BACKING_MODEL],
    "description": "Codex 自动审批审查模型，仅供已授权的 Codex 令牌调用。",
    "icon": "Codex",
    "tags": "text,codex,approval",
    "endpoints": '{"openai-response":"/v1/responses"}',
}


def mysql(query: str) -> list[list[str]]:
    password = os.environ["MYSQL_ROOT_PASSWORD"]
    database = os.environ["MYSQL_DATABASE"]
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
        "-uroot",
        "-N",
        "-B",
        database,
        "-e",
        query,
    ]
    output = subprocess.check_output(cmd, env=env, stderr=subprocess.DEVNULL).decode("utf-8", errors="replace")
    rows: list[list[str]] = []
    for line in output.splitlines():
        rows.append(line.split("\t"))
    return rows


def mysql_raw(query: str) -> list[list[str]]:
    password = os.environ["MYSQL_ROOT_PASSWORD"]
    database = os.environ["MYSQL_DATABASE"]
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
    output = subprocess.check_output(cmd, env=env, stderr=subprocess.DEVNULL).decode("utf-8", errors="replace")
    rows: list[list[str]] = []
    for line in output.splitlines():
        rows.append(line.split("\t"))
    return rows


def mysql_exec(query: str) -> None:
    password = os.environ["MYSQL_ROOT_PASSWORD"]
    database = os.environ["MYSQL_DATABASE"]
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
    subprocess.run(cmd, input=query.encode("utf-8"), env=env, check=True, stderr=subprocess.DEVNULL)


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
    subprocess.run(
        ["docker", "exec", "-i", "-e", "REDISCLI_AUTH", redis_container, "redis-cli", "--pipe"],
        input=payload.encode("utf-8"),
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return len(unique_keys)


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def discount_text_models_allowed_sql(column: str) -> str:
    return (
        "REPLACE(COALESCE(" + column + ", ''), ' ', '') REGEXP BINARY "
        + sql_quote(DISCOUNT_TEXT_MODELS_REGEX)
    )


def plus_text_models_allowed_sql(column: str) -> str:
    return (
        "REPLACE(COALESCE(" + column + ", ''), ' ', '') REGEXP BINARY "
        + sql_quote(PLUS_TEXT_MODELS_REGEX)
    )


def special_text_models_allowed_sql(column: str) -> str:
    return (
        "REPLACE(COALESCE(" + column + ", ''), ' ', '') REGEXP BINARY "
        + sql_quote(SPECIAL_TEXT_MODELS_REGEX)
    )


def is_retired_codex_text_model(model: str) -> bool:
    return model.strip() in RETIRED_CODEX_TEXT_MODELS


def is_retired_image_model(model: str) -> bool:
    normalized = model.strip().lower()
    return any(normalized == retired.lower() for retired in RETIRED_IMAGE_MODELS)


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
        if is_retired_image_model(model):
            continue
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
    required = [
        model
        for model in sanitize_codex_token_models(required_models or CODEX_STANDARD_ALLOWED_MODELS)
        if model not in CONTROLLED_CODEX_MODEL_ALIASES
    ]
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
    if is_retired_image_model(model):
        return False
    if is_retired_codex_text_model(model):
        return False
    if is_retired_claude_model(model):
        return False
    return is_public_alias_backing_model(model) or not is_supplier_exposed_model(model)


def is_hidden_pricing_model(model: str) -> bool:
    return (
        model.strip() == RAW_GPT_IMAGE2_MODEL
        or is_retired_image_model(model)
        or is_retired_codex_text_model(model)
        or is_retired_claude_model(model)
        or is_supplier_exposed_model(model)
    )


def supplier_exposed_model_limit_predicate() -> str:
    terms = [RAW_GPT_IMAGE2_MODEL, *SUPPLIER_EXPOSED_MODELS, *SUPPLIER_EXPOSED_MARKERS]
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
    mysql_exec(json_option_upsert_statement(key, values))


def json_option_upsert_statement(key: str, values: dict[str, float] | dict[str, str]) -> str:
    payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return (
        "INSERT INTO options (`key`, `value`) VALUES ("
        + sql_quote(key)
        + ", "
        + sql_quote(payload)
        + ") ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);"
    )


def upsert_json_string_option(key: str, values: dict[str, str]) -> None:
    mysql_exec(json_option_upsert_statement(key, values))


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
    if rate <= 0:
        raise ValueError("USDExchangeRate must be greater than 0")
    return rate


def sync_public_video_pricing() -> None:
    model_ratios = parse_json_option("ModelRatio")
    completion_ratios = parse_json_option("CompletionRatio")
    model_prices = parse_json_option("ModelPrice")
    exchange_rate = usd_exchange_rate()

    for model in DISABLED_PUBLIC_VIDEO_MODELS:
        model_prices.pop(model, None)
        model_ratios.pop(model, None)
        completion_ratios.pop(model, None)

    for model, price_cny in PUBLIC_VIDEO_FIXED_PRICES_CNY.items():
        model_prices[model] = decimal_to_float(price_cny / exchange_rate)
        model_ratios.pop(model, None)
        completion_ratios.pop(model, None)

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
                    sql_quote(str(config.get("icon", "OpenAI"))),
                    sql_quote(str(config.get("tags", "text,openai,codex"))),
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
            + sql_quote(str(config.get("icon", "OpenAI")))
            + ", tags = "
            + sql_quote(str(config.get("tags", "text,openai,codex")))
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


def ensure_claude_opus5_stable_model() -> None:
    rows = mysql(
        "SELECT id, COALESCE(models, ''), COALESCE(model_mapping, '') FROM channels WHERE tag = "
        + sql_quote(CLAUDE_OPUS5_CHANNEL_TAG)
        + " AND status = 1 AND REPLACE(COALESCE(`group`, ''), ' ', '') = "
        + sql_quote(CLAUDE_PRODUCT_GROUP)
        + " ORDER BY id"
    )
    if len(rows) != 1:
        raise RuntimeError("Claude Opus 5 requires exactly one enabled Kiro stable channel")
    channel_id, raw_models, raw_mapping = rows[0]
    models = [model.strip() for model in raw_models.split(",") if model.strip()]
    if CLAUDE_OPUS5_MODEL not in models:
        models.append(CLAUDE_OPUS5_MODEL)
    try:
        mapping = json.loads(raw_mapping) if raw_mapping else {}
    except json.JSONDecodeError as exc:
        raise RuntimeError("Kiro stable channel model mapping is invalid JSON") from exc
    if not isinstance(mapping, dict):
        raise RuntimeError("Kiro stable channel model mapping must be an object")
    mapping[CLAUDE_OPUS5_MODEL] = CLAUDE_OPUS5_MODEL
    # ModelRatio remains the base rate because New API applies GroupRatio at billing time.
    # This model is intentionally available only in the stable group, so expose its final rate.
    description = (
        "Claude claude-opus-5｜Kiro 稳定版 0.22x｜"
        f"输入人民币 ¥{CLAUDE_OPUS5_INPUT_CNY_PER_M * CLAUDE_OPUS5_STABLE_GROUP_RATIO:.4f}/M Tokens｜"
        f"输出人民币 ¥{CLAUDE_OPUS5_OUTPUT_CNY_PER_M * CLAUDE_OPUS5_STABLE_GROUP_RATIO:.4f}/M Tokens｜"
        f"缓存读取人民币 ¥{CLAUDE_OPUS5_CACHE_READ_CNY_PER_M * CLAUDE_OPUS5_STABLE_GROUP_RATIO:.4f}/M Tokens｜"
        f"缓存写入人民币 ¥{CLAUDE_OPUS5_CACHE_CREATE_CNY_PER_M * CLAUDE_OPUS5_STABLE_GROUP_RATIO:.4f}/M Tokens"
    )
    statements = [
        "START TRANSACTION;",
        "SET @now := UNIX_TIMESTAMP();",
        "SET @model_id := (SELECT MIN(id) FROM models WHERE model_name = " + sql_quote(CLAUDE_OPUS5_MODEL) + " AND deleted_at IS NULL);",
        "INSERT INTO models (model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
        "SELECT " + ", ".join([sql_quote(CLAUDE_OPUS5_MODEL), sql_quote(description), sql_quote("Claude.Color"), sql_quote("text,claude"), "2", sql_quote('{\"chat-completion\":\"/v1/chat/completions\"}'), "1", "0", "@now", "@now", "0"]) + " WHERE @model_id IS NULL;",
        "SET @model_id := IFNULL(@model_id, LAST_INSERT_ID());",
        "UPDATE models SET description = " + sql_quote(description) + ", icon = " + sql_quote("Claude.Color") + ", tags = " + sql_quote("text,claude") + ", vendor_id = 2, endpoints = " + sql_quote('{\"chat-completion\":\"/v1/chat/completions\"}') + ", status = 1, sync_official = 0, deleted_at = NULL, updated_time = @now, name_rule = 0 WHERE id = @model_id;",
        "UPDATE channels SET models = " + sql_quote(",".join(models)) + ", model_mapping = " + sql_quote(json.dumps(mapping, ensure_ascii=False, sort_keys=True, separators=(",", ":"))) + " WHERE id = " + sql_quote(channel_id) + " AND tag = " + sql_quote(CLAUDE_OPUS5_CHANNEL_TAG) + " AND status = 1 AND REPLACE(COALESCE(`group`, ''), ' ', '') = " + sql_quote(CLAUDE_PRODUCT_GROUP) + ";",
        "COMMIT;",
    ]
    mysql_exec("\n".join(statements))

    exchange_rate = usd_exchange_rate()
    model_ratios = parse_json_option("ModelRatio")
    completion_ratios = parse_json_option("CompletionRatio")
    cache_ratios = parse_json_option("CacheRatio")
    create_cache_ratios = parse_json_option("CreateCacheRatio")
    model_prices = parse_json_option("ModelPrice")
    model_ratios[CLAUDE_OPUS5_MODEL] = decimal_to_float(CLAUDE_OPUS5_INPUT_CNY_PER_M / (Decimal("2") * exchange_rate))
    completion_ratios[CLAUDE_OPUS5_MODEL] = decimal_to_float(CLAUDE_OPUS5_OUTPUT_CNY_PER_M / CLAUDE_OPUS5_INPUT_CNY_PER_M)
    cache_ratios[CLAUDE_OPUS5_MODEL] = decimal_to_float(CLAUDE_OPUS5_CACHE_READ_CNY_PER_M / CLAUDE_OPUS5_INPUT_CNY_PER_M)
    create_cache_ratios[CLAUDE_OPUS5_MODEL] = decimal_to_float(CLAUDE_OPUS5_CACHE_CREATE_CNY_PER_M / CLAUDE_OPUS5_INPUT_CNY_PER_M)
    model_prices.pop(CLAUDE_OPUS5_MODEL, None)
    upsert_json_option("ModelRatio", model_ratios)
    upsert_json_option("CompletionRatio", completion_ratios)
    upsert_json_option("CacheRatio", cache_ratios)
    upsert_json_option("CreateCacheRatio", create_cache_ratios)
    upsert_json_option("ModelPrice", model_prices)


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

    for alias, backing_model in CONTROLLED_CODEX_MODEL_ALIASES.items():
        if mapping.get(alias) != backing_model:
            mapping[alias] = backing_model
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
    grok1080_state = grok15_1080_video_release_state()
    grok46_image_state = grok46_media_release_state("image")
    grok46_video_state = grok46_media_release_state("video")
    gemini_ddpapi_state = gemini_ddpapi_release_state()
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
        if is_retired_image_model(model):
            return
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
            if model in PRIVATE_VIDEO_MODELS:
                continue
            if model == PUBLIC_GROK15_1080_VIDEO_MODEL and grok1080_state != "published":
                continue
            if model == PUBLIC_GROK46_VIDEO_MODEL and grok46_video_state != "published":
                continue
            append_model("video", model)
            continue
        if "image" in tags:
            if is_supplier_exposed_model(model):
                continue
            if model in GEMINI_DDPAPI_MODELS and gemini_ddpapi_state != "published":
                continue
            if model == GROK46_IMAGE_PUBLIC_MODEL and grok46_image_state != "published":
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
    public_image_models = [STABLE_IMAGE2_PUBLIC_MODEL]
    if discount_image2_release_state() == "published":
        public_image_models.append(DISCOUNT_IMAGE2_PUBLIC_MODEL)
    if grok46_image_state == "published":
        public_image_models.append(GROK46_IMAGE_PUBLIC_MODEL)
    for public_image_model in public_image_models:
        if public_image_model not in profiles["image"]:
            profiles["image"].append(public_image_model)
    for model in PUBLIC_VIDEO_MODELS:
        if model == PUBLIC_GROK15_1080_VIDEO_MODEL and grok1080_state != "published":
            continue
        if model == PUBLIC_GROK46_VIDEO_MODEL and grok46_video_state != "published":
            continue
        if model not in profiles["video"]:
            profiles["video"].append(model)
    return profiles


def grok15_1080_video_release_state() -> str:
    rows = mysql(
        "SELECT status, REPLACE(COALESCE(`group`, ''), ' ', '') FROM channels WHERE tag = "
        + sql_quote(PUBLIC_GROK15_1080_VIDEO_CHANNEL_TAG)
        + " ORDER BY id"
    )
    if len(rows) != 1 or rows[0][0] != "1":
        return "unavailable"
    groups = rows[0][1]
    if groups == "internal":
        return "staged"
    if groups == PUBLIC_GROK15_1080_VIDEO_CHANNEL_GROUPS:
        return "published"
    return "invalid"


def grok46_media_release_state(kind: str) -> str:
    if kind == "image":
        tag = GROK46_IMAGE_CHANNEL_TAG
        channel_type = "1"
        public_model = GROK46_IMAGE_PUBLIC_MODEL
        upstream_model = GROK46_IMAGE_UPSTREAM_MODEL
    elif kind == "video":
        tag = PUBLIC_GROK46_VIDEO_CHANNEL_TAG
        channel_type = "55"
        public_model = PUBLIC_GROK46_VIDEO_MODEL
        upstream_model = UPSTREAM_GROK46_VIDEO_MODEL
    else:
        raise ValueError("unsupported Grok 4.6 media kind")
    rows = mysql(
        "SELECT type, status, REPLACE(COALESCE(`group`, ''), ' ', ''), "
        "COALESCE(models, ''), COALESCE(model_mapping, ''), "
        "CHAR_LENGTH(COALESCE(`key`, '')), COALESCE(base_url, '') FROM channels WHERE tag = "
        + sql_quote(tag)
        + " ORDER BY id"
    )
    if len(rows) != 1:
        return "unavailable"
    raw_type, status, groups, models, raw_mapping, key_length, base_url = rows[0]
    expected_mapping = json.dumps(
        {public_model: upstream_model},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    if (
        raw_type != channel_type
        or status != "1"
        or groups != GROK46_MEDIA_PUBLIC_CHANNEL_GROUPS
        or models != public_model
        or raw_mapping != expected_mapping
        or int(key_length or "0") < 20
        or not base_url.lower().startswith("https://")
    ):
        return "invalid"
    return "published"


def discount_image2_release_state() -> str:
    rows = mysql(
        "SELECT COALESCE(tag, ''), status, REPLACE(COALESCE(`group`, ''), ' ', ''), "
        "REPLACE(COALESCE(models, ''), ' ', '') FROM channels WHERE tag IN ("
        + ", ".join(sql_quote(tag) for tag in DISCOUNT_IMAGE2_CHANNEL_TAGS)
        + ") ORDER BY tag, id"
    )
    by_tag: dict[str, list[str]] = {}
    for row in rows:
        if len(row) != 4 or row[0] in by_tag:
            return "invalid"
        by_tag[row[0]] = row

    fallback_tags = (
        DISCOUNT_IMAGE2_DDPAPI_CHANNEL_TAG,
        DISCOUNT_IMAGE2_GEEK2API_CHANNEL_TAG,
    )
    if any(tag not in by_tag for tag in fallback_tags):
        return "unavailable"
    for tag in fallback_tags:
        _tag, status, groups, models = by_tag[tag]
        if (
            status != "1"
            or groups != DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS
            or models != INTERNAL_DISCOUNT_IMAGE2_MODEL
        ):
            return "invalid"

    primary = by_tag.get(DISCOUNT_IMAGE2_PRIMARY_CHANNEL_TAG)
    # The existing verified DDPAPI + Geek2API pair keeps the public model
    # available during the one-time deployment that introduces the new
    # PDHLZY primary channel.
    if primary is None:
        return "published"
    _tag, status, groups, models = primary
    if status != "1" or models != INTERNAL_DISCOUNT_IMAGE2_MODEL:
        return "invalid"
    if groups == "internal":
        return "staged"
    if groups == DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS:
        return "published"
    return "invalid"


def gemini_ddpapi_release_state() -> str:
    rows = mysql(
        "SELECT COALESCE(tag, ''), status, REPLACE(COALESCE(`group`, ''), ' ', ''), "
        "REPLACE(COALESCE(models, ''), ' ', '') FROM channels WHERE tag IN ("
        + ", ".join(sql_quote(tag) for tag in GEMINI_DDPAPI_CHANNEL_TAGS)
        + ") ORDER BY tag"
    )
    if len(rows) != len(GEMINI_DDPAPI_MODEL_CONFIGS):
        return "unavailable"
    expected_by_tag = {
        str(config["channel_tag"]): model
        for model, config in GEMINI_DDPAPI_MODEL_CONFIGS.items()
    }
    groups: set[str] = set()
    seen_tags: set[str] = set()
    for tag, status, channel_groups, models in rows:
        if status != "1" or tag in seen_tags or models != expected_by_tag.get(tag):
            return "invalid"
        seen_tags.add(tag)
        groups.add(channel_groups)
    if groups == {"internal"}:
        return "staged"
    if groups == {GEMINI_DDPAPI_PUBLIC_CHANNEL_GROUPS}:
        return "published"
    return "invalid"


def system_token_profiles(profiles: dict[str, list[str]]) -> dict[str, list[str]]:
    result = {name: list(models) for name, models in profiles.items()}
    if grok15_1080_video_release_state() == "staged" and PUBLIC_GROK15_1080_VIDEO_MODEL not in result["video"]:
        result["video"].append(PUBLIC_GROK15_1080_VIDEO_MODEL)
    if discount_image2_release_state() == "staged" and DISCOUNT_IMAGE2_PUBLIC_MODEL not in result["image"]:
        result["image"].append(DISCOUNT_IMAGE2_PUBLIC_MODEL)
    if gemini_ddpapi_release_state() == "staged":
        for model in GEMINI_DDPAPI_MODELS:
            if model not in result["image"]:
                result["image"].append(model)
    return result


def active_groups() -> list[str]:
    groups = {"default", "standard", "pro", "code", "internal", KIMI_K3_GROUP}
    for row in mysql("SELECT DISTINCT `group` FROM users WHERE status = 1 AND `group` <> ''"):
        if row and row[0]:
            groups.add(row[0])
    for row in mysql("SELECT DISTINCT `group` FROM abilities WHERE `group` <> ''"):
        if row and row[0]:
            groups.add(row[0])
    return sorted(groups)


def require_grok46_source_channel_id() -> int:
    rows = mysql(
        "SELECT id, status, CHAR_LENGTH(COALESCE(`key`, '')), COALESCE(base_url, '') "
        "FROM channels WHERE tag = "
        + sql_quote(GROK46_CHANNEL_TAG)
        + " ORDER BY id"
    )
    if len(rows) != 1:
        raise RuntimeError("the managed Grok 4.6 text channel is missing or ambiguous")
    channel_id, _status, key_length, base_url = rows[0]
    if int(key_length or "0") < 20 or not base_url.lower().startswith("https://"):
        raise RuntimeError("the managed Grok 4.6 text channel is incomplete")
    return int(channel_id)


def validate_grok46_media_channel_isolation() -> None:
    for tag, model in GROK46_MEDIA_CHANNEL_MODEL_BY_TAG.items():
        rows = mysql("SELECT COUNT(*) FROM channels WHERE tag = " + sql_quote(tag))
        if (int(rows[0][0]) if rows else 0) > 1:
            raise RuntimeError("multiple channels use a managed Grok 4.6 media tag")
        rows = mysql(
            "SELECT COUNT(*) FROM channels WHERE COALESCE(tag, '') <> "
            + sql_quote(tag)
            + " AND FIND_IN_SET("
            + sql_quote(model)
            + ", COALESCE(models, '')) > 0"
        )
        if (int(rows[0][0]) if rows else 0) > 0:
            raise RuntimeError("a Grok 4.6 public media model is assigned to an unmanaged channel")


def ensure_grok46_media_channels() -> None:
    source_channel_id = require_grok46_source_channel_id()
    validate_grok46_media_channel_isolation()
    channel_specs = (
        (
            GROK46_IMAGE_CHANNEL_TAG,
            1,
            "星人 Grok 4.6 图片",
            GROK46_IMAGE_PUBLIC_MODEL,
            GROK46_IMAGE_UPSTREAM_MODEL,
            "人民币 ¥0.10/张；仅文生图；1K/2K；low/medium",
        ),
        (
            PUBLIC_GROK46_VIDEO_CHANNEL_TAG,
            55,
            "星人 Grok 4.6 视频",
            PUBLIC_GROK46_VIDEO_MODEL,
            UPSTREAM_GROK46_VIDEO_MODEL,
            "人民币 ¥0.10/秒；仅 720P；6/10/15 秒",
        ),
    )
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    for tag, channel_type, name, public_model, upstream_model, remark in channel_specs:
        mapping = json.dumps(
            {public_model: upstream_model},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        statements.extend(
            [
                "SET @grok46_media_channel_id := (SELECT MIN(id) FROM channels WHERE tag = "
                + sql_quote(tag)
                + ");",
                "INSERT INTO channels "
                "(type, `key`, status, name, weight, created_time, test_time, response_time, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark) "
                "SELECT "
                + ", ".join(
                    [
                        str(channel_type),
                        "source.`key`",
                        "1",
                        sql_quote(name),
                        "100",
                        "@now",
                        "0",
                        "0",
                        "source.base_url",
                        sql_quote(public_model),
                        sql_quote(GROK46_MEDIA_PUBLIC_CHANNEL_GROUPS),
                        sql_quote(mapping),
                        "0",
                        "1",
                        sql_quote(tag),
                        sql_quote(remark),
                    ]
                )
                + " FROM channels AS source WHERE source.id = "
                + str(source_channel_id)
                + " AND @grok46_media_channel_id IS NULL;",
                "SET @grok46_media_channel_id := IFNULL(@grok46_media_channel_id, LAST_INSERT_ID());",
                "UPDATE channels AS media JOIN channels AS source ON source.id = "
                + str(source_channel_id)
                + " SET media.type = "
                + str(channel_type)
                + ", media.`key` = source.`key`, media.status = 1, media.name = "
                + sql_quote(name)
                + ", media.weight = 100, media.base_url = source.base_url, media.models = "
                + sql_quote(public_model)
                + ", media.`group` = "
                + sql_quote(GROK46_MEDIA_PUBLIC_CHANNEL_GROUPS)
                + ", media.model_mapping = "
                + sql_quote(mapping)
                + ", media.priority = 0, media.auto_ban = 1, media.tag = "
                + sql_quote(tag)
                + ", media.remark = "
                + sql_quote(remark)
                + " WHERE media.id = @grok46_media_channel_id;",
            ]
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def ensure_grok46_image_model() -> None:
    statements = [
        "START TRANSACTION;",
        "SET @now := UNIX_TIMESTAMP();",
        "SET @grok46_image_model := "
        + sql_quote(GROK46_IMAGE_PUBLIC_MODEL)
        + " COLLATE utf8mb4_unicode_ci;",
        "SET @keep_model_id := (SELECT MIN(id) FROM models WHERE model_name = @grok46_image_model AND deleted_at IS NULL);",
        "SET @keep_model_id := IFNULL(@keep_model_id, (SELECT MIN(id) FROM models WHERE model_name = @grok46_image_model));",
        "INSERT INTO models "
        "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
        "SELECT "
        + ", ".join(
            [
                "@grok46_image_model",
                sql_quote(GROK46_IMAGE_DESCRIPTION),
                sql_quote("Grok"),
                sql_quote("image,grok"),
                "3",
                sql_quote(GROK46_IMAGE_ENDPOINTS),
                "1",
                "0",
                "@now",
                "@now",
                "0",
            ]
        )
        + " WHERE @keep_model_id IS NULL;",
        "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());",
        "UPDATE models SET description = "
        + sql_quote(GROK46_IMAGE_DESCRIPTION)
        + ", icon = 'Grok', tags = 'image,grok', vendor_id = 3, endpoints = "
        + sql_quote(GROK46_IMAGE_ENDPOINTS)
        + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 WHERE id = @keep_model_id;",
        "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
        "WHERE model_name = @grok46_image_model AND id <> @keep_model_id;",
        "COMMIT;",
    ]
    mysql_exec("\n".join(statements))


def ensure_public_video_models() -> None:
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
    for model, config in PUBLIC_VIDEO_MODEL_CONFIGS.items():
        description = str(config["description"])
        icon = str(config["icon"])
        tags = str(config["tags"])
        vendor_id = str(int(config["vendor_id"]))
        statements.append(
            "SET @public_video_model := "
            + sql_quote(model)
            + " COLLATE utf8mb4_unicode_ci;"
            "SET @keep_model_id := ("
            "SELECT MIN(id) FROM models WHERE model_name = @public_video_model AND deleted_at IS NULL"
            ");"
            "SET @keep_model_id := IFNULL(@keep_model_id, ("
            "SELECT MIN(id) FROM models WHERE model_name = @public_video_model"
            "));"
            "INSERT INTO models "
            "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
            "SELECT "
            + ", ".join(
                [
                    "@public_video_model",
                    sql_quote(description),
                    sql_quote(icon),
                    sql_quote(tags),
                    vendor_id,
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
            + sql_quote(icon)
            + ", tags = "
            + sql_quote(tags)
            + ", vendor_id = "
            + vendor_id
            + ", endpoints = "
            + sql_quote('{"openai-video":"/v1/videos"}')
            + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
            "WHERE id = @keep_model_id;"
            "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
            "WHERE model_name = @public_video_model AND id <> @keep_model_id;"
        )
    if DISABLED_PUBLIC_VIDEO_CHANNEL_IDS:
        disabled_channel_ids = ", ".join(str(int(channel_id)) for channel_id in DISABLED_PUBLIC_VIDEO_CHANNEL_IDS)
        statements.append(f"UPDATE channels SET status = 2 WHERE id IN ({disabled_channel_ids});")
        statements.append(f"UPDATE abilities SET enabled = 0 WHERE channel_id IN ({disabled_channel_ids});")
    for selector, selector_value, public_models, model_mapping in PUBLIC_VIDEO_CHANNEL_CONFIGS:
        if selector == "id":
            channel_where = "id = " + str(int(selector_value))
        elif selector == "tag":
            channel_where = "tag = " + sql_quote(selector_value)
        else:
            raise ValueError("unsupported public video channel selector")
        statements.append(
            "UPDATE channels SET status = 1, models = "
            + sql_quote(",".join(public_models))
            + ", model_mapping = "
            + sql_quote(model_mapping)
            + " WHERE "
            + channel_where
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def retire_legacy_discount_image2() -> dict[str, int]:
    retired_models = ", ".join(sql_quote(model) for model in RETIRED_IMAGE_MODELS)
    channel_predicate = " OR ".join(
        "FIND_IN_SET("
        + sql_quote(model)
        + ", COALESCE(models, '')) > 0"
        for model in RETIRED_IMAGE_MODELS
    )
    token_predicate = " OR ".join(
        "FIND_IN_SET("
        + sql_quote(model)
        + ", COALESCE(model_limits, '')) > 0"
        for model in RETIRED_IMAGE_MODELS
    )
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND ("
        + token_predicate
        + ");"
    )
    token_updates: list[tuple[str, str, str]] = []
    for token_id, token_key, raw_limits in token_rows:
        next_limits = sanitize_model_limits(raw_limits)
        if next_limits != raw_limits:
            token_updates.append((token_id, next_limits, token_key))

    pricing_statements: list[str] = []
    for key in (
        "ModelRatio",
        "CompletionRatio",
        "CacheRatio",
        "CreateCacheRatio",
        "ModelPrice",
        "ImageRatio",
    ):
        values = parse_json_option(key)
        sanitized = {
            model: value
            for model, value in values.items()
            if not is_retired_image_model(model)
        }
        if sanitized != values:
            pricing_statements.append(json_option_upsert_statement(key, sanitized))
    for key in ("billing_setting.billing_mode", "billing_setting.billing_expr"):
        values = parse_json_string_option(key)
        sanitized = {
            model: value
            for model, value in values.items()
            if not is_retired_image_model(model)
        }
        if sanitized != values:
            pricing_statements.append(json_option_upsert_statement(key, sanitized))

    statements = [
        "START TRANSACTION;",
        "UPDATE channels SET status = 2, priority = 0, weight = 0 WHERE "
        + channel_predicate
        + ";",
        "UPDATE abilities SET enabled = 0 WHERE model IN ("
        + retired_models
        + ") OR channel_id IN (SELECT id FROM channels WHERE "
        + channel_predicate
        + ");",
        "UPDATE models SET status = 0 WHERE model_name IN ("
        + retired_models
        + ");",
        *pricing_statements,
    ]
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
    caches_deleted = delete_token_caches(
        [token_key for _token_id, _next_limits, token_key in token_updates]
    )
    return {
        "channels_disabled": len(
            mysql("SELECT id FROM channels WHERE status = 2 AND (" + channel_predicate + ");")
        ),
        "models_disabled": len(
            mysql("SELECT id FROM models WHERE status = 0 AND model_name IN (" + retired_models + ");")
        ),
        "abilities_disabled": len(
            mysql(
                "SELECT channel_id FROM abilities WHERE enabled = 0 AND (model IN ("
                + retired_models
                + ") OR channel_id IN (SELECT id FROM channels WHERE "
                + channel_predicate
                + "));"
            )
        ),
        "tokens_rewritten": len(token_updates),
        "token_caches_deleted": caches_deleted,
        "pricing_options_sanitized": len(pricing_statements),
    }


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
        "UPDATE models SET description = "
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


def ensure_discount_image2_primary_and_fallback_channels() -> None:
    """Keep the verified three-channel order without touching credentials."""
    mapping = json.dumps({INTERNAL_DISCOUNT_IMAGE2_MODEL: RAW_GPT_IMAGE2_MODEL}, separators=(",", ":"))
    statements = [
        "START TRANSACTION;",
        "UPDATE channels SET status = 1, priority = "
        + str(DISCOUNT_IMAGE2_CHANNEL_PRIORITIES[DISCOUNT_IMAGE2_PRIMARY_CHANNEL_TAG])
        + ", weight = 100, models = "
        + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", remark = "
        + sql_quote(DISCOUNT_IMAGE2_CHANNEL_REMARK)
        + " WHERE tag = "
        + sql_quote(DISCOUNT_IMAGE2_PRIMARY_CHANNEL_TAG)
        + ";",
        "UPDATE channels SET status = 1, priority = "
        + str(DISCOUNT_IMAGE2_CHANNEL_PRIORITIES[DISCOUNT_IMAGE2_DDPAPI_CHANNEL_TAG])
        + ", weight = 100, models = "
        + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
        + ", `group` = "
        + sql_quote(DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", remark = "
        + sql_quote(DISCOUNT_IMAGE2_CHANNEL_REMARK)
        + " WHERE tag = "
        + sql_quote(DISCOUNT_IMAGE2_DDPAPI_CHANNEL_TAG)
        + ";",
        "UPDATE channels SET status = 1, priority = "
        + str(DISCOUNT_IMAGE2_CHANNEL_PRIORITIES[DISCOUNT_IMAGE2_GEEK2API_CHANNEL_TAG])
        + ", weight = 100, models = "
        + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
        + ", `group` = "
        + sql_quote(DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", remark = "
        + sql_quote(DISCOUNT_IMAGE2_CHANNEL_REMARK)
        + " WHERE tag = "
        + sql_quote(DISCOUNT_IMAGE2_GEEK2API_CHANNEL_TAG)
        + ";",
        "COMMIT;",
    ]
    mysql_exec("\n".join(statements))


def ensure_stable_image2_backing_model() -> None:
    statements = [
        "START TRANSACTION;",
        "SET @now := UNIX_TIMESTAMP();",
        "SET @stable_image2_model := "
        + sql_quote(INTERNAL_STABLE_IMAGE2_MODEL)
        + " COLLATE utf8mb4_unicode_ci;",
        "SET @keep_model_id := ("
        "SELECT MIN(id) FROM models WHERE model_name = @stable_image2_model AND deleted_at IS NULL"
        ");",
        "SET @keep_model_id := IFNULL(@keep_model_id, ("
        "SELECT MIN(id) FROM models WHERE model_name = @stable_image2_model"
        "));",
        "INSERT INTO models "
        "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) "
        "SELECT "
        + ", ".join(
            [
                "@stable_image2_model",
                sql_quote(STABLE_IMAGE2_DESCRIPTION),
                sql_quote("OpenAI"),
                sql_quote(STABLE_IMAGE2_TAGS),
                "1",
                sql_quote(STABLE_IMAGE2_ENDPOINTS),
                "1",
                "0",
                "@now",
                "@now",
                "0",
            ]
        )
        + " WHERE @keep_model_id IS NULL;",
        "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());",
        "UPDATE models SET description = "
        + sql_quote(STABLE_IMAGE2_DESCRIPTION)
        + ", icon = "
        + sql_quote("OpenAI")
        + ", tags = "
        + sql_quote(STABLE_IMAGE2_TAGS)
        + ", vendor_id = 1, endpoints = "
        + sql_quote(STABLE_IMAGE2_ENDPOINTS)
        + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 "
        "WHERE id = @keep_model_id;",
        "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
        "WHERE model_name = @stable_image2_model AND id <> @keep_model_id;",
        "COMMIT;",
    ]
    mysql_exec("\n".join(statements))


def ensure_stable_image2_channel_order() -> None:
    """Keep the stable Image 2 primary/fallback ordering without touching credentials."""
    mapping = json.dumps({INTERNAL_STABLE_IMAGE2_MODEL: RAW_GPT_IMAGE2_MODEL}, separators=(",", ":"))
    statements = [
        "START TRANSACTION;",
        "UPDATE channels SET status = 1, priority = "
        + str(STABLE_IMAGE2_CHANNEL_PRIORITIES[STABLE_IMAGE2_PRIMARY_CHANNEL_TAG])
        + ", weight = 100, models = "
        + sql_quote(INTERNAL_STABLE_IMAGE2_MODEL)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", remark = "
        + sql_quote(STABLE_IMAGE2_CHANNEL_REMARK)
        + " WHERE tag = "
        + sql_quote(STABLE_IMAGE2_PRIMARY_CHANNEL_TAG)
        + ";",
        "UPDATE channels SET status = 1, priority = "
        + str(STABLE_IMAGE2_CHANNEL_PRIORITIES[STABLE_IMAGE2_ENTERPRISE_FALLBACK_CHANNEL_TAG])
        + ", weight = 100, models = "
        + sql_quote(INTERNAL_STABLE_IMAGE2_MODEL)
        + ", model_mapping = "
        + sql_quote(mapping)
        + ", remark = "
        + sql_quote(STABLE_IMAGE2_ENTERPRISE_FALLBACK_REMARK)
        + " WHERE tag = "
        + sql_quote(STABLE_IMAGE2_ENTERPRISE_FALLBACK_CHANNEL_TAG)
        + ";",
        "COMMIT;",
    ]
    mysql_exec("\n".join(statements))


def ensure_gemini_ddpapi_image_models() -> None:
    statements = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();"]
    for model, config in GEMINI_DDPAPI_MODEL_CONFIGS.items():
        model_literal = sql_quote(model)
        statements.extend(
            [
                "SET @gemini_image_model := " + model_literal + " COLLATE utf8mb4_unicode_ci;",
                "SET @keep_model_id := (SELECT MIN(id) FROM models WHERE model_name = @gemini_image_model AND deleted_at IS NULL);",
                "SET @keep_model_id := IFNULL(@keep_model_id, (SELECT MIN(id) FROM models WHERE model_name = @gemini_image_model));",
                "INSERT INTO models "
                "(model_name, description, icon, tags, vendor_id, endpoints, status, sync_official, created_time, updated_time, name_rule) SELECT "
                + ", ".join(
                    [
                        "@gemini_image_model",
                        sql_quote(str(config["description"])),
                        sql_quote("Gemini.Color"),
                        sql_quote("image,gemini"),
                        "6",
                        sql_quote(GEMINI_DDPAPI_ENDPOINTS),
                        "1",
                        "0",
                        "@now",
                        "@now",
                        "0",
                    ]
                )
                + " WHERE @keep_model_id IS NULL;",
                "SET @keep_model_id := IFNULL(@keep_model_id, LAST_INSERT_ID());",
                "UPDATE models SET description = "
                + sql_quote(str(config["description"]))
                + ", icon = 'Gemini.Color', tags = 'image,gemini', vendor_id = 6, endpoints = "
                + sql_quote(GEMINI_DDPAPI_ENDPOINTS)
                + ", status = 1, sync_official = 0, updated_time = @now, deleted_at = NULL, name_rule = 0 WHERE id = @keep_model_id;",
                "UPDATE models SET status = 0, deleted_at = COALESCE(deleted_at, DATE_ADD(FROM_UNIXTIME(@now), INTERVAL id SECOND)) "
                "WHERE model_name = @gemini_image_model AND id <> @keep_model_id;",
            ]
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))


def sync_public_image_pricing() -> None:
    model_ratios = parse_json_option("ModelRatio")
    completion_ratios = parse_json_option("CompletionRatio")
    model_prices = parse_json_option("ModelPrice")
    exchange_rate = usd_exchange_rate()

    model_prices[DISCOUNT_IMAGE2_PUBLIC_MODEL] = decimal_to_float(
        DISCOUNT_IMAGE2_BASE_PRICE_CNY / exchange_rate
    )
    model_ratios.pop(DISCOUNT_IMAGE2_PUBLIC_MODEL, None)
    completion_ratios.pop(DISCOUNT_IMAGE2_PUBLIC_MODEL, None)

    model_prices[STABLE_IMAGE2_PUBLIC_MODEL] = decimal_to_float(
        STABLE_IMAGE2_PRICE_CNY / exchange_rate
    )
    model_ratios.pop(STABLE_IMAGE2_PUBLIC_MODEL, None)
    completion_ratios.pop(STABLE_IMAGE2_PUBLIC_MODEL, None)

    model_prices[GROK_IMAGE_MODEL] = decimal_to_float(
        GROK_IMAGE_PRICE_CNY / exchange_rate
    )
    model_ratios.pop(GROK_IMAGE_MODEL, None)
    completion_ratios.pop(GROK_IMAGE_MODEL, None)

    model_prices[GROK46_IMAGE_PUBLIC_MODEL] = decimal_to_float(
        GROK46_IMAGE_PRICE_CNY / exchange_rate
    )
    model_ratios.pop(GROK46_IMAGE_PUBLIC_MODEL, None)
    completion_ratios.pop(GROK46_IMAGE_PUBLIC_MODEL, None)

    for model, config in GEMINI_DDPAPI_MODEL_CONFIGS.items():
        price_cny = config["price_cny"]
        if not isinstance(price_cny, Decimal):
            raise TypeError("Gemini image price must be Decimal")
        model_prices[model] = decimal_to_float(price_cny / exchange_rate)
        model_ratios.pop(model, None)
        completion_ratios.pop(model, None)

    upsert_json_option("ModelRatio", model_ratios)
    upsert_json_option("CompletionRatio", completion_ratios)
    upsert_json_option("ModelPrice", model_prices)


def sync_grok_image_metadata() -> None:
    mysql_exec(
        "UPDATE models SET description = "
        + sql_quote(GROK_IMAGE_DESCRIPTION)
        + ", endpoints = "
        + sql_quote(GROK_IMAGE_ENDPOINTS)
        + ", updated_time = UNIX_TIMESTAMP() WHERE deleted_at IS NULL AND model_name = "
        + sql_quote(GROK_IMAGE_MODEL)
        + ";"
    )


def sync_tokens(profiles: dict[str, list[str]]) -> dict[str, int]:
    expected_models_by_name: dict[str, str] = {}
    expected_groups_by_name: dict[str, str] = {}
    for profile, names in TOKEN_PROFILES.items():
        profile_models = sanitize_token_models(profiles[profile])
        if profile == "claude":
            profile_models = claude_token_models_for_group(profile_models, CLAUDE_PRODUCT_GROUP)
        models = ",".join(profile_models)
        for name in names:
            expected_models_by_name[name] = models
            if profile == "claude":
                expected_groups_by_name[name] = CLAUDE_PRODUCT_GROUP
    managed_names = tuple(expected_models_by_name)
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), name, COALESCE(model_limits, ''), "
        "COALESCE(model_limits_enabled, 0), COALESCE(`group`, '') FROM tokens "
        "WHERE deleted_at IS NULL AND name IN ("
        + ", ".join(sql_quote(name) for name in managed_names)
        + ");"
    )
    token_updates: list[tuple[str, str, str, str | None]] = []
    for token_id, token_key, name, raw_limits, raw_enabled, raw_group in token_rows:
        expected_models = expected_models_by_name.get(name)
        if expected_models is None:
            continue
        if name in TOKEN_PROFILES["codex"] and raw_group == SPECIAL_TEXT_GROUP:
            expected_models = SPECIAL_TEXT_MODEL_LIMITS
        expected_group = expected_groups_by_name.get(name)
        if raw_limits != expected_models or raw_enabled != "1" or (expected_group is not None and raw_group != expected_group):
            token_updates.append((token_id, token_key, expected_models, expected_group))

    statements = ["START TRANSACTION;"]
    for token_id, _token_key, expected_models, expected_group in token_updates:
        group_sql = ""
        if expected_group is not None:
            group_sql = ", `group` = " + sql_quote(expected_group) + ", cross_group_retry = 0"
        statements.append(
            "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
            + sql_quote(expected_models)
            + group_sql
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches(
        [token_key for _token_id, token_key, _expected_models, _expected_group in token_updates]
    )
    return {"tokens_rewritten": len(token_updates), "token_caches_deleted": caches_deleted}


def sync_user_codex_tokens(profiles: dict[str, list[str]] | None = None) -> dict[str, int]:
    names = TOKEN_PROFILES["codex"]
    required_models = profiles["codex"] if profiles and profiles.get("codex") else CODEX_ALLOWED_MODELS
    name_predicates = [
        "name IN (" + ", ".join(sql_quote(name) for name in names) + ")",
        *[
            "name LIKE " + sql_quote(prefix + "%")
            for prefix in USER_CODEX_TOKEN_NAME_PREFIXES
        ],
    ]
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, ''), COALESCE(model_limits_enabled, 0), COALESCE(`group`, '') FROM tokens "
        "WHERE deleted_at IS NULL "
        "AND (" + " OR ".join(name_predicates) + ") "
        "AND user_id <> "
        + str(ADMIN_SYSTEM_TOKEN_USER_ID)
        + ";"
    )
    token_updates: list[tuple[str, str, str]] = []
    for token_id, token_key, raw_limits, raw_enabled, raw_group in token_rows:
        next_limits = SPECIAL_TEXT_MODEL_LIMITS if raw_group == SPECIAL_TEXT_GROUP else ensure_codex_image_model_limits(raw_limits, required_models)
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
    caches_deleted = delete_token_caches(
        [token_key for _token_id, _next_limits, token_key in token_updates]
    )
    return {"tokens_rewritten": len(token_updates), "token_caches_deleted": caches_deleted}


def append_model_limit(raw_limits: str, model: str) -> str:
    models = [item.strip() for item in raw_limits.split(",") if item.strip()]
    if model in models:
        return raw_limits
    separator = "" if not raw_limits or raw_limits.endswith(",") else ","
    return raw_limits + separator + model


def sync_controlled_codex_alias_tokens() -> dict[str, int]:
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND status = 1 AND model_limits_enabled = 1 "
        "AND FIND_IN_SET("
        + sql_quote(CODEX_AUTO_REVIEW_BACKING_MODEL)
        + ", REPLACE(COALESCE(model_limits, ''), ' ', '')) > 0;"
    )
    token_updates: list[tuple[str, str, str, str]] = []
    for token_id, token_key, raw_limits in token_rows:
        next_limits = append_model_limit(raw_limits, CODEX_AUTO_REVIEW_MODEL)
        if next_limits != raw_limits:
            token_updates.append((token_id, raw_limits, next_limits, token_key))

    statements = ["START TRANSACTION;"]
    for token_id, raw_limits, next_limits, _token_key in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits = "
            + sql_quote(next_limits)
            + " WHERE id = "
            + sql_quote(token_id)
            + " AND status = 1 AND model_limits_enabled = 1 AND FIND_IN_SET("
            + sql_quote(CODEX_AUTO_REVIEW_BACKING_MODEL)
            + ", REPLACE(COALESCE(model_limits, ''), ' ', '')) > 0"
            + " AND BINARY COALESCE(model_limits, '') = BINARY "
            + sql_quote(raw_limits)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches(
        [token_key for _token_id, _raw_limits, _next_limits, token_key in token_updates]
    )
    return {"tokens_rewritten": len(token_updates), "token_caches_deleted": caches_deleted}


def claude_token_models_for_group(available_models: list[str], group: str) -> list[str]:
    available = set(sanitize_token_models(available_models))
    allowed = CLAUDE_TOKEN_MODELS_BY_GROUP.get(group, CLAUDE_EXTERNAL_MODELS)
    return [model for model in allowed if model in available]


def sync_user_claude_tokens(profiles: dict[str, list[str]]) -> dict[str, int]:
    available_models = sanitize_token_models(profiles["claude"])
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, ''), COALESCE(model_limits_enabled, 0), "
        "COALESCE(`group`, ''), COALESCE(cross_group_retry, 0) FROM tokens "
        "WHERE deleted_at IS NULL AND LOWER(TRIM(COALESCE(name, ''))) = "
        + sql_quote(CLAUDE_USER_TOKEN_NAME)
        + ";"
    )
    token_updates: list[tuple[str, str, str, str]] = []
    for token_id, token_key, raw_limits, raw_enabled, raw_group, raw_cross_group_retry in token_rows:
        next_group = CLAUDE_PRODUCT_GROUP
        claude_models = ",".join(claude_token_models_for_group(available_models, next_group))
        if (
            raw_limits != claude_models
            or raw_enabled != "1"
            or raw_group != next_group
            or raw_cross_group_retry != "0"
        ):
            token_updates.append((token_id, token_key, claude_models, next_group))

    statements = ["START TRANSACTION;"]
    for token_id, _token_key, claude_models, next_group in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
            + sql_quote(claude_models)
            + ", `group` = "
            + sql_quote(next_group)
            + ", cross_group_retry = 0"
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches(
        [token_key for _token_id, token_key, _models, _group in token_updates]
    )
    return {"tokens_rewritten": len(token_updates), "token_caches_deleted": caches_deleted}


def sync_user_video_tokens(profiles: dict[str, list[str]]) -> dict[str, int]:
    video_models = ",".join(sanitize_token_models(profiles["video"]))
    token_names = TOKEN_PROFILES["video"]
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, ''), COALESCE(model_limits_enabled, 0) FROM tokens "
        "WHERE deleted_at IS NULL AND name IN ("
        + ", ".join(sql_quote(name) for name in token_names)
        + ") AND user_id <> 1;"
    )
    token_updates: list[tuple[str, str]] = []
    for token_id, token_key, raw_limits, raw_enabled in token_rows:
        if raw_limits != video_models or raw_enabled != "1":
            token_updates.append((token_id, token_key))

    statements = ["START TRANSACTION;"]
    for token_id, _token_key in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
            + sql_quote(video_models)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches([token_key for _token_id, token_key in token_updates])
    return {"tokens_rewritten": len(token_updates), "token_caches_deleted": caches_deleted}


def sync_user_image_tokens(profiles: dict[str, list[str]]) -> dict[str, int]:
    image_models = ",".join(sanitize_token_models(profiles["image"]))
    token_names = TOKEN_PROFILES["image"]
    token_rows = mysql(
        "SELECT id, COALESCE(`key`, ''), COALESCE(model_limits, ''), COALESCE(model_limits_enabled, 0) FROM tokens "
        "WHERE deleted_at IS NULL AND name IN ("
        + ", ".join(sql_quote(name) for name in token_names)
        + ") AND user_id <> "
        + str(ADMIN_SYSTEM_TOKEN_USER_ID)
        + ";"
    )
    token_updates: list[tuple[str, str]] = []
    for token_id, token_key, raw_limits, raw_enabled in token_rows:
        if raw_limits != image_models or raw_enabled != "1":
            token_updates.append((token_id, token_key))

    statements = ["START TRANSACTION;"]
    for token_id, _token_key in token_updates:
        statements.append(
            "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
            + sql_quote(image_models)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    caches_deleted = delete_token_caches([token_key for _token_id, token_key in token_updates])
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
    discount_channel_tags = set(DISCOUNT_TEXT_CHANNEL_TAGS)
    discount_channel_tags_sql = ", ".join(sql_quote(tag) for tag in DISCOUNT_TEXT_CHANNEL_TAGS)
    special_channel_tags = set(SPECIAL_TEXT_CHANNEL_TAGS)
    special_channel_tags_sql = ", ".join(sql_quote(tag) for tag in SPECIAL_TEXT_CHANNEL_TAGS)
    plus_channel_tags = set(PLUS_TEXT_CHANNEL_TAGS)
    plus_channel_tags_sql = ", ".join(sql_quote(tag) for tag in PLUS_TEXT_CHANNEL_TAGS)
    grok_channel_model_by_tag = dict(GROK_CHANNEL_MODEL_BY_TAG)
    grok_channel_tags = set(GROK_CHANNEL_TAGS)
    grok_channel_tags_sql = ", ".join(sql_quote(tag) for tag in GROK_CHANNEL_TAGS)
    grok_text_models = set(GROK_TEXT_MODELS)
    grok_text_models_sql = ", ".join(sql_quote(model) for model in GROK_TEXT_MODELS)
    grok46_media_channel_model_by_tag = dict(GROK46_MEDIA_CHANNEL_MODEL_BY_TAG)
    grok46_media_channel_tags = set(grok46_media_channel_model_by_tag)
    grok46_media_model_tag_by_name = {
        model: tag for tag, model in grok46_media_channel_model_by_tag.items()
    }
    protected_channel_tags_sql = ", ".join(
        sql_quote(tag)
        for tag in (
            *DISCOUNT_TEXT_CHANNEL_TAGS,
            *SPECIAL_TEXT_CHANNEL_TAGS,
            *PLUS_TEXT_CHANNEL_TAGS,
            *GROK_CHANNEL_TAGS,
            *GROK46_MEDIA_CHANNEL_MODEL_BY_TAG,
            KIMI_K3_CHANNEL_TAG,
            *CLAUDE_CHANNEL_GROUPS,
            *DISCOUNT_IMAGE2_CHANNEL_TAGS,
        )
    )
    discount_allowed_models = set(DISCOUNT_TEXT_ALLOWED_MODELS)
    discount_allowed_models_sql = ", ".join(sql_quote(model) for model in DISCOUNT_TEXT_ALLOWED_MODELS)
    special_allowed_models = set(SPECIAL_TEXT_ALLOWED_MODELS)
    special_allowed_models_sql = ", ".join(sql_quote(model) for model in SPECIAL_TEXT_ALLOWED_MODELS)
    plus_allowed_models = set(PLUS_TEXT_ALLOWED_MODELS)
    plus_allowed_models_sql = ", ".join(sql_quote(model) for model in PLUS_TEXT_ALLOWED_MODELS)
    kimi_enabled_channel_sql = (
        "SELECT id FROM channels WHERE status = 1 AND tag = "
        + sql_quote(KIMI_K3_CHANNEL_TAG)
        + " AND REPLACE(COALESCE(`group`, ''), ' ', '') = "
        + sql_quote(KIMI_K3_GROUP)
        + " AND REPLACE(COALESCE(models, ''), ' ', '') = "
        + sql_quote(KIMI_K3_MODEL)
    )
    statements = [
        "START TRANSACTION;",
        "UPDATE channels SET status = 2 WHERE tag IN ("
        + discount_channel_tags_sql
        + ")"
        + " AND (REPLACE(COALESCE(`group`, ''), ' ', '') <> "
        + sql_quote(DISCOUNT_TEXT_GROUP)
        + " OR NOT ("
        + discount_text_models_allowed_sql("models")
        + "));",
        "UPDATE channels SET status = 2 WHERE COALESCE(tag, '') NOT IN ("
        + discount_channel_tags_sql
        + ")"
        + " AND FIND_IN_SET("
        + sql_quote(DISCOUNT_TEXT_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
        *[
            "UPDATE channels SET status = 2 WHERE tag = "
            + sql_quote(tag)
            + " AND (type <> "
            + ("1" if tag == GROK46_IMAGE_CHANNEL_TAG else "55")
            + " OR REPLACE(COALESCE(`group`, ''), ' ', '') <> "
            + sql_quote(GROK46_MEDIA_PUBLIC_CHANNEL_GROUPS)
            + " OR COALESCE(models, '') <> "
            + sql_quote(expected_model)
            + ");"
            for tag, expected_model in grok46_media_channel_model_by_tag.items()
        ],
        "UPDATE channels SET status = 2 WHERE tag IN ("
        + special_channel_tags_sql
        + ")"
        + " AND (REPLACE(COALESCE(`group`, ''), ' ', '') <> "
        + sql_quote(SPECIAL_TEXT_GROUP)
        + " OR NOT ("
        + special_text_models_allowed_sql("models")
        + "));",
        "UPDATE channels SET status = 2 WHERE COALESCE(tag, '') NOT IN ("
        + special_channel_tags_sql
        + ")"
        + " AND FIND_IN_SET("
        + sql_quote(SPECIAL_TEXT_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
        "UPDATE channels SET status = 2 WHERE tag IN ("
        + plus_channel_tags_sql
        + ")"
        + " AND (REPLACE(COALESCE(`group`, ''), ' ', '') <> "
        + sql_quote(PLUS_TEXT_GROUP)
        + " OR NOT ("
        + plus_text_models_allowed_sql("models")
        + "));",
        "UPDATE channels SET status = 2 WHERE COALESCE(tag, '') NOT IN ("
        + plus_channel_tags_sql
        + ")"
        + " AND FIND_IN_SET("
        + sql_quote(PLUS_TEXT_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
        *[
            "UPDATE channels SET status = 2 WHERE tag = "
            + sql_quote(tag)
            + " AND (REPLACE(COALESCE(`group`, ''), ' ', '') <> "
            + sql_quote(GROK45_GROUP)
            + " OR REPLACE(COALESCE(models, ''), ' ', '') <> "
            + sql_quote(expected_model)
            + ");"
            for tag, expected_model in grok_channel_model_by_tag.items()
        ],
        "UPDATE channels SET status = 2 WHERE COALESCE(tag, '') NOT IN ("
        + grok_channel_tags_sql
        + ")"
        + " AND FIND_IN_SET("
        + sql_quote(GROK45_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
        "UPDATE channels SET status = 2 WHERE tag = "
        + sql_quote(PUBLIC_GROK15_1080_VIDEO_CHANNEL_TAG)
        + " AND REPLACE(COALESCE(`group`, ''), ' ', '') NOT IN ('internal', "
        + sql_quote(PUBLIC_GROK15_1080_VIDEO_CHANNEL_GROUPS)
        + ");",
        "UPDATE channels SET status = 2 WHERE tag = "
        + sql_quote(KIMI_K3_CHANNEL_TAG)
        + " AND (REPLACE(COALESCE(`group`, ''), ' ', '') <> "
        + sql_quote(KIMI_K3_GROUP)
        + " OR REPLACE(COALESCE(models, ''), ' ', '') <> "
        + sql_quote(KIMI_K3_MODEL)
        + ");",
        "UPDATE channels SET status = 2 WHERE COALESCE(tag, '') <> "
        + sql_quote(KIMI_K3_CHANNEL_TAG)
        + " AND FIND_IN_SET("
        + sql_quote(KIMI_K3_GROUP)
        + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
        "UPDATE channels SET status = 2 WHERE tag IN ("
        + ", ".join(sql_quote(tag) for tag in DISCOUNT_IMAGE2_CHANNEL_TAGS)
        + ")"
        + " AND (REPLACE(COALESCE(`group`, ''), ' ', '') NOT IN ('internal', "
        + sql_quote(DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS)
        + ") OR REPLACE(COALESCE(models, ''), ' ', '') <> "
        + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
        + ");",
    ]
    for model, config in GEMINI_DDPAPI_MODEL_CONFIGS.items():
        statements.append(
            "UPDATE channels SET status = 2 WHERE tag = "
            + sql_quote(str(config["channel_tag"]))
            + " AND (REPLACE(COALESCE(`group`, ''), ' ', '') NOT IN ('internal', "
            + sql_quote(GEMINI_DDPAPI_PUBLIC_CHANNEL_GROUPS)
            + ") OR REPLACE(COALESCE(models, ''), ' ', '') <> "
            + sql_quote(model)
            + ");"
        )
    for claude_group, allowed_tags in CLAUDE_CHANNEL_TAGS_BY_GROUP.items():
        allowed_tags_sql = ", ".join(sql_quote(tag) for tag in allowed_tags)
        statements.extend(
            [
                "UPDATE channels SET status = 2 WHERE COALESCE(tag, '') NOT IN ("
                + allowed_tags_sql
                + ") AND FIND_IN_SET("
                + sql_quote(claude_group)
                + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0;",
                "UPDATE channels SET status = 2 WHERE tag IN ("
                + allowed_tags_sql
                + ") AND REPLACE(COALESCE(`group`, ''), ' ', '') <> "
                + sql_quote(claude_group)
                + ";",
            ]
        )
    invalid_discount_channels: list[str] = []
    invalid_special_channels: list[str] = []
    invalid_plus_channels: list[str] = []
    invalid_grok_channels: list[str] = []
    invalid_grok46_media_channels: list[str] = []
    invalid_kimi_channels: list[str] = []
    invalid_grok1080_channels: list[str] = []
    invalid_discount_image2_channels: list[str] = []
    invalid_gemini_ddpapi_channels: list[str] = []
    invalid_claude_channels: list[str] = []
    gemini_model_by_tag = {
        str(config["channel_tag"]): model
        for model, config in GEMINI_DDPAPI_MODEL_CONFIGS.items()
    }
    gemini_tag_by_model = {model: tag for tag, model in gemini_model_by_tag.items()}
    for channel_id, raw_models, _priority, _weight, tag, raw_groups in channel_rows:
        channel_groups = [item.strip() for item in raw_groups.split(",") if item.strip()]
        channel_models = [item.strip() for item in raw_models.split(",") if item.strip()]
        if tag in discount_channel_tags:
            if (
                channel_groups != [DISCOUNT_TEXT_GROUP]
                or not channel_models
                or any(model not in discount_allowed_models for model in channel_models)
            ):
                invalid_discount_channels.append(channel_id)
                sync_groups = []
            else:
                sync_groups = channel_groups
        elif DISCOUNT_TEXT_GROUP in channel_groups:
            invalid_discount_channels.append(channel_id)
            sync_groups = []
        elif tag in special_channel_tags:
            if (
                channel_groups != [SPECIAL_TEXT_GROUP]
                or not channel_models
                or any(model not in special_allowed_models for model in channel_models)
            ):
                invalid_special_channels.append(channel_id)
                sync_groups = []
            else:
                sync_groups = channel_groups
        elif SPECIAL_TEXT_GROUP in channel_groups:
            invalid_special_channels.append(channel_id)
            sync_groups = []
        elif tag in plus_channel_tags:
            if (
                channel_groups != [PLUS_TEXT_GROUP]
                or not channel_models
                or any(model not in plus_allowed_models for model in channel_models)
            ):
                invalid_plus_channels.append(channel_id)
                sync_groups = []
            else:
                sync_groups = channel_groups
        elif PLUS_TEXT_GROUP in channel_groups:
            invalid_plus_channels.append(channel_id)
            sync_groups = []
        elif tag in grok_channel_model_by_tag:
            if channel_groups != [GROK45_GROUP] or channel_models != [grok_channel_model_by_tag[tag]]:
                invalid_grok_channels.append(channel_id)
                sync_groups = []
            else:
                sync_groups = channel_groups
        elif GROK45_GROUP in channel_groups:
            invalid_grok_channels.append(channel_id)
            sync_groups = []
        elif tag in grok46_media_channel_model_by_tag:
            expected_model = grok46_media_channel_model_by_tag[tag]
            if (
                ",".join(channel_groups) != GROK46_MEDIA_PUBLIC_CHANNEL_GROUPS
                or channel_models != [expected_model]
            ):
                invalid_grok46_media_channels.append(channel_id)
                sync_groups = []
            else:
                sync_groups = [
                    group
                    for group in groups
                    if group not in {DISCOUNT_TEXT_GROUP, SPECIAL_TEXT_GROUP, PLUS_TEXT_GROUP, GROK45_GROUP}
                    and group not in ISOLATED_CLAUDE_GROUPS
                ]
        elif tag == KIMI_K3_CHANNEL_TAG:
            if channel_groups != [KIMI_K3_GROUP] or channel_models != [KIMI_K3_MODEL]:
                invalid_kimi_channels.append(channel_id)
                sync_groups = []
            else:
                # Kimi is visible to normal token groups, but requests are
                # forced to the dedicated Kimi group before channel selection.
                sync_groups = groups
        elif KIMI_K3_GROUP in channel_groups:
            invalid_kimi_channels.append(channel_id)
            sync_groups = []
        elif tag == PUBLIC_GROK15_1080_VIDEO_CHANNEL_TAG:
            normalized_groups = ",".join(channel_groups)
            if normalized_groups == "internal":
                sync_groups = ["internal"]
            elif normalized_groups == PUBLIC_GROK15_1080_VIDEO_CHANNEL_GROUPS:
                sync_groups = [
                    group
                    for group in groups
                    if group not in {DISCOUNT_TEXT_GROUP, SPECIAL_TEXT_GROUP, PLUS_TEXT_GROUP, GROK45_GROUP}
                    and group not in ISOLATED_CLAUDE_GROUPS
                ]
            else:
                invalid_grok1080_channels.append(channel_id)
                sync_groups = []
        elif tag in DISCOUNT_IMAGE2_CHANNEL_TAGS:
            normalized_groups = ",".join(channel_groups)
            if channel_models != [INTERNAL_DISCOUNT_IMAGE2_MODEL]:
                invalid_discount_image2_channels.append(channel_id)
                sync_groups = []
            elif normalized_groups == "internal":
                sync_groups = ["internal"]
            elif normalized_groups == DISCOUNT_IMAGE2_PUBLIC_CHANNEL_GROUPS:
                sync_groups = [
                    group
                    for group in groups
                    if group not in {DISCOUNT_TEXT_GROUP, SPECIAL_TEXT_GROUP, PLUS_TEXT_GROUP, GROK45_GROUP}
                    and group not in ISOLATED_CLAUDE_GROUPS
                ]
            else:
                invalid_discount_image2_channels.append(channel_id)
                sync_groups = []
        elif tag in gemini_model_by_tag:
            expected_model = gemini_model_by_tag[tag]
            normalized_groups = ",".join(channel_groups)
            if channel_models != [expected_model]:
                invalid_gemini_ddpapi_channels.append(channel_id)
                sync_groups = []
            elif normalized_groups == "internal":
                sync_groups = ["internal"]
            elif normalized_groups == GEMINI_DDPAPI_PUBLIC_CHANNEL_GROUPS:
                sync_groups = [
                    group
                    for group in groups
                    if group not in {DISCOUNT_TEXT_GROUP, SPECIAL_TEXT_GROUP, PLUS_TEXT_GROUP, GROK45_GROUP}
                    and group not in ISOLATED_CLAUDE_GROUPS
                ]
            else:
                invalid_gemini_ddpapi_channels.append(channel_id)
                sync_groups = []
        elif tag in CLAUDE_CHANNEL_GROUPS:
            expected_group = CLAUDE_CHANNEL_GROUPS[tag]
            if channel_groups != [expected_group]:
                invalid_claude_channels.append(channel_id)
                sync_groups = []
            else:
                sync_groups = channel_groups
        elif any(group in ISOLATED_CLAUDE_GROUPS for group in channel_groups):
            invalid_claude_channels.append(channel_id)
            sync_groups = []
        else:
            sync_groups = [
                group
                for group in groups
                if group not in {DISCOUNT_TEXT_GROUP, SPECIAL_TEXT_GROUP, PLUS_TEXT_GROUP, GROK45_GROUP}
                and group not in ISOLATED_CLAUDE_GROUPS
            ]
        for model in channel_models:
            if model == INTERNAL_DISCOUNT_IMAGE2_MODEL and tag not in DISCOUNT_IMAGE2_CHANNEL_TAGS:
                continue
            if tag in DISCOUNT_IMAGE2_CHANNEL_TAGS and model != INTERNAL_DISCOUNT_IMAGE2_MODEL:
                continue
            if model in gemini_tag_by_model and tag != gemini_tag_by_model[model]:
                continue
            if tag in gemini_model_by_tag and model != gemini_model_by_tag[tag]:
                continue
            if model in grok_text_models and grok_channel_model_by_tag.get(tag) != model:
                continue
            if tag in grok_channel_model_by_tag and model != grok_channel_model_by_tag[tag]:
                continue
            if model in grok46_media_model_tag_by_name and grok46_media_model_tag_by_name[model] != tag:
                continue
            if tag in grok46_media_channel_tags and model != grok46_media_channel_model_by_tag[tag]:
                continue
            if model == KIMI_K3_MODEL and tag != KIMI_K3_CHANNEL_TAG:
                continue
            if tag == KIMI_K3_CHANNEL_TAG and model != KIMI_K3_MODEL:
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
                    "COALESCE(current_channel.tag, '') = " + sql_quote(tag),
                    "REPLACE(COALESCE(current_channel.`group`, ''), ' ', '') = "
                    + sql_quote(",".join(channel_groups)),
                ]
                if tag in grok46_media_channel_tags:
                    current_channel_conditions.append(
                        "COALESCE(current_channel.models, '') = " + sql_quote(model)
                    )
                else:
                    current_channel_conditions.append(
                        "FIND_IN_SET("
                        + sql_quote(model)
                        + ", REPLACE(COALESCE(current_channel.models, ''), ' ', '')) > 0"
                    )
                if tag in discount_channel_tags:
                    current_channel_conditions.append(
                        discount_text_models_allowed_sql("current_channel.models")
                    )
                elif tag in special_channel_tags:
                    current_channel_conditions.append(
                        special_text_models_allowed_sql("current_channel.models")
                    )
                elif tag in plus_channel_tags:
                    current_channel_conditions.append(
                        plus_text_models_allowed_sql("current_channel.models")
                    )
                elif tag in DISCOUNT_IMAGE2_CHANNEL_TAGS:
                    current_channel_conditions.append(
                        "REPLACE(COALESCE(current_channel.models, ''), ' ', '') = "
                        + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
                    )
                elif tag in CLAUDE_CHANNEL_GROUPS or tag == KIMI_K3_CHANNEL_TAG or tag in grok46_media_channel_tags:
                    pass
                elif tag not in grok_channel_tags:
                    current_channel_conditions.extend(
                        [
                            "COALESCE(current_channel.tag, '') NOT IN ("
                            + protected_channel_tags_sql
                            + ")",
                            "FIND_IN_SET("
                            + sql_quote(DISCOUNT_TEXT_GROUP)
                            + ", REPLACE(COALESCE(current_channel.`group`, ''), ' ', '')) = 0",
                            "FIND_IN_SET("
                            + sql_quote(SPECIAL_TEXT_GROUP)
                            + ", REPLACE(COALESCE(current_channel.`group`, ''), ' ', '')) = 0",
                            "FIND_IN_SET("
                            + sql_quote(PLUS_TEXT_GROUP)
                            + ", REPLACE(COALESCE(current_channel.`group`, ''), ' ', '')) = 0",
                            "FIND_IN_SET("
                            + sql_quote(GROK45_GROUP)
                            + ", REPLACE(COALESCE(current_channel.`group`, ''), ' ', '')) = 0",
                        ]
                    )
                duplicate_update = "enabled = 1, priority = VALUES(priority), weight = VALUES(weight), tag = VALUES(tag)"
                if tag in discount_channel_tags or tag in special_channel_tags or tag in plus_channel_tags:
                    duplicate_update = "priority = VALUES(priority), weight = VALUES(weight), tag = VALUES(tag)"
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
                    + " ON DUPLICATE KEY UPDATE "
                    + duplicate_update
                    + ";"
                )
    statements.extend(
        [
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(DISCOUNT_TEXT_GROUP)
            + " AND channel_id NOT IN (SELECT id FROM channels WHERE tag IN ("
            + discount_channel_tags_sql
            + ")) AND NOT (model = "
            + sql_quote(KIMI_K3_MODEL)
            + " AND channel_id IN ("
            + kimi_enabled_channel_sql
            + "));",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN "
            + "(SELECT id FROM channels WHERE tag IN ("
            + discount_channel_tags_sql
            + ")) AND `group` <> "
            + sql_quote(DISCOUNT_TEXT_GROUP)
            + ";",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
            "SET ability.enabled = 0 WHERE channel.tag IN ("
            + discount_channel_tags_sql
            + ")"
            + " AND (ability.model NOT IN ("
            + discount_allowed_models_sql
            + ") OR NOT ("
            + discount_text_models_allowed_sql("channel.models")
            + ") OR FIND_IN_SET(ability.model, REPLACE(COALESCE(channel.models, ''), ' ', '')) = 0);",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN "
            + "(SELECT id FROM channels WHERE status <> 1 AND (tag IN ("
            + discount_channel_tags_sql
            + ") OR FIND_IN_SET("
            + sql_quote(DISCOUNT_TEXT_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0));",
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(SPECIAL_TEXT_GROUP)
            + " AND channel_id NOT IN (SELECT id FROM channels WHERE tag IN ("
            + special_channel_tags_sql
            + "));",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN "
            + "(SELECT id FROM channels WHERE tag IN ("
            + special_channel_tags_sql
            + ")) AND `group` <> "
            + sql_quote(SPECIAL_TEXT_GROUP)
            + ";",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
            "SET ability.enabled = 0 WHERE channel.tag IN ("
            + special_channel_tags_sql
            + ")"
            + " AND (ability.model NOT IN ("
            + special_allowed_models_sql
            + ") OR NOT ("
            + special_text_models_allowed_sql("channel.models")
            + ") OR FIND_IN_SET(ability.model, REPLACE(COALESCE(channel.models, ''), ' ', '')) = 0);",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN "
            + "(SELECT id FROM channels WHERE status <> 1 AND (tag IN ("
            + special_channel_tags_sql
            + ") OR FIND_IN_SET("
            + sql_quote(SPECIAL_TEXT_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0));",
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(PLUS_TEXT_GROUP)
            + " AND channel_id NOT IN (SELECT id FROM channels WHERE tag IN ("
            + plus_channel_tags_sql
            + ")) AND NOT (model = "
            + sql_quote(KIMI_K3_MODEL)
            + " AND channel_id IN ("
            + kimi_enabled_channel_sql
            + "));",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN "
            + "(SELECT id FROM channels WHERE tag IN ("
            + plus_channel_tags_sql
            + ")) AND `group` <> "
            + sql_quote(PLUS_TEXT_GROUP)
            + ";",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
            "SET ability.enabled = 0 WHERE channel.tag IN ("
            + plus_channel_tags_sql
            + ")"
            + " AND (ability.model NOT IN ("
            + plus_allowed_models_sql
            + ") OR NOT ("
            + plus_text_models_allowed_sql("channel.models")
            + ") OR FIND_IN_SET(ability.model, REPLACE(COALESCE(channel.models, ''), ' ', '')) = 0);",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN "
            + "(SELECT id FROM channels WHERE status <> 1 AND (tag IN ("
            + plus_channel_tags_sql
            + ") OR FIND_IN_SET("
            + sql_quote(PLUS_TEXT_GROUP)
            + ", REPLACE(COALESCE(`group`, ''), ' ', '')) > 0));",
            "UPDATE abilities SET enabled = 0 WHERE `group` = "
            + sql_quote(GROK45_GROUP)
            + " AND channel_id NOT IN (SELECT id FROM channels WHERE tag IN ("
            + grok_channel_tags_sql
            + "));",
            *[
                "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
                "SET ability.enabled = 0 WHERE channel.tag = "
                + sql_quote(tag)
                + " AND (ability.`group` <> "
                + sql_quote(GROK45_GROUP)
                + " OR ability.model <> "
                + sql_quote(expected_model)
                + ");"
                for tag, expected_model in grok_channel_model_by_tag.items()
            ],
            "UPDATE abilities SET enabled = 0 WHERE model IN ("
            + grok_text_models_sql
            + ")"
            + " AND `group` <> "
            + sql_quote(GROK45_GROUP)
            + ";",
            "UPDATE abilities SET enabled = 0 WHERE channel_id IN "
            + "(SELECT id FROM channels WHERE status <> 1 AND tag IN ("
            + grok_channel_tags_sql
            + "));",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
            "SET ability.enabled = 0 WHERE channel.tag = "
            + sql_quote(KIMI_K3_CHANNEL_TAG)
            + " AND (ability.model <> "
            + sql_quote(KIMI_K3_MODEL)
            + " OR REPLACE(COALESCE(channel.`group`, ''), ' ', '') <> "
            + sql_quote(KIMI_K3_GROUP)
            + ");",
            "UPDATE abilities SET enabled = 0 WHERE model = "
            + sql_quote(KIMI_K3_MODEL)
            + " AND channel_id NOT IN (SELECT id FROM channels WHERE status = 1 AND tag = "
            + sql_quote(KIMI_K3_CHANNEL_TAG)
            + ");",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
            "SET ability.enabled = 0 WHERE channel.tag = "
            + sql_quote(PUBLIC_GROK15_1080_VIDEO_CHANNEL_TAG)
            + " AND REPLACE(COALESCE(channel.`group`, ''), ' ', '') = 'internal' "
            "AND ability.`group` <> 'internal';",
            "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
            "SET ability.enabled = 0 WHERE channel.tag IN ("
            + ", ".join(sql_quote(tag) for tag in DISCOUNT_IMAGE2_CHANNEL_TAGS)
            + ")"
            + " AND (ability.model <> "
            + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
            + " OR (REPLACE(COALESCE(channel.`group`, ''), ' ', '') = 'internal' "
            "AND ability.`group` <> 'internal'));",
            "UPDATE abilities SET enabled = 0 WHERE model = "
            + sql_quote(INTERNAL_DISCOUNT_IMAGE2_MODEL)
            + " AND channel_id NOT IN (SELECT id FROM channels WHERE status = 1 AND tag IN ("
            + ", ".join(sql_quote(tag) for tag in DISCOUNT_IMAGE2_CHANNEL_TAGS)
            + "));",
        ]
    )
    for model, config in GEMINI_DDPAPI_MODEL_CONFIGS.items():
        channel_tag = str(config["channel_tag"])
        statements.extend(
            [
                "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
                "SET ability.enabled = 0 WHERE channel.tag = "
                + sql_quote(channel_tag)
                + " AND (ability.model <> "
                + sql_quote(model)
                + " OR (REPLACE(COALESCE(channel.`group`, ''), ' ', '') = 'internal' AND ability.`group` <> 'internal'));",
                "UPDATE abilities SET enabled = 0 WHERE model = "
                + sql_quote(model)
                + " AND channel_id NOT IN (SELECT id FROM channels WHERE status = 1 AND tag = "
                + sql_quote(channel_tag)
                + ");",
            ]
        )
    for claude_group, allowed_tags in CLAUDE_CHANNEL_TAGS_BY_GROUP.items():
        allowed_tags_sql = ", ".join(sql_quote(tag) for tag in allowed_tags)
        statements.extend(
            [
                "UPDATE abilities SET enabled = 0 WHERE `group` = "
                + sql_quote(claude_group)
                + " AND channel_id NOT IN (SELECT id FROM channels WHERE tag IN ("
                + allowed_tags_sql
                + ") AND REPLACE(COALESCE(`group`, ''), ' ', '') = "
                + sql_quote(claude_group)
                + ");",
                "UPDATE abilities SET enabled = 0 WHERE channel_id IN (SELECT id FROM channels WHERE tag IN ("
                + allowed_tags_sql
                + ") AND REPLACE(COALESCE(`group`, ''), ' ', '') <> "
                + sql_quote(claude_group)
                + ");",
                "UPDATE abilities AS ability JOIN channels AS channel ON channel.id = ability.channel_id "
                "SET ability.enabled = 0 WHERE channel.tag IN ("
                + allowed_tags_sql
                + ") AND REPLACE(COALESCE(channel.`group`, ''), ' ', '') = "
                + sql_quote(claude_group)
                + " AND FIND_IN_SET(ability.model, REPLACE(COALESCE(channel.models, ''), ' ', '')) = 0;",
                "UPDATE abilities SET enabled = 0 WHERE channel_id IN (SELECT id FROM channels WHERE status <> 1 AND tag IN ("
                + allowed_tags_sql
                + "));",
            ]
        )
    statements.append("COMMIT;")
    mysql_exec("\n".join(statements))
    if invalid_discount_channels:
        raise RuntimeError(
            "discount group isolation violation; disabled channel count: "
            + str(len(invalid_discount_channels))
        )
    if invalid_special_channels:
        raise RuntimeError(
            "special group isolation violation; disabled channel count: "
            + str(len(invalid_special_channels))
        )
    if invalid_plus_channels:
        raise RuntimeError(
            "Plus group isolation violation; disabled channel count: "
            + str(len(invalid_plus_channels))
        )
    if invalid_grok_channels:
        raise RuntimeError(
            "Grok group isolation violation; disabled channel count: "
            + str(len(invalid_grok_channels))
        )
    if invalid_grok46_media_channels:
        raise RuntimeError(
            "Grok 4.6 media channel isolation violation; invalid channel count: "
            + str(len(invalid_grok46_media_channels))
        )
    if invalid_kimi_channels:
        raise RuntimeError(
            "Kimi K3 group isolation violation; disabled channel count: "
            + str(len(invalid_kimi_channels))
        )
    if invalid_grok1080_channels:
        raise RuntimeError(
            "Grok 1080P staging isolation violation; invalid channel count: "
            + str(len(invalid_grok1080_channels))
        )
    if invalid_discount_image2_channels:
        raise RuntimeError(
            "discount Image 2 staging isolation violation; invalid channel count: "
            + str(len(invalid_discount_image2_channels))
        )
    if invalid_gemini_ddpapi_channels:
        raise RuntimeError(
            "Gemini DDPAPI staging isolation violation; invalid channel count: "
            + str(len(invalid_gemini_ddpapi_channels))
        )
    if invalid_claude_channels:
        raise RuntimeError(
            "managed Claude group isolation violation; disabled channel count: "
            + str(len(invalid_claude_channels))
        )


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
        "CLAUDE_ALLOWED_MODELS": ",".join(
            claude_token_models_for_group(profiles["claude"], CLAUDE_PRODUCT_GROUP)
        ),
        "IMAGE_ALLOWED_MODELS": ",".join(
            model for model in profiles["image"] if model != DISCOUNT_IMAGE2_PUBLIC_MODEL
        ),
        "VIDEO_ALLOWED_MODELS": ",".join(profiles["video"]),
    }
    for key, value in updates.items():
        lines, changed = update_env_line(lines, key, value)
        changed_any = changed_any or changed
    if changed_any:
        backup = env_path.with_name(f".env.backup.model-sync.{os.environ.get('SYNC_TIMESTAMP', '')}".rstrip("."))
        if not backup.exists():
            backup.write_text(env_path.read_text(encoding="utf-8", errors="replace"), encoding="utf-8")
        env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return changed_any


def refresh_codex() -> None:
    if not (CODEX_ROOT / "docker-compose.yml").exists():
        return
    env = os.environ.copy()
    env.pop("HOST_BIND_IP", None)
    env.pop("HOST_BIND_PORT", None)
    env.pop("NEW_API_CONTAINER_PORT", None)
    subprocess.run(
        ["docker", "compose", "up", "-d", "shenxiang-codex-workspace", "shenxiang-codex-worker-fast", "shenxiang-codex-worker-heavy"],
        cwd=CODEX_ROOT,
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
    )


def run_optional_reconcile(
    step: str,
    reconcile: Callable[[], None],
    failures: list[str],
) -> None:
    try:
        reconcile()
    except Exception as exc:
        failure = f"{step}:{type(exc).__name__}"
        failures.append(failure)
        print(
            f"warning: optional model reconcile failed step={step} error={type(exc).__name__}: {exc}",
            file=sys.stderr,
        )


def main() -> int:
    optional_failures: list[str] = []
    ensure_grok46_media_channels()
    ensure_public_video_models()
    ensure_grok46_image_model()
    ensure_discount_image2_backing_model()
    ensure_discount_image2_primary_and_fallback_channels()
    ensure_stable_image2_backing_model()
    ensure_stable_image2_channel_order()
    ensure_gemini_ddpapi_image_models()
    sync_grok_image_metadata()
    ensure_public_openai_text_models()
    sync_public_video_pricing()
    sync_public_image_pricing()
    sync_public_openai_text_pricing()
    codex_text_channel_result = ensure_codex_text_channel_models()
    run_optional_reconcile(
        "claude_opus5_stable_model",
        ensure_claude_opus5_stable_model,
        optional_failures,
    )
    retired_codex_text_result = retire_codex_text_models()
    retired_claude_result = retire_claude_models()
    metadata_result = sync_supplier_safe_public_metadata()
    profiles = model_lists()
    missing = [name for name, values in profiles.items() if not values]
    if missing:
        print(f"refuse to sync empty model profiles: {', '.join(missing)}", file=sys.stderr)
        return 2
    sync_abilities()
    system_token_result = sync_tokens(system_token_profiles(profiles))
    codex_token_result = sync_user_codex_tokens(profiles)
    codex_alias_token_result = sync_controlled_codex_alias_tokens()
    claude_token_result = sync_user_claude_tokens(profiles)
    image_token_result = sync_user_image_tokens(profiles)
    video_token_result = sync_user_video_tokens(profiles)
    guard_result = enforce_gpt_image2_db_guard()
    env_changed = sync_codex_env(profiles)
    if env_changed or os.environ.get("SYNC_FORCE_CODEX_REFRESH") == "1":
        refresh_codex()
    print(
        "synced model permissions: "
        + ", ".join(f"{name}={len(values)}" for name, values in profiles.items())
        + f", codex_env_changed={env_changed}, system_token_sync={system_token_result}, codex_token_sync={codex_token_result}, codex_alias_token_sync={codex_alias_token_result}, claude_token_sync={claude_token_result}, image_token_sync={image_token_result}, video_token_sync={video_token_result}, gpt_image2_guard={guard_result}"
        + f", supplier_safe_metadata={metadata_result}, codex_text_channel={codex_text_channel_result}"
        + f", retired_codex_text={retired_codex_text_result}"
        + f", retired_claude={retired_claude_result}"
        + f", optional_failures={optional_failures}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
