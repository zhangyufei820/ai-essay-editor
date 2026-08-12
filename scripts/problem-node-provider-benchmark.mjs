#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

const DEFAULT_HOST = process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156"

const ROUTE_SYSTEM_PROMPT = [
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

const ROUTE_USER_PROMPT =
  "请解析这道题并给出简短答案，忽略方括号中的追踪码：2x+3=11。 [GW-AUDIT-PROBLEM-BENCH]"

const SOLVE_USER_PROMPT =
  "{\"skill\":\"math\",\"message\":\"用[math]技能，请解析这道题并给出简短答案，忽略方括号中的追踪码：2x+3=11。\"}"

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    rounds: 3,
    outputPath: "",
    onlyCases: [],
    pauseMs: 800,
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--host") {
      args.host = argv[++index]
    } else if (arg === "--rounds") {
      args.rounds = Math.max(1, Number(argv[++index]) || args.rounds)
    } else if (arg.startsWith("--output=")) {
      args.outputPath = arg.split("=")[1]
    } else if (arg.startsWith("--case=")) {
      args.onlyCases.push(arg.split("=")[1])
    } else if (arg.startsWith("--pause-ms=")) {
      args.pauseMs = Math.max(0, Number(arg.split("=")[1]) || args.pauseMs)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function runRemote(host, script) {
  const result = spawnSync("ssh", [host, "docker", "exec", "-i", "shenxiang-llm-gateway", "node", "-"], {
    input: script,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `remote command failed with code ${result.status}`)
  }
  return result.stdout
}

function buildRemoteScript({ rounds, onlyCases, pauseMs }) {
  return `
const ROUNDS = ${JSON.stringify(rounds)}
const ONLY_CASES = ${JSON.stringify(onlyCases)}
const PAUSE_MS = ${JSON.stringify(pauseMs)}
const gatewayBaseUrl = "http://127.0.0.1:4000/v1"
const gatewayKey = process.env.LITELLM_MASTER_KEY || ""

const ROUTE_MESSAGES = [
  { role: "system", content: ${JSON.stringify(ROUTE_SYSTEM_PROMPT)} },
  { role: "user", content: ${JSON.stringify(ROUTE_USER_PROMPT)} },
]

const SOLVE_MESSAGES = [
  { role: "user", content: ${JSON.stringify(SOLVE_USER_PROMPT)} },
]

const CASES = [
  { name: "route-sx-fast-chat", promptKey: "route", model: "sx-fast-chat", maxTokens: 128, temperature: 0 },
  { name: "route-gpt-5.5", promptKey: "route", model: "gpt-5.5", maxTokens: 128, temperature: 0 },
  { name: "route-gemini-3.1-pro-preview", promptKey: "route", model: "gemini-3.1-pro-preview", maxTokens: 128, temperature: 0 },
  { name: "route-fallback-viva-gpt-5.5", promptKey: "route", model: "fallback-viva-gpt-5.5", maxTokens: 128, temperature: 0 },
  { name: "route-sx-gemini-3.1-pro", promptKey: "route", model: "sx-gemini-3.1-pro", maxTokens: 128, temperature: 0 },
  { name: "solve-sx-math-text", promptKey: "solve", model: "sx-math-text", maxTokens: 512, temperature: 0.7 },
  { name: "solve-gpt-5.5", promptKey: "solve", model: "gpt-5.5", maxTokens: 512, temperature: 0.7 },
  { name: "solve-gemini-3.1-pro-preview", promptKey: "solve", model: "gemini-3.1-pro-preview", maxTokens: 512, temperature: 0.7 },
  { name: "solve-fallback-viva-gpt-5.5", promptKey: "solve", model: "fallback-viva-gpt-5.5", maxTokens: 512, temperature: 0.7 },
  { name: "solve-sx-gemini-3.1-pro", promptKey: "solve", model: "sx-gemini-3.1-pro", maxTokens: 512, temperature: 0.7 },
]

const ACTIVE_CASES = ONLY_CASES.length
  ? CASES.filter((item) => ONLY_CASES.includes(item.name))
  : CASES

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getUsage(payload) {
  const usage = payload?.usage || {}
  return {
    promptTokens: Number(usage.prompt_tokens || 0),
    completionTokens: Number(usage.completion_tokens || 0),
    totalTokens: Number(usage.total_tokens || 0),
    providerLatencySec: Number(usage.latency || 0),
    timeToFirstTokenSec: Number(usage.time_to_first_token || 0),
    timeToGenerateSec: Number(usage.time_to_generate || 0),
  }
}

function computeStats(values) {
  if (!values.length) return { avgMs: 0, p95Ms: 0, minMs: 0, maxMs: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const avgMs = values.reduce((sum, value) => sum + value, 0) / values.length
  const p95Ms = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
  return { avgMs, p95Ms, minMs: sorted[0], maxMs: sorted[sorted.length - 1] }
}

function hasUsableContent(content) {
  return typeof content === "string" && content.trim().length > 0
}

async function runCase(testCase, round) {
  const messages = testCase.promptKey === "route" ? ROUTE_MESSAGES : SOLVE_MESSAGES
  const startedAt = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    const response = await fetch(gatewayBaseUrl + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + gatewayKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: testCase.model,
        messages,
        temperature: testCase.temperature,
        stream: false,
        max_tokens: testCase.maxTokens,
      }),
    })
    clearTimeout(timeout)

    const rawText = await response.text()
    const elapsedMs = Date.now() - startedAt

    let payload
    try {
      payload = JSON.parse(rawText)
    } catch {
      return {
        name: testCase.name,
        round,
        promptKey: testCase.promptKey,
        model: testCase.model,
        ok: false,
        status: response.status,
        elapsedMs,
        error: "response_json_parse_failed",
        responseSnippet: rawText.slice(0, 200).replace(/\\s+/g, " "),
      }
    }

    const content = String(payload?.choices?.[0]?.message?.content || "")
    return {
      name: testCase.name,
      round,
      promptKey: testCase.promptKey,
      model: testCase.model,
      ok: response.ok && hasUsableContent(content),
      status: response.status,
      elapsedMs,
      usage: getUsage(payload),
      contentSnippet: content.slice(0, 160).replace(/\\s+/g, " "),
      responseSnippet: rawText.slice(0, 200).replace(/\\s+/g, " "),
    }
  } catch (error) {
    return {
      name: testCase.name,
      round,
      promptKey: testCase.promptKey,
      model: testCase.model,
      ok: false,
      status: "ERROR",
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.name + ":" + error.message : String(error),
    }
  }
}

const runs = []
for (let round = 1; round <= ROUNDS; round += 1) {
  for (const testCase of ACTIVE_CASES) {
    console.log(\`START\\t\${round}/\${ROUNDS}\\t\${testCase.name}\`)
    const result = await runCase(testCase, round)
    runs.push(result)
    const usage = result.usage
    const suffix = usage
      ? \`prompt=\${usage.promptTokens} completion=\${usage.completionTokens} ttft=\${usage.timeToFirstTokenSec.toFixed(3)}s latency=\${usage.providerLatencySec.toFixed(3)}s\`
      : result.error || "no_usage"
    console.log(\`\${round}/\${ROUNDS}\\t\${result.name}\\t\${result.status}\\t\${(result.elapsedMs / 1000).toFixed(2)}s\\t\${suffix}\`)
    if (PAUSE_MS > 0) {
      await sleep(PAUSE_MS)
    }
  }
}

const summaries = ACTIVE_CASES.map((testCase) => {
  const caseRuns = runs.filter((item) => item.name === testCase.name)
  const okRuns = caseRuns.filter((item) => item.ok)
  const elapsedValues = okRuns.map((item) => item.elapsedMs)
  const ttftValues = okRuns
    .map((item) => (item.usage?.timeToFirstTokenSec || 0) * 1000)
    .filter((value) => value > 0)
  const providerLatencyValues = okRuns
    .map((item) => (item.usage?.providerLatencySec || 0) * 1000)
    .filter((value) => value > 0)

  return {
    name: testCase.name,
    promptKey: testCase.promptKey,
    model: testCase.model,
    ok: \`\${okRuns.length}/\${caseRuns.length}\`,
    failures: caseRuns.length - okRuns.length,
    elapsed: computeStats(elapsedValues),
    ttft: computeStats(ttftValues),
    providerLatency: computeStats(providerLatencyValues),
    samplePromptTokens: okRuns[0]?.usage?.promptTokens || 0,
    sampleCompletionTokens: okRuns[0]?.usage?.completionTokens || 0,
    sampleContentSnippet: okRuns[0]?.contentSnippet || "",
  }
})

console.log("summary")
for (const item of summaries) {
  console.log(
    [
      item.promptKey,
      item.name,
      \`ok=\${item.ok}\`,
      \`fail=\${item.failures}\`,
      \`avg=\${(item.elapsed.avgMs / 1000).toFixed(2)}s\`,
      \`p95=\${(item.elapsed.p95Ms / 1000).toFixed(2)}s\`,
      \`ttft=\${(item.ttft.avgMs / 1000).toFixed(2)}s\`,
      \`provider=\${(item.providerLatency.avgMs / 1000).toFixed(2)}s\`,
      \`prompt=\${item.samplePromptTokens}\`,
      \`completion=\${item.sampleCompletionTokens}\`,
    ].join("\\t"),
  )
}

console.log("json")
console.log(JSON.stringify({ rounds: ROUNDS, pauseMs: PAUSE_MS, summaries, runs }, null, 2))
`
}

function extractJsonBlock(raw) {
  const marker = "json\n"
  const index = raw.lastIndexOf(marker)
  if (index === -1) {
    throw new Error(`benchmark summary not found in remote output:\n${raw}`)
  }
  return JSON.parse(raw.slice(index + marker.length))
}

function printRankings(payload) {
  for (const promptKey of ["route", "solve"]) {
    const rows = payload.summaries
      .filter((item) => item.promptKey === promptKey)
      .sort((left, right) => left.elapsed.avgMs - right.elapsed.avgMs)

    console.log(`\n[${promptKey}]`)
    console.log("| Case | OK | Avg ms | P95 ms | TTFT avg ms | Provider avg ms | Prompt tok | Completion tok |")
    console.log("|---|---:|---:|---:|---:|---:|---:|---:|")
    for (const row of rows) {
      console.log(
        `| ${row.name} | ${row.ok} | ${row.elapsed.avgMs.toFixed(0)} | ${row.elapsed.p95Ms.toFixed(0)} | ${row.ttft.avgMs.toFixed(0)} | ${row.providerLatency.avgMs.toFixed(0)} | ${row.samplePromptTokens} | ${row.sampleCompletionTokens} |`,
      )
    }
  }
}

function main() {
  const args = parseArgs(process.argv)
  const raw = runRemote(args.host, buildRemoteScript(args))
  const payload = extractJsonBlock(raw)

  const outputPath = args.outputPath || path.join(process.cwd(), "logs", `problem-node-provider-benchmark-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify({ raw, ...payload }, null, 2))

  printRankings(payload)
  console.log(`\nSaved ${outputPath}`)
}

main()
