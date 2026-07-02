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


if __name__ == "__main__":
    unittest.main()
