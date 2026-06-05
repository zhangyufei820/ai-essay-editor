#!/usr/bin/env node

const rounds = Math.max(
  1,
  Number(
    process.argv.find((arg) => arg.startsWith("--rounds="))?.split("=")[1] || 3,
  ),
)

const TOKENFLUX_USER_AGENT =
  "Codex Desktop/0.133.0 (Mac OS 13.5.0; x86_64) Apple_Terminal/447 (codex_exec; 0.133.0)"

const RED_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0uoAAAAASUVORK5CYII="

const CASES = [
  {
    name: "gpt-5.5 / VivaAPI",
    family: "fast-text",
    provider: "vivaapi",
    model: "gpt-5.5",
    baseUrlEnv: "VIVAAPI_LLM_BASE_URL",
    apiKeyEnv: "VIVAAPI_LLM_API_KEY",
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Reply with only: ok." }],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
  {
    name: "gpt-5.5 / Moonapix",
    family: "fast-text",
    provider: "moonapix",
    model: "gpt-5.5",
    baseUrlEnv: "MOONAPIX_LLM_BASE_URL",
    apiKeyEnv: "MOONAPIX_LLM_API_KEY",
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Reply with only: ok." }],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
  {
    name: "gpt-5.5 / TokenFlux",
    family: "fast-text",
    provider: "tokenflux",
    model: "gpt-5.5",
    baseUrlEnv: "TOKENFLUX_LLM_BASE_URL",
    apiKeyEnv: "TOKENFLUX_LLM_API_KEY",
    headers: {
      "User-Agent": TOKENFLUX_USER_AGENT,
    },
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Reply with only: ok." }],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
  {
    name: "claude-sonnet-4-6 / VivaAPI",
    family: "chinese-text",
    provider: "vivaapi",
    model: "claude-sonnet-4-6",
    baseUrlEnv: "VIVAAPI_LLM_BASE_URL",
    apiKeyEnv: "VIVAAPI_LLM_API_KEY",
    body: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "请只回复：收到。" }],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
  {
    name: "claude-sonnet-4-6 / Moonapix",
    family: "chinese-text",
    provider: "moonapix",
    model: "claude-sonnet-4-6",
    baseUrlEnv: "MOONAPIX_LLM_BASE_URL",
    apiKeyEnv: "MOONAPIX_LLM_API_KEY",
    body: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "请只回复：收到。" }],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
  {
    name: "gpt-5.4-mini vision / VivaAPI",
    family: "vision",
    provider: "vivaapi",
    model: "gpt-5.4-mini",
    baseUrlEnv: "VIVAAPI_LLM_BASE_URL",
    apiKeyEnv: "VIVAAPI_LLM_API_KEY",
    body: {
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this image? Reply with one word." },
            { type: "image_url", image_url: { url: RED_PIXEL } },
          ],
        },
      ],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
  {
    name: "gpt-5.4-mini vision / Moonapix",
    family: "vision",
    provider: "moonapix",
    model: "gpt-5.4-mini",
    baseUrlEnv: "MOONAPIX_LLM_BASE_URL",
    apiKeyEnv: "MOONAPIX_LLM_API_KEY",
    body: {
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this image? Reply with one word." },
            { type: "image_url", image_url: { url: RED_PIXEL } },
          ],
        },
      ],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
  {
    name: "gpt-5.4-mini vision / TokenFlux",
    family: "vision",
    provider: "tokenflux",
    model: "gpt-5.4-mini",
    baseUrlEnv: "TOKENFLUX_LLM_BASE_URL",
    apiKeyEnv: "TOKENFLUX_LLM_API_KEY",
    headers: {
      "User-Agent": TOKENFLUX_USER_AGENT,
    },
    body: {
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this image? Reply with one word." },
            { type: "image_url", image_url: { url: RED_PIXEL } },
          ],
        },
      ],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    },
  },
]

function computeP95(samples) {
  if (!samples.length) return 0
  const index = Math.max(0, Math.ceil(samples.length * 0.95) - 1)
  return [...samples].sort((a, b) => a - b)[index]
}

async function runCase(testCase) {
  const baseUrl = process.env[testCase.baseUrlEnv]
  const apiKey = process.env[testCase.apiKeyEnv]
  if (!baseUrl || !apiKey) {
    throw new Error(`missing_env:${testCase.baseUrlEnv}/${testCase.apiKeyEnv}`)
  }

  const started = Date.now()
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(testCase.headers || {}),
    },
    body: JSON.stringify(testCase.body),
  })

  const text = await response.text()
  return {
    name: testCase.name,
    family: testCase.family,
    provider: testCase.provider,
    model: testCase.model,
    status: response.status,
    elapsedMs: Date.now() - started,
    snippet: text.slice(0, 160).replace(/\s+/g, " "),
  }
}

const history = new Map()

for (let round = 1; round <= rounds; round += 1) {
  for (const testCase of CASES) {
    let result
    try {
      result = await runCase(testCase)
    } catch (error) {
      result = {
        name: testCase.name,
        family: testCase.family,
        provider: testCase.provider,
        model: testCase.model,
        status: "ERROR",
        elapsedMs: 0,
        snippet: error instanceof Error ? error.message : String(error),
      }
    }
    const bucket = history.get(testCase.name) || []
    bucket.push(result)
    history.set(testCase.name, bucket)
    console.log(
      `${round}/${rounds}\t${result.family}\t${result.name}\t${result.status}\t${(result.elapsedMs / 1000).toFixed(2)}s\t${result.snippet}`,
    )
  }
}

const summaries = []
for (const testCase of CASES) {
  const samples = history.get(testCase.name) || []
  const successes = samples.filter((sample) => sample.status === 200)
  const latencies = successes.map((sample) => sample.elapsedMs)
  const avgMs = latencies.length
    ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
    : 0
  summaries.push({
    family: testCase.family,
    name: testCase.name,
    provider: testCase.provider,
    model: testCase.model,
    ok: `${successes.length}/${samples.length}`,
    avgMs,
    p95Ms: computeP95(latencies),
    failures: samples.length - successes.length,
  })
}

console.log("summary")
for (const item of summaries) {
  console.log(
    `${item.family}\t${item.name}\tok=${item.ok}\tfail=${item.failures}\tavg=${(item.avgMs / 1000).toFixed(2)}s\tp95=${(item.p95Ms / 1000).toFixed(2)}s`,
  )
}

console.log("json")
console.log(JSON.stringify(summaries, null, 2))
