#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

const DEFAULT_HOST = process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156"
const PROVIDER_NAME = "langgenius/openai_api_compatible/openai_api_compatible"

const AI_WRITING_PAPER = {
  appId: "4575cc05-91ca-4058-a861-faa39738b6f0",
  appName: "论文写作",
  agentNodeId: "1775308769490",
  routeNodeId: "17751975014370",
  visionNodeIds: ["1766689591669", "1776129297350"],
}

const TUNING = {
  agentModelName: "沈翔语文优先",
  routeModelName: "沈翔快速对话",
  visionModelName: "沈翔图像识别",
  agentMaxTokens: 20000,
  agentMaximumIterations: 6,
  skillAgentMaxSteps: 6,
  skillAgentMemoryTurns: 6,
  skillAgentHistoryTurns: 2,
}

function parseArgs(argv) {
  const args = {
    apply: false,
    host: DEFAULT_HOST,
    outputPath: "",
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--apply") {
      args.apply = true
    } else if (arg === "--host") {
      args.host = argv[++index]
    } else if (arg.startsWith("--output=")) {
      args.outputPath = arg.split("=")[1]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function runRemote(host, script) {
  const result = spawnSync("ssh", [host, "python3", "-"], {
    input: script,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `remote command failed with code ${result.status}`)
  }

  return result.stdout
}

function buildRemoteScript({ apply }) {
  return `
import json
import subprocess
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

APPLY = ${apply ? "True" : "False"}
APP = ${JSON.stringify(AI_WRITING_PAPER)}
PROVIDER_NAME = ${JSON.stringify(PROVIDER_NAME)}
TUNING = ${JSON.stringify(TUNING)}

def run_sql(sql):
    result = subprocess.run(
        ["docker", "exec", "docker-db_postgres-1", "psql", "-U", "shenxiang", "-d", "shenxiang", "-At", "-F", "\\t", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout

def load_workflow():
    sql = f"""
select
  a.id::text,
  a.name,
  a.workflow_id::text,
  w.version,
  w.graph
from apps a
join workflows w on w.id = a.workflow_id
where a.id = '{APP["appId"]}'::uuid
limit 1;
"""
    raw = run_sql(sql).strip()
    if not raw:
        raise RuntimeError(f"app workflow not found: {APP['appName']} {APP['appId']}")
    parts = raw.split("\\t", 4)
    if len(parts) != 5:
        raise RuntimeError(f"unexpected workflow row: {raw}")
    app_id, app_name, workflow_id, version, graph_raw = parts
    return {
        "app_id": app_id,
        "app_name": app_name,
        "workflow_id": workflow_id,
        "version": version,
        "graph_raw": graph_raw,
        "graph": json.loads(graph_raw),
    }

def find_node(graph, node_id):
    for node in graph.get("nodes", []):
        if str(node.get("id")) == str(node_id):
            return node
    return None

def set_model(model, model_name):
    before = {
        "name": model.get("name") or model.get("model"),
        "provider": model.get("provider"),
    }
    model["provider"] = PROVIDER_NAME
    if "name" in model:
        model["name"] = model_name
    else:
        model["model"] = model_name
    model["mode"] = "chat"
    model["model_type"] = "llm"
    return before, {
        "name": model.get("name") or model.get("model"),
        "provider": model.get("provider"),
    }

def tune_llm_node(graph, node_id, model_name):
    node = find_node(graph, node_id)
    if node is None:
        raise RuntimeError(f"LLM node not found: {node_id}")
    data = node.setdefault("data", {})
    model = data.setdefault("model", {})
    before, after = set_model(model, model_name)
    if before != after:
        return {
            "node_id": node_id,
            "title": data.get("title"),
            "type": data.get("type"),
            "before": before,
            "after": after,
        }
    return None

def set_nested_constant(settings, key, value):
    holder = settings.setdefault(key, {}).setdefault("value", {})
    before = holder.get("value")
    holder["type"] = "constant"
    holder["value"] = value
    return before, value

def tune_agent_node(graph):
    node = find_node(graph, APP["agentNodeId"])
    if node is None:
        raise RuntimeError(f"agent node not found: {APP['agentNodeId']}")
    data = node.setdefault("data", {})
    params = data.setdefault("agent_parameters", {})
    changes = []

    model_value = params.setdefault("model", {}).setdefault("value", {})
    before_model, after_model = set_model(model_value, TUNING["agentModelName"])
    completion = model_value.setdefault("completion_params", {})
    before_max_tokens = completion.get("max_tokens")
    completion["max_tokens"] = TUNING["agentMaxTokens"]
    if before_model != after_model or before_max_tokens != completion["max_tokens"]:
        changes.append({
            "field": "agent_model",
            "before": {**before_model, "max_tokens": before_max_tokens},
            "after": {**after_model, "max_tokens": completion["max_tokens"]},
        })

    before_iterations = params.setdefault("maximum_iterations", {}).get("value")
    params["maximum_iterations"] = {"type": "constant", "value": TUNING["agentMaximumIterations"]}
    if before_iterations != TUNING["agentMaximumIterations"]:
        changes.append({
            "field": "maximum_iterations",
            "before": before_iterations,
            "after": TUNING["agentMaximumIterations"],
        })

    tools = params.setdefault("tools", {}).setdefault("value", [])
    for tool in tools:
        if tool.get("tool_name") != "skill_agent":
            continue
        settings = tool.setdefault("settings", {})
        nested_model = settings.setdefault("model", {}).setdefault("value", {}).setdefault("value", {})
        before_nested_model, after_nested_model = set_model(nested_model, TUNING["agentModelName"])
        if before_nested_model != after_nested_model:
            changes.append({
                "field": "skill_agent_model",
                "before": before_nested_model,
                "after": after_nested_model,
            })
        for key, target in [
            ("max_steps", TUNING["skillAgentMaxSteps"]),
            ("memory_turns", TUNING["skillAgentMemoryTurns"]),
            ("history_turns", TUNING["skillAgentHistoryTurns"]),
        ]:
            before, after = set_nested_constant(settings, key, target)
            if before != after:
                changes.append({"field": f"skill_agent_{key}", "before": before, "after": after})
        break

    if changes:
        return {
            "node_id": APP["agentNodeId"],
            "title": data.get("title"),
            "type": data.get("type"),
            "changes": changes,
        }
    return None

def tune_graph(graph):
    target = deepcopy(graph)
    node_changes = []
    route_change = tune_llm_node(target, APP["routeNodeId"], TUNING["routeModelName"])
    if route_change:
        node_changes.append(route_change)
    for node_id in APP["visionNodeIds"]:
        vision_change = tune_llm_node(target, node_id, TUNING["visionModelName"])
        if vision_change:
            node_changes.append(vision_change)
    agent_change = tune_agent_node(target)
    if agent_change:
        node_changes.append(agent_change)
    return target, node_changes

workflow = load_workflow()
tuned_graph, node_changes = tune_graph(workflow["graph"])
planned_changes = []
if tuned_graph != workflow["graph"]:
    planned_changes.append({
        "app_id": workflow["app_id"],
        "app_name": workflow["app_name"],
        "workflow_id": workflow["workflow_id"],
        "version": workflow["version"],
        "before_graph_raw": workflow["graph_raw"],
        "after_graph": tuned_graph,
    })

summary = {
    "apply": APPLY,
    "app_id": workflow["app_id"],
    "app_name": workflow["app_name"],
    "workflow_id": workflow["workflow_id"],
    "version": workflow["version"],
    "planned_changes": len(planned_changes),
    "tuning": TUNING,
    "node_changes": node_changes,
}

if not APPLY:
    print(json.dumps(summary, ensure_ascii=False))
    raise SystemExit(0)

if not planned_changes:
    print(json.dumps({**summary, "applied": False, "message": "no changes"}, ensure_ascii=False))
    raise SystemExit(0)

label = "codex-ai-writing-paper-tune-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
backup_dir = Path("/root/shenxiang-config-backups")
backup_dir.mkdir(parents=True, exist_ok=True)
backup_path = backup_dir / f"{label}.json"
backup_path.write_text(
    json.dumps(
        {
            "backup_label": label,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
            "workflows": [
                {
                    "workflow_id": item["workflow_id"],
                    "app_id": item["app_id"],
                    "app_name": item["app_name"],
                    "version": item["version"],
                    "graph": json.loads(item["before_graph_raw"]),
                }
                for item in planned_changes
            ],
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)

sql_chunks = ["begin;"]
for item in planned_changes:
    original_graph = item["before_graph_raw"].replace("'", "''")
    updated_graph = json.dumps(item["after_graph"], ensure_ascii=False).replace("'", "''")
    app_name = (item["app_name"] or "").replace("'", "''")
    sql_chunks.append(f"""
insert into codex_dify_workflow_graph_backups
  (backup_label, workflow_id, app_id, app_name, graph)
values
  ('{label}', '{item["workflow_id"]}', '{item["app_id"]}', '{app_name}', '{original_graph}');
""")
    sql_chunks.append(
        f"update workflows set graph = '{updated_graph}', updated_at = now() where id = '{item['workflow_id']}'::uuid;"
    )
sql_chunks.append("commit;")
subprocess.run(
    ["docker", "exec", "-i", "docker-db_postgres-1", "psql", "-q", "-U", "shenxiang", "-d", "shenxiang", "-v", "ON_ERROR_STOP=1"],
    input="\\n".join(sql_chunks),
    text=True,
    capture_output=True,
    check=True,
)

print(json.dumps({
    **summary,
    "applied": True,
    "backup_label": label,
    "backup_path": str(backup_path),
}, ensure_ascii=False))
`
}

function main() {
  const args = parseArgs(process.argv)
  const payload = JSON.parse(runRemote(args.host, buildRemoteScript(args)))
  const outputPath = args.outputPath || path.join(process.cwd(), "logs", `dify-tune-ai-writing-paper-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2))
  console.log(JSON.stringify(payload, null, 2))
  console.log(`Saved ${outputPath}`)
}

main()
