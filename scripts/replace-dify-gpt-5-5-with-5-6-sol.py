#!/usr/bin/env python3
"""Replace GPT 5.5 in current Dify workflows and its registered model.

Dry-run by default. --apply writes graph backups and all changes in one transaction.
Historical workflow versions are intentionally retained for audit and rollback.
"""

import argparse
import base64
import json
import shlex
import subprocess
from datetime import datetime, timezone


OLD = "gpt-5.5"
NEW = "gpt-5.6-sol"
PROVIDER = "langgenius/openai_api_compatible/openai_api_compatible"


def query(server, sql):
    docker = ["docker", "exec", "-i", "docker-db_postgres-1", "psql",
              "-U", "shenxiang", "-d", "shenxiang", "-At", "-F", "|",
              "-v", "ON_ERROR_STOP=1"]
    command = docker if server == "local" else ["ssh", "-o", "ConnectTimeout=8", server, shlex.join(docker)]
    return subprocess.run(command, input=sql, text=True, capture_output=True, check=True).stdout.strip()


def current_workflows(server):
    rows = query(server, f"""
SELECT w.id, a.id, a.name, md5(w.graph),
       replace(encode(convert_to(w.graph, 'UTF8'), 'base64'), E'\n', '')
FROM workflows w JOIN apps a ON a.id = w.app_id
WHERE (w.id = a.workflow_id OR w.version = 'draft')
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(w.graph::jsonb->'nodes') n
    WHERE n->'data'->'model'->>'name' = '{OLD}'
      AND n->'data'->'model'->>'provider' = '{PROVIDER}'
  ) ORDER BY a.name, w.id;
""")
    changes = []
    for row in rows.splitlines():
        workflow_id, app_id, app_name, digest, encoded = row.split("|", 4)
        graph = json.loads(base64.b64decode(encoded))
        count = 0
        for node in graph["nodes"]:
            model = node.get("data", {}).get("model")
            if model and model.get("name") == OLD and model.get("provider") == PROVIDER:
                model["name"] = NEW
                count += 1
        if not count:
            raise RuntimeError("Matched workflow has no target model node")
        changes.append((workflow_id, app_id, app_name, digest,
                        json.dumps(graph, ensure_ascii=False, separators=(",", ":")), count))
    return changes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="root@43.154.111.156")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    changes = current_workflows(args.server)
    if not changes:
        raise RuntimeError("No current GPT 5.5 workflow nodes found; inspect before retrying")
    state = query(args.server, f"""
SELECT 'model', count(*) FROM provider_models WHERE provider_name='{PROVIDER}' AND model_name='{OLD}'
UNION ALL SELECT 'setting', count(*) FROM provider_model_settings WHERE provider_name='{PROVIDER}' AND model_name='{OLD}'
UNION ALL SELECT 'credential', count(*) FROM provider_model_credentials WHERE provider_name='{PROVIDER}' AND model_name='{OLD}'
UNION ALL SELECT 'replacement', count(*) FROM provider_models WHERE provider_name='{PROVIDER}' AND model_name='{NEW}';
""")
    counts = dict(line.split("|") for line in state.splitlines())
    if counts != {"model": "1", "setting": "1", "credential": "1", "replacement": "0"}:
        raise RuntimeError(f"Unexpected Dify model registry state: {counts}")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "workflow_count": len(changes),
                      "node_count": sum(item[5] for item in changes),
                      "apps": sorted({item[2] for item in changes})}, ensure_ascii=False))
    if not args.apply:
        return

    label = "codex-gpt-5-5-to-5-6-sol-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    sql = ["BEGIN;", "SET LOCAL lock_timeout = '5s';"]
    for workflow_id, app_id, app_name, digest, graph, _ in changes:
        encoded = base64.b64encode(graph.encode()).decode()
        safe_name = app_name.replace("'", "''")
        sql.append(f"""
DO $$ BEGIN
  IF (SELECT md5(graph) FROM workflows WHERE id='{workflow_id}') IS DISTINCT FROM '{digest}' THEN
    RAISE EXCEPTION 'Workflow changed during GPT model migration: {workflow_id}';
  END IF;
END $$;
INSERT INTO codex_dify_workflow_graph_backups (backup_label, workflow_id, app_id, app_name, graph)
SELECT '{label}', id, app_id, '{safe_name}', graph FROM workflows WHERE id='{workflow_id}';
UPDATE workflows SET graph=convert_from(decode('{encoded}', 'base64'), 'UTF8'), updated_at=now()
WHERE id='{workflow_id}';
""")
    sql.append(f"""
DO $$ BEGIN
  IF (SELECT count(*) FROM provider_models WHERE provider_name='{PROVIDER}' AND model_name='{OLD}') <> 1
     OR (SELECT count(*) FROM provider_model_settings WHERE provider_name='{PROVIDER}' AND model_name='{OLD}') <> 1
     OR (SELECT count(*) FROM provider_model_credentials WHERE provider_name='{PROVIDER}' AND model_name='{OLD}') <> 1
     OR (SELECT count(*) FROM provider_models WHERE provider_name='{PROVIDER}' AND model_name='{NEW}') <> 0
     OR (SELECT count(*) FROM provider_model_credentials WHERE provider_name='{PROVIDER}' AND model_name='{OLD}'
           AND encrypted_config::jsonb->>'endpoint_url'='http://llm-gateway:4000/v1'
           AND encrypted_config::jsonb->>'endpoint_model_name'='{OLD}') <> 1 THEN
    RAISE EXCEPTION 'Dify model registry changed during migration';
  END IF;
END $$;
UPDATE provider_model_credentials SET model_name='{NEW}',
    encrypted_config=jsonb_set(jsonb_set(encrypted_config::jsonb,
      '{{endpoint_model_name}}', to_jsonb('{NEW}'::text)),
      '{{display_name}}', to_jsonb('{NEW}'::text))::text, updated_at=now()
WHERE provider_name='{PROVIDER}' AND model_name='{OLD}';
UPDATE provider_models SET model_name='{NEW}', updated_at=now()
WHERE provider_name='{PROVIDER}' AND model_name='{OLD}';
UPDATE provider_model_settings SET model_name='{NEW}', updated_at=now()
WHERE provider_name='{PROVIDER}' AND model_name='{OLD}';
COMMIT;
""")
    query(args.server, "\n".join(sql))
    print(json.dumps({"backup_label": label, "updated_workflows": len(changes)}))


if __name__ == "__main__":
    main()
