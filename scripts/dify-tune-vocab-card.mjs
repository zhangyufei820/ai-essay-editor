#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

const DEFAULT_HOST = process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156"

const VOCAB_APP = {
  appId: "7aa60548-0cfc-4688-a345-a7e37f234d63",
  appName: "词镜记忆卡",
  publishedWorkflowId: "59f82a10-bd32-4edb-9c2f-e05b3d005435",
  draftWorkflowId: "b5f1eeec-58f2-4dce-a004-8b94e153d563",
}

const TARGET_PROVIDER = "langgenius/openai_api_compatible/openai_api_compatible"

const NODE_TUNING = {
  "1101": {
    modelName: "沈翔快速对话",
    completionParams: {
      max_tokens: 512,
      temperature: 0,
    },
  },
  "1004": {
    modelName: "沈翔通用文本",
    completionParams: {
      max_tokens: 1800,
      temperature: 0,
    },
  },
  "1007": {
    modelName: "沈翔通用文本",
    completionParams: {
      max_tokens: 384,
      temperature: 0,
    },
  },
  "1010": {
    modelName: "沈翔通用文本",
    completionParams: {
      max_tokens: 1024,
      temperature: 0,
    },
  },
}

const PROMPT_APPENDERS = {
  "1004": {
    system: `

新增执行约束：
20. 如果 morphemes.type = chunk，则 meaning_cn 和 memory_hint_cn 中不要出现“词根”“词源”字样，即使是否定表达也不要出现；直接写“拼写记忆块”。
21. pronunciation.phonics_tip_cn、mouth_shape_tip_cn、common_pronunciation_mistakes 中不要出现“爆破两次”“发两次”“两个 p 都要发音”等字样；统一表述为“中间是两个 p；/p/ 正常爆破一次”。
22. spelling.spelling_formula 只写能直接拼回原单词的拆分式，例如“app + le”；不要再写“= apple”，不要重复完整单词。
23. 为保证展示速度，secondary_cn 最多 2 条，keywords 最多 4 条，common_pronunciation_mistakes 最多 2 条，examples 最多 1 个，self_check_questions 最多 3 个。
24. 内容尽量短句，避免同义重复；在不影响学习效果的前提下优先简洁。
`,
    user: `

20. spelling_formula 只写拆分式，不要写等号和完整单词，例如写 "app + le"，不要写 "app + le = apple"。
21. 如果 morphemes.type = chunk，meaning_cn / memory_hint_cn 里不要出现“词根”“词源”这两个词。
22. 发音相关字段不要出现“爆破两次”“发两次”等字样，只写“中间是两个 p；/p/ 正常爆破一次”。
23. secondary_cn 最多 2 条，keywords 最多 4 条，examples 最多 1 个，self_check_questions 最多 3 个。
24. 在不影响学习效果的前提下尽量简洁，减少冗长解释。
`,
  },
  "1010": {
    system: `

新增修复约束：
10. spelling_formula 只写拆分式，不要写等号和重复完整单词。
11. 如果 type = chunk，meaning_cn 和 memory_hint_cn 不要出现“词根”“词源”字样。
12. 发音相关字段不要出现“爆破两次”“发两次”等字样；统一写“中间是两个 p；/p/ 正常爆破一次”。
13. 只输出真正需要修复的最少字段，避免把无问题字段整段重写。
`,
  },
  "1007": {
    system: `

企业级质检提速约束：
13. 你的任务是做最短裁决，不要输出低价值润色建议。
14. 如果 safe_to_show = true 且 rewrite_required = false，且只存在轻微措辞优化空间，则 issues 输出 []。
15. 只有会影响学习效果、展示安全或需要重写的问题，才输出 issues。
16. issues 最多 2 条；summary_cn 控制在 18 个中文字符以内。
`,
    user: `

提速要求：
1. 可直接展示时输出 issues = []。
2. 只有影响学习结果或需要重写的问题才写进 issues。
3. issues 最多 2 条。
4. 通过态 summary_cn 直接写“通过，可直接展示。”。
`,
  },
}

const PROMPT_BLOCK_MARKERS = {
  "1007": {
    system: "企业级质检提速约束：",
    user: "提速要求：",
  },
}

