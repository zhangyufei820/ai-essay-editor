#!/usr/bin/env python3
"""Repair the dedicated paper-writing app's published and draft routing graphs."""

import argparse
import base64
import hashlib
import json
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import subprocess


APP_ID = "4575cc05-91ca-4058-a861-faa39738b6f0"
APP_NAME = "论文写作"
CONTENT_ID = "1764308660341"
ROUTER_ID = "17751975014370"
BRANCH_ID = "1775197733014"
AGENT_ID = "1775308769490"
REPLY_ID = "1775375495245"
PARSER_ID = "1784500000000"
OLD_CONDITION = (["17751975014370", "text"], "contains", '{"skill"')
NEW_CONDITION = ([PARSER_ID, "route"], "is", "skill")
SOURCE = Path(__file__).with_name("dify-paper-writing-router.py")


def query(server, sql):
    docker = [
        "docker", "exec", "-i", "docker-db_postgres-1", "psql",
        "-U", "shenxiang", "-d", "shenxiang", "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    ]
    command = docker if server == "local" else [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        "-o", "StrictHostKeyChecking=yes", server, *docker,
    ]
    result = subprocess.run(command, input=sql, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Dify SQL operation failed; no successful transaction was reported")
    return result.stdout.strip()


def one(items, **fields):
    matches = [item for item in items if all(item.get(key) == value for key, value in fields.items())]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one graph entry for {fields}")
    return matches[0]


def output(node, field):
    return "{{#" + node + "." + field + "#}}"


def patch_graph(graph, code):
    result = deepcopy(graph)
    nodes, edges = result["nodes"], result["edges"]
    expected_nodes = {
        CONTENT_ID: "code", ROUTER_ID: "llm", BRANCH_ID: "if-else", AGENT_ID: "agent", REPLY_ID: "answer",
    }
    for node_id, kind in expected_nodes.items():
        if one(nodes, id=node_id)["data"]["type"] != kind:
            raise RuntimeError(f"Unexpected node type for {node_id}")

    content = one(nodes, id=CONTENT_ID)
    router = one(nodes, id=ROUTER_ID)
    branch = one(nodes, id=BRANCH_ID)
    agent = one(nodes, id=AGENT_ID)["data"]["agent_parameters"]["query"]
    reply = one(nodes, id=REPLY_ID)["data"]
    cases = branch["data"]["cases"]
    if len(cases) != 1 or cases[0]["case_id"] != "true" or len(cases[0]["conditions"]) != 1:
        raise RuntimeError("Unexpected paper-writing branch cases")
    condition = cases[0]["conditions"][0]
    condition_fields = ("variable_selector", "comparison_operator", "value")
    current_condition = tuple(condition[key] for key in condition_fields)
    one(edges, source=CONTENT_ID, sourceHandle="source", target=ROUTER_ID, targetHandle="target")
    branch_edges = [edge for edge in edges if edge.get("source") == BRANCH_ID]
    if len(branch_edges) != 2:
        raise RuntimeError("Unexpected outgoing branch edges")
    one(branch_edges, sourceHandle="true", target=AGENT_ID, targetHandle="target")
    one(branch_edges, sourceHandle="false", target=REPLY_ID, targetHandle="target")
    outgoing = [edge for edge in edges if edge.get("source") == ROUTER_ID]
    parser_nodes = [node for node in nodes if node.get("id") == PARSER_ID]
    parser_data = {
        "code": code,
        "code_language": "python3",
        "type": "code",
        "title": "论文路由结果解析",
        "selected": False,
        "variables": [
            {"variable": "router_text", "value_type": "string", "value_selector": [ROUTER_ID, "text"]},
        ],
        "outputs": {field: {"type": "string", "children": None} for field in ("route", "agent_query", "reply")},
    }

    if parser_nodes:
        if (
            one(parser_nodes, id=PARSER_ID)["data"] != parser_data
            or current_condition != NEW_CONDITION
            or agent.get("type") != "constant"
            or agent.get("value") != output(PARSER_ID, "agent_query")
            or reply["answer"] != output(PARSER_ID, "reply")
        ):
            raise RuntimeError("Existing paper-writing parser differs from the expected repair")
        one(outgoing, sourceHandle="source", target=PARSER_ID, targetHandle="target")
        parser_edges = [edge for edge in edges if edge.get("source") == PARSER_ID]
        one(parser_edges, sourceHandle="source", target=BRANCH_ID, targetHandle="target")
        if len(outgoing) != 1 or len(parser_edges) != 1:
            raise RuntimeError("Unexpected outgoing router or parser edges")
        return result

    if (
        current_condition != OLD_CONDITION
        or agent.get("type") != "constant"
        or agent.get("value") != output(ROUTER_ID, "text")
        or reply["answer"] != output(ROUTER_ID, "text")
        or len(outgoing) != 1
    ):
        raise RuntimeError("Unexpected pre-repair paper-writing routing")

    original = one(outgoing, sourceHandle="source", target=BRANCH_ID, targetHandle="target")
    new_node = deepcopy(content)
    new_node.update(id=PARSER_ID, data=parser_data, selected=False)
    position = {
        "x": (router["position"]["x"] + branch["position"]["x"]) / 2,
        "y": (router["position"]["y"] + branch["position"]["y"]) / 2 - 135,
    }
    new_node.update(position=position, positionAbsolute=position.copy())
    nodes.append(new_node)
    for key, value in zip(condition_fields, NEW_CONDITION):
        condition[key] = value
    agent["value"] = output(PARSER_ID, "agent_query")
    reply["answer"] = output(PARSER_ID, "reply")
    edges.remove(original)
    for source, source_kind, destination, destination_kind in (
        (ROUTER_ID, "llm", PARSER_ID, "code"),
        (PARSER_ID, "code", BRANCH_ID, "if-else"),
    ):
        edge = deepcopy(original)
        edge.update(id=f"{source}-source-{destination}-target", source=source, target=destination)
        edge["data"].update(sourceType=source_kind, targetType=destination_kind)
        edges.append(edge)
    return result


def read_targets(server):
    rows = query(server, f"""
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SELECT json_build_object(
  'id', w.id, 'published', w.id = a.workflow_id, 'draft', w.version = 'draft',
  'graph', w.graph
)
FROM apps a JOIN workflows w ON w.app_id = a.id
WHERE a.id = '{APP_ID}'::uuid AND a.name = '{APP_NAME}' AND a.mode = 'advanced-chat'
  AND (w.id = a.workflow_id OR w.version = 'draft') AND w.type = 'chat';
ROLLBACK;
""").splitlines()
    targets = [json.loads(row) for row in rows]
    if len(targets) != 2:
        raise RuntimeError("Expected the dedicated paper-writing app's published and draft graphs")
    one(targets, published=True, draft=False)
    one(targets, published=False, draft=True)
    return targets


def apply_repair(server, targets, updates):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    label = "codex-paper-writing-router-" + stamp
    published = one(targets, published=True)["id"]
    draft = one(targets, draft=True)["id"]
    sql = [f"""
BEGIN;
SET LOCAL statement_timeout = '12s';
DO $$ BEGIN
  PERFORM 1 FROM apps
  WHERE id = '{APP_ID}'::uuid AND workflow_id = '{published}'::uuid
    AND name = '{APP_NAME}' AND mode = 'advanced-chat'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Published paper-writing workflow changed'; END IF;
  PERFORM 1 FROM workflows
  WHERE id = '{draft}'::uuid AND app_id = '{APP_ID}'::uuid AND version = 'draft'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft paper-writing workflow changed'; END IF;
END $$;
"""]
    for workflow_id, before, after in updates:
        digest = hashlib.md5(before.encode()).hexdigest()
        encoded = base64.b64encode(after.encode()).decode()
        sql.append(f"""
DO $$ DECLARE current_digest TEXT; BEGIN
  SELECT md5(graph) INTO current_digest FROM workflows
  WHERE id = '{workflow_id}'::uuid AND app_id = '{APP_ID}'::uuid FOR UPDATE;
  IF current_digest IS DISTINCT FROM '{digest}' THEN
    RAISE EXCEPTION 'Paper-writing workflow changed during repair';
  END IF;
END $$;
INSERT INTO codex_dify_workflow_graph_backups (backup_label, workflow_id, app_id, app_name, graph)
SELECT '{label}', id, app_id, '{APP_NAME}', graph FROM workflows WHERE id = '{workflow_id}'::uuid;
UPDATE workflows SET graph = convert_from(decode('{encoded}', 'base64'), 'UTF8'), updated_at = now()
WHERE id = '{workflow_id}'::uuid AND app_id = '{APP_ID}'::uuid;
""")
    query(server, "\n".join([*sql, "COMMIT;"]))
    return label


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="root@43.154.111.156")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    source = SOURCE.read_text(encoding="utf-8")
    targets = read_targets(args.server)
    updates = []
    for target in targets:
        graph = json.loads(target["graph"])
        updated = patch_graph(graph, source)
        if graph != updated:
            updates.append((target["id"], target["graph"], json.dumps(updated, ensure_ascii=False)))
    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "app": APP_NAME,
        "planned_updates": len(updates),
        "targets": [{"id": target["id"], "published": target["published"]} for target in targets],
    }
    if args.apply and updates:
        summary["backup_label"] = apply_repair(args.server, targets, updates)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
