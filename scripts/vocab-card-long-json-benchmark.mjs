#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

const DEFAULT_HOST = process.env.DIFY_DB_SSH_HOST || "root@43.154.111.156"
const DEFAULT_WORKFLOW_PATH = "/tmp/vocab-card-workflow-59f82a10.json"

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    workflowPath: DEFAULT_WORKFLOW_PATH,
    rounds: 1,
    outputPath: "",
    onlyCases: [],
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--host") {
      args.host = argv[++index]
    } else if (arg === "--workflow-path") {
      args.workflowPath = argv[++index]
    } else if (arg === "--rounds") {
      args.rounds = Math.max(1, Number(argv[++index]) || 1)
    } else if (arg.startsWith("--output=")) {
      args.outputPath = arg.split("=")[1]
    } else if (arg.startsWith("--case=")) {
      args.onlyCases.push(arg.split("=")[1])
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

function loadPrompts(workflowPath) {
  const graph = JSON.parse(fs.readFileSync(workflowPath, "utf8"))
  const node = (graph.nodes || []).find((item) => String(item.id) === "1004")
  if (!node) throw new Error("node 1004 not found in workflow graph")
  const templates = Array.isArray(node?.data?.prompt_template) ? node.data.prompt_template : []
  if (!templates.length) throw new Error("node 1004 prompt_template is empty")

  const replacements = new Map([
    ["{{#1002.normalized_word#}}", "apple"],
    ["{{#1002.level_out#}}", "high"],
    ["{{#1002.style_out#}}", "colorful"],
    ["{{#1002.language_out#}}", "zh-CN"],
    ["{{#1002.letter_counts_json#}}", '{"a": 1, "p": 2, "l": 1, "e": 1}'],
    ["{{#1002.repeated_letters_json#}}", '{"p": 2}'],
  ])

  return templates.map((item) => {
    let text = String(item.text || "")
    for (const [needle, value] of replacements.entries()) {
      text = text.split(needle).join(value)
    }
    return { role: item.role, content: text }
  })
}

function runRemote(host, script) {
  const result = spawnSync("ssh", [host, "docker", "exec", "-i", "shenxiang-llm-gateway", "node", "-"], {
    input: script,
    encoding: "utf8",
    maxBuffer: 60 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `remote command failed with code ${result.status}`)
  }
  return result.stdout
}

function buildRemoteScript({ prompts, rounds, onlyCases }) {
  return `
const PROMPTS = ${JSON.stringify(prompts)}
const ROUNDS = ${JSON.stringify(rounds)}
const REQUEST_TIMEOUT_MS = 45000
const ONLY_CASES = ${JSON.stringify(onlyCases)}

function lettersOnly(value) {
  return String(value || "").toLowerCase().replace(/[^a-z]/g, "")
}

function hasForbiddenChunkWords(text) {
  const value = String(text || "")
  return value.includes("词根") || value.includes("词源")
}

function hasForbiddenPronunciation(text) {
  const value = String(text || "")
  return (
    value.includes("爆破两次") ||
    value.includes("发两次") ||
    value.includes("两个 p 都要发音") ||
    value.includes("两个p都要发音") ||
    value.includes("两个 p 都发音") ||
    value.includes("两个p都发音")
  )
}

function inspectCard(text) {
  const result = {
    ok: false,
    parseOk: false,
    issues: [],
    word: "",
    normalizedWord: "",
    formula: "",
  }

  let parsed
  try {
    parsed = JSON.parse(text)
    result.parseOk = true
  } catch (error) {
    result.issues.push("json_parse_failed")
    return result
  }

  const card = parsed?.card || {}
  const spelling = card?.spelling || {}
  const pronunciation = card?.pronunciation || {}
  const morphemes = Array.isArray(card?.morphemes) ? card.morphemes : []
  const examples = Array.isArray(card?.examples) ? card.examples : []
  const reviewQuestions = Array.isArray(card?.review?.self_check_questions) ? card.review.self_check_questions : []
  const keywords = Array.isArray(card?.memory_story?.keywords) ? card.memory_story.keywords : []
  const secondaryCn = Array.isArray(card?.meaning?.secondary_cn) ? card.meaning.secondary_cn : []
  const pronunciationMistakes = Array.isArray(pronunciation?.common_pronunciation_mistakes)
    ? pronunciation.common_pronunciation_mistakes
    : []

  result.word = String(card?.word || "")
  result.normalizedWord = String(card?.normalized_word || "")
  result.formula = String(spelling?.spelling_formula || "")

  if (parsed?.status !== "success") result.issues.push("status_not_success")
  if (result.word !== "apple") result.issues.push("word_mismatch")
  if (result.normalizedWord !== "apple") result.issues.push("normalized_word_mismatch")
  if (lettersOnly(result.formula) !== "apple") result.issues.push("bad_formula")
  if (secondaryCn.length > 2) result.issues.push("secondary_cn_too_long")
  if (keywords.length > 4) result.issues.push("keywords_too_many")
  if (examples.length > 1) result.issues.push("examples_too_many")
  if (reviewQuestions.length > 3) result.issues.push("review_questions_too_many")
  if (pronunciationMistakes.length > 2) result.issues.push("pronunciation_mistakes_too_many")

  for (const item of morphemes) {
    if (String(item?.type || "") !== "chunk") continue
    if (hasForbiddenChunkWords(item?.meaning_cn) || hasForbiddenChunkWords(item?.memory_hint_cn)) {
      result.issues.push("chunk_mentions_root_or_etymology")
      break
    }
  }

  const pronunciationText = [
    pronunciation?.phonics_tip_cn,
    pronunciation?.mouth_shape_tip_cn,
    ...pronunciationMistakes,
  ].map((item) => String(item || "")).join("\\n")

  if (hasForbiddenPronunciation(pronunciationText)) {
    result.issues.push("pronunciation_mentions_double_burst")
  }

  result.ok = result.parseOk && result.issues.length === 0
  return result
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

const gatewayBaseUrl = "http://127.0.0.1:4000/v1"
const gatewayKey = process.env.LITELLM_MASTER_KEY || ""

const CASES = [
  { name: "gateway-gpt-5.4-mini", baseUrl: gatewayBaseUrl, apiKey: gatewayKey, model: "gpt-5.4-mini" },
  { name: "gateway-sx-general-text", baseUrl: gatewayBaseUrl, apiKey: gatewayKey, model: "sx-general-text" },
  { name: "gateway-sx-fast-chat", baseUrl: gatewayBaseUrl, apiKey: gatewayKey, model: "sx-fast-chat" },
  { name: "gateway-sx-gpt-5.4-mini-vivaapi", baseUrl: gatewayBaseUrl, apiKey: gatewayKey, model: "sx-gpt-5.4-mini-vivaapi" },
  { name: "gateway-sx-gpt-5.4-mini-moonapix", baseUrl: gatewayBaseUrl, apiKey: gatewayKey, model: "sx-gpt-5.4-mini-moonapix" },
  {
    name: "direct-tokenflux-gpt-5.4-mini",
    baseUrl: process.env.TOKENFLUX_LLM_BASE_URL || "",
    apiKey: process.env.TOKENFLUX_LLM_API_KEY || "",
    model: "gpt-5.4-mini",
    headers: { "User-Agent": "Codex Desktop/0.133.0 (Mac OS 13.5.0; x86_64) Apple_Terminal/447 (codex_exec; 0.133.0)" },
  },
  {
    name: "direct-tokenflux-gpt-5.5",
    baseUrl: process.env.TOKENFLUX_LLM_BASE_URL || "",
    apiKey: process.env.TOKENFLUX_LLM_API_KEY || "",
    model: "gpt-5.5",
    headers: { "User-Agent": "Codex Desktop/0.133.0 (Mac OS 13.5.0; x86_64) Apple_Terminal/447 (codex_exec; 0.133.0)" },
  },
  { name: "direct-vivaapi-gpt-5.4-mini", baseUrl: process.env.VIVAAPI_LLM_BASE_URL || "", apiKey: process.env.VIVAAPI_LLM_API_KEY || "", model: "gpt-5.4-mini" },
  { name: "direct-moonapix-gpt-5.4-mini", baseUrl: process.env.MOONAPIX_LLM_BASE_URL || "", apiKey: process.env.MOONAPIX_LLM_API_KEY || "", model: "gpt-5.4-mini" },
]

const ACTIVE_CASES = ONLY_CASES.length
  ? CASES.filter((item) => ONLY_CASES.includes(item.name))
  : CASES

async function runCase(testCase, round) {
  if (!testCase.baseUrl || !testCase.apiKey) {
    return { name: testCase.name, model: testCase.model, round, ok: false, status: "SKIP", elapsedMs: 0, error: "missing_base_url_or_api_key" }
  }

  const startedAt = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const response = await fetch(testCase.baseUrl.replace(/\\/$/, "") + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + testCase.apiKey,
        "Content-Type": "application/json",
        ...(testCase.headers || {}),
      },
      body: JSON.stringify({
        model: testCase.model,
        messages: PROMPTS,
        temperature: 0,
        stream: false,
        max_tokens: 1800,
      }),
    })
    clearTimeout(timeout)

    const rawText = await response.text()
    const elapsedMs = Date.now() - startedAt
    let payload = null
    let content = ""

    try {
      payload = JSON.parse(rawText)
      content = String(payload?.choices?.[0]?.message?.content || "")
    } catch {
      return {
        name: testCase.name,
        model: testCase.model,
        round,
        ok: false,
        status: response.status,
        elapsedMs,
        error: "response_json_parse_failed",
        responseSnippet: rawText.slice(0, 200).replace(/\\s+/g, " "),
      }
    }

    const inspection = inspectCard(content)
    return {
      name: testCase.name,
      model: testCase.model,
      round,
      ok: response.ok && inspection.ok,
      status: response.status,
      elapsedMs,
      usage: getUsage(payload),
      cardInspection: inspection,
      responseSnippet: rawText.slice(0, 200).replace(/\\s+/g, " "),
    }
  } catch (error) {
    return {
      name: testCase.name,
      model: testCase.model,
      round,
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
      ? \`prompt=\${usage.promptTokens} completion=\${usage.completionTokens} ttfb=\${usage.timeToFirstTokenSec.toFixed(3)}s gen=\${usage.timeToGenerateSec.toFixed(3)}s\`
      : result.error || (result.cardInspection?.issues || []).join(",")
    console.log(\`\${round}/\${ROUNDS}\\t\${result.name}\\t\${result.status}\\t\${(result.elapsedMs / 1000).toFixed(2)}s\\t\${suffix}\`)
  }
}

const summaries = ACTIVE_CASES.map((testCase) => {
  const caseRuns = runs.filter((item) => item.name === testCase.name)
  const okRuns = caseRuns.filter((item) => item.ok)
  const elapsedValues = okRuns.map((item) => item.elapsedMs)
  const promptTokens = okRuns.map((item) => item.usage?.promptTokens || 0)
  const completionTokens = okRuns.map((item) => item.usage?.completionTokens || 0)
  const ttfbValues = okRuns.map((item) => (item.usage?.timeToFirstTokenSec || 0) * 1000)
  const genValues = okRuns.map((item) => (item.usage?.timeToGenerateSec || 0) * 1000)
  const stats = computeStats(elapsedValues)

  return {
    name: testCase.name,
    model: testCase.model,
    ok: \`\${okRuns.length}/\${caseRuns.length}\`,
    failures: caseRuns.length - okRuns.length,
    elapsed: stats,
    usage: {
      avgPromptTokens: promptTokens.length ? promptTokens.reduce((sum, value) => sum + value, 0) / promptTokens.length : 0,
      avgCompletionTokens: completionTokens.length ? completionTokens.reduce((sum, value) => sum + value, 0) / completionTokens.length : 0,
      avgTtfbMs: ttfbValues.length ? ttfbValues.reduce((sum, value) => sum + value, 0) / ttfbValues.length : 0,
      avgGenerateMs: genValues.length ? genValues.reduce((sum, value) => sum + value, 0) / genValues.length : 0,
    },
    sampleIssues: caseRuns
      .filter((item) => !item.ok)
      .slice(0, 2)
      .map((item) => item.error || item.cardInspection?.issues || []),
  }
})

console.log("SUMMARY_JSON " + JSON.stringify({
  rounds: ROUNDS,
  activeCases: ACTIVE_CASES.map((item) => item.name),
  promptCount: PROMPTS.length,
  promptLengths: PROMPTS.map((item) => ({ role: item.role, textLength: String(item.content || "").length })),
  summaries,
  runs,
}, null, 2))
`
}

function printSummary(payload) {
  console.log("| Case | OK | Avg ms | P95 ms | Avg prompt | Avg completion | Avg TTFB ms | Avg generate ms |")
  console.log("|---|---:|---:|---:|---:|---:|---:|---:|")
  for (const item of payload.summaries) {
    console.log(
      `| ${item.name} | ${item.ok} | ${item.elapsed.avgMs.toFixed(0)} | ${item.elapsed.p95Ms.toFixed(0)} | ${item.usage.avgPromptTokens.toFixed(0)} | ${item.usage.avgCompletionTokens.toFixed(0)} | ${item.usage.avgTtfbMs.toFixed(0)} | ${item.usage.avgGenerateMs.toFixed(0)} |`,
    )
  }
}

function main() {
  const args = parseArgs(process.argv)
  const prompts = loadPrompts(args.workflowPath)
  const raw = runRemote(args.host, buildRemoteScript({ prompts, rounds: args.rounds, onlyCases: args.onlyCases }))
  const marker = "SUMMARY_JSON "
  const index = raw.indexOf(marker)
  if (index === -1) {
    throw new Error(`benchmark summary not found in remote output:\n${raw}`)
  }

  const logText = raw.slice(0, index).trim()
  if (logText) console.log(logText)

  const payload = JSON.parse(raw.slice(index + marker.length))
  const outputPath = args.outputPath || path.join(process.cwd(), "logs", `vocab-card-long-json-benchmark-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2))

  printSummary(payload)
  console.log(`\nSaved ${outputPath}`)
}

main()
