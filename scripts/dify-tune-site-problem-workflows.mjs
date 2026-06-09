#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

const DEFAULT_HOST = process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156"

const SITE_ASSISTANT = {
  appName: "网站助手",
  workflowId: "448d28d8-1205-45e3-98c8-1b44443b8949",
  retrievalNodeId: "1779100030769",
  backupPath: "/root/shenxiang-config-backups/codex-site-assistant-remove-dead-knowledge-20260605120514.json",
}

const PROBLEM_APP = {
  appName: "题目解析专用智能体",
  workflowId: "3be80f07-bf2e-4845-b246-2e61bff9dd69",
  routeNodeId: "17751975014370",
  solveNodeId: "1775196356822",
  finalEditorNodeId: "17643486820500",
}

const QUANQUAN_MATH_APP = {
  appName: "全学段数学智能体",
  workflowId: "81a66ab5-6410-41c0-8079-f3454d0843c7",
  routeNodeId: "1775197140264",
  finalEditorNodeId: "17643486820500",
}

const WEIGHTED_RETRIEVAL_CONFIG = {
  top_k: 3,
  score_threshold: null,
  reranking_mode: "weighted_score",
  reranking_enable: false,
  reranking_model: {
    provider: "langgenius/siliconflow/siliconflow",
    model: "netease-youdao/bce-reranker-base_v1",
  },
  weights: {
    weight_type: "customized",
    vector_setting: {
      vector_weight: 0.55,
      embedding_provider_name: "langgenius/openai_api_compatible/openai_api_compatible",
      embedding_model_name: "text-embedding-3-large",
    },
    keyword_setting: {
      keyword_weight: 0.45,
    },
  },
}

const PROBLEM_ROUTE_SYSTEM_PROMPT = [
  "你是数学技能路由器，读取用户原始问题后做最小分类。",
  "",
  "只允许输出两种结果：",
  "1. 一段简短中文寒暄回复（仅当用户是在打招呼、问你是谁、问你在不在）。",
  "2. 一行 JSON：{\"skill\":\"技能名\",\"message\":\"用[技能名]技能，[用户原始问题]\"}",
  "",
  "skill 只能从以下值中选择：",
  "- socraticmathcoach：引导思考、一步步来、启发式、不会做、不知道从哪里入手、讲思路、不要直接给答案",
  "- xueersi-math-word-problem：应用题、行程、工程、比例、鸡兔同笼、利润、植树",
  "- math-edu-assistant：教材同步、知识点讲解、按课本、年级章节、人教版、北师大版",
  "- math-tutor-lite：出题、练习题、检查答案、批改、对不对、算得对不对",
  "- math：数学计算、解方程、怎么算、等于多少",
  "- general：以上都不匹配时兜底",
  "",
  "分类优先级必须严格遵守：",
  "1. socraticmathcoach",
  "2. xueersi-math-word-problem",
  "3. math-edu-assistant",
  "4. math-tutor-lite",
  "5. math",
  "6. general",
  "",
  "规则：",
  "- 如果输出 JSON，message 必须保留用户原始问题核心内容，不要改写成别的问题。",
  "- JSON 不能带 markdown、解释、前导词、结尾语、空行或代码块。",
  "- JSON 前后不要有任何额外字符。",
].join("\n")

const QUANQUAN_MATH_EDITOR_SYSTEM_PROMPT = [
  "你是全学段数学解题老师。",
  "请基于路由结果、OCR 内容和检索上下文回答。",
  "如果图片题干不完整，先明确缺失部分，再尽量给出可判断部分的解法。",
  "回答保持清晰但不要冗长，优先输出题目信息、关键思路、步骤和结论。",
  "不要解释系统、网关、Dify 或错误提示；不要复述追踪码。",
].join("\n")

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
SITE = ${JSON.stringify(SITE_ASSISTANT)}
PROBLEM = ${JSON.stringify(PROBLEM_APP)}
QUANQUAN_MATH = ${JSON.stringify(QUANQUAN_MATH_APP)}
WEIGHTED_RETRIEVAL_CONFIG = json.loads(${JSON.stringify(JSON.stringify(WEIGHTED_RETRIEVAL_CONFIG))})
PROBLEM_ROUTE_SYSTEM_PROMPT = ${JSON.stringify(PROBLEM_ROUTE_SYSTEM_PROMPT)}
QUANQUAN_MATH_EDITOR_SYSTEM_PROMPT = ${JSON.stringify(QUANQUAN_MATH_EDITOR_SYSTEM_PROMPT)}

