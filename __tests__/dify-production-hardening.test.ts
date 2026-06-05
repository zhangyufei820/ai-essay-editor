import { execFileSync } from "child_process"

const scriptPath = "scripts/dify-tune-site-problem-workflows.mjs"
const remapScriptPath = "scripts/dify-remap-unified-routing.mjs"
const vocabCardScriptPath = "scripts/dify-tune-vocab-card.mjs"

function runNodeScript(script: string, args: string[] = []) {
  return execFileSync("node", [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function parseFirstJsonObject(stdout: string) {
  const start = stdout.indexOf("{")
  const end = stdout.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no json object found in output: ${stdout}`)
  }
  return JSON.parse(stdout.slice(start, end + 1))
}

describe("production dify hardening guards", () => {
  it("keeps unified routing drift limited to the approved vocab-card latency exceptions", () => {
    const payload = parseFirstJsonObject(runNodeScript(remapScriptPath))

    expect(payload.apply).toBe(false)
    expect(payload.total_changes).toBe(4)
    expect(Object.keys(payload.apps || {})).toEqual(["词镜记忆卡"])
    expect(payload.apps?.["词镜记忆卡"]).toEqual([
      {
        node_type: "llm",
        node_title: "04_AI_生成单词卡片",
        from_model: "gpt-5.4-mini",
        to_model: "沈翔通用文本",
      },
      {
        node_type: "llm",
        node_title: "07_AI_质检卡片",
        from_model: "gpt-5.4-mini",
        to_model: "沈翔通用文本",
      },
      {
        node_type: "llm",
        node_title: "10_AI_重写问题字段",
        from_model: "gpt-5.4-mini",
        to_model: "沈翔通用文本",
      },
      {
        node_type: "llm",
        node_title: "01_AI_对话理解与学习意图判断",
        from_model: "沈翔语文优先",
        to_model: "沈翔快速对话",
      },
    ])
  })

  it("keeps site assistant and problem workflow tuning idempotent", () => {
    const payload = parseFirstJsonObject(runNodeScript(scriptPath))

    expect(payload.apply).toBe(false)
    expect(payload.planned_changes).toBe(0)

    expect(payload.site_assistant.app_name).toBe("网站助手")
    expect(payload.site_assistant.had_retrieval).toBe(true)
    expect(payload.site_assistant.current_node_count).toBe(4)
    expect(payload.site_assistant.target_retrieval_config).toMatchObject({
      top_k: 3,
      reranking_mode: "weighted_score",
      reranking_enable: false,
    })

    expect(payload.problem.app_name).toBe("题目解析专用智能体")
    expect(payload.problem.after_completion_params).toMatchObject({
      max_tokens: 128,
      temperature: 0,
    })
    expect(payload.problem.after_prompt_chars).toBe(632)
  })

  it("keeps vocab-card tuning idempotent for both published and draft workflows", () => {
    const payload = parseFirstJsonObject(runNodeScript(vocabCardScriptPath))

    expect(payload.apply).toBe(false)
    expect(payload.app_name).toBe("词镜记忆卡")
    expect(payload.app_id).toBe("7aa60548-0cfc-4688-a345-a7e37f234d63")
    expect(payload.planned_changes).toBe(0)
    expect(payload.workflows).toHaveLength(2)
    expect(payload.workflows).toEqual([
      {
        workflow_id: "59f82a10-bd32-4edb-9c2f-e05b3d005435",
        version: expect.any(String),
        node_changes: [],
      },
      {
        workflow_id: "b5f1eeec-58f2-4dce-a004-8b94e153d563",
        version: "draft",
        node_changes: [],
      },
    ])
  })
})
