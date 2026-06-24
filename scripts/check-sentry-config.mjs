import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })
dotenv.config({ path: ".env.production", override: false, quiet: true })

const allowMissing = process.argv.includes("--allow-missing")

function isUsableSentryDsn(value) {
  if (!value) return false

  const normalized = value.trim().toLowerCase()
  const placeholderTokens = ["example", "placeholder", "your_", "your-", "sentry_dsn", "o0.ingest.sentry.io"]
  if (placeholderTokens.some((token) => normalized.includes(token))) return false

  try {
    const parsed = new URL(value)
    return parsed.protocol === "https:" && parsed.username.length > 0 && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function stateFor(name) {
  const value = process.env[name]
  return {
    name,
    present: Boolean(value),
    usable: isUsableSentryDsn(value),
  }
}

const checks = [
  stateFor("SENTRY_DSN"),
  stateFor("NEXT_PUBLIC_SENTRY_DSN"),
]

const serverReady = checks[0].usable
const browserReady = checks[1].usable
const ok = serverReady && browserReady

console.log(JSON.stringify({
  ok: ok || allowMissing,
  provider: "sentry",
  allowMissing,
  serverReady,
  browserReady,
  checks,
  guidance: ok
    ? "Sentry DSN variables are present and look usable."
    : "Configure SENTRY_DSN and NEXT_PUBLIC_SENTRY_DSN in production secrets, then rerun this check.",
}, null, 2))

if (!ok && !allowMissing) {
  process.exit(1)
}
