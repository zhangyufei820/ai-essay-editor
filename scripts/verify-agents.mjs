#!/usr/bin/env node

const BASE_URL = (process.env.AGENT_VERIFY_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "")
const BEARER = process.env.AGENT_VERIFY_BEARER || ""

const AGENTS = [
  "standard",
  "general-chat",
  "teaching-pro",
  "ai-writing-paper",
  "zhongying-essay",
  "reading-report",
  "experiment-report",
  "study-abroad",
  "resume-optimize",
  "speech-defense",
  "school-wechat",
  "beike-pro",
  "banzhuren",
  "quanquan-math",
  "quanquan-english",
  "vocab-card",
  "problem",
  "open-claw",
  "banana-2-pro",
  "gpt-image-2",
  "gpt-image-1",
  "suno-v5",
  "all-in-one-agent",
]

function routeFor(model) {
  if (model === "standard") return "/api/chat"
  if (model === "suno-v5") return "/api/suno"
  return "/api/dify-chat"
}

function bodyFor(model) {
  if (model === "standard") {
    return {
      messages: [{ role: "user", content: "ping" }],
    }
  }

  if (model === "suno-v5") {
    return {
      action: "generate",
      query: "ping",
      streaming: false,
      taskMode: "inspiration",
    }
  }

  return {
    query: "ping",
    response_mode: "blocking",
    model,
    inputs: model === "vocab-card" ? { word: "test" } : {},
  }
}

async function probe(model, authenticated = false) {
  const headers = {
    "Content-Type": "application/json",
    "X-Request-Id": `verify-${model}-${authenticated ? "auth" : "anon"}`,
  }
  if (authenticated && BEARER) headers.Authorization = `Bearer ${BEARER}`

  const response = await fetch(`${BASE_URL}${routeFor(model)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyFor(model)),
  })
  const text = await response.text().catch(() => "")
  return { status: response.status, text }
}

function isUnsupported(text) {
  return /model not supported|unsupported model|模型.*不支持|不支持.*模型/i.test(text)
}

let failures = 0

console.log(`Agent verification target: ${BASE_URL}`)
console.log(`Agent count: ${AGENTS.length}`)

for (const model of AGENTS) {
  try {
    const anonymous = await probe(model, false)

    if (anonymous.status === 401) {
      console.log(`✓ ${model} — 401 (auth guard works)`)
    } else if (anonymous.status === 404) {
      failures += 1
      console.log(`✗ ${model} — 404 (route missing)`)
      continue
    } else if (anonymous.status >= 500) {
      failures += 1
      console.log(`✗ ${model} — ${anonymous.status} (${anonymous.text.slice(0, 160) || "server error"})`)
      continue
    } else {
      console.log(`! ${model} — ${anonymous.status} (expected 401 without auth)`)
    }

    if (BEARER) {
      const authenticated = await probe(model, true)
      if (authenticated.status >= 500 || isUnsupported(authenticated.text)) {
        failures += 1
        console.log(`✗ ${model} — authenticated ${authenticated.status} (${authenticated.text.slice(0, 160)})`)
      } else {
        console.log(`✓ ${model} — authenticated ${authenticated.status} (route accepted model)`)
      }
    }
  } catch (error) {
    failures += 1
    console.log(`✗ ${model} — ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} agent route check(s) failed.`)
  process.exit(1)
}

console.log("\nAll agent route checks passed.")
