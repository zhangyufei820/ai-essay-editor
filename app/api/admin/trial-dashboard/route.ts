import { NextResponse, type NextRequest } from "next/server"
import { logAdminAction, verifyAdminToken } from "@/lib/admin-auth"
import { getFreeTrialFlags } from "@/lib/free-trial-flags"
import { logger } from "@/lib/logger"
import { getAdminRecentFeedback } from "@/lib/surveys"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

async function countTrialGrants(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("free_trial_grants")
    .select("*", { count: "exact", head: true })

  if (error) throw error
  return count || 0
}

async function countCampaignEvent(eventName: string, eventDate: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("campaign_events")
    .select("*", { count: "exact", head: true })
    .eq("event_name", eventName)
    .eq("event_date", eventDate)

  if (error) {
    logger.warn("[admin/trial-dashboard] campaign event count skipped", {
      eventName,
      code: error.code,
      message: error.message,
    })
    return 0
  }

  return count || 0
}

async function getSurveySubmitTrend(days: number): Promise<Array<{ date: string; submitters: number }>> {
  const today = new Date()
  const since = new Date(today)
  since.setDate(today.getDate() - Math.max(days - 1, 0))
  const sinceDate = since.toISOString().slice(0, 10)

  const { data, error } = await getSupabaseAdmin()
    .from("daily_trial_metrics")
    .select("metric_date, survey_submitters")
    .gte("metric_date", sinceDate)
    .order("metric_date", { ascending: true })

  if (error) throw error

  const byDate = new Map((data || []).map((row) => [
    String(row.metric_date),
    Number(row.survey_submitters || 0),
  ]))

  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(since)
    date.setDate(since.getDate() + offset)
    const key = date.toISOString().slice(0, 10)
    return { date: key, submitters: byDate.get(key) || 0 }
  })
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!token || !(await verifyAdminToken(token))) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 })
  }

  try {
    await logAdminAction("view_trial_dashboard", token)

    const today = todayIsoDate()
    const supabase = getSupabaseAdmin()
    const [
      cumulativeClaimed,
      activeStatusRows,
      todayMetrics,
      recentFeedback,
      surveySubmitTrend7d,
      campaignEventCounts,
    ] = await Promise.all([
      countTrialGrants(),
      supabase
        .from("user_trial_status")
        .select("user_id, trial_active")
        .eq("trial_active", true),
      supabase
        .from("daily_trial_metrics")
        .select("*")
        .eq("metric_date", today)
        .maybeSingle(),
      getAdminRecentFeedback(30),
      getSurveySubmitTrend(7),
      Promise.all([
        countCampaignEvent("free_trial_announcement_shown", today),
        countCampaignEvent("free_trial_claim_clicked", today),
        countCampaignEvent("free_trial_claim_success", today),
        countCampaignEvent("daily_survey_auto_prompt_shown", today),
        countCampaignEvent("daily_survey_submit_success", today),
        countCampaignEvent("daily_survey_later_clicked", today),
        countCampaignEvent("survey_required_block", today),
        countCampaignEvent("trial_billing_success", today),
      ]),
    ])

    if (activeStatusRows.error) throw activeStatusRows.error
    if (todayMetrics.error) throw todayMetrics.error

    const activeTrialUsersToday = activeStatusRows.data?.length || 0
    const surveySubmittersToday = Number(todayMetrics.data?.survey_submitters || 0)
    const surveyCompletionRate = activeTrialUsersToday > 0
      ? Number((surveySubmittersToday / activeTrialUsersToday).toFixed(4))
      : 0

    const [
      announcementShownToday,
      claimClicksToday,
      claimSuccessToday,
      dailySurveyAutoPromptShownToday,
      dailySurveySubmitSuccessToday,
      dailySurveyLaterClickedToday,
      surveyRequiredBlocksToday,
      trialBillingSuccessToday,
    ] = campaignEventCounts

    return NextResponse.json({
      ok: true,
      metrics: {
        cumulativeClaimed,
        activeTrialUsersToday,
        surveySubmittersToday,
        surveyCompletionRate,
        trialCreditsUsedToday: Number(todayMetrics.data?.trial_credit_used || 0),
        avgQualityScoreToday: todayMetrics.data?.avg_quality_score == null
          ? null
          : Number(todayMetrics.data.avg_quality_score),
        announcementShownToday,
        claimClicksToday,
        claimSuccessToday,
        dailySurveyAutoPromptShownToday,
        dailySurveySubmitSuccessToday,
        dailySurveyLaterClickedToday,
        surveyRequiredBlocksToday,
        trialBillingSuccessToday,
      },
      featureFlags: getFreeTrialFlags(),
      trends: {
        surveySubmitters7d: surveySubmitTrend7d,
      },
      recentFeedback: recentFeedback.data || [],
    })
  } catch (error) {
    logger.error("[admin/trial-dashboard] failed", error)
    return NextResponse.json(
      {
        ok: false,
        metrics: null,
        recentFeedback: [],
        error: "获取体验计划看板失败",
      },
      { status: 500 },
    )
  }
}