def run_sql(sql):
    result = subprocess.run(
        ["docker", "exec", "docker-db_postgres-1", "psql", "-U", "shenxiang", "-d", "shenxiang", "-At", "-F", "\\t", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout

def load_workflow(workflow_id):
    sql = f"""
select
  a.id::text,
  a.name,
  w.id::text,
  w.graph
from workflows w
left join apps a on a.workflow_id = w.id
where w.id = '{workflow_id}'::uuid
limit 1;
"""
    raw = run_sql(sql).strip()
    if not raw:
        raise RuntimeError(f"workflow not found: {workflow_id}")
    parts = raw.split("\\t", 3)
    if len(parts) != 4:
        raise RuntimeError(f"unexpected workflow row for {workflow_id}: {raw}")
    app_id, app_name, row_workflow_id, graph_raw = parts
    return {
        "app_id": app_id or None,
        "app_name": app_name,
        "workflow_id": row_workflow_id,
        "graph_raw": graph_raw,
        "graph": json.loads(graph_raw),
    }

def load_site_backup_graph():
    payload = json.loads(Path(SITE["backupPath"]).read_text(encoding="utf-8"))
    graph = payload["graph"]
    if isinstance(graph, str):
        graph = json.loads(graph)
    return graph

def find_node(graph, node_id):
    for node in graph.get("nodes", []):
        if str(node.get("id")) == str(node_id):
            return node
    return None

def tune_site_assistant(current_graph):
    backup_graph = load_site_backup_graph()
    has_retrieval = find_node(current_graph, SITE["retrievalNodeId"]) is not None
    target_graph = deepcopy(current_graph if has_retrieval else backup_graph)
    retrieval_node = find_node(target_graph, SITE["retrievalNodeId"])
    if retrieval_node is None:
        raise RuntimeError("site assistant retrieval node missing even in backup graph")
    data = retrieval_node.setdefault("data", {})
    data["multiple_retrieval_config"] = deepcopy(WEIGHTED_RETRIEVAL_CONFIG)
    data.setdefault("query_variable_selector", ["1777832712241", "sys.query"])
    data.setdefault("query_attachment_selector", [])
    data["retrieval_mode"] = "multiple"
    data["dataset_ids"] = data.get("dataset_ids") or ["1157e22b-8359-4e36-aad4-1f55fe71a8dc"]
    return {
        "had_retrieval": has_retrieval,
        "target_graph": target_graph,
        "retrieval_config": data["multiple_retrieval_config"],
    }

def tune_problem_route(current_graph):
    target_graph = deepcopy(current_graph)
    route_node = find_node(target_graph, PROBLEM["routeNodeId"])
    if route_node is None:
        raise RuntimeError("problem route node not found")
    data = route_node.setdefault("data", {})
    model = data.setdefault("model", {})
    completion = model.setdefault("completion_params", {})
    completion["temperature"] = 0
    completion["max_tokens"] = 128
    prompt_template = data.get("prompt_template") or []
    user_prompt = next((item for item in prompt_template if item.get("role") == "user"), None)
    data["prompt_template"] = [
        {
            "id": prompt_template[0].get("id") if prompt_template else "codex-problem-route-system",
            "role": "system",
            "text": PROBLEM_ROUTE_SYSTEM_PROMPT,
        },
        {
            "id": (user_prompt or {}).get("id", "codex-problem-route-user"),
            "role": "user",
            "text": (user_prompt or {}).get("text", "{{#sys.query#}}"),
        },
    ]
    model["name"] = "沈翔快速对话"
    model["provider"] = "langgenius/openai_api_compatible/openai_api_compatible"
    model["mode"] = "chat"
    return {
        "target_graph": target_graph,
        "before_completion_params": deepcopy(model.get("completion_params", {})),
        "after_completion_params": deepcopy(completion),
        "before_prompt_chars": len(prompt_template[0].get("text", "")) if prompt_template else 0,
        "after_prompt_chars": len(PROBLEM_ROUTE_SYSTEM_PROMPT),
        "route_model_name": model.get("name"),
    }

def tune_problem_solver(current_graph):
    target_graph = deepcopy(current_graph)
    solve_node_ids = [PROBLEM["solveNodeId"], PROBLEM["finalEditorNodeId"]]
    tuned_nodes = []

    for node_id in solve_node_ids:
        solve_node = find_node(target_graph, node_id)
        if solve_node is None:
            raise RuntimeError(f"problem solve node not found: {node_id}")
        data = solve_node.setdefault("data", {})
        model = data.setdefault("model", {})
        completion = model.setdefault("completion_params", {})
        if "temperature" not in completion:
            completion["temperature"] = 0.7
        model["name"] = "沈翔数学推理"
        model["provider"] = "langgenius/openai_api_compatible/openai_api_compatible"
        model["mode"] = "chat"
        tuned_nodes.append({
            "node_id": str(node_id),
            "title": data.get("title", ""),
            "model_name": model.get("name"),
            "completion_params": deepcopy(completion),
        })

    return {
        "target_graph": target_graph,
        "solve_nodes": tuned_nodes,
    }

def tune_quanquan_math(current_graph):
    target_graph = deepcopy(current_graph)
    route_node = find_node(target_graph, QUANQUAN_MATH["routeNodeId"])
    if route_node is None:
        raise RuntimeError("quanquan math route node not found")
    route_data = route_node.setdefault("data", {})
    route_model = route_data.setdefault("model", {})
    route_completion = route_model.setdefault("completion_params", {})
    route_completion["temperature"] = 0
    route_completion["max_tokens"] = 128
    route_model["name"] = "沈翔快速对话"
    route_model["provider"] = "langgenius/openai_api_compatible/openai_api_compatible"
    route_model["mode"] = "chat"

    editor_node = find_node(target_graph, QUANQUAN_MATH["finalEditorNodeId"])
    if editor_node is None:
        raise RuntimeError("quanquan math final editor node not found")
    editor_data = editor_node.setdefault("data", {})
    editor_model = editor_data.setdefault("model", {})
    editor_completion = editor_model.setdefault("completion_params", {})
    editor_completion["temperature"] = 0.2
    editor_completion["max_tokens"] = 900
    editor_model["name"] = "沈翔通用文本"
    editor_model["provider"] = "langgenius/openai_api_compatible/openai_api_compatible"
    editor_model["mode"] = "chat"

    prompt_template = editor_data.get("prompt_template") or []
    user_prompt = next((item for item in prompt_template if item.get("role") == "user"), None)
    editor_data["prompt_template"] = [
        {
            "id": (prompt_template[0] or {}).get("id", "codex-quanquan-math-editor-system") if prompt_template else "codex-quanquan-math-editor-system",
            "role": "system",
            "text": QUANQUAN_MATH_EDITOR_SYSTEM_PROMPT,
        },
        {
            "id": (user_prompt or {}).get("id", "codex-quanquan-math-editor-user"),
            "role": "user",
            "text": (user_prompt or {}).get("text", "对以下内容深度解答：\\n{{#1775197140264.text#}}{{#context#}}"),
        },
    ]

    return {
        "target_graph": target_graph,
        "route_node": {
            "node_id": QUANQUAN_MATH["routeNodeId"],
            "title": route_data.get("title", ""),
            "model_name": route_model.get("name"),
            "completion_params": deepcopy(route_completion),
        },
        "final_editor_node": {
            "node_id": QUANQUAN_MATH["finalEditorNodeId"],
            "title": editor_data.get("title", ""),
            "model_name": editor_model.get("name"),
            "completion_params": deepcopy(editor_completion),
            "system_prompt_chars": len(QUANQUAN_MATH_EDITOR_SYSTEM_PROMPT),
        },
    }

site_workflow = load_workflow(SITE["workflowId"])
problem_workflow = load_workflow(PROBLEM["workflowId"])
quanquan_math_workflow = load_workflow(QUANQUAN_MATH["workflowId"])

site_tuned = tune_site_assistant(site_workflow["graph"])
problem_tuned = tune_problem_route(problem_workflow["graph"])
problem_solver_tuned = tune_problem_solver(problem_tuned["target_graph"])
quanquan_math_tuned = tune_quanquan_math(quanquan_math_workflow["graph"])

changes = []

if site_tuned["target_graph"] != site_workflow["graph"]:
    changes.append({
        "app_id": site_workflow["app_id"],
        "app_name": site_workflow["app_name"],
        "workflow_id": site_workflow["workflow_id"],
        "before_graph_raw": site_workflow["graph_raw"],
        "after_graph": site_tuned["target_graph"],
        "reason": "restore_or_lighten_site_assistant_retrieval",
    })

if problem_solver_tuned["target_graph"] != problem_workflow["graph"]:
    changes.append({
        "app_id": problem_workflow["app_id"],
        "app_name": problem_workflow["app_name"],
        "workflow_id": problem_workflow["workflow_id"],
        "before_graph_raw": problem_workflow["graph_raw"],
        "after_graph": problem_solver_tuned["target_graph"],
        "reason": "tighten_problem_route_and_solver_models",
    })

if quanquan_math_tuned["target_graph"] != quanquan_math_workflow["graph"]:
    changes.append({
        "app_id": quanquan_math_workflow["app_id"],
        "app_name": quanquan_math_workflow["app_name"],
        "workflow_id": quanquan_math_workflow["workflow_id"],
        "before_graph_raw": quanquan_math_workflow["graph_raw"],
        "after_graph": quanquan_math_tuned["target_graph"],
        "reason": "tighten_quanquan_math_route_and_final_editor",
    })

summary = {
    "apply": APPLY,
    "planned_changes": len(changes),
    "site_assistant": {
        "workflow_id": site_workflow["workflow_id"],
        "app_name": site_workflow["app_name"],
        "had_retrieval": site_tuned["had_retrieval"],
        "current_node_count": len(site_workflow["graph"].get("nodes", [])),
        "target_node_count": len(site_tuned["target_graph"].get("nodes", [])),
        "target_retrieval_config": site_tuned["retrieval_config"],
    },
    "problem": {
        "workflow_id": problem_workflow["workflow_id"],
        "app_name": problem_workflow["app_name"],
        "before_completion_params": problem_tuned["before_completion_params"],
        "after_completion_params": problem_tuned["after_completion_params"],
        "before_prompt_chars": problem_tuned["before_prompt_chars"],
        "after_prompt_chars": problem_tuned["after_prompt_chars"],
        "route_model_name": problem_tuned["route_model_name"],
        "solve_nodes": problem_solver_tuned["solve_nodes"],
    },
    "quanquan_math": {
        "workflow_id": quanquan_math_workflow["workflow_id"],
        "app_name": quanquan_math_workflow["app_name"],
        "route_node": quanquan_math_tuned["route_node"],
        "final_editor_node": quanquan_math_tuned["final_editor_node"],
    },
}

if not APPLY:
    print(json.dumps(summary, ensure_ascii=False))
    raise SystemExit(0)

if not changes:
    print(json.dumps({**summary, "applied": False, "message": "no changes"}, ensure_ascii=False))
    raise SystemExit(0)

label = "codex-site-problem-tune-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
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
                    "graph": json.loads(item["before_graph_raw"]),
                    "reason": item["reason"],
                }
                for item in changes
            ],
        },
        ensure_ascii=False,
        indent=2,
    ),
    encoding="utf-8",
)

