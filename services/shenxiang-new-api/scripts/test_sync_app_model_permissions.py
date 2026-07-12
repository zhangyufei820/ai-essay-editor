#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).with_name("sync_app_model_permissions.py")


def load_sync_module():
    spec = importlib.util.spec_from_file_location("sync_app_model_permissions", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load sync_app_model_permissions.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SyncAppModelPermissionsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.module = load_sync_module()

    def test_sanitize_model_limits_replaces_raw_gpt_image2(self) -> None:
        raw = "gpt-5.5,gpt-image-2,gpt-image-2-4K,gpt-image-2,geek2api-image-2,gpt-5.3-codex-spark,gpt-5.3-spark"

        self.assertEqual(
            self.module.sanitize_model_limits(raw),
            "gpt-5.5,gpt-image-2-4K",
        )

    def test_codex_allowed_models_include_only_public_15k_image_model(self) -> None:
        self.assertIn("image 2电商商品图快速通道(1.5K)", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-luna", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-terra", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.6-sol", self.module.CODEX_ALLOWED_MODELS)
        self.assertIn("gpt-5.5-openai-compact", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.3-codex-spark", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.3-spark", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-5.4-openai-compact", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("codex-auto-review", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("geek2api-image-2", self.module.CODEX_ALLOWED_MODELS)
        self.assertNotIn("gpt-image-2-4K", self.module.CODEX_ALLOWED_MODELS)

    def test_discount_text_models_are_exactly_the_public_text_aliases(self) -> None:
        self.assertEqual(
            self.module.DISCOUNT_TEXT_ALLOWED_MODELS,
            (
                "gpt-5.4",
                "gpt-5.4-mini",
                "gpt-5.5",
                "gpt-5.5-openai-compact",
                "gpt-5.6-luna",
                "gpt-5.6-terra",
                "gpt-5.6-sol",
            ),
        )

    def test_ensure_codex_image_model_limits_adds_only_public_15k_image_model(self) -> None:
        raw = "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,banana-2,claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.4-mini,gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)",
        )

    def test_ensure_codex_image_model_limits_defaults_empty_to_text_and_image(self) -> None:
        raw = "claude-opus-4-8,seedance-2.0-cl-mini"

        self.assertEqual(
            self.module.ensure_codex_image_model_limits(raw),
            "gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)",
        )

    def test_token_cache_key_uses_crypto_secret_hmac(self) -> None:
        old_secret = os.environ.get("CRYPTO_SECRET")
        os.environ["CRYPTO_SECRET"] = "test-secret"
        try:
            self.assertEqual(
                self.module.token_cache_key("token-value"),
                "token:aa900acb34c6e64089ce061bb6e53053ecc0af1e03fd3a9aa63540d874843147",
            )
        finally:
            if old_secret is None:
                os.environ.pop("CRYPTO_SECRET", None)
            else:
                os.environ["CRYPTO_SECRET"] = old_secret

    def test_mysql_subprocesses_timeout_with_generic_errors(self) -> None:
        secret = "fake-sync-database-password"
        environment = {
            "MYSQL_ROOT_PASSWORD": secret,
            "MYSQL_DATABASE": "new-api",
        }
        for reader in (self.module.mysql, self.module.mysql_raw):
            with self.subTest(reader=reader.__name__), mock.patch.dict(
                self.module.os.environ,
                environment,
                clear=True,
            ), mock.patch.object(
                self.module.subprocess,
                "check_output",
                side_effect=self.module.subprocess.TimeoutExpired(["docker"], 15),
            ) as check_output:
                with self.assertRaisesRegex(RuntimeError, "MySQL query failed") as raised:
                    reader("SELECT 1")

                self.assertNotIn(secret, str(raised.exception))
                self.assertEqual(
                    check_output.call_args.kwargs["timeout"],
                    self.module.MYSQL_QUERY_TIMEOUT_SECONDS,
                )

    def test_mysql_update_timeout_is_fail_closed_and_generic(self) -> None:
        secret = "fake-sync-database-password"
        environment = {
            "MYSQL_ROOT_PASSWORD": secret,
            "MYSQL_DATABASE": "new-api",
        }
        with mock.patch.dict(self.module.os.environ, environment, clear=True), mock.patch.object(
            self.module.subprocess,
            "run",
            side_effect=self.module.subprocess.TimeoutExpired(["docker"], 60),
        ) as run:
            with self.assertRaisesRegex(RuntimeError, "MySQL update failed") as raised:
                self.module.mysql_exec("START TRANSACTION; COMMIT;")

        self.assertNotIn(secret, str(raised.exception))
        self.assertEqual(
            run.call_args.kwargs["timeout"],
            self.module.MYSQL_UPDATE_TIMEOUT_SECONDS,
        )

    def test_redis_timeout_is_fail_closed_and_does_not_leak_secret(self) -> None:
        secret = "fake-sync-redis-password"
        environment = {
            "CRYPTO_SECRET": "fake-crypto-secret",
            "REDIS_PASSWORD": secret,
        }
        with mock.patch.dict(self.module.os.environ, environment, clear=True), mock.patch.object(
            self.module.subprocess,
            "run",
            side_effect=self.module.subprocess.TimeoutExpired(["docker"], 15),
        ) as run, mock.patch.object(self.module.time, "sleep") as sleep:
            with self.assertRaisesRegex(RuntimeError, "cache invalidation failed") as raised:
                self.module.delete_token_caches(["token-value"])

        self.assertNotIn(secret, str(raised.exception))
        self.assertEqual(run.call_count, self.module.TOKEN_CACHE_INVALIDATION_ATTEMPTS)
        self.assertEqual(sleep.call_count, self.module.TOKEN_CACHE_INVALIDATION_ATTEMPTS - 1)
        self.assertEqual(
            run.call_args.kwargs["timeout"],
            self.module.REDIS_UPDATE_TIMEOUT_SECONDS,
        )

    def test_redis_cache_invalidation_retries_transient_failures(self) -> None:
        environment = {
            "CRYPTO_SECRET": "fake-crypto-secret",
            "REDIS_PASSWORD": "fake-redis-password",
        }
        failures = [
            self.module.subprocess.TimeoutExpired(["docker"], 15),
            OSError("temporary failure"),
            mock.Mock(),
        ]
        with mock.patch.dict(self.module.os.environ, environment, clear=True), mock.patch.object(
            self.module.subprocess,
            "run",
            side_effect=failures,
        ) as run, mock.patch.object(self.module.time, "sleep") as sleep:
            self.assertEqual(self.module.delete_token_caches(["token-value"]), 1)

        self.assertEqual(run.call_count, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])

    def test_all_active_token_cache_invalidation_queries_fresh_keys(self) -> None:
        captured_queries: list[str] = []
        captured_keys: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            captured_queries.append(query)
            return [["key-before"], [""], ["key-after"]]

        self.module.mysql = fake_mysql
        self.module.delete_token_caches = lambda keys: captured_keys.extend(keys) or len(keys)

        self.assertEqual(self.module.invalidate_all_active_token_caches(), 2)
        self.assertIn("deleted_at IS NULL", captured_queries[0])
        self.assertEqual(captured_keys, ["key-before", "key-after"])

    def test_main_invalidates_all_token_caches_before_and_after_sync(self) -> None:
        events: list[str] = []
        self.module.invalidate_all_active_token_caches = lambda: events.append("invalidate") or 1
        self.module.run_model_permission_sync = lambda: events.append("sync") or 0

        self.assertEqual(self.module.main(), 0)
        self.assertEqual(events, ["invalidate", "sync", "invalidate"])

    def test_main_invalidates_all_token_caches_after_partial_sync_failure(self) -> None:
        events: list[str] = []
        self.module.invalidate_all_active_token_caches = lambda: events.append("invalidate") or 1

        def fail_sync() -> int:
            events.append("sync")
            raise RuntimeError("partial commit")

        self.module.run_model_permission_sync = fail_sync
        with self.assertRaisesRegex(RuntimeError, "partial commit"):
            self.module.main()
        self.assertEqual(events, ["invalidate", "sync", "invalidate"])

    def test_codex_refresh_timeout_is_fail_closed(self) -> None:
        with mock.patch.object(self.module.Path, "exists", return_value=True), mock.patch.object(
            self.module.subprocess,
            "run",
            side_effect=self.module.subprocess.TimeoutExpired(["docker"], 180),
        ) as run:
            with self.assertRaisesRegex(RuntimeError, "workspace refresh failed"):
                self.module.refresh_codex()

        self.assertEqual(
            run.call_args.kwargs["timeout"],
            self.module.CODEX_REFRESH_TIMEOUT_SECONDS,
        )

    def test_codex_env_backup_is_external_and_private(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            codex_root = root / "opt" / "shenxiang-codex-workspace"
            backup_root = root / "quarantine" / "model-sync-env-backups"
            codex_root.mkdir(parents=True)
            env_path = codex_root / ".env"
            original = "SERVICE_SECRET=synthetic-test-value\nCODEX_ALLOWED_MODELS=old\n"
            env_path.write_text(original, encoding="utf-8")
            env_path.chmod(0o644)
            self.module.CODEX_ROOT = codex_root
            self.module.CODEX_ENV_BACKUP_ROOT = backup_root

            with mock.patch.dict(self.module.os.environ, {"SYNC_TIMESTAMP": "20260712-test"}, clear=False):
                changed = self.module.sync_codex_env(
                    {
                        "codex": ["gpt-5.5"],
                        "claude": ["claude-opus-4-8"],
                        "image": ["gpt-image-2-4K"],
                        "video": ["seedance-2.0-cl-mini"],
                    }
                )

            self.assertTrue(changed)
            backups = list(backup_root.iterdir())
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(encoding="utf-8"), original)
            self.assertEqual(stat.S_IMODE(backups[0].stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(backup_root.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(env_path.stat().st_mode), 0o600)
            self.assertIn("SERVICE_SECRET=synthetic-test-value", env_path.read_text(encoding="utf-8"))
            self.assertEqual(list(codex_root.glob(".env.backup*")), [])

    def test_dynamic_sql_columns_are_strictly_whitelisted(self) -> None:
        self.assertIn("current_channel.models", self.module.discount_text_models_allowed_sql("current_channel.models"))
        self.assertIn("model_name", self.module.supplier_exposed_model_name_predicate("model_name"))
        for builder, value in (
            (self.module.discount_text_models_allowed_sql, "models) OR 1=1 --"),
            (self.module.supplier_exposed_model_name_predicate, "model) OR 1=1 --"),
        ):
            with self.subTest(builder=builder.__name__):
                with self.assertRaisesRegex(ValueError, "SQL identifier"):
                    builder(value)

    def test_usd_exchange_rate_rejects_non_finite_values(self) -> None:
        for raw in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(raw=raw):
                self.module.option_value = lambda _key, value=raw: value
                with self.assertRaisesRegex(ValueError, "greater than 0"):
                    self.module.usd_exchange_rate()

    def test_supplier_exposed_model_limit_predicate_covers_known_markers(self) -> None:
        predicate = self.module.supplier_exposed_model_limit_predicate()

        for marker in ["gpt-image-2", "ccapi", "drag tokens", "dragtokens", "geek2api", "moonapix", "relay dance", "relaydance"]:
            self.assertIn(marker, predicate)

    def test_supplier_exposed_model_name_predicate_covers_known_markers(self) -> None:
        predicate = self.module.supplier_exposed_model_name_predicate("model")

        for marker in ["ccapi", "drag tokens", "dragtokens", "geek2api", "moonapix", "relay dance", "relaydance"]:
            self.assertIn(marker, predicate)

    def test_supplier_exposed_model_name_predicate_can_exclude_public_alias_backing_model(self) -> None:
        predicate = self.module.supplier_exposed_model_name_predicate("model", exclude_public_alias_backing=True)

        self.assertIn("geek2api", predicate)
        self.assertIn("NOT IN", predicate)
        self.assertIn("geek2api-image-2", predicate)

    def test_parse_json_string_option_preserves_escaped_quotes(self) -> None:
        self.module.option_value = lambda _key: '{"geek2api-image-2":"param(\\"resolution\\") == \\"4K\\" ? tier(\\"4K\\", 1) : tier(\\"1K\\", 0)"}'

        parsed = self.module.parse_json_string_option("billing_setting.billing_expr")

        self.assertEqual(
            parsed["geek2api-image-2"],
            'param("resolution") == "4K" ? tier("4K", 1) : tier("1K", 0)',
        )

    def test_option_value_reads_raw_mysql_output(self) -> None:
        captured: list[str] = []

        def fake_mysql_raw(query: str) -> list[list[str]]:
            captured.append(query)
            return [['{"model":"tier(\\"base\\", 1)"}']]

        self.module.mysql_raw = fake_mysql_raw

        self.assertEqual(self.module.option_value("billing_setting.billing_expr"), '{"model":"tier(\\"base\\", 1)"}')
        self.assertIn("billing_setting.billing_expr", captured[0])

    def test_model_lists_allows_codex_to_use_public_15k_image_model(self) -> None:
        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM models" not in query:
                return []
            return [
                ["1", "gpt-5.5", "text,openai,codex"],
                ["2", "gpt-5.4", "text,openai,codex"],
                ["3", "gpt-5.4-mini", "text,openai,codex"],
                ["4", "gpt-5.6-luna", "text,openai,codex"],
                ["5", "gpt-5.6-terra", "text,openai,codex"],
                ["6", "gpt-5.6-sol", "text,openai,codex"],
                ["7", "gpt-5.3-codex-spark", "text,codex"],
                ["8", "gpt-5.3-spark", "text,codex"],
                ["9", "gpt-5.4-openai-compact", "text,openai,codex"],
                ["10", "gpt-5.5-openai-compact", "text,codex"],
                ["11", "codex-auto-review", "text,codex"],
                ["12", "image 2电商商品图快速通道(1.5K)", "image,openai,ecommerce,1.5k,dragtokens"],
                ["13", "gpt-image-2-4K", "image,openai"],
                ["14", "geek2api-image-2", "image,openai,geek2api"],
            ]

        self.module.mysql = fake_mysql

        profiles = self.module.model_lists()

        self.assertEqual(
            profiles["codex"],
            [
                "gpt-5.5",
                "gpt-5.4",
                "gpt-5.4-mini",
                "gpt-5.6-luna",
                "gpt-5.6-terra",
                "gpt-5.6-sol",
                "gpt-5.5-openai-compact",
                "image 2电商商品图快速通道(1.5K)",
            ],
        )
        self.assertNotIn("gpt-5.3-codex-spark", profiles["codex"])
        self.assertNotIn("gpt-5.3-spark", profiles["codex"])
        self.assertNotIn("gpt-5.4-openai-compact", profiles["codex"])
        self.assertNotIn("codex-auto-review", profiles["codex"])
        self.assertNotIn("gpt-image-2-4K", profiles["codex"])
        self.assertIn("特价 image-2", profiles["image"])
        self.assertNotIn("geek2api-image-2", profiles["image"])

    def test_disabled_image2_ability_pairs_are_not_synced(self) -> None:
        self.assertTrue(self.module.is_disabled_ability_pair("12", "gpt-image-2-4K"))
        self.assertTrue(self.module.is_disabled_ability_pair("21", "gpt-image-2"))
        self.assertFalse(self.module.is_disabled_ability_pair("8", "gpt-image-2-4K"))

    def test_sync_abilities_allows_discount_image2_backing_model_only(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [["27", "geek2api-image-2,custom-geek2api-leak,image 2电商商品图快速通道(1.5K)", "0", "100", "test", "default"]]
            if "SELECT model_name FROM models" in query:
                return [["geek2api-image-2"], ["custom-geek2api-leak"], ["image 2电商商品图快速通道(1.5K)"]]
            return []

        self.module.active_groups = lambda: ["default"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = lambda query: captured.append(query) or ["ability_sync_status=ok"]

        self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("geek2api-image-2", sql)
        self.assertIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("custom-geek2api-leak", sql)

    def test_sync_abilities_keeps_discount_channel_isolated(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [
                    ["31", "gpt-5.5", "0", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAG, "discount"],
                    ["21", "gpt-5.5", "0", "100", "stable", "default,internal"],
                ]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"]]
            return []

        self.module.active_groups = lambda: ["default", "internal", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = lambda query: captured.append(query) or ["ability_sync_status=ok"]

        self.module.sync_abilities()

        sql = "\n".join(captured)
        discount_insert = "SELECT 'discount', 'gpt-5.5', 31"
        self.assertIn(discount_insert, sql)
        self.assertNotIn("'default', 'gpt-5.5', 31", sql)
        self.assertNotIn("'discount', 'gpt-5.5', 21", sql)
        self.assertIn("'default', 'gpt-5.5', 21", sql)
        self.assertIn("'internal', 'gpt-5.5', 21", sql)
        self.assertIn("EXISTS (SELECT 1 FROM models AS current_model", sql)
        self.assertNotIn("INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES", sql)
        self.assertIn("FROM channels AS current_channel", sql)
        self.assertIn("current_channel.id = 31", sql)
        self.assertIn("current_channel.status = 1", sql)
        self.assertIn("BINARY COALESCE(current_channel.tag, '') = BINARY 'xingren-discount-text'", sql)
        self.assertIn("BINARY REPLACE(COALESCE(current_channel.`group`, ''), ' ', '') = BINARY 'discount'", sql)
        self.assertIn(
            "FIND_IN_SET('gpt-5.5', REPLACE(COALESCE(current_channel.models, ''), ' ', '')) > 0",
            sql,
        )
        self.assertIn("REGEXP BINARY", sql)
        first_managed_disable = sql.index("UPDATE abilities SET enabled = 0 WHERE `group` IN")
        self.assertLess(first_managed_disable, sql.index("INSERT INTO abilities"))
        self.assertIn("@discount_sync_allowed = 1", sql)
        self.assertIn("ability_sync_status=", sql)

    def test_sync_abilities_fails_closed_for_discount_channel_with_extra_model(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [[
                    "31",
                    "gpt-5.5,gpt-5.7-preview",
                    "0",
                    "100",
                    self.module.DISCOUNT_TEXT_CHANNEL_TAG,
                    "discount",
                ]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"], ["gpt-5.7-preview"]]
            return []

        self.module.active_groups = lambda: ["default", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = lambda query: captured.append(query) or [
            "ability_sync_status=discount_invalid_profile"
        ]

        with self.assertRaisesRegex(RuntimeError, "discount group isolation violation"):
            self.module.sync_abilities()

        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET status = 2 WHERE BINARY COALESCE(tag, '')", sql)
        self.assertIn("REGEXP BINARY", sql)
        self.assertNotIn("SELECT 'discount', 'gpt-5.5', 31", sql)
        self.assertNotIn("gpt-5.7-preview', 31", sql)

    def test_sync_abilities_rejects_misgrouped_discount_channel(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [["31", "gpt-5.5", "0", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAG, "default"]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"]]
            return []

        self.module.active_groups = lambda: ["default", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = lambda query: captured.append(query) or [
            "ability_sync_status=discount_invalid_profile"
        ]

        with self.assertRaisesRegex(RuntimeError, "discount group isolation violation"):
            self.module.sync_abilities()
        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET status = 2", sql)
        self.assertIn("@discount_sync_status", sql)
        self.assertIn("ability_sync_status=", sql)
        self.assertNotIn("'discount', 'gpt-5.5', 31", sql)

    def test_sync_abilities_disables_nonisolated_channel_using_discount_group(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [["21", "gpt-5.5", "0", "100", "stable", "default,discount"]]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"]]
            return []

        self.module.active_groups = lambda: ["default", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = lambda query: captured.append(query) or [
            "ability_sync_status=discount_group_conflict"
        ]

        with self.assertRaisesRegex(RuntimeError, "discount group isolation violation"):
            self.module.sync_abilities()
        sql = "\n".join(captured)
        self.assertIn("FIND_IN_SET('discount'", sql)
        self.assertNotIn("'default', 'gpt-5.5', 21", sql)
        self.assertNotIn("'discount', 'gpt-5.5', 21", sql)

    def test_sync_abilities_locks_and_rejects_duplicate_discount_tag(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return [
                    ["31", "gpt-5.5", "0", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAG, "discount"],
                    ["32", "gpt-5.4", "0", "100", self.module.DISCOUNT_TEXT_CHANNEL_TAG, "discount"],
                ]
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"], ["gpt-5.4"]]
            return []

        self.module.active_groups = lambda: ["default", "discount"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = lambda query: captured.append(query) or [
            "ability_sync_status=discount_duplicate_tag"
        ]

        with self.assertRaisesRegex(RuntimeError, "multiple channels use the discount isolation tag"):
            self.module.sync_abilities()

        sql = captured[0]
        self.assertTrue(sql.startswith("START TRANSACTION;"))
        self.assertIn("FOR UPDATE;", sql)
        self.assertIn("@discount_tag_count", sql)
        self.assertIn("@discount_tag_count > 1", sql)
        self.assertIn("SET status = 2", sql)
        self.assertIn("@discount_sync_allowed = 1", sql)

    def test_sync_abilities_disables_stale_managed_abilities_before_reenable(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "FROM channels" in query:
                return []
            if "SELECT model_name FROM models" in query:
                return [["gpt-5.5"]]
            return []

        self.module.active_groups = lambda: ["default"]
        self.module.mysql = fake_mysql
        self.module.mysql_exec = lambda query: captured.append(query) or ["ability_sync_status=ok"]

        self.module.sync_abilities()

        sql = captured[0]
        disable_index = sql.index("UPDATE abilities SET enabled = 0 WHERE `group` IN")
        self.assertIn("'discount'", sql[disable_index:])
        self.assertIn("'grok45'", sql[disable_index:])
        self.assertIn("model = 'grok-4.5'", sql[disable_index:])
        self.assertIn("tag IN ('xingren-discount-text', 'xingren-grok45')", sql[disable_index:])
        insert_index = sql.find("INSERT INTO abilities")
        if insert_index >= 0:
            self.assertLess(disable_index, insert_index)

    def test_ensure_discount_image2_backing_model_uses_public_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_discount_image2_backing_model()

        sql = "\n".join(captured)
        self.assertIn("geek2api-image-2", sql)
        self.assertIn("特价 image-2", sql)
        self.assertIn("image,openai", sql)
        self.assertNotIn("image,openai,geek2api", sql)

    def test_sync_tokens_updates_admin_system_tokens_only(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append
        self.module.mysql = lambda query: [["admin-key-1"], ["admin-key-2"]]
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        self.module.sync_tokens(
            {
                "codex": [
                    "gpt-5.5",
                    "gpt-5.6-luna",
                    "gpt-5.6-terra",
                    "gpt-5.6-sol",
                    "image 2电商商品图快速通道(1.5K)",
                ],
                "claude": ["claude-opus-4-8"],
                "image": ["gpt-image-2-4K", "geek2api-image-2"],
                "video": ["seedance-2.0-cl-mini"],
            }
        )

        sql = "\n".join(captured)
        self.assertIn("AND user_id = 1", sql)
        self.assertEqual(sql.count("AND user_id = 1"), 5)
        self.assertIn("gpt-5.6-luna", sql)
        self.assertIn("gpt-5.6-terra", sql)
        self.assertIn("gpt-5.6-sol", sql)
        self.assertIn("image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertIn("CACHE:admin-key-1,admin-key-2", sql)

    def test_sync_user_codex_tokens_updates_non_admin_codex_tokens(self) -> None:
        captured: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            self.assertIn("user_id <> 1", query)
            self.assertIn("name LIKE '星人Codex %'", query)
            self.assertIn("'月卡专用 Key'", query)
            self.assertIn("'¥500 月卡专用'", query)
            self.assertIn("COALESCE(`key`, '')", query)
            self.assertNotIn("model_limits_enabled = 1", query)
            full_limits = (
                "gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.3-codex-spark,gpt-5.3-spark,gpt-5.4-openai-compact,codex-auto-review,"
                "gpt-5.5-openai-compact,codex-auto-review,image 2电商商品图快速通道(1.5K)"
            )
            return [
                ["101", "key-101", "gpt-5.5", "1"],
                ["102", "key-102", "gpt-5.4-mini,gpt-image-2-4K,geek2api-image-2,claude-opus-4-8,seedance-2.0-cl-mini", "1"],
                ["103", "key-103", "gpt-5.5,image 2电商商品图快速通道(1.5K)", "1"],
                ["104", "key-104", "", "0"],
                ["105", "key-105", full_limits, "1"],
                ["106", "key-106", "gpt-image-2-4K,gpt-5.5,gpt-5.4-mini,gpt-5.4,gpt-5.5-openai-compact", "1"],
            ]

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured.append
        self.module.delete_token_caches = lambda keys: captured.append("CACHE:" + ",".join(keys)) or len(keys)

        result = self.module.sync_user_codex_tokens()

        sql = "\n".join(captured)
        self.assertEqual(result, {"tokens_rewritten": 6, "token_caches_deleted": 6})
        self.assertIn("WHERE id = '101'", sql)
        self.assertIn("WHERE id = '102'", sql)
        self.assertIn("WHERE id = '103'", sql)
        self.assertIn("WHERE id = '104'", sql)
        self.assertIn("WHERE id = '105'", sql)
        self.assertIn("WHERE id = '106'", sql)
        self.assertIn("CACHE:key-101,key-102,key-103,key-104,key-105,key-106", sql)
        self.assertIn("model_limits_enabled = 1", sql)
        self.assertIn("gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)", sql)
        self.assertIn("gpt-5.4-mini,gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol,gpt-5.5-openai-compact,image 2电商商品图快速通道(1.5K)", sql)
        self.assertNotIn("gpt-5.3-codex-spark", sql)
        self.assertNotIn("gpt-5.3-spark", sql)
        self.assertNotIn("gpt-5.4-openai-compact", sql)
        self.assertNotIn("codex-auto-review", sql)
        self.assertNotIn("geek2api-image-2", sql)
        self.assertNotIn("gpt-image-2-4K", sql)
        self.assertNotIn("claude-opus-4-8", sql)
        self.assertNotIn("seedance-2.0-cl-mini", sql)

    def test_ensure_public_openai_text_models_uses_public_chat_metadata(self) -> None:
        captured: list[str] = []
        self.module.mysql_exec = captured.append

        self.module.ensure_public_openai_text_models()

        sql = "\n".join(captured)
        for model in ["gpt-5.4", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]:
            self.assertIn(model, sql)
        self.assertIn("text,openai,codex", sql)
        self.assertIn('{"openai":"/v1/chat/completions"}', sql)
        self.assertIn("vendor_id = 1", sql)

    def test_sync_public_openai_text_pricing_sets_ratio_and_tiered_prices(self) -> None:
        captured_options: dict[str, dict[str, float] | dict[str, str]] = {}
        self.module.parse_json_option = lambda _key: {}
        self.module.parse_json_string_option = lambda _key: {}
        self.module.option_value = lambda key: "7.3" if key == "USDExchangeRate" else ""
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.upsert_json_string_option = lambda key, values: captured_options.update({key: values})

        self.module.sync_public_openai_text_pricing()

        expected_model_ratios = {
            "gpt-5.4": 0.162739726027,
            "gpt-5.5": 0.369863013699,
            "gpt-5.6-luna": 0.068493150685,
            "gpt-5.6-terra": 0.171232876712,
            "gpt-5.6-sol": 0.342465753425,
        }
        expected_completion_ratios = {
            "gpt-5.4": 6.136363636364,
            "gpt-5.5": 6.0,
            "gpt-5.6-luna": 6.0,
            "gpt-5.6-terra": 6.0,
            "gpt-5.6-sol": 6.0,
        }
        for model, ratio in expected_model_ratios.items():
            self.assertEqual(captured_options["ModelRatio"][model], ratio)
            self.assertEqual(captured_options["CompletionRatio"][model], expected_completion_ratios[model])
            self.assertEqual(captured_options["CacheRatio"][model], 0.1)
            self.assertEqual(captured_options["CreateCacheRatio"][model], 1.25)
            self.assertNotIn(model, captured_options["ModelPrice"])
            self.assertEqual(captured_options["billing_setting.billing_mode"][model], "tiered_expr")

        gpt54_expr = captured_options["billing_setting.billing_expr"]["gpt-5.4"]
        gpt55_expr = captured_options["billing_setting.billing_expr"]["gpt-5.5"]
        luna_expr = captured_options["billing_setting.billing_expr"]["gpt-5.6-luna"]
        terra_expr = captured_options["billing_setting.billing_expr"]["gpt-5.6-terra"]
        sol_expr = captured_options["billing_setting.billing_expr"]["gpt-5.6-sol"]

        for expr in [gpt54_expr, gpt55_expr, luna_expr, terra_expr, sol_expr]:
            self.assertIn("len <= 272000", expr)
            self.assertIn('tier("base"', expr)
            self.assertIn('tier("longcontext"', expr)

        self.assertIn("p * 0.325479452055", gpt54_expr)
        self.assertIn("c * 1.997260273973", gpt54_expr)
        self.assertIn("cr * 0.032547945205", gpt54_expr)
        self.assertIn("cc * 0.406849315068", gpt54_expr)
        self.assertIn("p * 0.65095890411", gpt54_expr)
        self.assertIn("c * 2.995890410959", gpt54_expr)
        self.assertIn("cr * 0.065095890411", gpt54_expr)
        self.assertIn("cc * 0.813698630137", gpt54_expr)

        self.assertIn("p * 0.739726027397", gpt55_expr)
        self.assertIn("c * 4.438356164384", gpt55_expr)
        self.assertIn("cr * 0.07397260274", gpt55_expr)
        self.assertIn("cc * 0.924657534247", gpt55_expr)
        self.assertIn("p * 1.479452054795", gpt55_expr)
        self.assertIn("c * 6.657534246575", gpt55_expr)
        self.assertIn("cr * 0.147945205479", gpt55_expr)
        self.assertIn("cc * 1.849315068493", gpt55_expr)

        self.assertIn("p * 0.13698630137", luna_expr)
        self.assertIn("c * 0.821917808219", luna_expr)
        self.assertIn("cr * 0.013698630137", luna_expr)
        self.assertIn("cc * 0.171232876712", luna_expr)
        self.assertIn("p * 0.27397260274", luna_expr)
        self.assertIn("c * 1.232876712329", luna_expr)

        self.assertIn("p * 0.342465753425", terra_expr)
        self.assertIn("c * 2.054794520548", terra_expr)
        self.assertIn("p * 0.684931506849", terra_expr)
        self.assertIn("c * 3.082191780822", terra_expr)

        self.assertIn("p * 0.684931506849", sol_expr)
        self.assertIn("c * 4.109589041096", sol_expr)
        self.assertIn("cr * 0.068493150685", sol_expr)
        self.assertIn("cc * 0.856164383562", sol_expr)
        self.assertIn("p * 1.369863013699", sol_expr)
        self.assertIn("c * 6.164383561644", sol_expr)
        self.assertIn("cr * 0.13698630137", sol_expr)
        self.assertIn("cc * 1.712328767123", sol_expr)

    def test_sync_supplier_safe_public_metadata_removes_supplier_price_keys(self) -> None:
        captured_options: dict[str, dict[str, float]] = {}
        captured_sql: list[str] = []

        def fake_parse_json_option(key: str) -> dict[str, float]:
            if key == "ModelPrice":
                return {
                    "geek2api-image-2": 0.1,
                    "gpt-image-2": 0.2,
                    "image 2电商商品图快速通道(1.5K)": 1500.0,
                }
            return {"gpt-5.5": 1.0}

        self.module.parse_json_option = fake_parse_json_option
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.mysql_exec = captured_sql.append

        result = self.module.sync_supplier_safe_public_metadata()

        self.assertEqual(result, {"pricing_options_sanitized": 1, "public_model_tags_synced": 1})
        self.assertNotIn("geek2api-image-2", captured_options["ModelPrice"])
        self.assertNotIn("gpt-image-2", captured_options["ModelPrice"])
        self.assertIn("image 2电商商品图快速通道(1.5K)", captured_options["ModelPrice"])
        sql = "\n".join(captured_sql)
        self.assertIn("image,openai,ecommerce,1.5k", sql)
        self.assertNotIn("dragtokens", sql)

    def test_retire_codex_text_models_disables_db_rows_and_token_limits(self) -> None:
        captured_sql: list[str] = []
        captured_options: dict[str, dict[str, float]] = {}
        captured_caches: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "COUNT(*) FROM models" in query:
                return [["2"]]
            if "COUNT(*) FROM abilities" in query:
                return [["7"]]
            if "FROM tokens" in query:
                self.assertIn("FIND_IN_SET('gpt-5.3-codex-spark'", query)
                self.assertIn("FIND_IN_SET('gpt-5.3-spark'", query)
                return [
                    ["201", "key-201", "gpt-5.5,gpt-5.3-codex-spark,codex-auto-review"],
                    ["202", "key-202", "gpt-5.3-spark,gpt-5.4,gpt-5.4-openai-compact"],
                ]
            return []

        def fake_parse_json_option(_key: str) -> dict[str, float]:
            return {
                "gpt-5.5": 1.0,
                "gpt-5.3-codex-spark": 2.0,
                "gpt-5.3-spark": 3.0,
                "gpt-5.4-openai-compact": 4.0,
                "codex-auto-review": 5.0,
            }

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured_sql.append
        self.module.parse_json_option = fake_parse_json_option
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.delete_token_caches = lambda keys: captured_caches.extend(keys) or len(keys)

        result = self.module.retire_codex_text_models()

        self.assertEqual(
            result,
            {
                "active_models_retired": 2,
                "abilities_disabled": 7,
                "pricing_options_sanitized": 5,
                "tokens_rewritten": 2,
                "token_caches_deleted": 2,
            },
        )
        for values in captured_options.values():
            self.assertEqual(values, {"gpt-5.5": 1.0})
        sql = "\n".join(captured_sql)
        self.assertIn("UPDATE models SET status = 0", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'gpt-5.5' WHERE id = '201'", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'gpt-5.4' WHERE id = '202'", sql)
        self.assertEqual(captured_caches, ["key-201", "key-202"])

    def test_retire_claude_models_keeps_only_allowed_models(self) -> None:
        captured_sql: list[str] = []
        captured_options: dict[str, dict[str, float]] = {}
        captured_caches: list[str] = []

        def fake_mysql(query: str) -> list[list[str]]:
            if "COUNT(*) FROM models" in query:
                return [["4"]]
            if "COUNT(*) FROM abilities" in query:
                return [["12"]]
            if "FROM tokens" in query:
                return [
                    ["301", "key-301", "claude-sonnet-5,claude-fable-5,claude-opus-4-8-fast"],
                    ["302", "key-302", "claude-opus-4-6,claude-sonnet-4-5-20250929"],
                ]
            if "FROM channels" in query:
                return [
                    [
                        "9",
                        "claude-sonnet-5,claude-fable-5,claude-opus-4-8-fast,claude-opus-4-8",
                        '{"claude-opus-4-8-fast":"claude-opus-4-8","custom":"target"}',
                    ],
                ]
            return []

        def fake_parse_json_option(_key: str) -> dict[str, float]:
            return {
                "claude-sonnet-5": 1.0,
                "claude-fable-5": 2.0,
                "claude-opus-4-8-fast": 3.0,
            }

        self.module.mysql = fake_mysql
        self.module.mysql_exec = captured_sql.append
        self.module.parse_json_option = fake_parse_json_option
        self.module.upsert_json_option = lambda key, values: captured_options.update({key: values})
        self.module.delete_token_caches = lambda keys: captured_caches.extend(keys) or len(keys)

        result = self.module.retire_claude_models()

        self.assertEqual(result["active_models_retired"], 4)
        self.assertEqual(result["abilities_disabled"], 12)
        self.assertEqual(result["channel_models_removed"], 2)
        self.assertEqual(result["channel_mapping_removed"], 1)
        self.assertEqual(result["pricing_options_sanitized"], 5)
        self.assertEqual(result["tokens_rewritten"], 2)
        self.assertEqual(result["token_caches_deleted"], 2)
        for values in captured_options.values():
            self.assertEqual(values, {"claude-sonnet-5": 1.0})
        sql = "\n".join(captured_sql)
        self.assertIn("UPDATE models SET status = 0", sql)
        self.assertIn("UPDATE abilities SET enabled = 0", sql)
        self.assertIn("UPDATE channels SET models = 'claude-sonnet-5,claude-opus-4-8'", sql)
        self.assertIn("model_mapping = '{\"custom\":\"target\"}'", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'claude-sonnet-5' WHERE id = '301'", sql)
        self.assertIn("UPDATE tokens SET model_limits = 'claude-opus-4-6' WHERE id = '302'", sql)
        self.assertEqual(captured_caches, ["key-301", "key-302"])

    def test_ensure_codex_text_channel_models_adds_openai_models_and_retires_spark_mapping(self) -> None:
        captured: list[str] = []
        self.module.mysql = lambda query: [[
            "gpt-5.5,gpt-5.4,gpt-5.3-codex-spark,gpt-5.4-openai-compact,codex-auto-review",
            '{"custom":"target","gpt-5.3-codex-spark":"gpt-5.3-spark"}',
        ]]
        self.module.mysql_exec = captured.append

        result = self.module.ensure_codex_text_channel_models()

        self.assertEqual(
            result,
            {"channel_found": 1, "models_updated": 1, "mapping_updated": 1, "models_retired": 3, "mapping_retired": 1},
        )
        sql = "\n".join(captured)
        self.assertIn("UPDATE channels SET models", sql)
        self.assertIn("gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol", sql)
        self.assertNotIn("gpt-5.3-codex-spark", sql)
        self.assertNotIn("gpt-5.3-spark", sql)
        self.assertNotIn("gpt-5.4-openai-compact", sql)
        self.assertNotIn("codex-auto-review", sql)
        self.assertIn('"custom":"target"', sql)
        self.assertIn("WHERE id = 21", sql)

    def test_ensure_codex_text_channel_models_preserves_existing_models_and_mapping(self) -> None:
        captured: list[str] = []
        self.module.mysql = lambda query: [[
            "gpt-5.5,gpt-5.4,gpt-5.6-luna,gpt-5.6-terra,gpt-5.6-sol",
            '{"custom":"target"}'
        ]]
        self.module.mysql_exec = captured.append

        result = self.module.ensure_codex_text_channel_models()

        self.assertEqual(
            result,
            {"channel_found": 1, "models_updated": 0, "mapping_updated": 0, "models_retired": 0, "mapping_retired": 0},
        )
        self.assertEqual(captured, [])


if __name__ == "__main__":
    unittest.main()
