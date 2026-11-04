#!/usr/bin/env python3
"""Stage/publish the two isolated upscalers without putting credentials in Git."""
from __future__ import annotations

import argparse
import datetime
import fcntl
import json
import os
import stat
from pathlib import Path

import sync_app_model_permissions as permissions
from configure_gpt_image25_channel import fetch_upstream_models, normalize_base_url, validate_api_key

PUBLIC_GROUPS = permissions.UPSCALE_PUBLIC_CHANNEL_GROUPS


def read_private_json(path: str) -> dict:
    file = Path(path)
    if file.is_symlink() or not stat.S_ISREG(file.stat().st_mode) or file.stat().st_mode & 0o077:
        raise ValueError("配置文件必须为仅本人可读写的普通文件")
    data = json.loads(file.read_text())
    if not isinstance(data, dict):
        raise ValueError("配置必须为对象")
    return data


def validate_pricing(config: dict) -> None:
    # Use the same fail-closed parser as periodic reconciliation.
    if not permissions.upscale_pricing_config(json.dumps(config)):
        raise ValueError("请提供明确的像素积分人民币单价，不能使用固定倍数次价")


def snapshot() -> Path:
    root = Path("/opt/shenxiang-new-api/release-state")
    root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    path = root / ("upscale-before-" + stamp + ".json")
    tags = ",".join(permissions.sql_quote(v["tag"]) for v in permissions.UPSCALE_MODEL_CONFIGS.values())
    names = ",".join(permissions.sql_quote(v) for v in permissions.UPSCALE_MODELS)
    queries = {
        "channels": "SELECT JSON_OBJECT('id',id,'key',`key`,'status',status,'name',name,'base_url',base_url,'models',models,'group',`group`,'mapping',model_mapping,'tag',tag,'priority',priority,'weight',weight) FROM channels WHERE tag IN (" + tags + ")",
        "models": "SELECT JSON_OBJECT('id',id,'model',model_name,'status',status,'deleted_at',deleted_at,'description',description,'endpoints',endpoints) FROM models WHERE model_name IN (" + names + ")",
        "options": "SELECT JSON_OBJECT('key',`key`,'value',value) FROM options WHERE `key` IN ('UpscalePricingCNY','ModelPrice','ModelRatio','CompletionRatio')",
        "tokens": "SELECT JSON_OBJECT('id',id,'limits',model_limits,'enabled',model_limits_enabled) FROM tokens WHERE deleted_at IS NULL AND name='星人图像生成令牌'",
    }
    data = {name: [json.loads(row[0]) for row in permissions.mysql_raw(query)] for name, query in queries.items()}
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f, ensure_ascii=False)
    return path


def stage_sql(keys: dict[str, str], base: str, pricing: dict, token_id: str, limits: str) -> str:
    q = permissions.sql_quote
    sql = ["START TRANSACTION;", "SET @now := UNIX_TIMESTAMP();", permissions.json_option_upsert_statement("UpscalePricingCNY", pricing)]
    for name, spec in permissions.UPSCALE_MODEL_CONFIGS.items():
        key = keys[name]
        mapping = json.dumps({name: spec["upstream_model"]}, ensure_ascii=False, separators=(",", ":"))
        tag = q(spec["tag"])
        sql.extend([
            "SET @upscale_channel := (SELECT MIN(id) FROM channels WHERE tag=" + tag + ");",
            "INSERT INTO channels (type,`key`,status,name,weight,created_time,test_time,response_time,base_url,models,`group`,model_mapping,priority,auto_ban,tag,remark) SELECT " + ",".join(["1", q(key), "1", q("高清放大·" + name), "100", "@now", "0", "0", q(base), q(name), "'internal'", q(mapping), "0", "0", tag, q("像素积分人民币计费；受理后失败不自动退款")]) + " WHERE @upscale_channel IS NULL;",
            "SET @upscale_channel := IFNULL(@upscale_channel,LAST_INSERT_ID());",
            "UPDATE channels SET type=1,`key`=" + q(key) + ",status=1,name=" + q("高清放大·" + name) + ",models=" + q(name) + ",base_url=" + q(base) + ",`group`='internal',model_mapping=" + q(mapping) + ",auto_ban=0,priority=0,weight=100 WHERE id=@upscale_channel;",
            "UPDATE abilities SET enabled=0 WHERE channel_id=@upscale_channel;",
            "INSERT INTO abilities (`group`,model,channel_id,enabled,priority,weight,tag) VALUES ('internal'," + q(name) + ",@upscale_channel,1,0,100," + tag + ") ON DUPLICATE KEY UPDATE enabled=1,priority=0,weight=100,tag=VALUES(tag);",
        ])
    models = permissions.sanitize_token_models(limits.split(",") + list(permissions.UPSCALE_MODELS))
    sql.extend(["UPDATE tokens SET model_limits=" + q(",".join(models)) + ",model_limits_enabled=1 WHERE id=" + str(int(token_id)) + " AND user_id=1;", "COMMIT;"])
    return "\n".join(sql)


