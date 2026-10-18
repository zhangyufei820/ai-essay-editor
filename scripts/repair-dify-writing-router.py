#!/usr/bin/env python3
"""Patch the writing app's published/draft parser with a reversible graph backup.

Dry run by default. Run --apply only after code and browser checks are ready.
"""

import argparse
import base64
import hashlib
import json
import pathlib
import subprocess
from datetime import datetime, timezone


APP_ID = "02264892-13c7-4b22-9112-54cba4d34c29"
NODE_ID = "1780000000000"
SKILL_SOURCE = pathlib.Path(__file__).with_name("dify-writing-skill-router.py")


def query(server, sql):
    command = [
        "ssh", "-o", "ConnectTimeout=8", server,
        "docker", "exec", "-i", "docker-db_postgres-1", "psql",
        "-U", "shenxiang", "-d", "shenxiang", "-At", "-v", "ON_ERROR_STOP=1",
    ]
    result = subprocess.run(command, input=sql, text=True, capture_output=True, check=True)
    return result.stdout.strip()


def patch_graph(graph, code):
    matches = [node for node in graph.get("nodes", []) if str(node.get("id")) == NODE_ID]
    if len(matches) != 1 or matches[0].get("data", {}).get("type") != "code":
        raise RuntimeError("Expected one writing router code node")
    data = matches[0]["data"]
    variables = data.get("variables", [])
    if not any(item.get("variable") == "router_text" for item in variables):
        raise RuntimeError("Router input is missing")
    data["code"] = code
    data["variables"] = [item for item in variables if item.get("variable") != "user_query"] + [
        {"variable": "user_query", "value_selector": ["sys", "query"]}
    ]
    return graph


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="root@43.154.111.156")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    code = SKILL_SOURCE.read_text(encoding="utf-8")
    rows = query(args.server, f"""
SELECT id, replace(encode(convert_to(graph, 'UTF8'), 'base64'), E'\n', '')
FROM workflows
WHERE app_id = '{APP_ID}'
ORDER BY created_at DESC LIMIT 2;
""").splitlines()
    if len(rows) != 2:
        raise RuntimeError("Expected published and draft writing workflows")

    updates = []
    for row in rows:
        workflow_id, encoded = row.split("|", 1)
        old_graph = base64.b64decode(encoded).decode("utf-8")
        graph = patch_graph(json.loads(old_graph), code)
        new_graph = json.dumps(graph, ensure_ascii=False, separators=(",", ":"))
        updates.append((workflow_id, hashlib.md5(old_graph.encode()).hexdigest(), new_graph))

    published = query(args.server, f"SELECT workflow_id FROM apps WHERE id = '{APP_ID}';")
    if published not in [row[0] for row in updates]:
        raise RuntimeError("Published workflow is not among the selected versions")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "workflows": [row[0] for row in updates]}))
    if not args.apply:
        return

    label = "codex-writing-router-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    statements = ["BEGIN;"]
    for workflow_id, expected_md5, new_graph in updates:
        encoded = base64.b64encode(new_graph.encode()).decode()
        statements.append(f"""
DO $$ BEGIN
  IF (SELECT md5(graph) FROM workflows WHERE id = '{workflow_id}') <> '{expected_md5}' THEN
    RAISE EXCEPTION 'Writing workflow changed during patch';
  END IF;
END $$;
INSERT INTO codex_dify_workflow_graph_backups
  (backup_label, workflow_id, app_id, app_name, graph)
SELECT '{label}', id, app_id, '写作技能统一路由助手', graph
FROM workflows WHERE id = '{workflow_id}';
UPDATE workflows
SET graph = convert_from(decode('{encoded}', 'base64'), 'UTF8'), updated_at = now()
WHERE id = '{workflow_id}';
""")
    statements.append("COMMIT;")
    query(args.server, "\n".join(statements))
    print(json.dumps({"backup_label": label, "patched": len(updates)}))


if __name__ == "__main__":
    main()
