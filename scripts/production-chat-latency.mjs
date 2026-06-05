#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { chromium } from "playwright"

const DEFAULT_BASE_URL = process.env.E2E_BASE_URL || "https://shenxiang.school"
const DEFAULT_TIMEOUT_MS = Number(process.env.PROD_CHAT_AUDIT_TIMEOUT_MS || 180000)

const TARGETS = [
  {
    slug: "general-chat",
    route: "/chat",
    appName: "网站助手",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `请忽略方括号中的追踪码，只回复“收到”。[${marker}]`,
  },
  {
    slug: "all-in-one-agent",
    route: "/chat/all-in-one-agent",
    appName: "数学图片与动画生成器（Codex Gateway）-Chatflow稳定启动v3",
    placeholder: "描述你想生成的动画、图片或要处理的文件...",
    prompt: (marker) => `请忽略方括号中的追踪码，只回复“收到”。[${marker}]`,
  },
  {
    slug: "vocab-card",
    route: "/chat/vocab-card",
    appName: "词镜记忆卡",
    placeholder: "例如：你好啊 / 我要学习 apple / 考我一下",
    prompt: (marker) => `apple [${marker}]`,
  },
  {
    slug: "quanquan-math",
    route: "/chat/quanquan-math",
    appName: "全学段数学智能体",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `忽略方括号中的追踪码，只输出答案数字：7+5=? [${marker}]`,
  },
  {
    slug: "quanquan-english",
    route: "/chat/quanquan-english",
    appName: "全学段英语智能体",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `Ignore the tracking code in brackets and reply with only: ok. [${marker}]`,
  },
  {
    slug: "problem",
    route: "/chat/problem",
    appName: "题目解析专用智能体",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `请解析这道题并给出简短答案，忽略方括号中的追踪码：2x+3=11。 [${marker}]`,
  },
  {
    slug: "beike-pro",
    route: "/chat/beike-pro",
    appName: "全学段备课助手pro",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `请忽略方括号中的追踪码，只回复“收到”。[${marker}]`,
  },
  {
    slug: "banzhuren",
    route: "/chat/banzhuren",
    appName: "班主任超级助手",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `请忽略方括号中的追踪码，只回复“收到”。[${marker}]`,
  },
  {
    slug: "ai-writing-paper",
    route: "/chat/ai-writing-paper",
    appName: "论文写作",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `请忽略方括号中的追踪码，只回复“收到”。[${marker}]`,
  },
  {
    slug: "experiment-report",
    route: "/chat/experiment-report",
    appName: "实验报告智能助手",
    placeholder: "输入内容开始对话...",
    prompt: (marker) => `请忽略方括号中的追踪码，只回复“收到”。[${marker}]`,
  },
]

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=")
        if (separator === -1) return [line, ""]
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

function readCredentials() {
  const fileEnv = parseEnvFile("/Users/aixingren/.shenxiang-secrets/shenxiang-e2e.env")
  return {
    phone: process.env.SHENXIANG_E2E_TEST_PHONE || fileEnv.SHENXIANG_E2E_TEST_PHONE || "19132896773",
    password: process.env.SHENXIANG_E2E_TEST_PASSWORD || fileEnv.SHENXIANG_E2E_TEST_PASSWORD || "",
  }
}

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL.replace(/\/$/, ""),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    outputPath: "",
    headless: true,
    slugs: [],
  }

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith("--base-url=")) {
      args.baseUrl = arg.split("=")[1].replace(/\/$/, "")
    } else if (arg.startsWith("--timeout-ms=")) {
      args.timeoutMs = Number(arg.split("=")[1]) || DEFAULT_TIMEOUT_MS
    } else if (arg.startsWith("--output=")) {
      args.outputPath = arg.split("=")[1]
    } else if (arg === "--headed") {
      args.headless = false
    } else if (arg.startsWith("--slug=")) {
      args.slugs.push(arg.split("=")[1])
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

async function dismissTrialDialog(page) {
  const dialog = page.getByRole("dialog", { name: "沈翔智学 60 天共创体验计划" })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const visible = await dialog.isVisible({ timeout: 2000 }).catch(() => false)
    if (!visible) return
    const laterButton = dialog.getByRole("button", { name: "稍后再说" })
    if (await laterButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await laterButton.click({ force: true })
    } else {
      await page.keyboard.press("Escape")
    }
    const hidden = await dialog.isHidden({ timeout: 3000 }).catch(() => false)
    if (hidden) return
  }
}

