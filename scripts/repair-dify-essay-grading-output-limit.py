#!/usr/bin/env python3
"""Cap essay final-report output to a value supported by the gateway fallback.

Dry run by default. --apply backs up the published and draft graphs before
updating them in one guarded transaction.
"""

import argparse
import base64
import hashlib
import json
import shlex
import subprocess
from datetime import datetime, timezone


APP_ID = "e463613d-6025-4e24-996b-472e2c3b816e"
PUBLISHED_ID = "dd6f7ac9-2371-4eb7-9126-113ff7593eb1"
DRAFT_ID = "5c7d1d0c-43e3-4c5e-b5ca-a0ea76604a2b"
FINAL_GRADER_ID = "17643486820500"
OLD_LIMIT = 128_000
NEW_LIMIT = 8_192


def query(server: str, sql: str) -> str:
    docker = [
        "docker", "exec", "-i", "docker-db_postgres-1", "psql",
        "-U", "shenxiang", "-d", "shenxiang", "-At", "-v", "ON_ERROR_STOP=1",
    ]
    command = docker if server == "local" else [
        "ssh", "-o", "ConnectTimeout=8", server, shlex.join(docker),
    ]
    result = subprocess.run(command, input=sql, text=True, capture_output=True, check=True)
    return result.stdout.strip()


def patch_graph(graph: dict) -> dict:
    graders = [node for node in graph.get("nodes", []) if str(node.get("id")) == FINAL_GRADER_ID]
    if len(graders) != 1 or graders[0].get("data", {}).get("type") != "llm":
        raise RuntimeError("Expected one final essay grading LLM node")
    params = graders[0]["data"].get("model", {}).get("completion_params", {})
    if params.get("max_tokens") != OLD_LIMIT:
        raise RuntimeError("Essay final grader output limit changed; refusing to patch")
    params["max_tokens"] = NEW_LIMIT
    return graph


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="root@43.154.111.156")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    published = query(args.server, f"SELECT workflow_id FROM apps WHERE id = '{APP_ID}';")
    if published != PUBLISHED_ID:
        raise RuntimeError("Published essay workflow changed")
    rows = query(args.server, f"""
SELECT id, replace(encode(convert_to(graph, 'UTF8'), 'base64'), E'\\n', '')
FROM workflows WHERE app_id = '{APP_ID}' AND id IN ('{PUBLISHED_ID}', '{DRAFT_ID}');
""").splitlines()
    if len(rows) != 2:
        raise RuntimeError("Expected published and draft essay workflows")

    updates = []
    for row in rows:
        workflow_id, encoded = row.split("|", 1)
        old = base64.b64decode(encoded).decode("utf-8")
        new = json.dumps(patch_graph(json.loads(old)), ensure_ascii=False, separators=(",", ":"))
        updates.append((workflow_id, hashlib.md5(old.encode()).hexdigest(), new))
    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "workflows": [item[0] for item in updates],
        "old_max_tokens": OLD_LIMIT,
        "new_max_tokens": NEW_LIMIT,
    }))
    if not args.apply:
        return

    label = "codex-essay-output-limit-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    statements = ["BEGIN;"]
    for workflow_id, expected_md5, new in updates:
        encoded = base64.b64encode(new.encode()).decode()
        statements.append(f"""
DO $$ BEGIN
  IF (SELECT md5(graph) FROM workflows WHERE id = '{workflow_id}') <> '{expected_md5}' THEN
    RAISE EXCEPTION 'Essay workflow changed during patch';
  END IF;
END $$;
INSERT INTO codex_dify_workflow_graph_backups
  (backup_label, workflow_id, app_id, app_name, graph)
SELECT '{label}', id, app_id, '作文批改', graph FROM workflows WHERE id = '{workflow_id}';
UPDATE workflows SET graph = convert_from(decode('{encoded}', 'base64'), 'UTF8'), updated_at = now()
WHERE id = '{workflow_id}';
""")
    statements.append("COMMIT;")
    query(args.server, "\n".join(statements))
    print(json.dumps({"backup_label": label, "patched": len(updates)}))


if __name__ == "__main__":
    main()
