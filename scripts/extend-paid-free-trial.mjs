import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })

const DEFAULT_DAYS = 60
const DEFAULT_DAILY_QUOTA = 0
const MEMBERSHIP_PRODUCT_IDS = ["basic", "pro", "premium", "enterprise", "campus"]

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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
  console.log("Extend paid members with paid_extension free trial grants.")
  console.log("")
  console.log("Default mode is dry run. Use --apply to write rows.")
  console.log("")
  console.log("Usage:")
  console.log("  node scripts/extend-paid-free-trial.mjs")
  console.log("  node scripts/extend-paid-free-trial.mjs --days 60")
  console.log("  node scripts/extend-paid-free-trial.mjs --apply --days 60")
}

function addDays(date, days) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function loadPaidUserIds(supabase) {
  const userIds = new Set()

  const { data: credits, error: creditsError } = await supabase
    .from("user_credits")
    .select("user_id")
    .eq("is_pro", true)
  if (creditsError) throw creditsError
  for (const row of credits || []) {
    if (row.user_id) userIds.add(String(row.user_id))
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("user_id, product_id")
    .eq("status", "paid")
    .in("product_id", MEMBERSHIP_PRODUCT_IDS)
  if (ordersError) throw ordersError
  for (const row of orders || []) {
    if (row.user_id) userIds.add(String(row.user_id))
  }

  return Array.from(userIds).sort()
}

async function loadActivePaidExtensionUserIds(supabase) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("free_trial_grants")
    .select("user_id")
    .eq("grant_type", "paid_extension")
    .eq("status", "active")
    .lte("start_at", now)
    .gt("end_at", now)

  if (error) throw error
  return new Set((data || []).map((row) => String(row.user_id || "")).filter(Boolean))
}

async function grantPaidExtension(supabase, userId, options) {
  const startAt = new Date()
  const endAt = addDays(startAt, options.days)

  const { error } = await supabase.from("free_trial_grants").insert({
    user_id: userId,
    grant_type: "paid_extension",
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    daily_quota: options.dailyQuota,
    total_quota: null,
    status: "active",
    requires_daily_survey: false,
    metadata: {
      source: "full_launch_paid_extension",
      extensionDays: options.days,
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
  const result = {
    paidUsersScanned: 0,
    paidExtensionsGranted: 0,
    paidExtensionsSkipped: 0,
    errors: 0,
    dryRun,
  }

  console.log("================================================================================")
  console.log("Extend paid members free trial")
  console.log("================================================================================")
  console.log(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`)
  console.log(`Days: ${options.days}`)
  console.log(`Daily quota: ${options.dailyQuota}`)
  console.log("Only paid_extension grants are handled. Existing campaign grants are ignored.\n")

  const paidUserIds = await loadPaidUserIds(supabase)
  const activePaidExtensionUsers = await loadActivePaidExtensionUserIds(supabase)
  result.paidUsersScanned = paidUserIds.length

  for (const userId of paidUserIds) {
    if (activePaidExtensionUsers.has(userId)) {
      result.paidExtensionsSkipped += 1
      continue
    }

    if (dryRun) {
      result.paidExtensionsGranted += 1
      continue
    }

    try {
      await grantPaidExtension(supabase, userId, options)
      result.paidExtensionsGranted += 1
    } catch (error) {
      result.errors += 1
      console.error(`Paid extension failed for ${userId}: ${getErrorMessage(error)}`)
    }
  }

  console.log("\nSummary")
  console.log("-------")
  console.log(`paidUsersScanned: ${result.paidUsersScanned}`)
  console.log(`paidExtensionsGranted: ${result.paidExtensionsGranted}`)
  console.log(`paidExtensionsSkipped: ${result.paidExtensionsSkipped}`)
  console.log(`errors: ${result.errors}`)
  console.log(`dryRun: ${result.dryRun}`)

  if (dryRun) {
    console.log("\nNo database writes were made. Re-run with --apply to write paid_extension grants.")
  }

  if (result.errors > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error("Unexpected failure:", error)
  process.exit(1)
})
