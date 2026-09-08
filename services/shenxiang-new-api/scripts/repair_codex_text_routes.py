#!/usr/bin/env python3
"""Explicit, probe-gated migration of the three public Codex text tiers.

No aliases, price changes, normal-user inference keys, or credential output.
Existing provider records retain their credentials; scoped clones copy secrets
inside MySQL, never into an artifact. Run after releasing the matching policy.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import sys

import configure_plus_text_channel as locks
import provider_monitor as monitor
import sync_app_model_permissions as sync

MODELS = ("gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5", "gpt-5.4-mini")
SOURCE_MODELS = {
    "xingren-plus-text-wangwang": ("gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5", "gpt-5.4-mini"),
    "xingren-discount-text-aihub": ("gpt-5.6", "gpt-5.6-sol"),
}
# target tag, exact group, source tag, priority
CLONES = (
    ("xingren-discount-text-wangwang-codex", "discount", "xingren-plus-text-wangwang", 50),
    ("xingren-plus-text-aihub-codex", "plus", "xingren-discount-text-aihub", 25),
    ("xingren-default-text-wangwang-codex", "default", "xingren-plus-text-wangwang", 100),
    ("xingren-default-text-aihub-codex", "default", "xingren-discount-text-aihub", 80),
)
q = sync.sql_quote


def load_sources() -> dict[str, dict]:
    rows = sync.mysql("SELECT id,tag,base_url,`key` FROM channels WHERE tag IN (" + ",".join(q(tag) for tag in SOURCE_MODELS) + ")")
    sources = {}
    for channel_id, tag, base_url, key in rows:
        if tag in sources:
            raise RuntimeError("duplicate source identity")
        if not base_url.startswith("https://") or not key or "\n" in key:
            raise RuntimeError("invalid source connection")
        sources[tag] = {"id": int(channel_id), "base_url": base_url, "key": key}
    if set(sources) != set(SOURCE_MODELS):
        raise RuntimeError("missing source identity")
    return sources


def verify_sources(sources: dict[str, dict]) -> list[dict]:
    def probe_source(tag):
        source = sources[tag]
        results = []
        for model in SOURCE_MODELS[tag]:
            result = monitor.request_responses(source["base_url"], source["key"], model)
            results.append({"source": tag, "model": model, **result})
        return results
    # Serial within one credential to avoid manufacturing concurrency errors.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = [result for batch in pool.map(probe_source, SOURCE_MODELS) for result in batch]
    if not all(result["ok"] for result in results):
        print(json.dumps({"verified": False, "probes": results}), flush=True)
        raise RuntimeError("required route did not complete its Responses probe; no changes applied")
    return results


def build_sql(sources: dict[str, dict]) -> str:
    """Use source SELECTs so neither SQL nor logs contain an upstream secret."""
    statements = ["START TRANSACTION;"]
    for index, (tag, group, source_tag, priority) in enumerate(CLONES):
        source_id = int(sources[source_tag]["id"])
        models = ",".join(SOURCE_MODELS[source_tag])
        mapping = json.dumps({model: model for model in SOURCE_MODELS[source_tag]}, separators=(",", ":"))
        variable = f"@codex_repair_{index}"
        source_guard = f"source.id={source_id} AND source.tag={q(source_tag)} AND source.type=1"
        statements.extend([
            f"SET {variable} := (SELECT MIN(id) FROM channels WHERE tag={q(tag)});",
            "INSERT INTO channels (type,`key`,status,name,weight,created_time,base_url,models,`group`,model_mapping,priority,auto_ban,tag,settings) "
            + f"SELECT 1,source.`key`,1,{q('Codex '+group+' 可用链路 '+str(index+1))},100,UNIX_TIMESTAMP(),source.base_url,{q(models)},{q(group)},{q(mapping)},{priority},1,{q(tag)},'{{}}' FROM channels source WHERE {source_guard} AND {variable} IS NULL;",
            f"SET {variable} := IFNULL({variable},LAST_INSERT_ID());",
            f"UPDATE channels target JOIN channels source ON {source_guard} SET target.`key`=source.`key`,target.base_url=source.base_url,target.type=1,target.status=1,target.models={q(models)},target.`group`={q(group)},target.model_mapping={q(mapping)},target.priority={priority},target.weight=100 WHERE target.id={variable} AND target.tag={q(tag)};",
            f"UPDATE abilities SET enabled=0 WHERE channel_id={variable} AND (`group`<>{q(group)} OR model NOT IN ({','.join(q(m) for m in SOURCE_MODELS[source_tag])}));",
        ])
        for model in SOURCE_MODELS[source_tag]:
            statements.append(f"INSERT INTO abilities (`group`,model,channel_id,enabled,priority,weight,tag) VALUES ({q(group)},{q(model)},{variable},1,{priority},100,{q(tag)}) ON DUPLICATE KEY UPDATE enabled=1,priority=VALUES(priority),weight=100,tag=VALUES(tag);")
    # Adopt only successfully tested models on existing routes. Other model
    # mappings/abilities are left to their current owners.
    for tag, models in SOURCE_MODELS.items():
        source_id = int(sources[tag]["id"])
        group = "plus" if tag == "xingren-plus-text-wangwang" else "discount"
        priority = 40
        statements.append(f"UPDATE channels SET status=1,priority={priority} WHERE id={source_id} AND tag={q(tag)} AND `group`={q(group)};")
        for model in models:
            statements.append(f"UPDATE channels SET models=IF(FIND_IN_SET({q(model)},models)>0,models,CONCAT_WS(',',NULLIF(models,''),{q(model)})) WHERE id={source_id} AND tag={q(tag)};")
            statements.append(f"INSERT INTO abilities (`group`,model,channel_id,enabled,priority,weight,tag) VALUES ({q(group)},{q(model)},{source_id},1,{priority},100,{q(tag)}) ON DUPLICATE KEY UPDATE enabled=1,priority=VALUES(priority),weight=100,tag=VALUES(tag);")
    statements.append("COMMIT;")
    return "\n".join(statements)


def backfill_monthly_tokens() -> dict:
    # One-time migration only. The Go monthly-card service remains the owner
    # of the full whitelist and subscription eligibility for future tokens.
    rows = sync.mysql("SELECT t.id,t.`key`,t.model_limits FROM tokens t JOIN users u ON u.id=t.user_id "
        "WHERE t.deleted_at IS NULL AND t.status=1 AND t.model_limits_enabled=1 AND u.deleted_at IS NULL AND u.status=1 "
        "AND t.user_id<>1 AND t.name IN ('月卡专用 Key','¥500 月卡专用') "
        "AND (FIND_IN_SET('default',REPLACE(t.`group`,' ',''))>0 OR FIND_IN_SET('discount',REPLACE(t.`group`,' ',''))>0 OR FIND_IN_SET('plus',REPLACE(t.`group`,' ',''))>0)")
    statements = ["START TRANSACTION;"]
    keys = []
    for token_id, key, old in rows:
        updated = old
        for model in ("gpt-6-astra", *MODELS):
            updated = sync.append_model_limit(updated, model)
        if updated != old:
            statements.append(f"UPDATE tokens SET model_limits={q(updated)} WHERE id={int(token_id)} AND model_limits={q(old)} AND status=1 AND deleted_at IS NULL;")
            keys.append(key)
    statements.append("COMMIT;")
    sync.mysql_exec("\n".join(statements))
    return {"monthly_tokens_updated": len(keys), "token_caches_deleted": sync.delete_token_caches(keys)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with locks.model_sync_lock():
        sources = load_sources()
        tags = tuple(tag for tag, _group, _source, _priority in CLONES)
        duplicates = sync.mysql("SELECT tag,COUNT(*) FROM channels WHERE tag IN (" + ",".join(q(tag) for tag in tags) + ") GROUP BY tag HAVING COUNT(*)>1")
        if duplicates:
            raise RuntimeError("duplicate managed route identity")
        results = verify_sources(sources)
        report = {"verified": True, "applied": args.apply, "probes": results}
        if args.apply:
            if load_sources() != sources:
                raise RuntimeError("source identity changed during probing; retry without applying")
            sync.mysql_exec(build_sql(sources))
            # Release only circuits whose exact source/model just completed a
            # probe. Do not erase other providers' failure history.
            state = monitor.load_state()
            for tag, models in SOURCE_MODELS.items():
                family = "plus_text" if tag == "xingren-plus-text-wangwang" else "discount_text"
                for model in models:
                    circuit = monitor.managed_ability_state(state, family, model, sources[tag]["id"])
                    circuit.update(auto_disabled=False, disabled_at=0, last_action="verified_codex_repair")
            monitor.save_state(state)
            report.update(backfill_monthly_tokens())
            sync.sync_user_codex_tokens()
            sync.sync_abilities()
        print(json.dumps(report), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        # Avoid tracebacks from DB/HTTP libraries containing credentials.
        print("Codex route repair failed; inspect sanitized probe results and route guards.", file=sys.stderr)
        raise SystemExit(1)
