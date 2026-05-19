import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })

const DEFAULT_DAYS = 60
const DEFAULT_DAILY_QUOTA = 2000
const PAGE_SIZE = 1000

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const batchGrantEnabled = process.env.FREE_TRIAL_BATCH_GRANT_ENABLED !== "false"

function parseArgs(argv) {
  const options = {
    apply: false,
    days: DEFAULT_DAYS,
    dailyQuota: DEFAULT_DAILY_QUOTA,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--apply") {
      options.apply = true
    } else if (arg === "--all") {
      // Backward-compatible no-op: the script grants to all known users by default.
    } else if (arg === "--help" || arg === "-h") {
      options.help = true
    } else if (arg === "--days") {
      options.days = Number(argv[index + 1])
      index += 1
    } else if (arg.startsWith("--days=")) {
      options.days = Number(arg.split("=")[1])
    } else if (arg === "--daily-quota") {
      options.dailyQuota = Number(argv[index + 1])
      index += 1
    } else if (arg.startsWith("--daily-quota=")) {
      options.dailyQuota = Number(arg.split("=")[1])
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!Number.isFinite(options.days) || options.days <= 0) {
    throw new Error("--days must be a positive number")
  }
  if (!Number.isFinite(options.dailyQuota) || options.dailyQuota < 0) {
    throw new Error("--daily-quota must be a non-negative number")
  }

  options.days = Math.floor(options.days)
  options.dailyQuota = Math.floor(options.dailyQuota)
  return options
}

function printUsage() {
  console.log("Grant campaign free trial grants to existing users.")
  console.log("")
  console.log("Default mode is dry run. Use --apply to write rows.")
  console.log("")
  console.log("Usage:")
  console.log("  node scripts/grant-free-trial.mjs")
  console.log("  node scripts/grant-free-trial.mjs --days 60 --daily-quota 2000")
  console.log("  node scripts/grant-free-trial.mjs --apply --days 60 --daily-quota 2000")
  console.log("")
  console.log("Required env:")
  console.log("  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL")
  console.log("  SUPABASE_SERVICE_ROLE_KEY")
}

function addDays(date, days) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function selectAll(supabase, tableName, columns, options = {}) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from(tableName)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1)

    if (options.orderBy) {
      query = query.order(options.orderBy, { ascending: true })
    }

    const { data, error } = await query
    if (error) throw error

    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

async function loadExistingUserIds(supabase) {
  const userIds = new Set()
  const errors = []

  try {
    const creditUsers = await selectAll(supabase, "user_credits", "user_id", { orderBy: "user_id" })
    for (const row of creditUsers) {
      if (row.user_id) userIds.add(String(row.user_id))
    }
  } catch (error) {
    errors.push({ source: "user_credits", error: getErrorMessage(error) })
  }

  try {
    const orderUsers = await selectAll(supabase, "orders", "user_id", { orderBy: "user_id" })
    for (const row of orderUsers) {
      if (row.user_id) userIds.add(String(row.user_id))
    }
  } catch (error) {
    errors.push({ source: "orders", error: getErrorMessage(error) })
  }

  return {
    userIds: Array.from(userIds).sort(),
    sourceErrors: errors,
  }
}

async function loadActiveCampaignUserIds(supabase) {
  const now = new Date().toISOString()
  const rows = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("free_trial_grants")
      .select("user_id")
      .eq("grant_type", "campaign")
      .eq("status", "active")
      .lte("start_at", now)
      .gt("end_at", now)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) break
  }

  return new Set(rows.map((row) => String(row.user_id)).filter(Boolean))
}

async function grantOne(supabase, userId, options) {
  const startAt = new Date()
  const endAt = addDays(startAt, options.days)

  const { error } = await supabase.from("free_trial_grants").insert({
    user_id: userId,
    grant_type: "campaign",
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    daily_quota: options.dailyQuota,
    total_quota: null,
    status: "active",
    requires_daily_survey: true,
    metadata: {
      source: "scripts/grant-free-trial.mjs",
      durationDays: options.days,
      dryRun: false,
      grantedAt: startAt.toISOString(),
    },
  })

  if (error) throw error
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    printUsage()
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const dryRun = !options.apply
  if (!dryRun && !batchGrantEnabled) {
    console.error("FREE_TRIAL_BATCH_GRANT_ENABLED=false; refusing to write grants. Run without --apply for dry run.")
    process.exit(1)
  }

  const result = {
    dryRun,
    days: options.days,
    dailyQuota: options.dailyQuota,
    usersScanned: 0,
    granted: 0,
    skipped: 0,
    errors: 0,
  }

  console.log("================================================================================")
  console.log("Grant free trial")
  console.log("================================================================================")
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`)
  console.log(`Days: ${options.days}`)
  console.log(`Daily quota: ${options.dailyQuota}`)
  console.log("Default dry run protects production data. Add --apply to write grants.\n")

  const { userIds, sourceErrors } = await loadExistingUserIds(supabase)
  for (const sourceError of sourceErrors) {
    result.errors += 1
    console.error(`Source scan warning (${sourceError.source}): ${sourceError.error}`)
  }

  result.usersScanned = userIds.length
  const activeCampaignUsers = await loadActiveCampaignUserIds(supabase)

  for (const userId of userIds) {
    if (activeCampaignUsers.has(userId)) {
      result.skipped += 1
      continue
    }

    if (dryRun) {
      result.granted += 1
      continue
    }

    try {
      await grantOne(supabase, userId, options)
      result.granted += 1
    } catch (error) {
      result.errors += 1
      console.error(`Grant failed for ${userId}: ${getErrorMessage(error)}`)
    }
  }

  console.log("\nSummary")
  console.log("-------")
  console.log(`usersScanned: ${result.usersScanned}`)
  console.log(`granted: ${result.granted}`)
  console.log(`skipped: ${result.skipped}`)
  console.log(`errors: ${result.errors}`)
  console.log(`dryRun: ${result.dryRun}`)

  if (dryRun) {
    console.log("\nNo database writes were made. Re-run with --apply to write grants.")
  }

  if (result.errors > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error("Unexpected failure:", error)
  process.exit(1)
})
