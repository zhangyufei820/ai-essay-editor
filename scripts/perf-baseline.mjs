#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://shenxiang.school"
const DEFAULT_ROUTES = [
  "/",
  "/chat",
  "/chat/gemini-image",
  "/lab",
  "/pricing",
  "/admin",
  "/worksheet-diagnosis",
  "/api/health",
]

const args = process.argv.slice(2)
const baseUrl = (args.find((arg) => arg.startsWith("--base-url="))?.split("=")[1] || process.env.PERF_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "")
const routeArg = args.find((arg) => arg.startsWith("--routes="))?.split("=")[1]
const routes = routeArg ? routeArg.split(",").filter(Boolean) : DEFAULT_ROUTES
const iterations = Number(args.find((arg) => arg.startsWith("--iterations="))?.split("=")[1] || process.env.PERF_ITERATIONS || 1)

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

async function measure(route) {
  const url = `${baseUrl}${route}`
  const samples = []
  let lastStatus = 0
  let lastBytes = 0

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now()
    const response = await fetch(url, { redirect: "manual" })
    const body = Buffer.from(await response.arrayBuffer())
    const totalMs = performance.now() - started
    samples.push(totalMs)
    lastStatus = response.status
    lastBytes = body.byteLength
  }

  return {
    route,
    status: lastStatus,
    bytes: lastBytes,
    avgMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p95Ms: percentile(samples, 95),
  }
}

const results = []
for (const route of routes) {
  try {
    results.push(await measure(route))
  } catch (error) {
    results.push({
      route,
      status: "ERR",
      bytes: 0,
      avgMs: 0,
      p95Ms: 0,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

console.log(`# Performance baseline\n`)
console.log(`- Base URL: ${baseUrl}`)
console.log(`- Iterations: ${iterations}`)
console.log(`- Captured at: ${new Date().toISOString()}\n`)
console.log("| Route | Status | Bytes | Avg ms | P95 ms |")
console.log("|---|---:|---:|---:|---:|")
for (const result of results) {
  console.log(`| ${result.route} | ${result.status} | ${result.bytes} | ${result.avgMs.toFixed(1)} | ${result.p95Ms.toFixed(1)} |`)
  if (result.error) console.error(`${result.route}: ${result.error}`)
}