const CODE_REPLACEMENTS = {
  "1006": [
    {
      find: `def add_issue(issues, field, severity, message_cn, suggestion_cn):
    issues.append({
        "field": field,
        "severity": severity,
        "message_cn": message_cn,
        "suggestion_cn": suggestion_cn
    })

def main(card_json_text: str, normalized_word: str, letter_counts_json: str, repeated_letters_json: str) -> dict:
`,
      replace: `def add_issue(issues, field, severity, message_cn, suggestion_cn):
    issues.append({
        "field": field,
        "severity": severity,
        "message_cn": message_cn,
        "suggestion_cn": suggestion_cn
    })

def normalize_spelling_formula(value: str) -> str:
    text = str(value or "").strip()
    if "=" in text:
        left = text.split("=", 1)[0].strip()
        if left:
            return left
    return text

def chunk_claims_root_or_etymology(text: str) -> bool:
    t = str(text or "").replace(" ", "")
    if not t:
        return False
    negative_markers = [
        "不是词根",
        "不是词源",
        "非词根",
        "非词源",
        "不属于词根",
        "不属于词源",
        "不作词根",
        "不作词源",
        "不进行词根",
        "不进行词源",
        "无需词根",
        "无需词源",
    ]
    if any(marker in t for marker in negative_markers):
        return False
    return "词根" in t or "词源" in t

def pronunciation_claims_double_p(text: str) -> bool:
    t = str(text or "").replace(" ", "")
    if not t:
        return False
    negative_markers = [
        "不要",
        "不需要",
        "不能",
        "不是",
        "不代表",
        "只爆破一次",
        "正常爆破一次",
    ]
    bad_fragments = [
        "p音爆破两次",
        "/p/爆破两次",
        "发两次/p/",
        "/p/发两次",
        "两个p都要发音",
        "两个p都发音",
    ]
    if any(fragment in t for fragment in bad_fragments):
        return not any(marker in t for marker in negative_markers)
    return False

def main(card_json_text: str, normalized_word: str, letter_counts_json: str, repeated_letters_json: str) -> dict:
`,
    },
    {
      find: `    formula_letters = letters_only(formula)
    if formula and formula_letters != word:
        add_issue(
            issues,
            "spelling.spelling_formula",
            "high",
            f"spelling_formula 拼回后是 {formula_letters}，不是 {word}。",
            "请让 spelling_formula 能准确拼回原单词。"
        )
`,
      replace: `    normalized_formula = normalize_spelling_formula(formula)
    formula_letters = letters_only(normalized_formula)
    if formula and formula_letters != word:
        add_issue(
            issues,
            "spelling.spelling_formula",
            "high",
            f"spelling_formula 拼回后是 {formula_letters}，不是 {word}。",
            "请让 spelling_formula 只保留能拼回原单词的拆分式。"
        )
`,
    },
    {
      find: `        if "爆破两次" in pron_text or "发两次" in pron_text:
            add_issue(
                issues,
                "pronunciation",
                "high",
                "apple 的发音提示把两个 p 误导成发音重复。",
                "请说明两个 p 是拼写规则，/p/ 发音正常爆破一次。"
            )
`,
      replace: `        if pronunciation_claims_double_p(pron_text):
            add_issue(
                issues,
                "pronunciation",
                "high",
                "apple 的发音提示把两个 p 误导成发音重复。",
                "请说明两个 p 是拼写规则，/p/ 发音正常爆破一次。"
            )
`,
    },
    {
      find: `        if mtype == "chunk":
            if "词根" in mtext or "词源" in mtext:
                add_issue(
                    issues,
                    f"morphemes[{idx}]",
                    "high",
                    "chunk 被解释成了词根或词源。",
                    "chunk 只能叫拼写记忆块，不能冒充词根词源。"
                )
`,
      replace: `        if mtype == "chunk":
            if chunk_claims_root_or_etymology(mtext):
                add_issue(
                    issues,
                    f"morphemes[{idx}]",
                    "high",
                    "chunk 被解释成了词根或词源。",
                    "chunk 只能叫拼写记忆块，不能冒充词根词源。"
                )
`,
    },
  ],
  "1011": [
    {
      find: `def add_issue(issues, field, severity, message_cn, suggestion_cn):
    issues.append({
        "field": field,
        "severity": severity,
        "message_cn": message_cn,
        "suggestion_cn": suggestion_cn
    })

def has_repeated_letter_tip(text: str, letter: str, count: int) -> bool:
`,
      replace: `def add_issue(issues, field, severity, message_cn, suggestion_cn):
    issues.append({
        "field": field,
        "severity": severity,
        "message_cn": message_cn,
        "suggestion_cn": suggestion_cn
    })

def normalize_spelling_formula(value: str) -> str:
    text = str(value or "").strip()
    if "=" in text:
        left = text.split("=", 1)[0].strip()
        if left:
            return left
    return text

def chunk_claims_root_or_etymology(text: str) -> bool:
    t = str(text or "").replace(" ", "")
    if not t:
        return False
    negative_markers = [
        "不是词根",
        "不是词源",
        "非词根",
        "非词源",
        "不属于词根",
        "不属于词源",
        "不作词根",
        "不作词源",
        "不进行词根",
        "不进行词源",
        "无需词根",
        "无需词源",
    ]
    if any(marker in t for marker in negative_markers):
        return False
    return "词根" in t or "词源" in t

def pronunciation_claims_double_p(text: str) -> bool:
    t = str(text or "").replace(" ", "")
    if not t:
        return False
    negative_markers = [
        "不要",
        "不需要",
        "不能",
        "不是",
        "不代表",
        "只爆破一次",
        "正常爆破一次",
    ]
    bad_fragments = [
        "p音爆破两次",
        "/p/爆破两次",
        "发两次/p/",
        "/p/发两次",
        "两个p都要发音",
        "两个p都发音",
    ]
    if any(fragment in t for fragment in bad_fragments):
        return not any(marker in t for marker in negative_markers)
    return False

def has_repeated_letter_tip(text: str, letter: str, count: int) -> bool:
`,
    },
    {
      find: `    formula_letters = letters_only(formula)
`,
      replace: `    formula_letters = letters_only(normalize_spelling_formula(formula))
`,
    },
    {
      find: `        if mtype == "chunk":
            if "词根" in mtext or "词源" in mtext:
                add_issue(
                    issues,
                    f"morphemes[{idx}]",
                    "high",
                    "chunk 被解释成了词根或词源。",
                    "chunk 只能叫拼写记忆块，不能冒充词根词源。"
                )
`,
      replace: `        if mtype == "chunk":
            if chunk_claims_root_or_etymology(mtext):
                add_issue(
                    issues,
                    f"morphemes[{idx}]",
                    "high",
                    "chunk 被解释成了词根或词源。",
                    "chunk 只能叫拼写记忆块，不能冒充词根词源。"
                )
`,
    },
    {
      find: `        if "爆破两次" in pron_text or "发两次" in pron_text:
            add_issue(
                issues,
                "pronunciation",
                "high",
                "apple 的发音提示把两个 p 误导成发音重复。",
                "请说明两个 p 是拼写规则，/p/ 发音正常爆破一次。"
            )
`,
      replace: `        if pronunciation_claims_double_p(pron_text):
            add_issue(
                issues,
                "pronunciation",
                "high",
                "apple 的发音提示把两个 p 误导成发音重复。",
                "请说明两个 p 是拼写规则，/p/ 发音正常爆破一次。"
            )
`,
    },
  ],
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
    maxBuffer: 30 * 1024 * 1024,
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
VOCAB_APP = ${JSON.stringify(VOCAB_APP)}
TARGET_PROVIDER = ${JSON.stringify(TARGET_PROVIDER)}
NODE_TUNING = json.loads(${JSON.stringify(JSON.stringify(NODE_TUNING))})
PROMPT_APPENDERS = json.loads(${JSON.stringify(JSON.stringify(PROMPT_APPENDERS))})
PROMPT_BLOCK_MARKERS = json.loads(${JSON.stringify(JSON.stringify(PROMPT_BLOCK_MARKERS))})
CODE_REPLACEMENTS = json.loads(${JSON.stringify(JSON.stringify(CODE_REPLACEMENTS))})

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
  coalesce(w.version::text, ''),
  w.graph
from workflows w
left join apps a on a.workflow_id = w.id or a.id = '{VOCAB_APP["appId"]}'::uuid
where w.id = '{workflow_id}'::uuid
limit 1;
"""
    raw = run_sql(sql).strip()
    if not raw:
        raise RuntimeError(f"workflow not found: {workflow_id}")
    parts = raw.split("\\t", 4)
    if len(parts) != 5:
        raise RuntimeError(f"unexpected workflow row for {workflow_id}: {raw}")
    app_id, app_name, row_workflow_id, version, graph_raw = parts
    return {
        "app_id": app_id or VOCAB_APP["appId"],
        "app_name": app_name or VOCAB_APP["appName"],
        "workflow_id": row_workflow_id,
        "version": version,
        "graph_raw": graph_raw,
        "graph": json.loads(graph_raw),
    }

def tune_graph(graph):
    target_graph = deepcopy(graph)
    changes = []
    for node in target_graph.get("nodes", []):
        node_id = str(node.get("id"))
        data = node.setdefault("data", {})
        node_change = {
            "node_id": node_id,
            "title": data.get("title"),
        }
        changed = False

        tune = NODE_TUNING.get(node_id)
        if tune:
            model = data.setdefault("model", {})
            before = {
                "provider": model.get("provider"),
                "name": model.get("name"),
                "completion_params": deepcopy(model.get("completion_params", {})),
            }
            model["provider"] = TARGET_PROVIDER
            model["name"] = tune["modelName"]
            completion = model.setdefault("completion_params", {})
            completion.update(tune["completionParams"])
            after = {
                "provider": model.get("provider"),
                "name": model.get("name"),
                "completion_params": deepcopy(model.get("completion_params", {})),
            }
            if before != after:
                node_change["model_before"] = before
                node_change["model_after"] = after
                changed = True

        prompt_append = PROMPT_APPENDERS.get(node_id)
        if prompt_append:
            prompt_markers = PROMPT_BLOCK_MARKERS.get(node_id, {})
            prompt_before = []
            prompt_after = []
            for prompt in data.get("prompt_template", []):
                role = prompt.get("role")
                extra = prompt_append.get(role)
                before_text = prompt.get("text", "")
                base_text = before_text
                marker = prompt_markers.get(role)
                if marker and marker in base_text:
                    base_text = base_text.split(marker, 1)[0].rstrip()
                after_text = base_text
                if extra and extra.strip():
                    if extra.strip() not in after_text:
                        after_text = after_text.rstrip() + extra
                    prompt["text"] = after_text
                prompt_before.append({"role": role, "len": len(before_text)})
                prompt_after.append({"role": role, "len": len(after_text)})
            if prompt_before != prompt_after:
                node_change["prompt_before"] = prompt_before
                node_change["prompt_after"] = prompt_after
                changed = True

        code_replacements = CODE_REPLACEMENTS.get(node_id, [])
        if code_replacements:
            code_before = data.get("code", "")
            code_after = code_before
            for item in code_replacements:
                find = item["find"]
                replace = item["replace"]
                if find in code_after:
                    code_after = code_after.replace(find, replace, 1)
            if code_after != code_before:
                data["code"] = code_after
                node_change["code_len_before"] = len(code_before)
                node_change["code_len_after"] = len(code_after)
                changed = True

        if changed:
            changes.append(node_change)
    return target_graph, changes

workflows = [
    load_workflow(VOCAB_APP["publishedWorkflowId"]),
    load_workflow(VOCAB_APP["draftWorkflowId"]),
]

workflow_summaries = []
planned_changes = []
for workflow in workflows:
    tuned_graph, node_changes = tune_graph(workflow["graph"])
    workflow_summaries.append({
        "workflow_id": workflow["workflow_id"],
        "version": workflow["version"],
        "node_changes": node_changes,
    })
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
    "app_id": VOCAB_APP["appId"],
    "app_name": VOCAB_APP["appName"],
    "planned_changes": len(planned_changes),
    "workflows": workflow_summaries,
}

if not APPLY:
    print(json.dumps(summary, ensure_ascii=False))
    raise SystemExit(0)

if not planned_changes:
    print(json.dumps({**summary, "applied": False, "message": "no changes"}, ensure_ascii=False))
    raise SystemExit(0)

label = "codex-vocab-card-tune-" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
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
    app_id = item["app_id"]
    app_name = (item["app_name"] or "").replace("'", "''")
    workflow_id = item["workflow_id"]
    sql_chunks.append(f"""
insert into codex_dify_workflow_graph_backups
  (backup_label, workflow_id, app_id, app_name, graph)
values
  ('{label}', '{workflow_id}', '{app_id}', '{app_name}', '{original_graph}');
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

  const outputPath = args.outputPath || path.join(process.cwd(), "logs", `dify-tune-vocab-card-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2))

  console.log(JSON.stringify(payload, null, 2))
  console.log(`Saved ${outputPath}`)
}

main()
