import dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000"
const secret = process.env.CRON_SECRET || process.env.IMAGE_TASKS_CRON_SECRET
const dryRun = process.argv.includes("--dry-run")

if (!secret) {
  console.error("Missing CRON_SECRET or IMAGE_TASKS_CRON_SECRET")
  process.exit(1)
}

const url = new URL("/api/cron/settle-image-tasks", baseUrl)
if (dryRun) url.searchParams.set("dryRun", "1")

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
