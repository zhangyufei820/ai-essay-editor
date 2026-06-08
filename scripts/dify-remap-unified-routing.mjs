#!/usr/bin/env node

import fs from "fs"
import os from "os"
import path from "path"
import { spawnSync } from "child_process"

const PRESERVED_APP_NAMES = new Set([
  "Open Claw",
  "codex",
])

const TARGET_ENV_KEYS = [
  "DIFY_GENERAL_CHAT_API_KEY",
  "DIFY_API_KEY_GPT5",
  "DIFY_API_KEY_CLAUDE",
  "DIFY_API_KEY_GEMINI",
  "DIFY_API_KEY_GROK42",
  "ESSAY_CORRECTION_API_KEY",
  "DIFY_WORKFLOW_SKILL_API_KEY",
  "DIFY_TEACHING_PRO_API_KEY",
  "DIFY_QUANQUANMATH_API_KEY",
  "DIFY_QUANQUANENGLISH_API_KEY",
  "DIFY_VOCAB_CARD_API_KEY",
  "DIFY_PROBLEM_API_KEY",
  "DIFY_BEIKE_PRO_API_KEY",
  "DIFY_BANZHUREN_API_KEY",
  "DIFY_ALL_IN_ONE_AGENT_API_KEY",
  "DIFY_SUPER_ALL_IN_ONE_AGENT_API_KEY",
  "DIFY_WORKSHEET_DIAGNOSIS_API_KEY",
  "DIFY_AI_WRITING_PAPER_API_KEY",
  "DIFY_EXPERIMENT_REPORT_API_KEY",
  "DIFY_IMAGE_PROMPT_REVERSE_API_KEY",
  "DIFY_IMAGE_PROMPT_OPTIMIZER_API_KEY",
  "DIFY_PRESENTATION_API_KEY",
  "DIFY_SPARKPAGE_API_KEY",
]

const PROVIDER_NAME = "langgenius/openai_api_compatible/openai_api_compatible"
const DEFAULT_MODEL_NAME = "沈翔通用文本"
const APPROVED_DIFY_GATEWAY_MODEL_NAMES = new Set([
  "沈翔快速对话",
  "沈翔语文优先",
  "沈翔数学推理",
  "沈翔通用文本",
  "沈翔图像识别",
])