def publish() -> dict:
    tags = ",".join(permissions.sql_quote(v["tag"]) for v in permissions.UPSCALE_MODEL_CONFIGS.values())
    counts = permissions.mysql("SELECT COUNT(*) FROM channels WHERE tag IN (" + tags + ") AND status=1 AND CHAR_LENGTH(`key`)>20")
    if not counts or counts[0][0] != "2" or not permissions.upscale_pricing_config():
        raise ValueError("两条放大链路或价格配置尚未准备好")
    try:
        permissions.mysql_exec("UPDATE channels SET `group`=" + permissions.sql_quote(PUBLIC_GROUPS) + " WHERE tag IN (" + tags + ") AND status=1;")
        permissions.ensure_upscale_models()
        permissions.sync_public_image_pricing()
        permissions.sync_abilities()
        profiles = permissions.model_lists()
        if not set(permissions.UPSCALE_MODELS).issubset(profiles["image"]):
            raise ValueError("放大模型未进入公共图像目录")
        return permissions.sync_user_image_tokens(profiles)
    except Exception:
        permissions.mysql_exec("START TRANSACTION; UPDATE channels SET `group`='internal' WHERE tag IN (" + tags + "); UPDATE abilities SET enabled=0 WHERE tag IN (" + tags + ") AND `group`<>'internal'; COMMIT;")
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", action="store_true")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--secrets-file")
    parser.add_argument("--pricing-file")
    args = parser.parse_args()
    if args.stage == args.publish:
        raise ValueError("必须选择暂存或发布")
    pricing, keys, base = {}, {}, ""
    if args.stage:
        if not args.secrets_file or not args.pricing_file:
            raise ValueError("暂存需要私密令牌文件和已确认的价格文件")
        secret = read_private_json(args.secrets_file)
        pricing = read_private_json(args.pricing_file)
        validate_pricing(pricing)
        base = normalize_base_url(secret.get("base_url", "https://api.smile-ai-studio.com"))
        for name, spec in permissions.UPSCALE_MODEL_CONFIGS.items():
            key = validate_api_key(str(secret.get("precision_key" if name == "精准放大" else "creative_key", "")))
            if spec["upstream_model"] not in fetch_upstream_models(base, key):
                raise ValueError("对应令牌尚未开通所需放大模型")
            keys[name] = key
    if not args.apply:
        print(json.dumps({"dry_run": True, "action": "stage" if args.stage else "publish", "models": list(permissions.UPSCALE_MODELS), "pricing_mode": pricing.get("mode")}, ensure_ascii=False))
        return
    with open("/tmp/shenxiang-new-api-model-sync.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        for spec in permissions.UPSCALE_MODEL_CONFIGS.values():
            count = permissions.mysql("SELECT COUNT(*) FROM channels WHERE tag=" + permissions.sql_quote(spec["tag"]))
            if count and int(count[0][0]) > 1:
                raise ValueError("放大链路配置不唯一，已停止")
            if args.stage:
                existing = permissions.mysql("SELECT REPLACE(COALESCE(`group`,''),' ','') FROM channels WHERE tag=" + permissions.sql_quote(spec["tag"]))
                if existing and existing[0][0] != "internal":
                    raise ValueError("已发布的放大链路不能重新暂存覆盖")
        before = snapshot()
        if args.stage:
            rows = permissions.mysql_raw("SELECT id,`key`,COALESCE(model_limits,'') FROM tokens WHERE user_id=1 AND deleted_at IS NULL AND status=1 AND name='星人图像生成令牌'")
            if len(rows) != 1:
                raise ValueError("管理员图像测试令牌缺失或不唯一")
            token_id, token_key, limits = rows[0]
            permissions.mysql_exec(stage_sql(keys, base, pricing, token_id, limits))
            permissions.ensure_upscale_models()
            permissions.sync_public_image_pricing()
            permissions.delete_token_caches([token_key])
            result = {"staged": 2}
        else:
            result = publish()
        print(json.dumps({"ok": True, "snapshot": str(before), "result": result}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never include SQL, connection details, credentials or upstream error bodies.
        print(json.dumps({"ok": False, "error": str(error) if isinstance(error, ValueError) else "放大配置操作失败，请核对受保护的服务端记录"}, ensure_ascii=False))
        raise SystemExit(1)
