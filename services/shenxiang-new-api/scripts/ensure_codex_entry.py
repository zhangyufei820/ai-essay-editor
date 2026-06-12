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


def patch_file(path: Path, replacements: list[tuple[str, str, str]]) -> bool:
    text = read_text(path)
    changed_any = False
    for old, new, label in replacements:
        text, changed = replace_once(text, old, new, label)
        changed_any = changed_any or changed
    if changed_any:
        write_text(path, text)
    return changed_any


def patch_classic_navigation(source_root: Path) -> bool:
    path = source_root / "web/classic/src/hooks/common/useNavigation.js"
    return patch_file(
        path,
        [
            (
                "      media: true,\n      pricing: true,",
                "      media: true,\n      codex: true,\n      pricing: true,",
                "classic nav default codex",
            ),
            (
                "      {\n        text: t('媒体工坊'),\n        itemKey: 'media',\n        to: '/console/media-playground',\n      },\n      {\n        text: t('模型广场'),",
                "      {\n        text: t('媒体工坊'),\n        itemKey: 'media',\n        to: '/console/media-playground',\n      },\n      {\n        text: t('云端 Codex'),\n        itemKey: 'codex',\n        to: '/codex/',\n      },\n      {\n        text: t('模型广场'),",
                "classic nav codex link",
            ),
            (
                "      if (link.itemKey === 'media') {\n        return modules.media !== false;\n      }\n      return modules[link.itemKey] === true;",
                "      if (link.itemKey === 'media') {\n        return modules.media !== false;\n      }\n      if (link.itemKey === 'codex') {\n        return modules.codex !== false;\n      }\n      return modules[link.itemKey] === true;",
                "classic nav codex filter",
            ),
        ],
    )


def patch_classic_settings(source_root: Path) -> bool:
    path = source_root / "web/classic/src/pages/Setting/Operation/SettingsHeaderNavModules.jsx"
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
            "    {\n      key: 'media',\n      title: t('媒体工坊'),\n      description: t('图像和视频生成入口'),\n    },\n    {\n      key: 'codex',\n      title: t('云端 Codex'),\n      description: t('在线 Codex 工作台入口'),\n    },\n    {\n      key: 'pricing',",
            "classic settings codex card",
        ),
    ]
    text = read_text(path)
    for old, new, label in replacements:
        text, item_changed = replace_once(text, old, new, label)
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
                "  // Cloud Codex\n  if (modules?.codex !== false) {\n    links.push({ title: t('云端 Codex'), href: '/codex/' })\n  }\n\n  // Pricing\n  const pricing = modules?.pricing",
                "default top links codex",
            ),
        ],
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
                "    {\n      key: 'codex',\n      title: t('云端 Codex'),\n      description: t('Online Codex workspace.'),\n    },\n    {\n      key: 'docs',\n      title: t('Docs'),",
                "default header simple module codex",
            ),
        ],
    )
    return changed_config or changed_section


def patch_source(source_root: Path) -> dict[str, bool]:
    results = {
        "classic_navigation": patch_classic_navigation(source_root),
        "classic_settings": patch_classic_settings(source_root),
        "default_nav_modules": patch_default_nav_modules(source_root),
        "default_top_links": patch_default_top_links(source_root),
        "default_settings": patch_default_settings(source_root),
    }
    return results


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
        "codex": True,
        "console": True,
        "docs": True,
        "media": True,
        "pricing": {"enabled": True, "requireAuth": True},
        "about": True,
    }
    sidebar_default: dict[str, Any] = {
        "chat": {"chat": True, "codex": True, "enabled": True, "media": True, "playground": True},
        "console": {"detail": True, "enabled": True, "log": True, "midjourney": True, "task": True, "token": True},
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
    chat = sidebar.setdefault("chat", {})
    if not isinstance(chat, dict):
        sidebar["chat"] = chat = {}
        changed_sidebar = True
    for key in ("enabled", "codex", "media", "playground", "chat"):
        if chat.get(key) is not True:
            chat[key] = True
            changed_sidebar = True

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
    return {"header_changed": changed_header, "sidebar_changed": changed_sidebar}


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


def check_url(base_url: str) -> dict[str, bool]:
    text = fetch_bundle_text(base_url)
    return {
        "has_codex_label": "云端 Codex" in text or "云端Codex" in text,
        "has_codex_route": "/codex/" in text,
        "has_media_label": "媒体工坊" in text,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", default=str(DEFAULT_APP_ROOT))
    parser.add_argument("--source-root", default=str(DEFAULT_SOURCE_ROOT))
    parser.add_argument("--patch-source", action="store_true")
    parser.add_argument("--sync-db", action="store_true")
    parser.add_argument("--check-url", default="")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    results: dict[str, Any] = {}
    if args.patch_source:
        results["source"] = patch_source(Path(args.source_root))
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
