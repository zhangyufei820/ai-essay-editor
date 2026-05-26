#!/usr/bin/env node

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

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
const useProxy = args.includes("--use-proxy") || process.env.PERF_USE_PROXY === "1"
const timeoutSeconds = Number(args.find((arg) => arg.startsWith("--timeout="))?.split("=")[1] || process.env.PERF_TIMEOUT_SECONDS || 15)

const CURL_FORMAT = JSON.stringify({
  status: "%{http_code}",
  bytes: "%{size_download}",
  totalMs: "%{time_total}",
  ttfbMs: "%{time_starttransfer}",
  remoteIp: "%{remote_ip}",
  effectiveUrl: "%{url_effective}",
})

function cleanProxyEnv() {
  if (useProxy) return process.env

  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.toLowerCase().includes("proxy")) delete env[key]
  }
  return env
}

function isProxyLikeRemoteIp(remoteIp) {
  if (!remoteIp) return false
  if (remoteIp === "::1" || remoteIp.startsWith("127.")) return true
  if (remoteIp.startsWith("10.") || remoteIp.startsWith("192.168.")) return true
  const parts = remoteIp.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)
}

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
  let lastTtfbMs = 0
  let lastRemoteIp = ""
  let lastEffectiveUrl = url

  for (let index = 0; index < iterations; index += 1) {
    const { stdout } = await execFileAsync("curl", [
      "-L",
      "-sS",
      "-o",
      "/dev/null",
      "-w",
      `${CURL_FORMAT}\n`,
      "--max-time",
      String(timeoutSeconds),
      url,
    ], { env: cleanProxyEnv() })
    const line = stdout.trim().split("\n").pop()
    const sample = JSON.parse(line)
    const totalMs = Number(sample.totalMs) * 1000
    samples.push(totalMs)
    lastStatus = Number(sample.status)
    lastBytes = Number(sample.bytes)
    lastTtfbMs = Number(sample.ttfbMs) * 1000
    lastRemoteIp = sample.remoteIp || ""
    lastEffectiveUrl = sample.effectiveUrl || url
  }

  return {
    route,
    status: lastStatus,
    bytes: lastBytes,
    ttfbMs: lastTtfbMs,
    avgMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p95Ms: percentile(samples, 95),
    remoteIp: lastRemoteIp,
    effectiveUrl: lastEffectiveUrl,
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
      ttfbMs: 0,
      avgMs: 0,
      p95Ms: 0,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

console.log(`# Performance baseline\n`)
console.log(`- Base URL: ${baseUrl}`)
console.log(`- Iterations: ${iterations}`)
console.log(`- Proxy env: ${useProxy ? "enabled" : "disabled"}`)
console.log(`- Captured at: ${new Date().toISOString()}\n`)

const proxyLikeRemoteIps = Array.from(new Set(results
  .map((result) => result.remoteIp)
  .filter(isProxyLikeRemoteIp)))
if (proxyLikeRemoteIps.length > 0) {
  console.log(`> Warning: proxy-like remote IP detected (${proxyLikeRemoteIps.join(", ")}). Treat public TLS errors from this client as local proxy/TUN evidence until confirmed from the server or an external monitor.\n`)
}

console.log("| Route | Status | Remote IP | Bytes | TTFB ms | Avg ms | P95 ms |")
console.log("|---|---:|---|---:|---:|---:|---:|")
for (const result of results) {
  console.log(`| ${result.route} | ${result.status} | ${result.remoteIp || "-"} | ${result.bytes} | ${result.ttfbMs.toFixed(1)} | ${result.avgMs.toFixed(1)} | ${result.p95Ms.toFixed(1)} |`)
  if (result.error) console.error(`${result.route}: ${result.error}`)
}
