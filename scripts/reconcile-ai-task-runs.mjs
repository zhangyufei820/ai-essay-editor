import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })
dotenv.config({ path: ".env.production", override: false, quiet: true })

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"
const secret = process.env.CRON_SECRET || process.env.AI_TASK_RECONCILE_CRON_SECRET
const apply = process.argv.includes("--apply")

function readArg(name) {
  const prefix = `--${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : null
}

if (!secret) {
  console.error("Missing CRON_SECRET or AI_TASK_RECONCILE_CRON_SECRET")
  process.exit(1)
}

const url = new URL("/api/cron/reconcile-ai-task-runs", baseUrl)
if (apply) {
  url.searchParams.set("apply", "1")
} else {
  url.searchParams.set("dryRun", "1")
}

const olderThanMinutes = readArg("older-than-minutes")
const limit = readArg("limit")
if (olderThanMinutes) url.searchParams.set("olderThanMinutes", olderThanMinutes)
if (limit) url.searchParams.set("limit", limit)

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${secret}`,
  },
})

const text = await res.text()
console.log(text)

if (!res.ok) {
  process.exit(1)
}