async function login(page, baseUrl, phone, password) {
  await page.goto(`${baseUrl}/login?redirect=%2Fchat`, { waitUntil: "domcontentloaded" })
  await dismissTrialDialog(page)
  await page.locator("#passworLogin_account").fill(phone)
  await page.locator("#passworLogin_password").fill(password)
  await page.locator("button[type='submit']").filter({ hasText: "Sign In" }).click()
  await page.waitForURL(/\/chat(?:$|\?)/, { timeout: 45000 })
  await dismissTrialDialog(page)
  await page.getByPlaceholder("输入内容开始对话...").waitFor({ timeout: 30000 })
}

async function waitForPerfStage(page, stage, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const entries = await page.evaluate(() => {
      return Array.isArray(window.__SHENXIANG_CHAT_PERF__) ? window.__SHENXIANG_CHAT_PERF__ : []
    })
    if (entries.some((entry) => entry?.stage === stage)) return entries
    await page.waitForTimeout(500)
  }
  throw new Error(`perf_stage_timeout:${stage}`)
}

function summarizePerf(entries) {
  const stages = ["click_to_request_start", "request_headers", "first_chunk", "first_answer", "first_text_chunk", "first_workflow_output", "first_word_card", "first_render", "stream_end"]
  const summary = {}
  for (const stage of stages) {
    const entry = entries.find((item) => item?.stage === stage)
    if (entry) summary[stage] = entry.elapsedMs
  }
  return summary
}

async function runTarget(page, baseUrl, target, timeoutMs) {
  const marker = `GW-AUDIT-${Date.now()}-${target.slug}`
  const sendButton = page.getByRole("button", { name: "发送消息" })

  await page.goto(`${baseUrl}${target.route}`, { waitUntil: "domcontentloaded" })
  await dismissTrialDialog(page)

  const input = page.getByPlaceholder(target.placeholder)
  await input.waitFor({ timeout: 30000 })
  await input.click()
  await input.fill("")
  await input.fill(target.prompt(marker))
  await page.evaluate(() => {
    window.__SHENXIANG_CHAT_PERF__ = []
  })

  const requestStartedAt = Date.now()
  const responsePromise = page.waitForResponse((response) => {
    try {
      const url = new URL(response.url())
      return url.pathname === "/api/dify-chat" && response.request().method() === "POST"
    } catch {
      return false
    }
  }, { timeout: Math.min(timeoutMs, 45000) })

  await sendButton.click()
  const response = await responsePromise
  const responseHeadersMs = Date.now() - requestStartedAt
  const perfEntries = await waitForPerfStage(page, "stream_end", timeoutMs)
  await dismissTrialDialog(page)
  await sendButton.waitFor({ state: "visible", timeout: 10000 })

  const assistantPreview = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-slot="v2-message-bubble-markdown"]'))
    const lastCard = cards.at(-1)
    if (!lastCard) return ""
    return (lastCard.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160)
  })

  return {
    slug: target.slug,
    route: target.route,
    appName: target.appName,
    marker,
    status: response.status(),
    responseHeadersMs,
    perf: summarizePerf(perfEntries),
    assistantPreview,
  }
}

function printSummary(results) {
  console.log("| Route | App | HTTP | Headers ms | First render ms | Stream end ms | Marker |")
  console.log("|---|---|---:|---:|---:|---:|---|")
  for (const result of results) {
    if (result.error) {
      console.log(`| ${result.route} | ${result.appName} | ERR | - | - | - | ${result.marker || "-"} |`)
      continue
    }
    console.log(
      `| ${result.route} | ${result.appName} | ${result.status} | ${result.responseHeadersMs} | ${result.perf.first_render || "-"} | ${result.perf.stream_end || "-"} | ${result.marker} |`
    )
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const { phone, password } = readCredentials()
  if (!password) throw new Error("SHENXIANG_E2E_TEST_PASSWORD is not configured")

  const selectedTargets = args.slugs.length
    ? TARGETS.filter((target) => args.slugs.includes(target.slug))
    : TARGETS

  if (!selectedTargets.length) throw new Error("No targets selected")

  const browser = await chromium.launch({ headless: args.headless })
  const context = await browser.newContext()
  const page = await context.newPage()
  const results = []

  try {
    await login(page, args.baseUrl, phone, password)

    for (const target of selectedTargets) {
      try {
        const result = await runTarget(page, args.baseUrl, target, args.timeoutMs)
        results.push(result)
      } catch (error) {
        results.push({
          slug: target.slug,
          route: target.route,
          appName: target.appName,
          marker: `FAILED-${Date.now()}-${target.slug}`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } finally {
    await context.close()
    await browser.close()
  }

  const output = {
    baseUrl: args.baseUrl,
    capturedAt: new Date().toISOString(),
    results,
  }

  const outputPath = args.outputPath || path.join(process.cwd(), "logs", `production-chat-latency-${Date.now()}.json`)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))

  printSummary(results)
  console.log(`\nSaved ${outputPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