const APP_RULES = {
  "3d提示词优化": {
    defaultModelName: "沈翔通用文本",
  },
  "Image Prompt Studio Chatflow v2.2 Fixed": {
    defaultModelName: "沈翔通用文本",
  },
  "K12中英文作文企业级Chatflow-显性提示词版": {
    defaultModelName: "沈翔语文优先",
  },
  "Minimal Video Gateway Fixed": {
    defaultModelName: "沈翔通用文本",
  },
  "Notes to Flashcards": {
    defaultModelName: "沈翔通用文本",
  },
  "Teacher Custom Agent Workflow Fallback": {
    defaultModelName: "沈翔语文优先",
  },
  "OpenClaw_Expert_Bridge": {
    defaultModelName: "沈翔快速对话",
  },
  "gemini 图像提示词": {
    defaultModelName: "沈翔通用文本",
  },
  "gpt2图像提示词优化": {
    defaultModelName: "沈翔通用文本",
  },
  "网站助手": {
    defaultModelName: "沈翔快速对话",
  },
  "网页搜索专用助手": {
    defaultModelName: "沈翔快速对话",
  },
  "ChatGPT 5.4": {
    defaultModelName: "沈翔通用文本",
  },
  "Claude 4.6 think": {
    defaultModelName: "沈翔语文优先",
  },
  "Gemini 3.1 pro": {
    defaultModelName: "沈翔数学推理",
  },
  "grok-4.2": {
    defaultModelName: "沈翔通用文本",
  },
  "全学段作文批改超级智能体": {
    nodeRules: [
      [/视觉提取/i, "沈翔图像识别"],
      [/快速回复/i, "沈翔快速对话"],
      [/.*/i, "沈翔语文优先"],
    ],
  },
  "写作技能统一路由助手": {
    nodeRules: [
      [/意图路由/i, "沈翔快速对话"],
      [/.*/i, "沈翔语文优先"],
    ],
  },
  "教学评智能助手-Pro": {
    nodeRules: [
      [/极速回复/i, "沈翔快速对话"],
      [/.*/i, "沈翔语文优先"],
    ],
  },
  "全学段数学智能体": {
    nodeRules: [
      [/视觉提取/i, "沈翔图像识别"],
      [/.*/i, "沈翔数学推理"],
    ],
  },
  "全学段英语智能体": {
    nodeRules: [
      [/视觉提取/i, "沈翔图像识别"],
      [/.*/i, "沈翔通用文本"],
    ],
  },
  "词镜记忆卡": {
    nodeRules: [
      [/对话理解|陪聊回复/i, "沈翔快速对话"],
      [/.*/i, "沈翔通用文本"],
    ],
  },
  "题目解析专用智能体": {
    nodeRules: [
      [/视觉提取/i, "沈翔图像识别"],
      [/问题通道/i, "沈翔快速对话"],
      [/.*/i, "沈翔数学推理"],
    ],
  },
  "全学段备课助手pro": {
    nodeRules: [
      [/视觉提取/i, "沈翔图像识别"],
      [/.*/i, "沈翔语文优先"],
    ],
  },
  "班主任超级助手": {
    nodeRules: [
      [/视觉提取/i, "沈翔图像识别"],
      [/.*/i, "沈翔语文优先"],
    ],
  },
  "数学图片与动画生成器（Codex Gateway）-Chatflow稳定启动v3": {
    nodeRules: [
      [/图片.*识别|视觉/i, "沈翔图像识别"],
      [/.*/i, "沈翔数学推理"],
    ],
  },
  "错题诊断海报-后端分析链路": {
    nodeRules: [
      [/OCR|图片/i, "沈翔图像识别"],
      [/.*/i, "沈翔通用文本"],
    ],
  },
  "论文写作": {
    nodeRules: [
      [/视觉提取|LLM 3/i, "沈翔图像识别"],
      [/LLM 4|路由|调度/i, "沈翔快速对话"],
      [/.*/i, "沈翔语文优先"],
    ],
  },
  "实验报告智能助手": {
    defaultModelName: "沈翔语文优先",
  },
}

const FALLBACK_RULES = [
  [/视觉提取|OCR|图片.*识别|图像.*识别|识别图片|图片内容识别/i, "沈翔图像识别"],
  [/快速|极速|意图|路由|回复|理解/i, "沈翔快速对话"],
  [/数学|推理/i, "沈翔数学推理"],
  [/作文|写作|润色|语文|实验报告|备课|班主任|教案|教师|论文|学生表现|一致性/i, "沈翔语文优先"],
]

function parseArgs(argv) {
  const args = {
    apply: false,
    allApps: false,
    host: process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156",
    includePreserved: false,
    appNames: [],
    nodeTypes: ["llm", "question-classifier"],
  }

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--apply") {
      args.apply = true
    } else if (arg === "--all-apps") {
      args.allApps = true
    } else if (arg === "--host") {
      args.host = argv[++i]
    } else if (arg === "--app") {
      args.appNames.push(argv[++i])
    } else if (arg === "--include-preserved") {
      args.includePreserved = true
    } else if (arg === "--node-type") {
      args.nodeTypes.push(argv[++i])
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  args.nodeTypes = [...new Set(args.nodeTypes.filter(Boolean))]
  return args
}

function runRemote(host, script) {
  const result = spawnSync("ssh", [host, "python3", "-"], {
    input: script,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `remote command failed with code ${result.status}`)
  }

  return result.stdout
}

function pickGatewayModel(nodeTitle, appName, nodeType) {
  if (nodeType === "question-classifier") return "沈翔快速对话"

  const appRule = APP_RULES[appName]
  if (appRule?.nodeRules) {
    for (const [pattern, modelName] of appRule.nodeRules) {
      if (pattern.test(nodeTitle)) return modelName
    }
  }

  if (appRule?.defaultModelName) return appRule.defaultModelName

  for (const [pattern, modelName] of FALLBACK_RULES) {
    if (pattern.test(nodeTitle)) return modelName
  }

  return DEFAULT_MODEL_NAME
}

