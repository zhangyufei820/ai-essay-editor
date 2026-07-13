import { execFileSync } from "child_process"
import fs from "fs"

const scriptPath = "scripts/dify-tune-site-problem-workflows.mjs"
const remapScriptPath = "scripts/dify-remap-unified-routing.mjs"
const vocabCardScriptPath = "scripts/dify-tune-vocab-card.mjs"
const aiWritingPaperScriptPath = "scripts/dify-tune-ai-writing-paper.mjs"
const approvedGatewayModels = [
  "沈翔快速对话",
  "沈翔语文优先",
  "沈翔数学推理",
  "沈翔通用文本",
  "沈翔图像识别",
]
const describeProduction = process.env.RUN_DIFY_PRODUCTION_TESTS === "1" ? describe : describe.skip

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

describeProduction("production dify hardening guards", () => {
  it("keeps every non-exempt realtime Dify app on the approved gateway aliases", () => {
    const payload = parseFirstJsonObject(runNodeScript(remapScriptPath))

    expect(payload.apply).toBe(false)
    expect(payload.total_changes).toBe(0)
    expect(payload.apps || {}).toEqual({})
    expect(payload.preserved_apps).toEqual(["Open Claw", "codex"])
    expect(payload.approved_gateway_model_names).toEqual([
      "沈翔快速对话",
      "沈翔语文优先",
      "沈翔数学推理",
      "沈翔通用文本",
      "沈翔图像识别",
    ])
    expect(payload.exempt_model_types).toEqual(["embeddings", "rerank"])
  })

  it("keeps the all-app Dify audit clean except for Open Claw and codex", () => {
    const payload = parseFirstJsonObject(runNodeScript(remapScriptPath, ["--all-apps"]))

    expect(payload.apply).toBe(false)
    expect(payload.all_apps).toBe(true)
    expect(payload.include_preserved).toBe(false)
    expect(payload.preserved_apps).toEqual(["Open Claw", "codex"])
    expect(payload.total_changes).toBe(0)
    expect(payload.apps || {}).toEqual({})
  })

  it("prevents remediation scripts from reintroducing direct realtime model targets", () => {
    const sources = [
      fs.readFileSync(remapScriptPath, "utf8"),
      fs.readFileSync(scriptPath, "utf8"),
      fs.readFileSync(vocabCardScriptPath, "utf8"),
      fs.readFileSync(aiWritingPaperScriptPath, "utf8"),
    ].join("\n")
    const directTargetPattern = /(?:defaultModelName|modelName|model\["name"\])\s*[:=]\s*"([^"]+)"/g

    for (const match of sources.matchAll(directTargetPattern)) {
      expect(approvedGatewayModels).toContain(match[1])
    }
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
    expect(payload.problem.route_model_name).toBe("沈翔快速对话")
    expect(payload.problem.solve_nodes).toEqual([
      {
        node_id: "1775196356822",
        title: "LLM 3",
        model_name: "沈翔数学推理",
        completion_params: { temperature: 0.7 },
      },
      {
        node_id: "17643486820500",
        title: "总编辑 ",
        model_name: "沈翔数学推理",
        completion_params: { temperature: 0.7 },
      },
    ])

    expect(payload.quanquan_math.app_name).toBe("全学段数学智能体")
    expect(payload.quanquan_math.route_node).toEqual({
      node_id: "1775197140264",
      title: "LLM 4",
      model_name: "沈翔快速对话",
      completion_params: { max_tokens: 128, temperature: 0 },
    })
    expect(payload.quanquan_math.final_editor_node).toMatchObject({
      node_id: "17643486820500",
      title: "总编辑 ",
      model_name: "沈翔通用文本",
      completion_params: { max_tokens: 900, temperature: 0.2 },
    })
    expect(payload.quanquan_math.final_editor_node.system_prompt_chars).toBeGreaterThan(80)
  })

  it("keeps problem workflow remap aligned to the dedicated latency-tightened models", () => {
    const payload = parseFirstJsonObject(runNodeScript(remapScriptPath, ["--app", "题目解析专用智能体"]))

    expect(payload.apply).toBe(false)
    expect(payload.total_changes).toBe(0)
    expect(payload.apps || {}).toEqual({})
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

  it("keeps ai-writing-paper agent tuning idempotent and pinned to gateway aliases", () => {
    const payload = parseFirstJsonObject(runNodeScript(aiWritingPaperScriptPath))

    expect(payload.apply).toBe(false)
    expect(payload.app_name).toBe("论文写作")
    expect(payload.app_id).toBe("4575cc05-91ca-4058-a861-faa39738b6f0")
    expect(payload.planned_changes).toBe(0)
    expect(payload.tuning).toMatchObject({
      agentModelName: "沈翔语文优先",
      routeModelName: "沈翔快速对话",
      visionModelName: "沈翔图像识别",
      agentMaxTokens: 20000,
      agentMaximumIterations: 6,
      skillAgentMaxSteps: 6,
    })
    expect(payload.node_changes).toEqual([])
  })
})
