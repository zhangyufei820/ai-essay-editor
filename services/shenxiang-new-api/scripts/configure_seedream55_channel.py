#!/usr/bin/env python3
"""Stage an admin-only image relay, then publish it against a verified minimum charge."""
from __future__ import annotations

import argparse
from decimal import Decimal, ROUND_HALF_UP
import fcntl
import getpass
import hashlib
import hmac
import json
import re
import subprocess
import sys

import sync_app_model_permissions as permissions

MODEL = permissions.SEEDREAM55_MODEL
TAG = permissions.SEEDREAM55_CHANNEL_TAG
BASE_URL = permissions.SEEDREAM55_BASE_URL
GROUPS = ",".join(permissions.SEEDREAM55_PUBLIC_GROUPS)
MINIMUM = permissions.SEEDREAM55_MINIMUM_CNY
TOKEN_NAME = permissions.TOKEN_PROFILES["image"][0]
q = permissions.sql_quote

DESCRIPTION = (
    "豆包绘图 Seedream 5.5 可以用文字画图、参考图片改图，或把一张海报拆成底图和多个图层。"
    "每张参考图 ¥0.042。每张成功输出按请求尺寸定价，1K、1.5K 和不超过 261 万像素的自定义尺寸 ¥0.1092，"
    "2K、自动尺寸和超过 261 万像素的自定义尺寸 ¥0.1932。底图和每个图层各算一张。"
    "文字识别包含在内。没有成功出图时收费为零。"
)
ENDPOINTS = '{"image-generation":"/v1/images/generations"}'


class ConfigurationError(Exception):
    pass


def channel_state() -> tuple[int, str]:
    rows = permissions.mysql(
        "SELECT id, status, type, COALESCE(base_url,''), CHAR_LENGTH(COALESCE(`key`,'')), "
        f"COALESCE(models,''), COALESCE(`group`,'') FROM channels WHERE tag = {q(TAG)}"
    )
    if not rows:
        return 0, "absent"
    if len(rows) != 1:
        raise ConfigurationError("多个渠道使用相同的 Seedream 标记")
    channel, status, kind, base, length, models, groups = rows[0]
    if status == "1" and kind == "1" and base == BASE_URL and int(length) >= 20:
        if models == "" and groups == "internal":
            return int(channel), "staged"
        if models == MODEL and groups == GROUPS:
            return int(channel), "published"
    raise ConfigurationError("Seedream 渠道的状态、域名、模型或分组异常")


def ensure_isolated(channel_id: int, *, staged: bool) -> None:
    checks = [
        f"SELECT COUNT(*) FROM channels WHERE id <> {channel_id} AND FIND_IN_SET({q(MODEL)}, REPLACE(models,' ','')) > 0",
        f"SELECT COUNT(*) FROM abilities WHERE enabled = 1 AND channel_id <> {channel_id} AND model = {q(MODEL)}",
    ]
    if staged:
        checks += [
            f"SELECT COUNT(*) FROM models WHERE deleted_at IS NULL AND model_name = {q(MODEL)}",
            f"SELECT COUNT(*) FROM abilities WHERE channel_id = {channel_id} AND enabled = 1",
        ]
    if any(permissions.mysql(query) != [["0"]] for query in checks):
        raise ConfigurationError("已有模型目录或能力与 Seedream 暂存渠道冲突")


def compatibility_price_sql() -> str:
    # Model Plaza expects a USD-compatible fallback. The relay settles the components in CNY.
    price = permissions.decimal_to_expr_literal(MINIMUM / permissions.usd_exchange_rate())
    json_path = q('$."' + MODEL + '"')
    return (
        "INSERT INTO options (`key`, `value`) VALUES ('ModelPrice', JSON_OBJECT("
        f"{q(MODEL)}, {price})) ON DUPLICATE KEY UPDATE `value` = JSON_SET(`value`, {json_path}, {price});"
    )


def stage(key: str) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9._-]{20,512}", key):
        raise ConfigurationError("上游令牌格式无效")
    channel_id, state = channel_state()
    if state == "published":
        raise ConfigurationError("该模型已开放，暂存操作不能覆盖现有渠道")
    ensure_isolated(channel_id, staged=True)
    if state == "staged":
        digests = permissions.mysql(f"SELECT SHA2(`key`,256) FROM channels WHERE id = {channel_id}")
        if not digests or not hmac.compare_digest(digests[0][0], hashlib.sha256(key.encode()).hexdigest()):
            raise ConfigurationError("暂存渠道已有另一枚令牌，需先核对渠道")
        return {"channel_id": channel_id, "state": state}
    permissions.mysql_exec(
        "START TRANSACTION;\n"
        + compatibility_price_sql()
        + "\nINSERT INTO channels (type,`key`,status,name,weight,created_time,test_time,response_time,"
        "base_url,models,`group`,model_mapping,priority,auto_ban,tag,remark) VALUES ("
        f"1,{q(key)},1,'豆包绘图 Seedream 5.5',100,UNIX_TIMESTAMP(),0,0,{q(BASE_URL)},'',"
        f"'internal','{{}}',0,0,{q(TAG)},'管理员测试通过后上架');\nCOMMIT;"
    )
    channel_id, state = channel_state()
    if state != "staged":
        raise ConfigurationError("未能确认管理员阶段")
    return {"channel_id": channel_id, "state": state}


