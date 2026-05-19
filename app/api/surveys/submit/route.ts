import { NextResponse, type NextRequest } from "next/server"
import { getUserTrialStatus } from "@/lib/free-trial"
import { logger } from "@/lib/logger"
import { submitSurveyResponse, type SurveyAnswers } from "@/lib/surveys"
import { requireUser } from "@/lib/auth/verified-user"
import { rejectUntrustedOrigin } from "@/lib/security/request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SubmitSurveyBody = {
  answers?: SurveyAnswers
  metadata?: {
    durationSeconds?: number
    source?: string
  } & Record<string, unknown>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function normalizeMetadata(metadata: SubmitSurveyBody["metadata"]): Record<string, unknown> {
  if (!isPlainObject(metadata)) return {}

  const normalized: Record<string, unknown> = {}
  if (Number.isFinite(Number(metadata.durationSeconds))) {
    normalized.durationSeconds = Math.max(0, Math.floor(Number(metadata.durationSeconds)))
  }
  if (typeof metadata.source === "string" && metadata.source.trim()) {
    normalized.source = metadata.source.trim().slice(0, 80)
  }

  return normalized
}

export async function POST(request: NextRequest) {
  const originRejected = rejectUntrustedOrigin(request)
  if (originRejected) return originRejected

  try {
    const auth = await requireUser(request)
    if (auth.response) return auth.response

    const body = (await request.json().catch(() => null)) as SubmitSurveyBody | null
    if (!body || !isPlainObject(body.answers)) {
      return NextResponse.json(
        {
          ok: false,
          qualityScore: null,
          streakDay: null,
          trialStatus: null,
          reward: null,
          error: "answers 参数无效",
        },
        { status: 400 },
      )
    }

    const userId = auth.user!.id
    const submitted = await submitSurveyResponse(
      userId,
      body.answers,
      normalizeMetadata(body.metadata),
    )
    const trialStatus = await getUserTrialStatus(userId)

    if (!submitted.success || !submitted.data) {
      logger.warn("[surveys/submit] submit failed", { userId, error: submitted.error })
      return NextResponse.json(
        {
          ok: false,
          qualityScore: null,
          streakDay: null,
          trialStatus: trialStatus.data,
          reward: null,
          error: "提交问卷失败，请稍后重试",
        },
        { status: 500 },
      )
    }

    const reward = {
      type: submitted.data.streakDay >= 30 ? "streak_bonus_candidate" : "survey_completed",
      granted: false,
      message: submitted.data.streakDay >= 30
        ? "已记录 30 天连续反馈资格，奖励将在后台复核后发放"
        : "今日问卷已记录，体验额度已解锁",
    }

    return NextResponse.json({
      ok: true,
      qualityScore: submitted.data.qualityScore,
      streakDay: submitted.data.streakDay,
      trialStatus: trialStatus.data,
      reward,
    })
  } catch (error) {
    logger.error("[surveys/submit] unexpected error", error)
    return NextResponse.json(
      {
        ok: false,
        qualityScore: null,
        streakDay: null,
        trialStatus: null,
        reward: null,
        error: "提交问卷失败，请稍后重试",
      },
      { status: 500 },
    )
  }
}
