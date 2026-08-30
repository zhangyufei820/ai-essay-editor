#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_APP_ROOT = Path("/opt/shenxiang-new-api")
DEFAULT_SOURCE_ROOT = DEFAULT_APP_ROOT / "build" / "src-20260606-143624"
DEFAULT_BASE_URL = "http://127.0.0.1:3120"
SOURCE_ROOT_MARKERS = (
    ".last_media_source_model_guard_source",
    ".last_codex_entry_source",
)
RAW_GPT_IMAGE2_MODEL = "gpt-image-2"
GPT_IMAGE2_PRODUCT_MODEL = "gpt-image-2-4K"
DISCOUNT_IMAGE2_PUBLIC_MODEL = "特价 image-2"
INTERNAL_DISCOUNT_IMAGE2_MODEL = "geek2api-image-2"
FALLBACK_DISCOUNT_IMAGE2_MODEL = "internal-image2-discount-v2"
CODEX_IMAGE_15K_MODEL = "image 2电商商品图快速通道(1.5K)"
CODEX_IMAGE_15K_PUBLIC_TAGS = "image,openai,ecommerce,1.5k"
CODEX_TOKEN_NAMES = ("星人 Codex 文本令牌", "星人 Codex 自动令牌")
USER_CODEX_TOKEN_NAME_PREFIXES = ("星人Codex ",)
ADMIN_SYSTEM_TOKEN_USER_ID = 1
CODEX_AUTO_REVIEW_MODEL = "codex-auto-review"
CODEX_ALLOWED_MODELS = (
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.6-terra",
    "gpt-5.6-sol",
    "kimi-k3",
    "gpt-5.5-openai-compact",
    CODEX_AUTO_REVIEW_MODEL,
    CODEX_IMAGE_15K_MODEL,
)
CODEX_STANDARD_ALLOWED_MODELS = tuple(
    model for model in CODEX_ALLOWED_MODELS if model != CODEX_AUTO_REVIEW_MODEL
)
SUPPLIER_EXPOSED_MODELS = {
    INTERNAL_DISCOUNT_IMAGE2_MODEL,
    FALLBACK_DISCOUNT_IMAGE2_MODEL,
}
PUBLIC_ALIAS_BACKING_MODELS = {
    INTERNAL_DISCOUNT_IMAGE2_MODEL: DISCOUNT_IMAGE2_PUBLIC_MODEL,
}
SUPPLIER_EXPOSED_MARKERS = (
    "ccapi",
    "drag tokens",
    "dragtokens",
    "geek2api",
    "moonapix",
    "relay dance",
    "relaydance",
)
DISABLED_GPT_IMAGE2_ABILITY_PAIRS = (
    ("12", GPT_IMAGE2_PRODUCT_MODEL),
    ("21", RAW_GPT_IMAGE2_MODEL),
)
TOKEN_MODEL_REPLACEMENTS = {
    RAW_GPT_IMAGE2_MODEL: GPT_IMAGE2_PRODUCT_MODEL,
}
RETIRED_CODEX_TEXT_MODELS = (
    "gpt-5.3-codex-spark",
    "gpt-5.3-spark",
    "gpt-5.4-openai-compact",
    "gpt-5.6-luna",
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text:
        return text, False
    if old not in text:
        raise RuntimeError(f"patch anchor not found: {label}")
    return text.replace(old, new, 1), True


def patch_file(
    path: Path,
    replacements: list[tuple[str, str, str]],
    *,
    missing_ok: bool = False,
) -> bool:
    if not path.exists():
        return False
    text = read_text(path)
    changed_any = False
    for old, new, label in replacements:
        try:
            text, changed = replace_once(text, old, new, label)
        except RuntimeError:
            if not missing_ok:
                raise
            continue
        changed_any = changed_any or changed
    if changed_any:
        write_text(path, text)
    return changed_any


def latest_source_root(app_root: Path) -> Path:
    for marker in SOURCE_ROOT_MARKERS:
        marker_path = app_root / marker
        if not marker_path.exists():
            continue
        raw = read_text(marker_path).strip()
        if not raw:
            continue
        source_root = Path(raw)
        candidates = [source_root]
        if not source_root.is_absolute():
            candidates = [app_root / source_root, app_root / "build" / source_root]
        for candidate in candidates:
            if (candidate / "Dockerfile").exists() and (candidate / "web/package.json").exists():
                return candidate

    candidates = sorted(
        (app_root / "build").glob("src-*"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for candidate in candidates:
        if (candidate / "Dockerfile").exists() and (candidate / "web/package.json").exists():
            return candidate
    return DEFAULT_SOURCE_ROOT


def normalize_critical_labels(source_root: Path) -> dict[str, bool]:
    paths = [
        source_root / "web/classic/src/hooks/common/useNavigation.js",
        source_root / "web/classic/src/pages/Setting/Operation/SettingsHeaderNavModules.jsx",
        source_root / "web/classic/src/components/layout/SiderBar.jsx",
        source_root / "web/default/src/hooks/use-top-nav-links.ts",
        source_root / "web/default/src/features/system-settings/maintenance/header-navigation-section.tsx",
    ]
    results: dict[str, bool] = {}
    for path in paths:
        if not path.exists():
            results[path.name] = False
            continue
        text = read_text(path)
        normalized = (
            text.replace("云端 Codex", "云 Codex")
            .replace("云端Codex", "云 Codex")
            .replace("绘图日志", "任务日志")
            .replace("图像生成日志", "任务日志")
        )
        changed = normalized != text
        if changed:
            write_text(path, normalized)
        results[path.name] = changed
    return results


def normalize_codex_labels(source_root: Path) -> dict[str, bool]:
    return normalize_critical_labels(source_root)


def patch_classic_app(source_root: Path) -> bool:
    path = source_root / "web/classic/src/App.jsx"
    if not path.exists():
        return False
    text = read_text(path)
    changed = False
    replacements = [
        (
            "import React, { lazy, Suspense, useContext, useMemo } from 'react';",
            "import React, { lazy, Suspense, useContext, useEffect, useMemo } from 'react';",
            "classic app useEffect import",
        ),
        (
            "function DynamicOAuth2Callback() {\n  const { provider } = useParams();\n  return <OAuth2Callback type={provider} />;\n}\n\nfunction App() {",
            "function DynamicOAuth2Callback() {\n  const { provider } = useParams();\n  return <OAuth2Callback type={provider} />;\n}\n\nfunction CodexRedirect() {\n  useEffect(() => {\n    window.location.replace('/codex/');\n  }, []);\n  return <Loading />;\n}\n\nfunction App() {",
            "classic app codex redirect component",
        ),
        (
            "        <Route\n          path='/console/media-playground'\n          element={\n            <PrivateRoute>\n              <Suspense fallback={<Loading></Loading>} key={location.pathname}>\n                <MediaPlayground />\n              </Suspense>\n            </PrivateRoute>\n          }\n        />\n        <Route\n          path='/console/redemption'",
            "        <Route\n          path='/console/media-playground'\n          element={\n            <PrivateRoute>\n              <Suspense fallback={<Loading></Loading>} key={location.pathname}>\n                <MediaPlayground />\n              </Suspense>\n            </PrivateRoute>\n          }\n        />\n        <Route\n          path='/console/codex'\n          element={\n            <PrivateRoute>\n              <CodexRedirect />\n            </PrivateRoute>\n          }\n        />\n        <Route\n          path='/media-playground'\n          element={\n            <PrivateRoute>\n              <Suspense fallback={<Loading></Loading>} key={location.pathname}>\n                <MediaPlayground />\n              </Suspense>\n            </PrivateRoute>\n          }\n        />\n        <Route\n          path='/console/redemption'",
            "classic app codex and media aliases",
        ),
    ]
    for old, new, label in replacements:
        text, item_changed = replace_once(text, old, new, label)
        changed = changed or item_changed
    if changed:
        write_text(path, text)
    return changed


def patch_classic_sidebar(source_root: Path) -> bool:
    path = source_root / "web/classic/src/components/layout/SiderBar.jsx"
    return patch_file(
        path,
        [
            (
                "  playground: '/console/playground',\n  personal: '/console/personal',",
                "  playground: '/console/playground',\n  media: '/console/media-playground',\n  codex: '/console/codex',\n  personal: '/console/personal',",
                "classic sidebar router map codex",
            ),
            (
                "      {\n        text: t('操练场'),\n        itemKey: 'playground',\n        to: '/playground',\n      },\n      {\n        text: t('聊天'),",
                "      {\n        text: t('操练场'),\n        itemKey: 'playground',\n        to: '/playground',\n      },\n      {\n        text: t('媒体工坊'),\n        itemKey: 'media',\n        to: '/media-playground',\n      },\n      {\n        text: t('云 Codex'),\n        itemKey: 'codex',\n        to: '/codex/',\n        external: true,\n      },\n      {\n        text: t('聊天'),",
                "classic sidebar chat codex item",
            ),
            (
                "            // 如果没有路由，直接返回元素\n            if (!to) return itemElement;\n\n            return (",
                "            // 如果没有路由，直接返回元素\n            if (!to) return itemElement;\n\n            if (to.startsWith('/codex/')) {\n              return (\n                <a\n                  style={{ textDecoration: 'none' }}\n                  href={to}\n                  onClick={onNavigate}\n                >\n                  {itemElement}\n                </a>\n              );\n            }\n\n            return (",
                "classic sidebar codex external link",
            ),
        ],
        missing_ok=True,
    )


def patch_classic_sidebar_config(source_root: Path) -> bool:
    path = source_root / "web/classic/src/hooks/common/useSidebar.js"
    return patch_file(
        path,
        [
            (
                "  chat: {\n    enabled: true,\n    playground: true,\n    chat: true,\n  },",
                "  chat: {\n    enabled: true,\n    playground: true,\n    media: true,\n    codex: true,\n    chat: true,\n  },",
                "classic sidebar default media codex",
            ),
        ],
    )


def patch_classic_navigation(source_root: Path) -> bool:
    path = source_root / "web/classic/src/hooks/common/useNavigation.js"
    if not path.exists():
        return False

    text = read_text(path)
    original = text

    for old, new in [
        (
            "      console: true,\n      pricing: true,",
            "      console: true,\n      media: true,\n      codex: true,\n      pricing: true,",
        ),
        (
            "      media: true,\n      pricing: true,",
            "      media: true,\n      codex: true,\n      pricing: true,",
        ),
    ]:
        if new in text:
            break
        if old in text:
            text = text.replace(old, new, 1)
            break

    pricing_link = (
        "      {\n"
        "        text: t('模型广场'),\n"
        "        itemKey: 'pricing',\n"
        "        to: '/pricing',\n"
        "      },"
    )
    media_link = (
        "      {\n"
        "        text: t('媒体工坊'),\n"
        "        itemKey: 'media',\n"
        "        to: '/console/media-playground',\n"
        "      },"
    )
    codex_link = (
        "      {\n"
        "        text: t('云 Codex'),\n"
        "        itemKey: 'codex',\n"
        "        to: '/console/codex',\n"
        "      },"
    )
    if "itemKey: 'media'" not in text:
        if pricing_link not in text:
            raise RuntimeError("patch anchor not found: classic nav pricing link")
        text = text.replace(pricing_link, f"{media_link}\n{codex_link}\n{pricing_link}", 1)
    elif "itemKey: 'codex'" not in text:
        if media_link not in text:
            raise RuntimeError("patch anchor not found: classic nav media link")
        text = text.replace(media_link, f"{media_link}\n{codex_link}", 1)

    if "link.itemKey === 'media'" not in text:
        pricing_filter = "      if (link.itemKey === 'pricing') {"
        nav_filters = (
            "      if (link.itemKey === 'media') {\n"
            "        return modules.media !== false;\n"
            "      }\n"
            "      if (link.itemKey === 'codex') {\n"
            "        return modules.codex !== false;\n"
            "      }\n"
            f"{pricing_filter}"
        )
        if pricing_filter not in text:
            raise RuntimeError("patch anchor not found: classic nav pricing filter")
        text = text.replace(pricing_filter, nav_filters, 1)
    elif "link.itemKey === 'codex'" not in text:
        media_filter = (
            "      if (link.itemKey === 'media') {\n"
            "        return modules.media !== false;\n"
            "      }"
        )
        codex_filter = (
            f"{media_filter}\n"
            "      if (link.itemKey === 'codex') {\n"
            "        return modules.codex !== false;\n"
            "      }"
        )
        if media_filter not in text:
            raise RuntimeError("patch anchor not found: classic nav media filter")
        text = text.replace(media_filter, codex_filter, 1)

    if text != original:
        write_text(path, text)
        return True
    return False


def patch_classic_settings(source_root: Path) -> bool:
    path = source_root / "web/classic/src/pages/Setting/Operation/SettingsHeaderNavModules.jsx"
    if not path.exists():
        return False
    changed = False
    replacements = [
        (
            "    media: true,\n    pricing: {",
            "    media: true,\n    codex: true,\n    pricing: {",
            "classic settings initial codex",
        ),
        (
            "      media: true,\n      pricing: {",
            "      media: true,\n      codex: true,\n      pricing: {",
            "classic settings default codex",
        ),
        (
            "          media: true,\n          pricing: {",
            "          media: true,\n          codex: true,\n          pricing: {",
            "classic settings fallback codex",
        ),
        (
            "    {\n      key: 'media',\n      title: t('媒体工坊'),\n      description: t('图像和视频生成入口'),\n    },\n    {\n      key: 'pricing',",
            "    {\n      key: 'media',\n      title: t('媒体工坊'),\n      description: t('图像和视频生成入口'),\n    },\n    {\n      key: 'codex',\n      title: t('云 Codex'),\n      description: t('在线 Codex 工作台入口'),\n    },\n    {\n      key: 'pricing',",
            "classic settings codex card",
        ),
    ]
    text = read_text(path)
    for old, new, label in replacements:
        try:
            text, item_changed = replace_once(text, old, new, label)
        except RuntimeError:
            continue
        changed = changed or item_changed
    if changed:
        write_text(path, text)
    return changed


def patch_default_nav_modules(source_root: Path) -> bool:
    path = source_root / "web/default/src/lib/nav-modules.ts"
    return patch_file(
        path,
        [
            (
                "  console: boolean\n  pricing: ModuleAccess",
                "  console: boolean\n  codex: boolean\n  pricing: ModuleAccess",
                "default nav type codex",
            ),
            (
                "  console: true,\n  pricing: { enabled: true, requireAuth: false },",
                "  console: true,\n  codex: true,\n  pricing: { enabled: true, requireAuth: false },",
                "default nav default codex",
            ),
        ],
        missing_ok=True,
    )


def patch_default_top_links(source_root: Path) -> bool:
    path = source_root / "web/default/src/hooks/use-top-nav-links.ts"
    return patch_file(
        path,
        [
            (
                " *   console: true,\n *   pricing: { enabled: true, requireAuth: false },",
                " *   console: true,\n *   codex: true,\n *   pricing: { enabled: true, requireAuth: false },",
                "default top links comment codex",
            ),
            (
                "  // Pricing\n  const pricing = modules?.pricing",
                "  // Cloud Codex\n  if (modules?.codex !== false) {\n    links.push({ title: t('云 Codex'), href: '/codex/' })\n  }\n\n  // Pricing\n  const pricing = modules?.pricing",
                "default top links codex",
            ),
        ],
        missing_ok=True,
    )


def patch_default_settings(source_root: Path) -> bool:
    config = source_root / "web/default/src/features/system-settings/maintenance/config.ts"
    section = source_root / "web/default/src/features/system-settings/maintenance/header-navigation-section.tsx"
    changed_config = patch_file(
        config,
        [
            (
                "  console: boolean\n  pricing: HeaderNavAccessConfig",
                "  console: boolean\n  codex: boolean\n  pricing: HeaderNavAccessConfig",
                "default settings type codex",
            ),
            (
                "  console: true,\n  pricing: {",
                "  console: true,\n  codex: true,\n  pricing: {",
                "default settings default codex",
            ),
        ],
        missing_ok=True,
    )
    changed_section = patch_file(
        section,
        [
            (
                "  console: z.boolean(),\n  pricingEnabled: z.boolean(),",
                "  console: z.boolean(),\n  codex: z.boolean(),\n  pricingEnabled: z.boolean(),",
                "default header form schema codex",
            ),
            (
                "  pricingEnabled:\n    config.pricing?.enabled === undefined",
                "  codex:\n    config.codex === undefined\n      ? HEADER_NAV_DEFAULT.codex\n      : Boolean(config.codex),\n  pricingEnabled:\n    config.pricing?.enabled === undefined",
                "default header form values codex",
            ),
            (
                "      console: values.console,\n      docs: values.docs,",
                "      console: values.console,\n      codex: values.codex,\n      docs: values.docs,",
                "default header submit codex",
            ),
            (
                "    {\n      key: 'docs',\n      title: t('Docs'),",
                "    {\n      key: 'codex',\n      title: t('云 Codex'),\n      description: t('Online Codex workspace.'),\n    },\n    {\n      key: 'docs',\n      title: t('Docs'),",
                "default header simple module codex",
            ),
        ],
        missing_ok=True,
    )
    return changed_config or changed_section


def patch_source(source_root: Path) -> dict[str, bool]:
    results = {
        "codex_label_normalized": any(normalize_codex_labels(source_root).values()),
        "classic_app": patch_classic_app(source_root),
        "classic_sidebar": patch_classic_sidebar(source_root),
        "classic_sidebar_config": patch_classic_sidebar_config(source_root),
        "classic_navigation": patch_classic_navigation(source_root),
        "classic_settings": patch_classic_settings(source_root),
        "default_nav_modules": patch_default_nav_modules(source_root),
        "default_top_links": patch_default_top_links(source_root),
        "default_settings": patch_default_settings(source_root),
    }
    return results


def source_text(source_root: Path, relative_path: str) -> str:
    path = source_root / relative_path
    if not path.exists():
        return ""
    return read_text(path)


def has_pattern(text: str, pattern: str) -> bool:
    return bool(re.search(pattern, text, re.S))


def has_media_result_model_guard(text: str) -> bool:
    markers = [
        "function resultImageModelValue(result)",
        "function resultVideoModelValue(result)",
        "function resultModelLabel(result, fallbackImageModel, fallbackVideoModel)",
        "const imageEditModelLockRef = useRef('')",
        "const effectiveRequestPayload =",
        "async function loadResultImageModelValue(result)",
        "imageEditModelLockRef.current = hydratedSourceModelValue",
        "已切回原结果模型",
        "原结果模型当前不可用",
    ]
    return all(marker in text for marker in markers)


def check_source(source_root: Path) -> dict[str, bool]:
    sidebar = source_text(source_root, "web/classic/src/components/layout/SiderBar.jsx")
    sidebar_config = source_text(source_root, "web/classic/src/hooks/common/useSidebar.js")
    navigation = source_text(source_root, "web/classic/src/hooks/common/useNavigation.js")
    home_workbench = source_text(source_root, "web/classic/src/pages/Home/TextWorkbench.jsx")
    api_teacher = source_text(source_root, "web/xingren-api-onboarding-assistant.js")
    main_go = source_text(source_root, "main.go")
    app = source_text(source_root, "web/classic/src/App.jsx")
    media_playground = source_text(source_root, "web/classic/src/pages/MediaPlayground/index.jsx")
    user_controller = source_text(source_root, "controller/user.go")

    return {
        "source_root_exists": source_root.exists(),
        "has_sidebar_media_entry": "媒体工坊" in sidebar and "itemKey: 'media'" in sidebar and "/media-playground" in sidebar,
        "has_sidebar_chat_entry": "itemKey: 'chat'" in sidebar and "/console/chat" in sidebar,
        "has_sidebar_codex_entry": "itemKey: 'codex'" in sidebar and ("/console/codex" in sidebar or "/codex/" in sidebar),
        "hides_sidebar_playground_entry": "itemKey: 'playground'" not in sidebar and "操练场" not in sidebar,
        "hides_image_generation_log_label": "图像生成日志" not in sidebar,
        "has_no_legacy_drawing_log_label": "绘图日志" not in sidebar,
        "hides_midjourney_log_entry": "itemKey: 'midjourney'" not in sidebar and "/midjourney" not in sidebar,
        "has_task_log_entry": "任务日志" in sidebar and "itemKey: 'task'" in sidebar and "/task" in sidebar,
        "has_admin_models_entry": "模型管理" in sidebar and "itemKey: 'models'" in sidebar and "/console/models" in sidebar,
        "has_sidebar_default_media": has_pattern(sidebar_config, r"chat:\s*\{[^}]*media:\s*true"),
        "has_sidebar_default_chat": has_pattern(sidebar_config, r"chat:\s*\{[^}]*chat:\s*true"),
        "has_sidebar_default_codex": has_pattern(sidebar_config, r"chat:\s*\{[^}]*codex:\s*true"),
        "hides_sidebar_default_playground": not has_pattern(sidebar_config, r"chat:\s*\{[^}]*playground:\s*true"),
        "hides_sidebar_default_midjourney": not has_pattern(sidebar_config, r"console:\s*\{[^}]*midjourney:\s*true"),
        "has_sidebar_default_task": has_pattern(sidebar_config, r"console:\s*\{[^}]*task:\s*true"),
        "has_sidebar_default_admin_models": has_pattern(sidebar_config, r"admin:\s*\{[^}]*models:\s*true"),
        "has_top_nav_media_entry": "媒体工坊" in navigation and "itemKey: 'media'" in navigation and "/console/media-playground" in navigation,
        "has_top_nav_codex_entry": "itemKey: 'codex'" in navigation and ("/console/codex" in navigation or "/codex/" in navigation),
        "has_home_console_nav": "控制台" in home_workbench and "LayoutDashboard" in home_workbench and "href: '/console'" in home_workbench,
        "has_api_teacher_detached_panel": (
            "function renderDetachedPanel()" in api_teacher
            and 'id="xr-api-assistant-panel"' in api_teacher
            and 'document.body.insertAdjacentHTML(' in api_teacher
        ),
        "has_api_teacher_route_aware_layout": (
            "function getRouteKind()" in api_teacher
            and "data-xr-route" in api_teacher
            and "height:min(320px" in api_teacher
            and "height:min(500px" in api_teacher
        ),
        "has_api_teacher_non_fullheight_panel": "top:64px;bottom:20px" not in api_teacher and "bottom:auto" in api_teacher,
        "has_api_teacher_cache_busted_script": "xingren-api-onboarding-assistant.js?v=api-teacher-panel-" in main_go,
        "has_app_media_route": "path='/console/media-playground'" in app and "path='/media-playground'" in app,
        "has_app_chat_route": "path='/console/chat/:id?'" in app,
        "has_app_codex_route": "path='/console/codex'" in app and "CodexRedirect" in app,
        "has_seedance_private_model": "Seedance 私测视频" in media_playground and "seedance-nsfw" in media_playground,
        "has_seedance_private_filter": "private: true" in media_playground and "/api/user/models" in media_playground,
        "has_media_result_model_guard": has_media_result_model_guard(media_playground),
        "has_seedance_backend_guard": (
            'seedancePrivateVideoModel         = "seedance-nsfw"' in user_controller
            and "seedancePrivateVideoAllowedUserID = 1" in user_controller
            and "normalizeUserVisibleModels(id, models)" in user_controller
        ),
    }


def load_dotenv(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in read_text(path).splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def mysql_exec(app_root: Path, query: str) -> str:
    env = load_dotenv(app_root / ".env")
    password = env.get("MYSQL_ROOT_PASSWORD")
    database = env.get("MYSQL_DATABASE")
    if not password or not database:
        raise RuntimeError("MYSQL_ROOT_PASSWORD or MYSQL_DATABASE missing")
    cmd = [
        "docker",
        "exec",
        "-i",
        "-e",
        f"MYSQL_PWD={password}",
        "shenxiang-new-api-mysql",
        "mysql",
        "--default-character-set=utf8mb4",
        "-uroot",
        database,
    ]
    result = subprocess.run(
        cmd,
        input=query,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "mysql command failed")
    return result.stdout


def sql_quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


def is_retired_codex_text_model(model: str) -> bool:
    return model.strip() in RETIRED_CODEX_TEXT_MODELS


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


def ensure_codex_image_model_limits(raw: str) -> str:
    models = sanitize_codex_token_models(raw.split(","))
    for model in CODEX_STANDARD_ALLOWED_MODELS:
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


def is_hidden_pricing_model(model: str) -> bool:
    return (
        model.strip() == RAW_GPT_IMAGE2_MODEL
        or is_retired_codex_text_model(model)
        or is_supplier_exposed_model(model)
    )


def supplier_exposed_model_limit_predicate() -> str:
    terms = [RAW_GPT_IMAGE2_MODEL, *SUPPLIER_EXPOSED_MODELS, *SUPPLIER_EXPOSED_MARKERS]
    clauses = [
        "COALESCE(model_limits, '') LIKE " + sql_quote(f"%{term}%")
        for term in terms
    ]
    return " OR ".join(clauses)


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


def mysql_count(app_root: Path, query: str) -> int:
    rows = mysql_exec(app_root, query).splitlines()
    for row in reversed(rows):
        first_cell = row.split("\t", 1)[0].strip()
        if first_cell.isdigit():
            return int(first_cell)
    return 0


def mysql_option_value(app_root: Path, key: str) -> str:
    rows = mysql_exec(app_root, "SELECT value FROM options WHERE `key` = " + sql_quote(key) + " LIMIT 1;").splitlines()
    for row in reversed(rows):
        if row.strip() and row.strip() != "value":
            return row
    return ""


def sync_supplier_safe_public_metadata_guard(app_root: Path) -> dict[str, int]:
    result = {"pricing_options_sanitized": 0, "public_model_tags_synced": 1}
    statements = ["START TRANSACTION;"]
    for key in ("ModelRatio", "CompletionRatio", "ModelPrice"):
        raw = mysql_option_value(app_root, key)
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except Exception:
            continue
        if not isinstance(parsed, dict):
            continue
        sanitized = {
            model: value
            for model, value in parsed.items()
            if isinstance(model, str) and not is_hidden_pricing_model(model)
        }
        if sanitized != parsed:
            statements.append(
                "REPLACE INTO options (`key`, value) VALUES ("
                + sql_quote(key)
                + ", "
                + sql_quote(json.dumps(sanitized, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
                + ");"
            )
            result["pricing_options_sanitized"] += 1
    statements.append(
        "UPDATE models SET tags = "
        + sql_quote(CODEX_IMAGE_15K_PUBLIC_TAGS)
        + ", updated_time = UNIX_TIMESTAMP() "
        "WHERE deleted_at IS NULL AND model_name = "
        + sql_quote(CODEX_IMAGE_15K_MODEL)
        + ";"
    )
    statements.append("COMMIT;")
    mysql_exec(app_root, "\n".join(statements))
    return result


def enforce_gpt_image2_route_db_guard(app_root: Path) -> dict[str, int]:
    result: dict[str, int] = {}
    for channel_id, model in DISABLED_GPT_IMAGE2_ABILITY_PAIRS:
        result[f"channel_{channel_id}_{model}"] = mysql_count(
            app_root,
            "SELECT COUNT(*) FROM abilities WHERE enabled = 1 AND channel_id = "
            + sql_quote(channel_id)
            + " AND model = "
            + sql_quote(model)
            + ";",
        )

    result["supplier_exposed_abilities"] = mysql_count(
        app_root,
        "SELECT COUNT(*) FROM abilities WHERE enabled = 1 AND ("
        + supplier_exposed_model_name_predicate("model", exclude_public_alias_backing=True)
        + ");",
    )
    result["supplier_exposed_models"] = mysql_count(
        app_root,
        "SELECT COUNT(*) FROM models WHERE deleted_at IS NULL AND status = 1 AND ("
        + supplier_exposed_model_name_predicate("model_name", exclude_public_alias_backing=True)
        + ");",
    )

    token_rows = mysql_exec(
        app_root,
        "SELECT id, COALESCE(model_limits, '') FROM tokens "
        "WHERE deleted_at IS NULL AND model_limits_enabled = 1 "
        "AND ("
        + supplier_exposed_model_limit_predicate()
        + ");",
    ).splitlines()
    token_updates: list[tuple[str, str]] = []
    for row in token_rows:
        if "\t" not in row:
            continue
        token_id, raw_limits = row.split("\t", 1)
        token_id = token_id.strip()
        if not token_id.isdigit():
            continue
        next_limits = sanitize_model_limits(raw_limits)
        if next_limits != raw_limits:
            token_updates.append((token_id, next_limits))

    codex_name_predicates = [
        "name IN (" + ", ".join(sql_quote(name) for name in CODEX_TOKEN_NAMES) + ")",
        *[
            "name LIKE " + sql_quote(prefix + "%")
            for prefix in USER_CODEX_TOKEN_NAME_PREFIXES
        ],
    ]
    codex_token_rows = mysql_exec(
        app_root,
        "SELECT id, COALESCE(model_limits, ''), COALESCE(model_limits_enabled, 0) FROM tokens "
        "WHERE deleted_at IS NULL "
        "AND (" + " OR ".join(codex_name_predicates) + ") "
        "AND user_id <> "
        + str(ADMIN_SYSTEM_TOKEN_USER_ID)
        + ";",
    ).splitlines()
    codex_token_updates: list[tuple[str, str]] = []
    for row in codex_token_rows:
        if "\t" not in row:
            continue
        parts = row.split("\t")
        if len(parts) != 3:
            continue
        token_id, raw_limits, raw_enabled = parts
        token_id = token_id.strip()
        if not token_id.isdigit():
            continue
        next_limits = ensure_codex_image_model_limits(raw_limits)
        if next_limits != raw_limits or raw_enabled != "1":
            codex_token_updates.append((token_id, next_limits))

    statements = ["START TRANSACTION;"]
    for channel_id, model in DISABLED_GPT_IMAGE2_ABILITY_PAIRS:
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
    for token_id, next_limits in codex_token_updates:
        statements.append(
            "UPDATE tokens SET model_limits_enabled = 1, model_limits = "
            + sql_quote(next_limits)
            + " WHERE id = "
            + sql_quote(token_id)
            + ";"
        )
    statements.append("COMMIT;")
    mysql_exec(app_root, "\n".join(statements))
    result["tokens_rewritten"] = len(token_updates)
    result["codex_tokens_rewritten"] = len(codex_token_updates)
    result.update(sync_supplier_safe_public_metadata_guard(app_root))
    return result


def sync_db_options(app_root: Path) -> dict[str, Any]:
    query = "SELECT `key`, value FROM options WHERE `key` IN ('HeaderNavModules','SidebarModulesAdmin');"
    rows = mysql_exec(app_root, query).splitlines()
    data: dict[str, str] = {}
    for line in rows:
        if "\t" not in line:
            continue
        key, value = line.split("\t", 1)
        data[key] = value

    header_default: dict[str, Any] = {
        "home": True,
        "console": True,
        "docs": True,
        "media": True,
        "codex": True,
        "pricing": {"enabled": True, "requireAuth": True},
        "about": True,
    }
    sidebar_default: dict[str, Any] = {
        "chat": {"chat": True, "codex": True, "enabled": True, "media": True, "playground": False},
        "console": {"detail": True, "enabled": True, "log": True, "task": True, "token": True},
        "personal": {"enabled": True, "personal": True, "topup": True},
        "admin": {"channel": True, "deployment": True, "enabled": True, "models": True, "redemption": True, "setting": True, "subscription": True, "user": True},
    }

    def parse_or_default(raw: str | None, default: dict[str, Any]) -> dict[str, Any]:
        if not raw:
            return json.loads(json.dumps(default))
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
        return json.loads(json.dumps(default))

    header = parse_or_default(data.get("HeaderNavModules"), header_default)
    changed_header = False
    for key, value in header_default.items():
        if key not in header:
            header[key] = value
            changed_header = True
    if header.get("codex") is not True:
        header["codex"] = True
        changed_header = True
    if header.get("media") is not True:
        header["media"] = True
        changed_header = True

    sidebar = parse_or_default(data.get("SidebarModulesAdmin"), sidebar_default)
    changed_sidebar = False

    def ensure_sidebar_section(section_name: str, keys: tuple[str, ...]) -> None:
        nonlocal changed_sidebar
        section = sidebar.setdefault(section_name, {})
        if not isinstance(section, dict):
            sidebar[section_name] = section = {}
            changed_sidebar = True
        for key in keys:
            if section.get(key) is not True:
                section[key] = True
                changed_sidebar = True

    def disable_sidebar_section_keys(section_name: str, keys: tuple[str, ...]) -> None:
        nonlocal changed_sidebar
        section = sidebar.setdefault(section_name, {})
        if not isinstance(section, dict):
            sidebar[section_name] = section = {}
            changed_sidebar = True
        for key in keys:
            if section.get(key) is not False:
                section[key] = False
                changed_sidebar = True

    ensure_sidebar_section("chat", ("enabled", "media", "codex", "chat"))
    disable_sidebar_section_keys("chat", ("playground",))
    ensure_sidebar_section("console", ("enabled", "log", "task", "token", "detail"))
    disable_sidebar_section_keys("console", ("midjourney",))
    ensure_sidebar_section("admin", ("enabled", "models"))

    statements = ["START TRANSACTION;"]
    if changed_header:
        statements.append(
            "REPLACE INTO options (`key`, value) VALUES ('HeaderNavModules', "
            + sql_quote(json.dumps(header, ensure_ascii=False, separators=(",", ":")))
            + ");"
        )
    if changed_sidebar:
        statements.append(
            "REPLACE INTO options (`key`, value) VALUES ('SidebarModulesAdmin', "
            + sql_quote(json.dumps(sidebar, ensure_ascii=False, separators=(",", ":")))
            + ");"
        )
    statements.append("COMMIT;")
    if changed_header or changed_sidebar:
        mysql_exec(app_root, "\n".join(statements))
    guard_result = enforce_gpt_image2_route_db_guard(app_root)
    return {"header_changed": changed_header, "sidebar_changed": changed_sidebar, "gpt_image2_guard": guard_result}


def fetch_bundle_text(base_url: str) -> str:
    headers = {"User-Agent": "shenxiang-new-api-codex-entry-guard/1.0"}
    with urllib.request.urlopen(urllib.request.Request(base_url, headers=headers), timeout=10) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    bundle = html
    for path in sorted(set(re.findall(r"/static/js/[^\"']+\.js", html))):
        request = urllib.request.Request(base_url.rstrip("/") + path, headers=headers)
        with urllib.request.urlopen(request, timeout=20) as resp:
            bundle += "\n" + resp.read().decode("utf-8", errors="replace")
    return bundle


def fetch_text(url: str) -> str:
    headers = {"User-Agent": "shenxiang-new-api-codex-entry-guard/1.0"}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as resp:
        return resp.read().decode("utf-8", errors="replace")


def check_url(base_url: str) -> dict[str, bool]:
    text = fetch_bundle_text(base_url)
    has_sidebar_codex_item = bool(
        re.search(
            r"itemKey\s*:\s*['\"]codex['\"][^{}]{0,240}to\s*:\s*['\"]/(?:console/codex|codex/?)['\"]",
            text,
            re.S,
        )
    )
    has_sidebar_playground_item = bool(
        re.search(
            r"itemKey\s*:\s*['\"]playground['\"][^{}]{0,240}to\s*:\s*['\"]/playground['\"]",
            text,
            re.S,
        )
    )
    has_sidebar_chat_item = bool(
        re.search(
            r"itemKey\s*:\s*['\"]chat['\"][^{}]{0,240}to\s*:\s*['\"]/console/chat",
            text,
            re.S,
        )
    )
    has_top_nav_codex_item = bool(
        re.search(
            r"itemKey\s*:\s*['\"]codex['\"][^{}]{0,240}to\s*:\s*['\"]/(?:console/codex|codex/?)['\"]",
            text,
            re.S,
        )
    )
    has_top_nav_media_item = bool(
        re.search(
            r"itemKey\s*:\s*['\"]media['\"][^{}]{0,240}to\s*:\s*['\"]/console/media-playground['\"]",
            text,
            re.S,
        )
    )
    return {
        "has_sidebar_media_item": 'itemKey:"media"' in text,
        "has_sidebar_chat_item": has_sidebar_chat_item,
        "has_sidebar_codex_item": has_sidebar_codex_item,
        "hides_sidebar_playground_item": not has_sidebar_playground_item,
        "has_top_nav_codex_item": has_top_nav_codex_item,
        "has_top_nav_media_item": has_top_nav_media_item,
        "has_media_label": "媒体工坊" in text,
        "hides_image_generation_log_label": "图像生成日志" not in text,
        "has_midjourney_log_route_redirect": "/console/midjourney" in text and "/console/task" in text,
        "has_task_log_label": "任务日志" in text,
        "has_task_log_route": "/console/task" in text,
        "has_admin_models_route": "/console/models" in text,
        "has_media_result_model_guard": "已切回原结果模型" in text and "原结果模型当前不可用" in text,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", default=str(DEFAULT_APP_ROOT))
    parser.add_argument("--source-root", default="")
    parser.add_argument("--patch-source", action="store_true")
    parser.add_argument("--check-source", action="store_true")
    parser.add_argument("--sync-db", action="store_true")
    parser.add_argument("--check-url", default="")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    results: dict[str, Any] = {}
    source_root = Path(args.source_root) if args.source_root else latest_source_root(Path(args.app_root))
    if args.patch_source:
        results["source_root"] = str(source_root)
        results["source"] = patch_source(source_root)
    if args.check_source:
        results["source_root"] = str(source_root)
        results["source_check"] = check_source(source_root)
        if args.strict and not all(results["source_check"].values()):
            print(json.dumps(results, ensure_ascii=False, sort_keys=True))
            return 2
    if args.sync_db:
        results["db"] = sync_db_options(Path(args.app_root))
    if args.check_url:
        results["url"] = check_url(args.check_url)
        if args.strict and not all(results["url"].values()):
            print(json.dumps(results, ensure_ascii=False, sort_keys=True))
            return 2

    print(json.dumps(results, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