def check_smoke(channel_id: int, log_id: int) -> None:
    if log_id <= 0:
        raise ConfigurationError("需要有效的管理员最低费用测试流水号")
    query = (
        "SELECT l.quota, l.other FROM logs l JOIN channels c ON c.id = l.channel_id "
        "JOIN tokens t ON t.id = l.token_id "
        f"WHERE l.id = {int(log_id)} AND l.channel_id = {channel_id} AND l.model_name = {q(MODEL)} "
        f"AND l.user_id = 1 AND l.type = 2 AND t.user_id = 1 AND t.name = {q(TOKEN_NAME)} "
        "AND t.deleted_at IS NULL AND t.status = 1 AND l.created_at >= c.created_time"
    )
    rows = permissions.mysql_raw(query)
    if len(rows) != 1:
        raise ConfigurationError("未找到此渠道的管理员图像令牌消费流水")
    quota, raw = rows[0]
    audit = json.loads(raw)
    units = Decimal(permissions.option_value("QuotaPerUnit") or "500000")
    expected = int((MINIMUM * units / permissions.usd_exchange_rate()).quantize(Decimal("1"), ROUND_HALF_UP))
    checks = {
        "billing_source": "wallet", "image_price_version": "seedream55-cny-20261120",
        "image_input_count": 0, "image_output_count": 1, "image_output_cap": 1,
        "image_output_tier": "low", "image_output_unit_cny": "0.1092",
        "image_input_unit_cny": "0.042", "image_total_cny": "0.1092",
        "reserved_quota": expected, "charged_quota": expected,
    }
    if int(quota) != expected or any(audit.get(k) != v for k, v in checks.items()):
        raise ConfigurationError("最低费用测试的档位、张数、钱包来源、预扣或最终扣费不一致")


def publish_sql(channel_id: int) -> str:
    # All durable visibility changes happen in one transaction. Repeating is safe after a cache failure.
    group_rows = ", ".join(
        f"({q(group)}, {q(MODEL)}, {channel_id}, 1, 0, 100, {q(TAG)})"
        for group in permissions.SEEDREAM55_PUBLIC_GROUPS
    )
    statements = [
        "START TRANSACTION;",
        f"UPDATE channels SET models = {q(MODEL)}, `group` = {q(GROUPS)} WHERE id = {channel_id};",
        f"INSERT INTO abilities (`group`,model,channel_id,enabled,priority,weight,tag) VALUES {group_rows} "
        "ON DUPLICATE KEY UPDATE enabled=1, priority=0, weight=100, tag=VALUES(tag);",
        "INSERT INTO models (model_name,description,icon,tags,vendor_id,endpoints,status,sync_official,"
        "created_time,updated_time,name_rule) "
        f"SELECT {q(MODEL)},{q(DESCRIPTION)},'Doubao','image,seedream',0,{q(ENDPOINTS)},1,0,"
        f"UNIX_TIMESTAMP(),UNIX_TIMESTAMP(),0 WHERE NOT EXISTS (SELECT 1 FROM models WHERE model_name={q(MODEL)} AND deleted_at IS NULL);",
        f"UPDATE tokens SET model_limits=CONCAT_WS(',',NULLIF(model_limits,''),{q(MODEL)}) "
        f"WHERE name={q(TOKEN_NAME)} AND deleted_at IS NULL AND model_limits_enabled=1 "
        f"AND FIND_IN_SET({q(MODEL)},COALESCE(model_limits,''))=0;",
        "COMMIT;",
    ]
    return "\n".join(statements)


def publish(log_id: int) -> dict:
    channel_id, state = channel_state()
    if state == "absent":
        raise ConfigurationError("需要先暂存 Seedream 渠道")
    ensure_isolated(channel_id, staged=state == "staged")
    check_smoke(channel_id, log_id)
    # Capture every affected managed token so retry also evicts stale cache from a previous run.
    rows = permissions.mysql_raw(
        f"SELECT `key` FROM tokens WHERE name={q(TOKEN_NAME)} AND deleted_at IS NULL AND model_limits_enabled=1"
    )
    permissions.mysql_exec(publish_sql(channel_id))
    dropped = permissions.delete_token_caches([r[0] for r in rows])
    return {"state": channel_state()[1], "channel_id": channel_id, "image_token_caches_refreshed": dropped}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--stage", action="store_true", help="read upstream key from stdin")
    actions.add_argument("--publish", type=int, metavar="ADMIN_LOG_ID")
    actions.add_argument("--status", action="store_true")
    args = parser.parse_args()
    try:
        with open("/tmp/shenxiang-new-api-model-sync.lock", "a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if args.stage:
                key = getpass.getpass("上游令牌：") if sys.stdin.isatty() else sys.stdin.readline().strip()
                result = stage(key)
            elif args.publish is not None:
                result = publish(args.publish)
            else:
                channel_id, state = channel_state()
                result = {"channel_id": channel_id, "state": state}
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except ConfigurationError as err:
        print(str(err), file=sys.stderr)
    except (ArithmeticError, KeyError, OSError, RuntimeError, ValueError, subprocess.SubprocessError):
        print("渠道操作失败，请检查数据库、缓存及金额配置后重试。", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
