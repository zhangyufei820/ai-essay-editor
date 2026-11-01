#!/usr/bin/env python3
"""Repair essay grading routing and premature answers; dry run by default.

The published and draft graphs are backed up in the existing backup table in
the same transaction as the update. No user content or credentials are read.
"""

import argparse
import base64
import hashlib
import json
import shlex
import subprocess
from datetime import datetime, timezone


APP_ID = "e463613d-6025-4e24-996b-472e2c3b816e"
WORKFLOW_IDS = (
    "dd6f7ac9-2371-4eb7-9126-113ff7593eb1",
    "5c7d1d0c-43e3-4c5e-b5ca-a0ea76604a2b",
)
ROUTER = "1764311644520"
BRANCH = "1764311739200"
VISION = "1766689591669"
VISION_FALLBACK = "1776129801030"
CLEAN = "1766689943052"
DOCUMENT = "1764300258582"
GATHER = "1764308660341"
IMAGE_FILTER = "codex_essay_images"
DOCUMENT_FILTER = "codex_essay_documents"
EARLY_ANSWERS = {"1774673093513", "1774673157752"}
DOCUMENT_CASE = "9a2ed41f-0048-43ec-be12-64921fa404df"
MIXED_CASE = "codex_essay_mixed"
TEXT_CASE = "codex_essay_text"

ROUTER_CODE = '''def main(file_list: list, user_input: str) -> dict:
    kinds = set()
    for item in file_list or []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "").lower()
        name = str(item.get("name") or item.get("filename") or "").lower()
        mime = str(item.get("mime_type") or "").lower()
        if kind == "image" or mime.startswith("image/") or name.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp")):
            kinds.add("image")
        else:
            kinds.add("document")
    if len(kinds) == 2:
        return {"type": "mixed"}
    if kinds:
        return {"type": next(iter(kinds))}
    return {"type": "essay_text" if len(str(user_input or "")) > 150 else "text"}
'''

GATHER_CODE = '''def main(ocr_text: str, doc_text: list, user_input: str) -> dict:
    def flatten(value):
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, list):
            return "\\n".join(flatten(item) for item in value if item).strip()
        if isinstance(value, dict):
            return str(value.get("content") or "").strip()
        return ""

    image = flatten(ocr_text)
    document = flatten(doc_text)
    pasted = str(user_input or "").strip()
    if image and document:
        content = "文档内容：\\n" + document + "\\n\\n图片内容：\\n" + image
    else:
        content = document or image or pasted
    if len(content) < 5:
        content = "未检测到有效内容。请上传图片、文档或直接粘贴作文内容。"
    return {"content": content}
'''


def query(server: str, sql: str) -> str:
    docker = ["docker", "exec", "-i", "docker-db_postgres-1", "psql",
              "-U", "shenxiang", "-d", "shenxiang", "-At", "-v", "ON_ERROR_STOP=1"]
    command = docker if server == "local" else [
        "ssh", "-o", "ConnectTimeout=8", server, shlex.join(docker)]
    result = subprocess.run(command, input=sql, text=True, capture_output=True, check=True)
    return result.stdout.strip()


def make_case(case_id: str, value: str) -> dict:
    return {
        "id": case_id, "case_id": case_id,
        "conditions": [{"id": case_id + "_condition", "value": value,
                        "varType": "string", "variable_selector": [ROUTER, "type"],
                        "comparison_operator": "is"}],
        "logical_operator": "and",
    }


def make_filter(node_id: str, kind: str, y: int) -> dict:
    position = {"x": 1700, "y": y}
    return {
        "id": node_id,
        "data": {
            "desc": "Only pass matching attachments to the extractor",
            "type": "list-operator", "title": "筛选上传图片" if kind == "image" else "筛选上传文档",
            "limit": {"size": 10, "enabled": False},
            "order_by": {"key": "", "value": "asc", "enabled": False},
            "selected": False, "var_type": "array[file]", "variable": ["sys", "files"],
            "filter_by": {"enabled": True, "conditions": [
                {"key": "type", "value": [kind], "comparison_operator": "in"}]},
            "extract_by": {"serial": "1", "enabled": False}, "item_var_type": "file",
        },
        "type": "custom", "width": 242, "height": 136, "position": position,
        "selected": False, "sourcePosition": "right", "targetPosition": "left",
        "positionAbsolute": position.copy(),
    }


def make_edge(source: str, handle: str, target: str, source_type: str, target_type: str) -> dict:
    return {
        "id": f"{source}-{handle}-{target}-target",
        "data": {"isInLoop": False, "sourceType": source_type, "targetType": target_type},
        "type": "custom", "source": source, "target": target,
        "zIndex": 0, "selected": False, "sourceHandle": handle, "targetHandle": "target",
    }


