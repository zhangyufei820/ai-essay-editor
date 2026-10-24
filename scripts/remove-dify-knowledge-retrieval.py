#!/usr/bin/env python3
"""Remove knowledge retrieval nodes from active Dify workflows, with backups.

Dry-run by default. Apply the essay scope and verify it before the remaining apps.
Historical workflow versions are left intact.
"""

import argparse
import base64
import copy
import csv
import hashlib
import io
import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone


ESSAY_APP_ID = "e463613d-6025-4e24-996b-472e2c3b816e"
DB_COMMAND = [
    "docker", "exec", "-i", "docker-db_postgres-1", "psql",
    "-U", "shenxiang", "-d", "shenxiang", "-At", "-v", "ON_ERROR_STOP=1",
]


def query(server, sql):
    command = DB_COMMAND if server == "local" else ["ssh", "-o", "ConnectTimeout=8", server, *DB_COMMAND]
    result = subprocess.run(command, input=sql, text=True, capture_output=True, check=True)
    return result.stdout


def load_active_workflows(server):
    sql = """COPY (
SELECT a.id::text, a.name, w.id::text,
       CASE WHEN w.id = a.workflow_id THEN 'published' ELSE 'draft' END,
       w.graph
FROM apps a JOIN workflows w ON w.app_id = a.id
WHERE w.id = a.workflow_id OR w.version = 'draft'
) TO STDOUT WITH CSV;
"""
    csv.field_size_limit(50_000_000)
    rows = csv.reader(io.StringIO(query(server, sql)))
    return [
        {"app_id": app_id, "app_name": app_name, "workflow_id": workflow_id,
         "state": state, "raw_graph": raw_graph}
        for app_id, app_name, workflow_id, state, raw_graph in rows
    ]


def reachable(graph):
    nodes = {str(node["id"]): node for node in graph["nodes"]}
    adjacency = {node_id: [] for node_id in nodes}
    for edge in graph["edges"]:
        source, target = str(edge["source"]), str(edge["target"])
        if source not in nodes or target not in nodes:
            raise ValueError(f"Edge references a missing node: {source} -> {target}")
        adjacency[source].append(target)
    pending = [node_id for node_id, node in nodes.items() if node.get("data", {}).get("type") == "start"]
    seen = set()
    while pending:
        node_id = pending.pop()
        if node_id not in seen:
            seen.add(node_id)
            pending.extend(adjacency[node_id])
    return seen


def patch_graph(original):
    graph = copy.deepcopy(original)
    nodes = {str(node["id"]): node for node in graph["nodes"]}
    knowledge = {
        node_id for node_id, node in nodes.items()
        if node.get("data", {}).get("type") == "knowledge-retrieval"
    }
    if not knowledge:
        return graph, []

    original_reachable = reachable(graph)
    bypasses = []
    for node_id in sorted(knowledge):
        incoming = [edge for edge in graph["edges"] if str(edge["target"]) == node_id]
        outgoing = [edge for edge in graph["edges"] if str(edge["source"]) == node_id]
        for before in incoming:
            for after in outgoing:
                source, target = str(before["source"]), str(after["target"])
                if source in knowledge or target in knowledge:
                    raise ValueError("Adjacent retrieval nodes require manual rewiring")
                edge = copy.deepcopy(before)
                edge["target"] = target
                edge["targetHandle"] = after.get("targetHandle", "target")
                edge["id"] = f"{source}-{edge.get('sourceHandle', 'source')}-{target}-{edge['targetHandle']}"
                edge.setdefault("data", {})["sourceType"] = nodes[source]["data"]["type"]
                edge["data"]["targetType"] = nodes[target]["data"]["type"]
                bypasses.append(edge)

    graph["nodes"] = [node for node in graph["nodes"] if str(node["id"]) not in knowledge]
    graph["edges"] = [
        edge for edge in graph["edges"]
        if str(edge["source"]) not in knowledge and str(edge["target"]) not in knowledge
    ]
    existing = {str(edge["id"]) for edge in graph["edges"]}
    for edge in bypasses:
        if edge["id"] not in existing:
            graph["edges"].append(edge)
            existing.add(edge["id"])

    for node in graph["nodes"]:
        context = node.get("data", {}).get("context")
        selector = context.get("variable_selector") if isinstance(context, dict) else None
        if isinstance(selector, list) and selector and selector[0] in knowledge:
            context["enabled"] = False
            context["variable_selector"] = []

    encoded = json.dumps(graph, ensure_ascii=False)
    if any(node_id in encoded for node_id in knowledge):
        raise ValueError("A removed retrieval node is still referenced")
    if not original_reachable.difference(knowledge).issubset(reachable(graph)):
        raise ValueError("Removing retrieval disconnected a reachable node")
    return graph, sorted(knowledge)


