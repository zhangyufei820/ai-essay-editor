#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
SPEC = importlib.util.spec_from_file_location(
    "configure_grok15_1080p_video",
    SCRIPT_DIR / "configure_grok15_1080p_video.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ConfigureGrok15Video1080Tests(unittest.TestCase):
    def test_normalize_base_url_accepts_only_https_origin(self) -> None:
        self.assertEqual(MODULE.normalize_base_url("https://provider.example/"), "https://provider.example")
        for value in (
            "http://provider.example",
            "https://user:secret@provider.example",
            "https://provider.example/v1",
            "https://provider.example?token=secret",
        ):
            with self.assertRaises(MODULE.ConfigurationError):
                MODULE.normalize_base_url(value)

    def test_build_stage_sql_is_internal_and_keeps_legacy_model_untouched(self) -> None:
        options = {
            "ModelPrice": {"grok-video-1.5": 0.027397260274, MODULE.PUBLIC_MODEL: 0.054794520548},
            "ModelRatio": {},
            "CompletionRatio": {},
        }
        sql = MODULE.build_stage_sql(
            "sk-test-value-long-enough-123456",
            "https://provider.example",
            options,
            "55",
            "grok-video-1.5",
        )
        self.assertIn("type, `key`, status", sql)
        self.assertIn("SELECT 55,", sql)
        self.assertIn("`group` = 'internal'", sql)
        self.assertIn("'internal', 'grok-video-1.5-1080p'", sql)
        self.assertIn("上游成本 CNY ¥0.35/次", sql)
        self.assertIn("grok-video-1.5,grok-video-1.5-1080p", sql)
        self.assertNotIn("UPDATE channels SET status = 2", sql)
        self.assertIn('"grok-video-1.5":0.027397260274', sql)

    def test_publish_syncs_all_groups_then_video_tokens(self) -> None:
        calls: list[str] = []
        MODULE.validate_channel_isolation = lambda: calls.append("isolation")
        MODULE.require_managed_channel_ready = lambda: calls.append("ready")
        MODULE.permissions.mysql_exec = lambda sql: calls.append("mysql:" + sql)
        MODULE.permissions.ensure_public_video_models = lambda: calls.append("models")
        MODULE.permissions.sync_public_video_pricing = lambda: calls.append("pricing")
        MODULE.permissions.model_lists = lambda: {
            "codex": ["gpt-5.5"],
            "claude": ["claude-opus-4-8"],
            "image": ["gpt-image-2-4K"],
            "video": ["grok-video-1.5", MODULE.PUBLIC_MODEL],
        }
        MODULE.permissions.sync_abilities = lambda: calls.append("abilities")
        MODULE.permissions.sync_user_video_tokens = lambda profiles: calls.append(
            "tokens:" + ",".join(profiles["video"])
        ) or {"tokens_rewritten": 2, "token_caches_deleted": 2}

        result = MODULE.publish()

        self.assertEqual(calls[:2], ["isolation", "ready"])
        self.assertIn(MODULE.CHANNEL_GROUPS, calls[2])
        self.assertEqual(calls[3:6], ["models", "pricing", "abilities"])
        self.assertIn(MODULE.PUBLIC_MODEL, calls[6])
        self.assertEqual(result["tokens_rewritten"], 2)


if __name__ == "__main__":
    unittest.main()
