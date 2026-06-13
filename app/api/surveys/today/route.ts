import { NextResponse, type NextRequest } from "next/server"
import { getUserTrialStatus } from "@/lib/free-trial"
import { logger } from "@/lib/logger"
import { isOperationTimeoutError, withTimeout } from "@/lib/server-timeout"
import { getTodaySurveyTemplate, hasSubmittedSurveyToday } from "@/lib/surveys"
import { requireUser } from "@/lib/auth/verified-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AUTH_TIMEOUT_MS = 5_000
const SURVEY_READ_TIMEOUT_MS = 2_500
const TRIAL_STATUS_TIMEOUT_MS = 2_000

export async function GET(request: NextRequest) {
  try {
    const auth = await withTimeout(requireUser(request), AUTH_TIMEOUT_MS, "surveys-today.auth")
    if (auth.response) return auth.response

    const userId = auth.user!.id
    const submittedResult = await withTimeout(
      hasSubmittedSurveyToday(userId),
      SURVEY_READ_TIMEOUT_MS,
      "surveys-today.submitted",
    ).catch((error) => {
      logger.warn("[surveys/today] submitted state degraded", { userId, error })
      return { success: false, data: false, error: "submitted_timeout" }
    })

    const [templateResult, trialStatus] = await Promise.all([
      submittedResult.data
        ? Promise.resolve({ success: true, data: null, error: null })
        : withTimeout(
          getTodaySurveyTemplate(userId),
          SURVEY_READ_TIMEOUT_MS,
          "surveys-today.template",
        ).catch((error) => {
          logger.warn("[surveys/today] template state degraded", { userId, error })
          return { success: false, data: null, error: "template_timeout" }
        }),
      withTimeout(
        getUserTrialStatus(userId),
        TRIAL_STATUS_TIMEOUT_MS,
        "surveys-today.trial-status",
      ).catch((error) => {
        logger.warn("[surveys/today] trial status degraded", { userId, error })
        return { success: false, data: null, error: "trial_status_timeout" }
      }),
    ])

    if (!templateResult.success || !submittedResult.success) {
      logger.warn("[surveys/today] failed to load survey state", {
        userId,
        templateError: templateResult.error,
        submittedError: submittedResult.error,
      })
    }

    return NextResponse.json({
      ok: true,
      template: templateResult.success ? templateResult.data : null,
      alreadySubmitted: Boolean(submittedResult.data),
      trialStatus: trialStatus.data,
      degraded: !templateResult.success || !submittedResult.success || !trialStatus.success,
    })
  } catch (error) {
    logger.error("[surveys/today] unexpected error", error)
    if (isOperationTimeoutError(error)) {
      return NextResponse.json(
        { ok: false, template: null, alreadySubmitted: false, trialStatus: null, code: error.code },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { ok: false, template: null, alreadySubmitted: false, trialStatus: null },
      { status: 500 },
    )
  }
}
