import { performance } from "node:perf_hooks"

const BASE_URL = (process.env.STRESS_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "")
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 20)
const REQUESTS = Number(process.env.STRESS_REQUESTS || 100)

const scenarios = [
  {
    name: "health",
    path: "/api/health",
    expected: [200],
  },
  {
    name: "dify-chat-auth-guard",
    path: "/api/dify-chat",
    expected: [401],
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": "stress_dify_auth_guard" },
      body: JSON.stringify({ query: "ping", model: "standard" }),
    },
  },
  {
    name: "dify-upload-auth-guard",
    path: "/api/dify-upload",
    expected: [401],
    init: {
      method: "POST",
      headers: { "X-Request-Id": "stress_upload_auth_guard" },
      body: (() => {
        const form = new FormData()
        form.append("file", new Blob(["ping"], { type: "text/plain" }), "ping.txt")
        return form
      })(),
    },
  },
  {
    name: "image-proxy-validation",
    path: "/api/image-proxy",
    expected: [400],
  },
  {
    name: "openclaw-slides-validation",
    path: "/slides/__stress_missing_file__.html",
    expected: [404],
  },
]

async function runScenario(scenario) {
  const latencies = []
  let ok = 0
  let failed = 0
  let nextIndex = 0

  async function worker() {
    while (nextIndex < REQUESTS) {
      nextIndex += 1
      const started = performance.now()
      try {
        const response = await fetch(`${BASE_URL}${scenario.path}`, scenario.init)
        const elapsed = performance.now() - started
        latencies.push(elapsed)
        if (scenario.expected.includes(response.status)) {
          ok += 1
        } else {
          failed += 1
          console.error(`[${scenario.name}] unexpected status=${response.status}`)
        }
        await response.arrayBuffer().catch(() => undefined)
      } catch (error) {
        failed += 1
        console.error(`[${scenario.name}] request failed`, error instanceof Error ? error.message : String(error))
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  latencies.sort((a, b) => a - b)
  const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0
  return {
    name: scenario.name,
    ok,
    failed,
    p50: Math.round(percentile(0.5)),
    p95: Math.round(percentile(0.95)),
    p99: Math.round(percentile(0.99)),
  }
}

const results = []
for (const scenario of scenarios) {
  results.push(await runScenario(scenario))
}

console.table(results)
const failures = results.reduce((sum, result) => sum + result.failed, 0)
if (failures > 0) {
  process.exitCode = 1
}