function assertApprovedGatewayModelName(modelName, appName, nodeTitle) {
  if (APPROVED_DIFY_GATEWAY_MODEL_NAMES.has(modelName)) return
  throw new Error(
    `unapproved Dify gateway target model "${modelName}" for app "${appName}" node "${nodeTitle}". ` +
      "Realtime Dify nodes must use the 沈翔* gateway aliases; keep retrieval, Open Claw, and codex as the only exemptions.",
  )
}

function buildRemoteAuditScript({ appNames, allApps, includePreserved, nodeTypes }) {
  const appFilter = JSON.stringify(appNames)
  const nodeTypeFilter = JSON.stringify(nodeTypes)
  const allAppsLiteral = allApps ? "True" : "False"
  const includePreservedLiteral = includePreserved ? "True" : "False"
  return `
import json
import subprocess
from pathlib import Path

PRESERVED = ${JSON.stringify([...PRESERVED_APP_NAMES])}
APP_FILTER = set(${appFilter})
ALL_APPS = ${allAppsLiteral}
INCLUDE_PRESERVED = ${includePreservedLiteral}
NODE_TYPES = set(${nodeTypeFilter})
TARGET_ENV_KEYS = ${JSON.stringify(TARGET_ENV_KEYS)}

target_app_ids = set()
if not ALL_APPS:
  env = {}
  for raw in Path("/data/ai-essay-editor/.env.production").read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    k, v = line.split("=", 1)
    if k in TARGET_ENV_KEYS:
      env[k] = v.strip().strip('"').strip("'")

  for key in TARGET_ENV_KEYS:
    token = env.get(key, "")
    if not token:
      continue
    safe = token.replace("'", "''")
    sql = f"select coalesce(app_id::text, '') from api_tokens where token = '{safe}' limit 1;"
    token_res = subprocess.run(
      ["docker", "exec", "docker-db_postgres-1", "psql", "-U", "shenxiang", "-d", "shenxiang", "-At", "-c", sql],
      capture_output=True,
      text=True,
      check=True,
    )
    app_id = (token_res.stdout or "").strip()
    if app_id:
      target_app_ids.add(app_id)

sql = """
with workflow_nodes as (
  select
    a.id::text as app_id,
    a.name as app_name,
    a.mode as app_mode,
    a.workflow_id::text as workflow_id,
    w.graph as workflow_graph,
    n as node
  from apps a
  join workflows w on w.id = a.workflow_id
  cross join jsonb_array_elements((w.graph::jsonb)->'nodes') as n
  where a.enable_api = true
    and a.workflow_id is not null
)
select json_agg(row_to_json(t))
from (
  select
    app_id,
    app_name,
    app_mode,
    workflow_id,
    workflow_graph,
    node->>'id' as node_id,
    node->'data'->>'type' as node_type,
    node->'data'->>'title' as node_title,
    coalesce(node->'data'->'model'->>'name', '') as model_name,
    coalesce(node->'data'->'model'->>'provider', '') as provider_name
  from workflow_nodes
  where node->'data'->>'type' in ('llm', 'question-classifier')
) t;
"""

res = subprocess.run(
  ["docker", "exec", "docker-db_postgres-1", "psql", "-U", "shenxiang", "-d", "shenxiang", "-At", "-c", sql],
  capture_output=True,
  text=True,
  check=True,
)
rows = json.loads(res.stdout or "null") or []
filtered = []
for row in rows:
  if row["node_type"] not in NODE_TYPES:
    continue
  if not INCLUDE_PRESERVED and row["app_name"] in PRESERVED:
    continue
  if not ALL_APPS and target_app_ids and row["app_id"] not in target_app_ids:
    continue
  if APP_FILTER and row["app_name"] not in APP_FILTER:
    continue
  filtered.append(row)
print(json.dumps(filtered, ensure_ascii=False))
`
}

