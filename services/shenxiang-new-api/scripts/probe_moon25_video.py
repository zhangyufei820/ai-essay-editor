#!/usr/bin/env python3
import argparse
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

import sync_app_model_permissions as permissions

MODEL = permissions.PUBLIC_MOON25_VIDEO_MODEL


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--task-id')
    args = parser.parse_args()
    rows = permissions.mysql_raw("SELECT id, `key`, `group`, model_limits FROM tokens WHERE user_id=1 AND name='星人视频生成令牌' AND status=1 AND deleted_at IS NULL")
    if len(rows) != 1:
        raise RuntimeError('one enabled admin video token is required')
    token_id, key, group, limits = rows[0]
    print(json.dumps({'admin_token_id': token_id, 'user_id': 1, 'group': group, 'model_allowed': MODEL in limits.split(',')}), flush=True)
    if MODEL not in limits.split(','):
        raise RuntimeError('admin token lacks the requested model')

    def request(path, payload=None):
        req = urllib.request.Request('http://127.0.0.1:3120' + path, data=None if payload is None else json.dumps(payload).encode(), headers={'Authorization': 'Bearer sk-' + key.removeprefix('sk-'), 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    task = args.task_id
    if not task:
        payload = {'model': MODEL, 'prompt': 'Keep the exact shape and colors of @image1. Make a minimal product animation with a gentle slow camera push, clean white background, no extra text.', 'duration': 4, 'ratio': '16:9', 'resolution': '480P', 'references': [{'media_type': 'image', 'role': 'reference_image', 'url': 'https://api.aiphui.top/logo.png', 'alias': 'image1'}]}
        status, result = request('/v1/videos', payload)
        print(json.dumps({'submit_http': status, 'result': result}, ensure_ascii=False), flush=True)
        task = result.get('id') or result.get('task_id') or result.get('data', {}).get('task_id')
        if not task:
            raise RuntimeError('submission did not return a task ID')
        Path('/tmp/newapi-moon25-task-id').write_text(task)
    for attempt in range(90):
        status, result = request('/v1/videos/' + task)
        print(json.dumps({'poll_http': status, 'result': result}, ensure_ascii=False), flush=True)
        if result.get('status') in ('succeeded', 'completed', 'failed', 'cancelled'):
            Path('/tmp/newapi-moon25-task-result.json').write_text(json.dumps(result))
            break
        time.sleep(10)


if __name__ == '__main__':
    main()
