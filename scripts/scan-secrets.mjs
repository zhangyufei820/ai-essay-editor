import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const EXCLUDED_PATHS = [
  /^\.env(?:\.|$)/,
  /^services\/shenxiang-new-api\//,
  /^services\/shenxiang-codex-workspace\/tests\//,
  /(^|\/)tests?\//,
  /(^|\/)__tests__\//,
  /(^|\/)fixtures?\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.venv\//,
  /\.lock$/,
]

const SECRET_PATTERNS = [
  { type: "OpenAI-compatible key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { type: "Dify application key", pattern: /\bapp-[A-Za-z0-9_-]{20,}\b/g },
  { type: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g },
  { type: "Stripe live key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { type: "Stripe webhook secret", pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/g },
  { type: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { type: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { type: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { type: "Tencent Cloud secret id", pattern: /\bAKID[A-Za-z0-9]{28,}\b/g },
  { type: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { type: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
]

function isObviousPlaceholderSecret(value) {
  const body = value.replace(/^(?:sk-(?:proj-)?|app-|sb_secret_)/, "")
  return body.length > 0 && new Set(body.toLowerCase()).size === 1
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
}

export function scanTrackedFiles(files = trackedFiles()) {
  const findings = []

  for (const file of files) {
    if (EXCLUDED_PATHS.some((pattern) => pattern.test(file))) continue

    let content
    try {
      content = readFileSync(file, "utf8")
    } catch {
      continue
    }

    for (const { type, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0
      for (const match of content.matchAll(pattern)) {
        if (isObviousPlaceholderSecret(match[0])) continue
        const line = content.slice(0, match.index).split("\n").length
        findings.push({ file, line, type })
      }
    }
  }

  return findings
}

const isCli = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]
if (isCli) {
  const findings = scanTrackedFiles()
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line} ${finding.type}`)
    }
    process.exitCode = 1
  } else {
    console.log("No tracked secret patterns found.")
  }
}
