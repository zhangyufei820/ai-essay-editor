#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import getpass
import json
import os
from datetime import datetime, timezone

import sync_app_model_permissions as permissions
from configure_gpt_image25_channel import fetch_upstream_models, normalize_base_url, validate_api_key


MODEL = permissions.PUBLIC_MOON25_VIDEO_MODEL
UPSTREAM = permissions.UPSTREAM_MOON25_VIDEO_MODEL
TAG = permissions.PUBLIC_MOON25_VIDEO_CHANNEL_TAG
GROUPS = 'default,standard,pro,code,internal'


def channel_rows():
    return permissions.mysql_raw(
        'SELECT id, status, `group`, models, model_mapping, base_url FROM channels WHERE tag = '
        + permissions.sql_quote(TAG)
    )


def stage(key):
    quote = permissions.sql_quote
    rows = channel_rows()
    if rows:
        raise ValueError('channel already exists; inspect it before staging again')
    conflicts = permissions.mysql('SELECT COUNT(*) FROM channels WHERE FIND_IN_SET(' + quote(MODEL) + ", REPLACE(COALESCE(models, ''), ' ', '')) > 0")
    if conflicts and int(conflicts[0][0]):
        raise ValueError('model is already configured on another channel')
    if UPSTREAM not in fetch_upstream_models('https://moonapix.com', key):
        raise ValueError('the required upstream model is absent')
    tokens = permissions.mysql_raw("SELECT id, `key`, model_limits FROM tokens WHERE user_id=1 AND name='星人视频生成令牌' AND deleted_at IS NULL AND status=1")
    if len(tokens) != 1:
        raise ValueError('one enabled admin video token is required')
    token_id, token_key, limits = tokens[0]
    prices = permissions.parse_json_option('ModelPrice')
    snapshot = {'time': datetime.now(timezone.utc).isoformat(), 'model': MODEL, 'channels': rows, 'previous_price': prices.get(MODEL), 'admin_token_id': token_id, 'admin_model_limits': limits}
    log_path = permissions.ROOT / 'logs' / ('moon25-before-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '.json')
    with log_path.open('x', encoding='utf-8') as stream:
        json.dump(snapshot, stream, ensure_ascii=False, indent=2)
    prices[MODEL] = permissions.decimal_to_float(permissions.Decimal('0.50') / permissions.usd_exchange_rate())
    model_limits = ','.join(dict.fromkeys([*filter(None, limits.split(',')), MODEL]))
    mapping = json.dumps({MODEL: UPSTREAM}, separators=(',', ':'))
    values = [55, key, 1, '星人 Moon Video 2.5 480P', 100, 'https://moonapix.com', MODEL, 'internal', mapping, 0, 1, TAG, '人民币 ¥0.50/秒；480P；4-30秒；30图；音频接口拒绝，暂不开放']
    sql = [
        'START TRANSACTION;',
        'INSERT INTO channels (type, `key`, status, name, weight, base_url, models, `group`, model_mapping, priority, auto_ban, tag, remark, created_time, test_time, response_time) VALUES (' + ','.join(str(value) if isinstance(value, int) else quote(value) for value in values) + ', UNIX_TIMESTAMP(),0,0);',
        'SET @moon_channel := LAST_INSERT_ID();',
        'INSERT INTO abilities (`group`, model, channel_id, enabled, priority, weight, tag) VALUES (' + ','.join([quote('internal'), quote(MODEL), '@moon_channel', '1', '0', '100', quote(TAG)]) + ');',
        permissions.json_option_upsert_statement('ModelPrice', prices),
        'UPDATE tokens SET model_limits_enabled=1, model_limits=' + quote(model_limits) + ' WHERE id=' + str(int(token_id)) + ' AND user_id=1;',
        'COMMIT;',
    ]
    permissions.mysql_exec('\n'.join(sql))
    permissions.delete_token_caches([token_key])
    return {'action': 'staged', 'model': MODEL, 'snapshot': str(log_path)}


def publish():
    rows = channel_rows()
    if len(rows) != 1 or rows[0][1] != '1' or rows[0][2] not in ('internal', GROUPS) or rows[0][3] != MODEL:
        raise ValueError('the staged channel is incomplete')
    if json.loads(rows[0][4]) != {MODEL: UPSTREAM}:
        raise ValueError('model mapping differs from the verified contract')
    normalize_base_url(rows[0][5])
    successes = permissions.mysql("SELECT COUNT(*) FROM tasks WHERE user_id=1 AND channel_id=" + str(int(rows[0][0])) + " AND status='SUCCESS' AND properties LIKE '%" + MODEL + "%'")
    if not successes or int(successes[0][0]) < 1:
        raise ValueError('a successful admin task through the staged channel is required before publishing')
    permissions.mysql_exec('UPDATE channels SET `group`=' + permissions.sql_quote(GROUPS) + ' WHERE id=' + str(int(rows[0][0])) + ';')
    permissions.ensure_public_video_models()
    permissions.sync_public_video_pricing()
    permissions.sync_abilities()
    profiles = permissions.model_lists()
    if MODEL not in profiles['video']:
        raise ValueError('published video permissions are incomplete')
    return {'action': 'published', 'model': MODEL, **permissions.sync_user_video_tokens(profiles)}


def main():
    parser = argparse.ArgumentParser(description='Stage or publish Moon Video 2.5 480P')
    parser.add_argument('action', choices=('stage', 'publish'))
    args = parser.parse_args()
    with open('/tmp/shenxiang-new-api-model-sync.lock', 'a+') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == 'stage':
            key = validate_api_key(os.environ.get('MOON25_API_KEY') or getpass.getpass('Upstream key: '))
            result = stage(key)
        else:
            result = publish()
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
