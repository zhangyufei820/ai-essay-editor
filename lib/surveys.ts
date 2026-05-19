import { logger } from "@/lib/logger"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export interface SurveyTemplate {
  id: string
  template_key: string
  title: string
  description: string | null
  audience: string
  cadence: "onboarding" | "daily" | "weekly" | "exit"
  questions_json: SurveyQuestion[]
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SurveyQuestion {
  id: string
  type: string
  title: string
  required?: boolean
  options?: string[]
  min?: number
  max?: number
}

export type SurveyAnswers = Record<string, unknown>

export interface SurveyResponse {
  id: string
  user_id: string
  template_id: string | null
  survey_date: string
  answers_json: SurveyAnswers
  quality_score: number
  streak_day: number
  metadata: Record<string, unknown>
  created_at: string
}

export interface SurveyOperationResult<T> {
  success: boolean
  data: T | null
  error: string | null
}

export interface SubmitSurveyResult {
  todaySurveyCompleted: boolean
  streakDay: number
  qualityScore: number
  response: SurveyResponse | null
}

export interface AdminFeedbackItem extends SurveyResponse {
  survey_templates?: {
    template_key: string
    title: string
    cadence: string
  } | null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function clampLimit(limit?: number, fallback = 20, max = 200): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return fallback
  return Math.min(Math.floor(limit), max)
}

function isMeaningfulAnswer(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0
  return value !== null && value !== undefined
}

function isOpenTextKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return (
    normalized.includes("text") ||
    normalized.includes("pain") ||
    normalized.includes("part") ||
    normalized.includes("friction") ||
    normalized.includes("feedback") ||
    normalized.includes("request") ||
    normalized.includes("reason")
  )
}

export async function getTodaySurveyTemplate(userId: string): Promise<SurveyOperationResult<SurveyTemplate>> {
  try {
    const submitted = await hasSubmittedSurveyToday(userId)
    if (submitted.data === true) {
      return { success: true, data: null, error: null }
    }

    const supabase = getSupabaseAdmin()
    const { data: hasAnyResponse, error: responseError } = await supabase
      .from("survey_responses")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle()

    if (responseError) throw responseError

    const cadence = hasAnyResponse ? "daily" : "onboarding"
    const { data, error } = await supabase
      .from("survey_templates")
      .select("*")
      .eq("active", true)
      .eq("cadence", cadence)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return { success: true, data: (data as SurveyTemplate | null) || null, error: null }
  } catch (error) {
    logger.error("[surveys] getTodaySurveyTemplate failed", { userId, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function hasSubmittedSurveyToday(userId: string): Promise<SurveyOperationResult<boolean>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("survey_responses")
      .select("id")
      .eq("user_id", userId)
      .eq("survey_date", todayIsoDate())
      .maybeSingle()

    if (error) throw error
    return { success: true, data: Boolean(data), error: null }
  } catch (error) {
    logger.error("[surveys] hasSubmittedSurveyToday failed", { userId, error })
    return { success: false, data: false, error: getErrorMessage(error) }
  }
}

export function calculateSurveyQualityScore(
  answers: SurveyAnswers,
  metadata: Record<string, unknown> = {},
): number {
  const entries = Object.entries(answers || {})
  if (entries.length === 0 || entries.every(([, value]) => !isMeaningfulAnswer(value))) {
    return 20
  }

  let score = 100
  const durationSeconds = Number(metadata.durationSeconds)
  if (Number.isFinite(durationSeconds) && durationSeconds < 15) {
    score -= 40
  }

  const openAnswerEntries = entries.filter(([key, value]) => (
    isOpenTextKey(key) || typeof value === "string"
  ))
  if (
    openAnswerEntries.length > 0 &&
    openAnswerEntries.every(([, value]) => typeof value !== "string" || value.trim().length === 0)
  ) {
    score -= 10
  }

  return Math.max(20, Math.min(100, score))
}

export async function calculateCurrentStreak(userId: string): Promise<SurveyOperationResult<number>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("survey_responses")
      .select("survey_date")
      .eq("user_id", userId)
      .order("survey_date", { ascending: false })
      .limit(120)

    if (error) throw error

    const uniqueDates = Array.from(
      new Set((data || []).map((row) => String(row.survey_date)).filter(Boolean)),
    )

    let streak = 0
    const cursor = new Date(`${todayIsoDate()}T00:00:00.000Z`)
    for (const date of uniqueDates) {
      const expected = cursor.toISOString().slice(0, 10)
      if (date !== expected) break
      streak += 1
      cursor.setUTCDate(cursor.getUTCDate() - 1)
    }

    return { success: true, data: streak, error: null }
  } catch (error) {
    logger.error("[surveys] calculateCurrentStreak failed", { userId, error })
    return { success: false, data: 0, error: getErrorMessage(error) }
  }
}

