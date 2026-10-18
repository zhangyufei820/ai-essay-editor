from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('smoke_test.sh')


class SmokeModelSelectionTest(unittest.TestCase):
    def run_smoke(self, models):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / '.env').write_text('')
            binary = root / 'bin'
            binary.mkdir()
            docker = binary / 'docker'
            docker.write_text('#!/bin/sh\nprintf "52\\t1\\t1\\tsk-test-admin-fixture\\n"\n')
            docker.chmod(0o755)
            curl = binary / 'curl'
            curl.write_text('#!' + sys.executable + '''
import json,os,sys
args=sys.argv[1:]
url=args[-1]
if url.endswith('/v1/models'):
 print(json.dumps({'data':[{'id':m} for m in json.loads(os.environ['TEST_MODELS'])]}))
elif url.endswith('/v1/responses'):
 payload=json.loads(args[args.index('-d')+1])
 with open(os.environ['TEST_INFERENCE_LOG'],'w') as f: f.write(payload['model'])
 print(json.dumps({'output':[{'content':[{'text':'OK'}]}]}))
else:
 print('HTTP/1.1 200 OK')
''')
            curl.chmod(0o755)
            log = root / 'inference'
            env = {**os.environ, 'PATH': str(binary) + ':' + os.environ['PATH'],
                   'APP_DIR': str(root), 'TEST_MODELS': json.dumps(models), 'TEST_INFERENCE_LOG': str(log)}
            result = subprocess.run(['bash', str(SCRIPT), '--profile', 'codex', '--mode', 'responses'],
                                    env=env, text=True, capture_output=True)
            return result, log.read_text() if log.exists() else None

    def test_restricted_admin_token_uses_a_visible_routable_model(self):
        result, model = self.run_smoke(['gpt-6-sol', 'gpt-5.6'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(model, 'gpt-6-sol')
        self.assertNotIn('sk-test-admin-fixture', result.stdout + result.stderr)

    def test_historical_default_is_retained_when_permitted(self):
        result, model = self.run_smoke(['gpt-6-sol', 'gpt-5.5'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(model, 'gpt-5.5')

    def test_empty_or_non_codex_model_list_fails_before_inference(self):
        for models in ([], ['gpt-image-2-4K'], ['claude-sonnet-4-6']):
            with self.subTest(models=models):
                result, model = self.run_smoke(models)
                self.assertNotEqual(result.returncode, 0)
                self.assertIsNone(model)


if __name__ == '__main__':
    unittest.main()