def update_graphs(server, plans, label, rollback=False):
    statements = ["BEGIN;", "SET LOCAL lock_timeout = '5s';"]
    for plan in plans:
        workflow_id = str(uuid.UUID(plan["workflow_id"]))
        old_raw = plan["raw_graph"]
        new_raw = plan["updated_graph"]
        expected_md5 = hashlib.md5(old_raw.encode("utf-8")).hexdigest()
        encoded = base64.b64encode(new_raw.encode("utf-8")).decode("ascii")
        statements.append(f"""
DO $$ BEGIN
  IF (SELECT md5(graph) FROM workflows WHERE id = '{workflow_id}'::uuid) IS DISTINCT FROM '{expected_md5}' THEN
    RAISE EXCEPTION 'Workflow changed during retrieval edit: {workflow_id}';
  END IF;
END $$;
""")
        if not rollback:
            statements.append(f"""
INSERT INTO codex_dify_workflow_graph_backups
  (backup_label, workflow_id, app_id, app_name, graph)
SELECT '{label}', w.id, a.id, a.name, w.graph
FROM workflows w JOIN apps a ON a.id = w.app_id
WHERE w.id = '{workflow_id}'::uuid;
""")
        statements.append(f"""
UPDATE workflows
SET graph = convert_from(decode('{encoded}', 'base64'), 'UTF8'), updated_at = now()
WHERE id = '{workflow_id}'::uuid;
""")
    statements.append("COMMIT;")
    query(server, "\n".join(statements))


def load_backup(server, label):
    if not label.startswith("codex-remove-knowledge-") or not all(c.isalnum() or c == "-" for c in label):
        raise ValueError("Invalid backup label")
    sql = f"""COPY (
SELECT workflow_id::text, graph FROM codex_dify_workflow_graph_backups
WHERE backup_label = '{label}' ORDER BY workflow_id
) TO STDOUT WITH CSV;
"""
    csv.field_size_limit(50_000_000)
    return list(csv.reader(io.StringIO(query(server, sql))))


def rollback(server, label, apply):
    backups = load_backup(server, label)
    if not backups:
        raise ValueError("No workflows found for backup label")
    current = {row["workflow_id"]: row for row in load_active_workflows(server)}
    plans = []
    for workflow_id, original_raw in backups:
        if workflow_id not in current:
            raise ValueError(f"Backup workflow is no longer active: {workflow_id}")
        expected, _ = patch_graph(json.loads(original_raw))
        current_raw = current[workflow_id]["raw_graph"]
        if json.loads(current_raw) != expected:
            raise ValueError(f"Workflow changed after removal: {workflow_id}")
        plans.append({"workflow_id": workflow_id, "raw_graph": current_raw, "updated_graph": original_raw})
    print(json.dumps({"mode": "rollback", "apply": apply, "backup_label": label,
                      "workflows": [plan["workflow_id"] for plan in plans]}, ensure_ascii=False))
    if apply:
        update_graphs(server, plans, label, rollback=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="root@43.154.111.156")
    parser.add_argument("--scope", choices=("essay", "remaining", "all"))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback-label")
    args = parser.parse_args()
    if args.rollback_label:
        if args.scope:
            parser.error("--scope cannot be combined with --rollback-label")
        rollback(args.server, args.rollback_label, args.apply)
        return
    if not args.scope:
        parser.error("--scope is required")

    plans = []
    for row in load_active_workflows(args.server):
        if args.scope == "essay" and row["app_id"] != ESSAY_APP_ID:
            continue
        if args.scope == "remaining" and row["app_id"] == ESSAY_APP_ID:
            continue
        graph, removed = patch_graph(json.loads(row["raw_graph"]))
        if removed:
            plans.append({**row, "updated_graph": json.dumps(graph, ensure_ascii=False, separators=(",", ":")),
                          "removed": removed})
    if args.scope == "essay" and len(plans) != 2 and args.apply:
        raise ValueError("Expected exactly published and draft essay workflows")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "scope": args.scope,
                      "workflows": [{"app": p["app_name"], "app_id": p["app_id"],
                                     "state": p["state"], "workflow_id": p["workflow_id"],
                                     "removed": p["removed"]} for p in plans]}, ensure_ascii=False))
    if not args.apply or not plans:
        return

    label = "codex-remove-knowledge-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
    update_graphs(args.server, plans, label)
    after = {row["workflow_id"]: row for row in load_active_workflows(args.server)}
    for plan in plans:
        if json.loads(after[plan["workflow_id"]]["raw_graph"]) != json.loads(plan["updated_graph"]):
            raise ValueError(f"Post-write verification failed: {plan['workflow_id']}")
    print(json.dumps({"backup_label": label, "verified_workflows": len(plans)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, ValueError) as error:
        print(f"Retrieval edit failed: {error}", file=sys.stderr)
        sys.exit(1)