export async function submitSurveyResponse(
  userId: string,
  answers: SurveyAnswers,
  metadata: Record<string, unknown> = {},
): Promise<SurveyOperationResult<SubmitSurveyResult>> {
  try {
    const submitted = await hasSubmittedSurveyToday(userId)
    if (submitted.data) {
      const recent = await getRecentSurveyResponses(userId, 1)
      const response = recent.data?.[0] || null
      return {
        success: true,
        data: {
          todaySurveyCompleted: true,
          streakDay: response?.streak_day || 0,
          qualityScore: response?.quality_score || 0,
          response,
        },
        error: null,
      }
    }

    const templateResult = await getTodaySurveyTemplate(userId)
    const template = templateResult.data
    const qualityScore = calculateSurveyQualityScore(answers, metadata)
    const streakBeforeInsert = await calculateCurrentStreak(userId)
    const streakDay = (streakBeforeInsert.data || 0) + 1

    const { data, error } = await getSupabaseAdmin()
      .from("survey_responses")
      .insert({
        user_id: userId,
        template_id: template?.id || null,
        survey_date: todayIsoDate(),
        answers_json: answers,
        quality_score: qualityScore,
        streak_day: streakDay,
        metadata,
      })
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        const recent = await getRecentSurveyResponses(userId, 1)
        const response = recent.data?.[0] || null
        return {
          success: true,
          data: {
            todaySurveyCompleted: true,
            streakDay: response?.streak_day || 0,
            qualityScore: response?.quality_score || 0,
            response,
          },
          error: null,
        }
      }
      throw error
    }

    return {
      success: true,
      data: {
        todaySurveyCompleted: true,
        streakDay,
        qualityScore,
        response: data as SurveyResponse,
      },
      error: null,
    }
  } catch (error) {
    logger.error("[surveys] submitSurveyResponse failed", { userId, error })
    return { success: false, data: null, error: getErrorMessage(error) }
  }
}

export async function getRecentSurveyResponses(
  userId: string,
  limit = 20,
): Promise<SurveyOperationResult<SurveyResponse[]>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("survey_responses")
      .select("*")
      .eq("user_id", userId)
      .order("survey_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(clampLimit(limit))

    if (error) throw error
    return { success: true, data: (data || []) as SurveyResponse[], error: null }
  } catch (error) {
    logger.error("[surveys] getRecentSurveyResponses failed", { userId, limit, error })
    return { success: false, data: [], error: getErrorMessage(error) }
  }
}

export async function getAdminRecentFeedback(limit = 100): Promise<SurveyOperationResult<AdminFeedbackItem[]>> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("survey_responses")
      .select(`
        *,
        survey_templates (
          template_key,
          title,
          cadence
        )
      `)
      .order("created_at", { ascending: false })
      .limit(clampLimit(limit, 100, 500))

    if (error) throw error
    return { success: true, data: (data || []) as AdminFeedbackItem[], error: null }
  } catch (error) {
    logger.error("[surveys] getAdminRecentFeedback failed", { limit, error })
    return { success: false, data: [], error: getErrorMessage(error) }
  }
}
