#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("ensure_codex_entry.py")


def load_guard_module():
    spec = importlib.util.spec_from_file_location("ensure_codex_entry", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load ensure_codex_entry.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class EnsureCodexEntryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_guard_module()
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.source_root = Path(self.tempdir.name)
        self.write_fixture()

    def write_file(self, relative_path: str, text: str) -> None:
        path = self.source_root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_fixture(self) -> None:
        self.write_file(
            "web/classic/src/components/layout/SiderBar.jsx",
            """
const routerMap = {
  chat: '/console/chat',
  media: '/console/media-playground',
  codex: '/console/codex',
  task: '/console/task',
  models: '/console/models',
};
const items = [
  { text: t('聊天'), itemKey: 'chat', to: '/console/chat' },
  { text: t('媒体工坊'), itemKey: 'media', to: '/media-playground' },
  { text: t('云 Codex'), itemKey: 'codex', to: '/codex/' },
  { text: t('任务日志'), itemKey: 'task', to: '/task' },
  { text: t('模型管理'), itemKey: 'models', to: '/console/models' },
];
""",
        )
        self.write_file(
            "web/classic/src/hooks/common/useSidebar.js",
            """
export const DEFAULT_ADMIN_CONFIG = {
  chat: { enabled: true, media: true, chat: true, codex: true, playground: false },
  console: { enabled: true, log: true, task: true, token: true },
  admin: { enabled: true, models: true },
};
""",
        )
        self.write_file(
            "web/classic/src/hooks/common/useNavigation.js",
            """
const links = [
  { text: t('媒体工坊'), itemKey: 'media', to: '/console/media-playground' },
  { text: t('云 Codex'), itemKey: 'codex', to: '/codex/' },
];
""",
        )
        self.write_file(
            "web/classic/src/App.jsx",
            """
const routes = [
  "path='/console/chat/:id?'",
  "path='/console/media-playground'",
  "path='/console/codex'",
  "path='/media-playground'",
];
function CodexRedirect() {}
""",
        )
        self.write_file(
            "main.go",
            """
func InjectXingrenAPIOnboardingAssistant() {
  snippet := []byte("<script src=\\"/assets/xingren-api-onboarding-assistant.js?v=api-teacher-panel-20260709\\" defer></script>")
  _ = snippet
}
""",
        )
        self.write_file(
            "web/classic/src/pages/Home/TextWorkbench.jsx",
            """
import { LayoutDashboard } from 'lucide-react';

const primaryNav = [
  { label: '新聊天', action: 'new' },
  { label: '控制台', icon: LayoutDashboard, href: '/console' },
  { label: '聊天', action: 'chat', active: true },
];
""",
        )
        self.write_file(
            "web/xingren-api-onboarding-assistant.js",
            """
function getRouteKind() {}
function renderDetachedPanel() {
  document.body.insertAdjacentHTML("beforeend", '<aside id="xr-api-assistant-panel" data-xr-route="home"></aside>');
}
const css = ".xr-api-assistant-panel{bottom:auto;height:min(540px,calc(100vh - 132px))}.xr-api-assistant-panel[data-xr-route='home']{height:min(320px,calc(100vh - 150px))}.xr-api-assistant-panel[data-xr-route='codex']{height:min(500px,calc(100vh - 220px))}";
""",
        )
        self.write_file(
            "web/classic/src/pages/MediaPlayground/index.jsx",
            """
function resultImageModelValue(result) {}
function resultVideoModelValue(result) {}
function resultModelLabel(result, fallbackImageModel, fallbackVideoModel) {}

function MediaPlayground() {
  const imageEditModelLockRef = useRef('');
  const effectiveRequestPayload = {};
  imageEditModelLockRef.current = hydratedSourceModelValue;
}

async function loadResultImageModelValue(result) {}

const VIDEO_MODELS = [
  { value: 'seedance-nsfw', label: 'Seedance 私测视频', private: true },
];
API.get('/api/user/models');
Toast.info('已切回原结果模型：GPT Image 2');
Toast.warning('原结果模型当前不可用，请先手动选择可用模型。');
""",
        )
        self.write_file(
            "controller/user.go",
            """
const (
  seedancePrivateVideoModel         = "seedance-nsfw"
  seedancePrivateVideoAllowedUserID = 1
)

func GetUserModels() {
  models = normalizeUserVisibleModels(id, models)
}
""",
        )

    def test_check_source_covers_critical_entries(self) -> None:
        results = self.module.check_source(self.source_root)

        self.assertTrue(all(results.values()), results)

    def test_normalize_critical_labels_restores_image_generation_log_label(self) -> None:
        sidebar = self.source_root / "web/classic/src/components/layout/SiderBar.jsx"
        sidebar.write_text(
            sidebar.read_text(encoding="utf-8").replace("任务日志", "图像生成日志"),
            encoding="utf-8",
        )

        before = self.module.check_source(self.source_root)
        self.assertFalse(before["hides_image_generation_log_label"])

        self.module.normalize_critical_labels(self.source_root)

        after = self.module.check_source(self.source_root)
        self.assertTrue(after["hides_image_generation_log_label"])
        self.assertTrue(after["has_no_legacy_drawing_log_label"])

    def test_check_source_fails_when_seedance_backend_guard_is_missing(self) -> None:
        self.write_file("controller/user.go", "func GetUserModels() {}\n")

        results = self.module.check_source(self.source_root)

        self.assertFalse(results["has_seedance_backend_guard"])

    def test_check_source_fails_when_media_result_model_guard_is_missing(self) -> None:
        self.write_file(
            "web/classic/src/pages/MediaPlayground/index.jsx",
            """
const VIDEO_MODELS = [
  { value: 'seedance-nsfw', label: 'Seedance 私测视频', private: true },
];
API.get('/api/user/models');
""",
        )

        results = self.module.check_source(self.source_root)

        self.assertFalse(results["has_media_result_model_guard"])

    def test_latest_source_root_prefers_deploy_marker_over_mtime(self) -> None:
        app_root = self.source_root / "app"
        good = app_root / "build/src-good"
        stale = app_root / "build/src-stale"
        for source_root in (good, stale):
            (source_root / "web").mkdir(parents=True)
            (source_root / "Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
            (source_root / "web/package.json").write_text("{}", encoding="utf-8")

        (app_root / ".last_media_source_model_guard_source").write_text(
            "build/src-good\n",
            encoding="utf-8",
        )

        self.assertEqual(self.module.latest_source_root(app_root), good)

    def test_sanitize_model_limits_replaces_raw_gpt_image2(self) -> None:
        raw = "gpt-image-2,gpt-image-2-4K,gpt-5.5,gpt-image-2,geek2api-image-2"

        self.assertEqual(
            self.module.sanitize_model_limits(raw),
            "gpt-image-2-4K,gpt-5.5",
        )

    def test_ensure_codex_image_model_limits_adds_only_public_15k_image_model(self) -> None:
        raw = "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,banana-2"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.4-mini,image 2电商商品图快速通道(1.5K)",
        )

    def test_supplier_exposed_model_limit_predicate_covers_known_markers(self) -> None:
        predicate = self.module.supplier_exposed_model_limit_predicate()

        for marker in ["gpt-image-2", "ccapi", "drag tokens", "dragtokens", "geek2api", "moonapix", "relay dance", "relaydance"]:
            self.assertIn(marker, predicate)

    def test_supplier_exposed_model_name_predicate_covers_known_markers(self) -> None:
        predicate = self.module.supplier_exposed_model_name_predicate("model")

        for marker in ["ccapi", "drag tokens", "dragtokens", "geek2api", "moonapix", "relay dance", "relaydance"]:
            self.assertIn(marker, predicate)

    def test_mysql_count_parses_last_numeric_row(self) -> None:
        def fake_mysql_exec(_app_root: Path, _query: str) -> str:
            return "COUNT(*)\n5\n"

        original = self.module.mysql_exec
        self.module.mysql_exec = fake_mysql_exec
        try:
            self.assertEqual(self.module.mysql_count(self.source_root, "SELECT COUNT(*)"), 5)
        finally:
            self.module.mysql_exec = original

    def test_supplier_safe_public_metadata_guard_removes_supplier_price_keys(self) -> None:
        captured: list[str] = []

        def fake_mysql_exec(_app_root: Path, query: str) -> str:
            if "SELECT value FROM options" in query and "ModelPrice" in query:
                return (
                    "value\n"
                    '{"geek2api-image-2":0.1,"gpt-image-2":0.2,'
                    '"image 2电商商品图快速通道(1.5K)":1500.0}\n'
                )
            if "SELECT value FROM options" in query:
                return "value\n{\"gpt-5.5\":1.0}\n"
            captured.append(query)
            return ""

        original = self.module.mysql_exec
        self.module.mysql_exec = fake_mysql_exec
        try:
            result = self.module.sync_supplier_safe_public_metadata_guard(self.source_root)
        finally:
            self.module.mysql_exec = original

        self.assertEqual(result, {"pricing_options_sanitized": 1, "public_model_tags_synced": 1})
        sql = "\n".join(captured)
        self.assertIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertIn("image,openai,ecommerce,1.5k", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertNotIn("gpt-image-2\":0.2", sql)
        self.assertNotIn("dragtokens", sql)

    def test_api_teacher_launcher_is_docked_in_top_navigation(self) -> None:
        source_root = SCRIPT_PATH.parent.parent
        candidates = [
            source_root / "src-patch/web/xingren-api-onboarding-assistant.js",
            source_root / "web/xingren-api-onboarding-assistant.js",
        ]
        assistant = next((path for path in candidates if path.exists()), candidates[0])
        source = assistant.read_text(encoding="utf-8")

        self.assertIn("function findDockTargetNav()", source)
        self.assertIn("function navIsVisible(nav)", source)
        self.assertIn('document.querySelectorAll("header nav")', source)
        self.assertIn('style.display === "none"', source)
        self.assertIn("rect.width > 0 && rect.height > 0", source)
        self.assertIn("function undockRoot(root)", source)
        self.assertIn("function refreshDockRoot(root)", source)
        self.assertIn("function startDockKeepAlive()", source)
        self.assertIn('root.classList.remove("xr-api-assistant-docked")', source)
        self.assertIn('window.addEventListener("resize"', source)
        self.assertIn("nav.insertBefore(root, nav.firstChild)", source)
        self.assertIn('root.classList.add("xr-api-assistant-docked")', source)
        self.assertIn('root.setAttribute("data-xr-docked", "top-nav")', source)
        self.assertIn("#xr-api-assistant-root.xr-api-assistant-docked", source)
        self.assertIn("function getRouteKind()", source)
        self.assertIn("function renderDetachedPanel()", source)
        self.assertIn('id="xr-api-assistant-panel"', source)
        self.assertIn("document.body.insertAdjacentHTML(", source)
        self.assertIn(".xr-api-assistant-panel{position:fixed;right:22px;top:96px;bottom:auto;z-index:2147483000", source)
        self.assertIn(".xr-api-assistant-panel[data-xr-route='home']{top:96px", source)
        self.assertNotIn(".xr-api-assistant-panel{position:fixed;right:20px;top:64px;bottom:20px", source)
        self.assertIn(
            ".xr-api-assistant-open #xr-api-assistant-root:not(.xr-api-assistant-docked) .xr-api-assistant-launcher",
            source,
        )
        self.assertIn("#xr-api-assistant-root:not(.xr-api-assistant-docked){right:12px;top:auto!important;bottom:12px}", source)


if __name__ == "__main__":
    unittest.main()
