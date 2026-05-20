import { NextResponse } from "next/server"
import { getAllRuntimeFlags } from "@/lib/free-trial-runtime-config"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const flags = await getAllRuntimeFlags()
    return NextResponse.json({
      campaignEnabled: flags.campaignEnabled,
      consumptionEnabled: flags.consumptionEnabled,
      autoPromptEnabled: flags.autoPromptEnabled,
    })
  } catch (error) {
    logger.warn("[free-trial/runtime-flags] fallback to safe defaults", error)
    return NextResponse.json({
      campaignEnabled: process.env.NEXT_PUBLIC_FREE_TRIAL_CAMPAIGN_ENABLED !== "false",
      consumptionEnabled: process.env.FREE_TRIAL_CONSUMPTION_ENABLED !== "false",
      autoPromptEnabled: true,
    })
  }
}