function buildRemoteApplyScript(changes) {
  const encoded = JSON.stringify(changes)
  return `
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

CHANGES = json.loads(${JSON.stringify(encoded)})
label = "codex-unified-routing-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
sql_path = Path("/tmp") / f"{label}.sql"

sql_chunks = ["begin;"]

grouped = {}
for item in CHANGES:
  grouped.setdefault(item["workflow_id"], []).append(item)

for workflow_id, items in grouped.items():
  base = items[0]
  graph = json.loads(base["workflow_graph"])
  original_graph = base["workflow_graph"].replace("'", "''")
  app_name = base["app_name"].replace("'", "''")
  app_id = base["app_id"]
  pending = {item["node_id"]: item for item in items}

  for node in graph.get("nodes", []):
    node_id = str(node.get("id", ""))
    item = pending.get(node_id)
    if not item:
      continue
    data = node.setdefault("data", {})
    model = data.setdefault("model", {})
    model["provider"] = ${JSON.stringify(PROVIDER_NAME)}
    model["name"] = item["target_model_name"]
    pending.pop(node_id, None)

  if pending:
    missing = ", ".join(sorted(pending.keys()))
    raise RuntimeError(f"nodes not found in workflow {workflow_id}: {missing}")

  graph_json = json.dumps(graph, ensure_ascii=False).replace("'", "''")

  sql_chunks.append(f"""
insert into codex_dify_workflow_graph_backups
  (backup_label, workflow_id, app_id, app_name, graph)
values
  ('{label}', '{workflow_id}', '{app_id}', '{app_name}', '{original_graph}');
""")
  sql_chunks.append(
    f"update workflows set graph = '{graph_json}', updated_at = now() where id = '{workflow_id}';"
  )

sql_chunks.append("commit;")
sql_path.write_text("\\n".join(sql_chunks), encoding="utf-8")
subprocess.run(
  ["docker", "cp", str(sql_path), "docker-db_postgres-1:/tmp/dify-remap.sql"],
  check=True,
)
subprocess.run(
  ["docker", "exec", "docker-db_postgres-1", "psql", "-U", "shenxiang", "-d", "shenxiang", "-v", "ON_ERROR_STOP=1", "-f", "/tmp/dify-remap.sql"],
  check=True,
)
print(json.dumps({"backup_label": label, "updated": len(CHANGES)}, ensure_ascii=False))
`
}

function main() {
  const args = parseArgs(process.argv)
  const auditRaw = runRemote(args.host, buildRemoteAuditScript(args))
  const rows = JSON.parse(auditRaw)

  const changes = []
  for (const row of rows) {
    const targetModelName = pickGatewayModel(row.node_title || "", row.app_name || "", row.node_type || "")
    assertApprovedGatewayModelName(targetModelName, row.app_name || "", row.node_title || "")
    if (row.model_name === targetModelName && row.provider_name === PROVIDER_NAME) continue
    changes.push({
      ...row,
      target_model_name: targetModelName,
    })
  }

  const summary = changes.reduce((acc, change) => {
    const key = change.app_name
    if (!acc[key]) acc[key] = []
    acc[key].push({
      node_type: change.node_type,
      node_title: change.node_title,
      from_model: change.model_name,
      to_model: change.target_model_name,
    })
    return acc
  }, {})

  const output = {
    apply: args.apply,
    all_apps: args.allApps,
    host: args.host,
    include_preserved: args.includePreserved,
    node_types: args.nodeTypes,
    preserved_apps: [...PRESERVED_APP_NAMES],
    approved_gateway_model_names: [...APPROVED_DIFY_GATEWAY_MODEL_NAMES],
    exempt_model_types: ["embeddings", "rerank"],
    total_changes: changes.length,
    apps: summary,
  }

  fs.writeFileSync(
    path.join(process.cwd(), "logs", `dify-remap-unified-routing-${Date.now()}.json`),
    JSON.stringify(output, null, 2),
  )

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)

  if (!args.apply) return

  if (changes.length === 0) {
    process.stdout.write("No changes to apply.\n")
    return
  }

  const applyRaw = runRemote(args.host, buildRemoteApplyScript(changes))
  process.stdout.write(`${applyRaw}\n`)
}

try {
  fs.mkdirSync(path.join(process.cwd(), "logs"), { recursive: true })
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