sql_chunks = ["begin;"]
for item in changes:
    original_graph = item["before_graph_raw"].replace("'", "''")
    updated_graph = json.dumps(item["after_graph"], ensure_ascii=False).replace("'", "''")
    app_id = item["app_id"]
    app_id_sql = f"'{app_id}'" if app_id else "null"
    app_name = (item["app_name"] or "").replace("'", "''")
    workflow_id = item["workflow_id"]
    sql_chunks.append(f"""
insert into codex_dify_workflow_graph_backups
  (backup_label, workflow_id, app_id, app_name, graph)
values
  ('{label}', '{workflow_id}', {app_id_sql}, '{app_name}', '{original_graph}');
""")
    sql_chunks.append(
        f"update workflows set graph = '{updated_graph}', updated_at = now() where id = '{workflow_id}'::uuid;"
    )
sql_chunks.append("commit;")
sql = "\\n".join(sql_chunks)
subprocess.run(
    ["docker", "exec", "-i", "docker-db_postgres-1", "psql", "-q", "-U", "shenxiang", "-d", "shenxiang", "-v", "ON_ERROR_STOP=1"],
    input=sql,
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

  const outputPath = args.outputPath || path.join(process.cwd(), "logs", `dify-tune-site-problem-workflows-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2))

  console.log(JSON.stringify(payload, null, 2))
  console.log(`Saved ${outputPath}`)
}

main()
