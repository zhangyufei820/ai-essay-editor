#!/usr/bin/env node

import http from "http"
import fs from "fs"

const args = process.argv.slice(2)
const roundsArg = args.find((arg) => arg.startsWith("--rounds="))
const rounds = Math.max(1, Number(roundsArg?.split("=")[1] || 1))

const env = Object.fromEntries(
  fs.readFileSync("/proc/1/environ", "utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf("=")
      return [entry.slice(0, idx), entry.slice(idx + 1)]
    }),
)

const key = env.LITELLM_MASTER_KEY || process.env.LITELLM_MASTER_KEY || ""
const models = args.filter((arg) => !arg.startsWith("--"))

function request(model) {
  return new Promise((resolve) => {
    const started = Date.now()
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with ok." }],
      temperature: 0,
      stream: false,
      max_completion_tokens: 8,
    })

    const req = http.request(
      {
        host: "llm-gateway",
        port: 4000,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ""
        res.on("data", (chunk) => {
          data += chunk
        })
        res.on("end", () => {
          resolve({
            model,
            status: res.statusCode || 0,
            elapsedMs: Date.now() - started,
            snippet: data.slice(0, 120),
          })
        })
      },
    )

    req.on("error", (error) => {
      resolve({
        model,
        status: "ERROR",
        elapsedMs: Date.now() - started,
        snippet: error.message,
      })
    })

    req.write(body)
    req.end()
  })
}

const history = new Map()

for (let round = 1; round <= rounds; round += 1) {
  for (const model of models) {
    const result = await request(model)
    const bucket = history.get(model) || []
    bucket.push(result)
    history.set(model, bucket)
    console.log(
      `${round}/${rounds}\t${result.model}\t${result.status}\t${(result.elapsedMs / 1000).toFixed(2)}s\t${String(result.snippet).replace(/\n/g, " ")}`
    )
  }
}

if (rounds > 1) {
  console.log("summary")
  for (const model of models) {
    const samples = history.get(model) || []
    const okSamples = samples.filter((sample) => sample.status === 200)
    const avgMs = okSamples.length
      ? okSamples.reduce((sum, sample) => sum + sample.elapsedMs, 0) / okSamples.length
      : 0
    const p95Index = okSamples.length ? Math.max(0, Math.ceil(okSamples.length * 0.95) - 1) : 0
    const p95Ms = okSamples.length
      ? [...okSamples].sort((a, b) => a.elapsedMs - b.elapsedMs)[p95Index].elapsedMs
      : 0
    const failures = samples.length - okSamples.length
    console.log(`${model}\tok=${okSamples.length}/${samples.length}\tfail=${failures}\tavg=${(avgMs / 1000).toFixed(2)}s\tp95=${(p95Ms / 1000).toFixed(2)}s`)
  }
}