def patch_graph(graph: dict) -> dict:
    nodes = {str(node["id"]): node for node in graph["nodes"]}
    required = {ROUTER, BRANCH, VISION, VISION_FALLBACK, CLEAN, DOCUMENT, GATHER, *EARLY_ANSWERS}
    if not required.issubset(nodes) or IMAGE_FILTER in nodes or DOCUMENT_FILTER in nodes:
        raise RuntimeError("Unexpected essay workflow graph; refusing to patch")
    if nodes[ROUTER]["data"].get("type") != "code" or nodes[BRANCH]["data"].get("type") != "if-else":
        raise RuntimeError("Essay router node types changed")
    cases = nodes[BRANCH]["data"].get("cases", [])
    if len(cases) != 2 or cases[1].get("case_id") != DOCUMENT_CASE:
        raise RuntimeError("Essay branch cases changed")
    nodes[ROUTER]["data"]["code"] = ROUTER_CODE
    nodes[BRANCH]["data"]["cases"].extend([
        make_case(MIXED_CASE, "mixed"), make_case(TEXT_CASE, "essay_text")])
    nodes[VISION]["data"]["vision"]["configs"]["variable_selector"] = [IMAGE_FILTER, "result"]
    nodes[DOCUMENT]["data"]["variable_selector"] = [DOCUMENT_FILTER, "result"]
    nodes[GATHER]["data"]["code"] = GATHER_CODE
    graph["nodes"] = [node for node in graph["nodes"] if node["id"] not in EARLY_ANSWERS]
    graph["nodes"].extend([
        make_filter(IMAGE_FILTER, "image", 0),
        make_filter(DOCUMENT_FILTER, "document", 300),
    ])
    removed = [edge for edge in graph["edges"] if edge["source"] in EARLY_ANSWERS
               or edge["target"] in EARLY_ANSWERS
               or edge["source"] == BRANCH and edge["sourceHandle"] in ("true", DOCUMENT_CASE)]
    if len(removed) != 7:
        raise RuntimeError(f"Expected seven replaced edges, found {len(removed)}")
    graph["edges"] = [edge for edge in graph["edges"] if edge not in removed]
    graph["edges"].extend([
        make_edge(BRANCH, "true", IMAGE_FILTER, "if-else", "list-operator"),
        make_edge(BRANCH, DOCUMENT_CASE, DOCUMENT_FILTER, "if-else", "list-operator"),
        make_edge(BRANCH, MIXED_CASE, IMAGE_FILTER, "if-else", "list-operator"),
        make_edge(BRANCH, MIXED_CASE, DOCUMENT_FILTER, "if-else", "list-operator"),
        make_edge(BRANCH, TEXT_CASE, GATHER, "if-else", "code"),
        make_edge(IMAGE_FILTER, "source", VISION, "list-operator", "llm"),
        make_edge(DOCUMENT_FILTER, "source", DOCUMENT, "list-operator", "document-extractor"),
        make_edge(VISION, "source", CLEAN, "llm", "code"),
        make_edge(VISION_FALLBACK, "source", CLEAN, "llm", "code"),
        make_edge(DOCUMENT, "source", GATHER, "document-extractor", "code"),
    ])
    edge_ids = [edge["id"] for edge in graph["edges"]]
    if len(edge_ids) != len(set(edge_ids)):
        raise RuntimeError("Duplicate edge IDs")
    return graph


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", default="root@43.154.111.156")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    ids = "','".join(WORKFLOW_IDS)
    rows = query(args.server, f"""
SELECT id, replace(encode(convert_to(graph, 'UTF8'), 'base64'), E'\\n', '')
FROM workflows WHERE app_id = '{APP_ID}' AND id IN ('{ids}');
""").splitlines()
    if len(rows) != 2:
        raise RuntimeError("Expected published and draft essay workflows")
    published = query(args.server, f"SELECT workflow_id FROM apps WHERE id = '{APP_ID}';")
    if published != WORKFLOW_IDS[0]:
        raise RuntimeError("Published essay workflow changed")
    updates = []
    for row in rows:
        workflow_id, encoded = row.split("|", 1)
        old = base64.b64decode(encoded).decode("utf-8")
        patched = patch_graph(json.loads(old))
        new = json.dumps(patched, ensure_ascii=False, separators=(",", ":"))
        updates.append((workflow_id, hashlib.md5(old.encode()).hexdigest(), new))
    print(json.dumps({"mode": "apply" if args.apply else "dry-run",
                      "workflows": [item[0] for item in updates],
                      "nodes": len(patched["nodes"]), "edges": len(patched["edges"])}))
    if not args.apply:
        return
    label = "codex-essay-grading-flow-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
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
