from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest import mock



class Gpt61SolTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('gpt61_sync_test', Path(__file__).with_name('sync_app_model_permissions.py'))
        self.sync = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.sync)

    def test_catalog_prices_and_expression_are_cny_and_include_whole_request_tiers(self):
        sync = self.sync
        prices = sync.PUBLIC_OPENAI_TEXT_MODELS['gpt-6.1-sol']
        for key, value in {'input_cny': '2', 'output_cny': '10',
                           'longcontext_input_cny': '4', 'longcontext_output_cny': '15',
                           'cache_read_cny': '0.1', 'cache_create_cny': '2.5',
                           'longcontext_cache_read_cny': '0.2', 'longcontext_cache_create_cny': '5'}.items():
            self.assertEqual(prices[key], sync.Decimal(value))
        expr = sync.openai_text_billing_expr(prices, sync.Decimal('7.3'))
        self.assertTrue(expr.startswith('len <= 272000 ? tier("base", p * '))
        self.assertIn(' : tier("longcontext", p * ', expr)
        self.assertNotIn('p - 272000', expr)
        self.assertIn('gpt-6.1-sol', sync.CODEX_ALLOWED_MODELS)

    def test_restricted_user_keys_gain_only_routable_model_and_preserve_other_limits(self):
        sync = self.sync
        captured = []
        with mock.patch.object(sync, 'mysql', return_value=[['20', 'test-key', 'custom-model,gpt-6-sol', 'discount']]), \
             mock.patch.object(sync, 'mysql_exec', side_effect=captured.append), \
             mock.patch.object(sync, 'delete_token_caches', return_value=1):
            result = sync.sync_astra_access_for_target_user_tokens({'discount': {'gpt-6-sol', 'gpt-6.1-sol'}})
        self.assertEqual(result['tokens_rewritten'], 1)
        self.assertIn("'custom-model,gpt-6-sol,gpt-6.1-sol'", captured[0])
        with mock.patch.object(sync, 'mysql', return_value=[['20', 'test-key', 'custom-model,gpt-6-sol,gpt-6.1-sol', 'discount']]), \
             mock.patch.object(sync, 'mysql_exec'), mock.patch.object(sync, 'delete_token_caches', return_value=0):
            self.assertEqual(sync.sync_astra_access_for_target_user_tokens({'discount': {'gpt-6-sol', 'gpt-6.1-sol'}})['tokens_rewritten'], 0)

    def test_ability_reconcile_keeps_each_managed_group_isolated(self):
        sync = self.sync
        rows = [[str(i), 'gpt-6.1-sol', '40', '100', f'xingren-gpt61-sol-{group}-1', group]
                for i, group in enumerate(sync.GPT6_ASTRA_MANAGED_GROUPS, 1)]
        captured = []
        def query(sql):
            if 'FROM channels' in sql:
                return rows
            if 'SELECT model_name FROM models' in sql:
                return [['gpt-6.1-sol']]
            return []
        with mock.patch.object(sync, 'mysql', side_effect=query), mock.patch.object(sync, 'mysql_exec', side_effect=captured.append), \
             mock.patch.object(sync, 'active_groups', return_value=list(sync.GPT6_ASTRA_MANAGED_GROUPS)), \
             mock.patch.object(sync, 'monitor_disabled_ability_pairs', return_value=set()):
            sync.sync_abilities()
        sql = '\n'.join(captured)
        for group in sync.GPT6_ASTRA_MANAGED_GROUPS:
            self.assertIn(f"SELECT '{group}', 'gpt-6.1-sol'", sql)
        for group in ('discount', 'plus', 'special'):
            guard = next(s for s in sql.split(';\n') if s.startswith(f"UPDATE abilities SET enabled = 0 WHERE `group` = '{group}' AND channel_id NOT IN"))
            self.assertIn("model = 'gpt-6.1-sol' AND channel_id IN", guard)

    def test_profile_preserves_existing_models_and_requires_verified_sources(self):
        sync = self.sync
        name = 'gpt61_profile_test'
        spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name('configure_gpt6_astra_channel.py'))
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        with mock.patch.dict(os.environ, {'GPT6_MODEL_PROFILE': 'sol61'}):
            spec.loader.exec_module(module)
        self.assertEqual(module.MODEL_NAME, 'gpt-6.1-sol')
        self.assertEqual(len(module.managed_tags()), 32)
        sources = tuple(module.SourceChannel(tag, 'test-key-123456789', f'https://{i}.example', i)
                        for i, tag in enumerate(module.SOURCE_CHANNEL_TAGS, 1))
        verified = {sources[0].tag}
        sql = module.build_apply_sql(sources, verified)
        self.assertIn("models='gpt-6.1-sol'", sql)
        self.assertNotIn("models='gpt-6-sol'", sql)
        self.assertNotIn("models='gpt-6-astra'", sql)
        self.assertIn("status=2, name='GPT-6.1 Sol", sql)
        _, enabled = module.discount_route_policy(sources, [], verified)
        self.assertEqual(enabled, set())
