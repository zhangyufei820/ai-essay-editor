import { NextResponse, type NextRequest } from "next/server"
import { getUserTrialStatus } from "@/lib/free-trial"
import { logger } from "@/lib/logger"
import { getTodaySurveyTemplate, hasSubmittedSurveyToday } from "@/lib/surveys"
import { requireUser } from "@/lib/auth/verified-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const userId = auth.user!.id
    const [templateResult, submittedResult, trialStatus] = await Promise.all([
      getTodaySurveyTemplate(userId),
      hasSubmittedSurveyToday(userId),
      getUserTrialStatus(userId),
    ])

    if (!templateResult.success || !submittedResult.success) {
      logger.warn("[surveys/today] failed to load survey state", {
        userId,
        templateError: templateResult.error,
        submittedError: submittedResult.error,
      })
      return NextResponse.json(
        {
          ok: false,
          template: null,
          alreadySubmitted: Boolean(submittedResult.data),
          trialStatus: trialStatus.data,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      template: templateResult.data,
      alreadySubmitted: Boolean(submittedResult.data),
      trialStatus: trialStatus.data,
    })
  } catch (error) {
    logger.error("[surveys/today] unexpected error", error)
    return NextResponse.json(
      { ok: false, template: null, alreadySubmitted: false, trialStatus: null },
      { status: 500 },
    )
  }
}
