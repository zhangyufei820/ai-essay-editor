from __future__ import annotations
import importlib.util
import sys
import os
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS=Path(__file__).parent

def load(name,filename,profile=None):
 spec=importlib.util.spec_from_file_location(name,SCRIPTS/filename)
 mod=importlib.util.module_from_spec(spec);sys.modules[name]=mod
 with mock.patch.dict(os.environ,{'GPT6_MODEL_PROFILE':profile} if profile else {}):spec.loader.exec_module(mod)
 return mod

class Gpt62Tests(unittest.TestCase):
 def setUp(self):self.sync=load('gpt62_sync_test','sync_app_model_permissions.py')
 def test_exact_rmb_prices_whole_request_tiers_and_12h(self):
  s=self.sync
  for model,scale in [('gpt-6.2-sol',1),('gpt-6.2-astra',4)]:
   p=s.PUBLIC_OPENAI_TEXT_MODELS[model]
   for key,val in {'input_cny':'2','output_cny':'10','cache_read_cny':'.1','cache_create_cny':'2.5','cache_create_12h_cny':'5','longcontext_input_cny':'4','longcontext_output_cny':'15','longcontext_cache_read_cny':'.2','longcontext_cache_create_cny':'5','longcontext_cache_create_12h_cny':'10'}.items():self.assertEqual(p[key],s.Decimal(val)*scale)
   expr=s.openai_text_billing_expr(p,s.Decimal('7.3'))
   self.assertTrue(expr.startswith('len <= 272000 ? tier("base",'))
   self.assertEqual(expr.count('cc12h *'),2)
   self.assertNotIn('p - 272000',expr)
   self.assertIn(model,s.CODEX_ALLOWED_MODELS)
 def test_profile_routes_three_suppliers_in_measured_order(self):
  for profile,variant in [('sol62','sol'),('astra62','astra')]:
   m=load('gpt62_'+profile,'configure_gpt6_astra_channel.py',profile)
   self.assertEqual(m.MODEL_NAME,'gpt-6.2-'+variant)
   self.assertEqual(len(m.managed_tags()),24)
   self.assertEqual(m.SOURCE_CHANNEL_TAGS[-1],m.PDHLZY_SOURCE_TAG)
   self.assertEqual(m.SOURCE_CHANNEL_TAGS[0],m.ASTRA_SOURCE_TAG if variant=='sol' else m.WANGWANG_SOURCE_TAG)
   sources=tuple(m.SourceChannel(tag,'test-key-123456789',f'https://{i}.example',i) for i,tag in enumerate(m.SOURCE_CHANNEL_TAGS,1))
   sql=m.build_apply_sql(sources,{sources[0].tag})
   self.assertNotIn("models='gpt-6.1-sol'",sql)
   self.assertIn("status=2, name='GPT-6.2",sql)
   priorities,enabled=m.discount_route_policy(sources,[],{sources[0].tag})
   self.assertEqual(enabled,{sources[0].tag})
   self.assertGreater(priorities[sources[0].tag],priorities[sources[-1].tag])
 def test_tool_probe_stops_after_result_without_altering_other_profiles(self):
  m=load('gpt62_astra_tool_probe','configure_gpt6_astra_channel.py','astra62')
  source=m.SourceChannel(m.WANGWANG_SOURCE_TAG,'test-key-123456789','https://test.example',1)
  calls=[]
  def completed(_source,body):
   import copy
   calls.append(copy.deepcopy(body))
   if len(calls)==1:return {'output':[{'type':'function_call','name':'audit_sum','call_id':'test-call','arguments':'{"a":1,"b":1}'}]}
   return {'output':[{'type':'message','content':[{'type':'output_text','text':'2'}]}]}
  with mock.patch.object(m,'codex_completed_response',side_effect=completed):self.assertTrue(m.probe_codex_tool_roundtrip(source))
  self.assertEqual(calls[0]['tool_choice'],{'type':'function','name':'audit_sum'})
  self.assertEqual(calls[1]['tool_choice'],'none')
  self.assertTrue(any(x.get('type')=='function_call_output' and x['output']=='2' for x in calls[1]['input']))
 def test_special_and_discount_ability_guards_keep_62(self):
  s=self.sync
  rows=[[str(i),model,'40','100',tag,s.GPT62_CHANNEL_GROUP_BY_TAG[tag]] for i,(tag,model) in enumerate(s.GPT62_CHANNEL_MODEL_BY_TAG.items(),1)]
  captured=[]
  def query(sql):
   if 'FROM channels' in sql:return rows
   if 'SELECT model_name FROM models' in sql:return [[m] for m in s.GPT62_MODELS]
   return []
  with mock.patch.object(s,'mysql',side_effect=query),mock.patch.object(s,'mysql_exec',side_effect=captured.append),mock.patch.object(s,'active_groups',return_value=list(s.GPT6_ASTRA_MANAGED_GROUPS)),mock.patch.object(s,'monitor_disabled_ability_pairs',return_value=set()):s.sync_abilities()
  sql='\n'.join(captured)
  for group in ('discount','plus','special'):
   guard=next(x for x in sql.split(';\n') if x.startswith(f"UPDATE abilities SET enabled = 0 WHERE `group` = '{group}' AND channel_id NOT IN"))
   for model in s.GPT62_MODELS:self.assertIn("model = '"+model+"' AND channel_id IN",guard)
  for group in s.GPT6_ASTRA_MANAGED_GROUPS:
   for model in s.GPT62_MODELS:self.assertIn(f"SELECT '{group}', '{model}'",sql)
 def test_restricted_special_token_gains_only_routable_62(self):
  s=self.sync;captured=[]
  with mock.patch.object(s,'mysql',return_value=[['42','secret-test-key','custom-model','special']]),mock.patch.object(s,'mysql_exec',side_effect=captured.append),mock.patch.object(s,'delete_token_caches',return_value=1):
   s.sync_astra_access_for_target_user_tokens({'special':set(s.GPT62_MODELS)})
  self.assertIn("'custom-model,gpt-6.2-sol,gpt-6.2-astra'",captured[0])
 def test_scoped_price_update_preserves_other_models(self):
  s=self.sync;written={}
  options={'ModelRatio':{'unrelated':3},'CompletionRatio':{'unrelated':9},'CacheRatio':{},'CreateCacheRatio':{},'ModelPrice':{},'billing_setting.billing_mode':{},'billing_setting.billing_expr':{}}
  with mock.patch.object(s,'parse_json_option',side_effect=lambda key:dict(options[key])),mock.patch.object(s,'parse_json_string_option',side_effect=lambda key:dict(options[key])),mock.patch.object(s,'usd_exchange_rate',return_value=s.Decimal('7.3')),mock.patch.object(s,'upsert_json_option',side_effect=lambda k,v:written.update({k:v})),mock.patch.object(s,'upsert_json_string_option',side_effect=lambda k,v:written.update({k:v})):
   s.sync_public_openai_text_pricing(s.GPT62_MODELS)
  self.assertEqual(written['ModelRatio']['unrelated'],3)
  self.assertEqual(set(written['billing_setting.billing_mode']),set(s.GPT62_MODELS))

if __name__=='__main__':unittest.main()
