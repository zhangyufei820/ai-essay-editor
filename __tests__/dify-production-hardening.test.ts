import { execFileSync } from "child_process"

const scriptPath = "scripts/dify-tune-site-problem-workflows.mjs"
const remapScriptPath = "scripts/dify-remap-unified-routing.mjs"

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
  it("keeps unified routing remap idempotent for all managed apps", () => {
    const payload = parseFirstJsonObject(runNodeScript(remapScriptPath, ["--all-apps"]))

    expect(payload.apply).toBe(false)
    expect(payload.total_changes).toBe(0)
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
})
