#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

function parseArgs(argv) {
  const args = {
    host: process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156",
    minutes: Number(process.env.DIFY_AUDIT_MINUTES || 180),
    limit: Number(process.env.DIFY_AUDIT_LIMIT || 20),
    outputPath: "",
    markers: [],
    appNames: [],
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--host") {
      args.host = argv[++index]
    } else if (arg === "--minutes") {
      args.minutes = Number(argv[++index]) || args.minutes
    } else if (arg === "--limit") {
      args.limit = Number(argv[++index]) || args.limit
    } else if (arg === "--marker") {
      args.markers.push(argv[++index])
    } else if (arg === "--app") {
      args.appNames.push(argv[++index])
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

function buildRemoteScript({ minutes, limit, markers, appNames }) {
  return `
import json
import subprocess

MINUTES = ${JSON.stringify(minutes)}
LIMIT = ${JSON.stringify(limit)}
MARKERS = ${JSON.stringify(markers)}
APP_NAMES = set(${JSON.stringify(appNames)})

run_sql = """
select
  wr.id::text as workflow_run_id,
  a.name as app_name,
  wr.workflow_id::text as workflow_id,
  wr.status,
  wr.elapsed_time,
  wr.total_tokens,
  wr.created_at,
  wr.finished_at,
  coalesce(wr.inputs, '') as inputs
from workflow_runs wr
join apps a on a.id = wr.app_id
where wr.created_at >= now() - interval '${minutes} minutes'
order by wr.created_at desc
limit ${limit * 8};
"""

run_rows = subprocess.run(
  ["docker", "exec", "docker-db_postgres-1", "psql", "-U", "shenxiang", "-d", "shenxiang", "-At", "-F", "\\t", "-c", run_sql],
  capture_output=True,
  text=True,
  check=True,
)

runs = []
for line in (run_rows.stdout or "").splitlines():
  parts = line.split("\\t")
  if len(parts) < 9:
    continue
  row = {
    "workflow_run_id": parts[0],
    "app_name": parts[1],
    "workflow_id": parts[2],
    "status": parts[3],
    "elapsed_time": float(parts[4] or 0),
    "total_tokens": int(parts[5] or 0),
    "created_at": parts[6],
    "finished_at": parts[7],
    "inputs": parts[8],
  }
  if APP_NAMES and row["app_name"] not in APP_NAMES:
    continue
  matched_markers = [marker for marker in MARKERS if marker and marker in row["inputs"]]
  if MARKERS and not matched_markers:
    continue
  row["matched_markers"] = matched_markers
  row["inputs_excerpt"] = row["inputs"][:320]
  runs.append(row)

runs = runs[:LIMIT]
run_ids = [row["workflow_run_id"] for row in runs]

node_map = {}
if run_ids:
  quoted = ",".join("'" + run_id.replace("'", "''") + "'" for run_id in run_ids)
  node_sql = f"""
select
  workflow_run_id::text,
  index,
  node_id,
  node_type,
  title,
  status,
  elapsed_time,
  created_at,
  finished_at
from workflow_node_executions
where workflow_run_id in ({quoted})
order by workflow_run_id, index;
"""
  node_rows = subprocess.run(
    ["docker", "exec", "docker-db_postgres-1", "psql", "-U", "shenxiang", "-d", "shenxiang", "-At", "-F", "\\t", "-c", node_sql],
    capture_output=True,
    text=True,
    check=True,
  )
  for line in (node_rows.stdout or "").splitlines():
    parts = line.split("\\t")
    if len(parts) < 9:
      continue
    item = {
      "index": int(parts[1] or 0),
      "node_id": parts[2],
      "node_type": parts[3],
      "title": parts[4],
      "status": parts[5],
      "elapsed_time": float(parts[6] or 0),
      "created_at": parts[7],
      "finished_at": parts[8],
    }
    node_map.setdefault(parts[0], []).append(item)

for row in runs:
  nodes = node_map.get(row["workflow_run_id"], [])
  row["node_executions"] = nodes
  row["slowest_nodes"] = sorted(nodes, key=lambda item: item["elapsed_time"], reverse=True)[:5]

print(json.dumps({
  "minutes": MINUTES,
  "limit": LIMIT,
  "markers": MARKERS,
  "app_names": list(APP_NAMES),
  "runs": runs,
}, ensure_ascii=False))
`
}

function printSummary(payload) {
  console.log("| App | Run | Status | Elapsed s | Tokens | Slowest node | Slowest s | Markers |")
  console.log("|---|---|---|---:|---:|---|---:|---|")
  for (const run of payload.runs) {
    const slowest = run.slowest_nodes?.[0]
    console.log(
      `| ${run.app_name} | ${run.workflow_run_id.slice(0, 8)} | ${run.status} | ${run.elapsed_time.toFixed(2)} | ${run.total_tokens} | ${slowest?.title || "-"} | ${slowest ? slowest.elapsed_time.toFixed(2) : "-"} | ${(run.matched_markers || []).join(", ")} |`
    )
  }
}

function main() {
  const args = parseArgs(process.argv)
  const raw = runRemote(args.host, buildRemoteScript(args))
  const payload = JSON.parse(raw)

  const outputPath = args.outputPath || path.join(process.cwd(), "logs", `dify-workflow-latency-audit-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2))

  printSummary(payload)
  console.log(`\nSaved ${outputPath}`)
}

main()
