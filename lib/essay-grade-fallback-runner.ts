import "server-only"

import { isValidEssayCorrectionResult } from "@/lib/essay-correction-result"
import {
  gradeEssayWithFallback,
  type EssayFallbackGradeResult,
  type GradeEssayWithFallbackParams,
  type VerifiedEssayOcrText,
} from "@/lib/essay-image-fallback"

type EssayFallbackGrader = (
  params: GradeEssayWithFallbackParams,
) => Promise<EssayFallbackGradeResult>

type CreateEssayGradeFallbackRunnerParams = {
  verifiedOcr: VerifiedEssayOcrText | null
  pastedEssay?: string
  requestId: string
  signal?: AbortSignal
  grade?: EssayFallbackGrader
}

export type EssayGradeFallbackRunnerState = {
  attempted: boolean
  reason: string | null
  errorCode: string | null
}

export function createEssayGradeFallbackRunner(
  params: CreateEssayGradeFallbackRunnerParams,
) {
  const grade = params.grade || gradeEssayWithFallback
  const state: EssayGradeFallbackRunnerState = {
    attempted: false,
    reason: null,
    errorCode: null,
  }
  let attemptPromise: Promise<EssayFallbackGradeResult | null> | null = null

  const attempt = (reason: string) => {
    const text = params.verifiedOcr?.text || params.pastedEssay
    if (!text || params.signal?.aborted) return Promise.resolve(null)
    if (attemptPromise) return attemptPromise

    state.attempted = true
    state.reason = reason
    attemptPromise = (async () => {
      try {
        const result = await grade({
          text,
          essayId: params.requestId,
          signal: params.signal,
          metadata: {
            source: params.verifiedOcr ? "dify-chat-image-fallback" : "dify-chat-text-fallback",
            reason,
            file_count: params.verifiedOcr?.fileIds.length || 0,
          },
        })
        if (params.signal?.aborted) return null
        if (
          (result.provider !== "llm" && !(params.verifiedOcr && result.provider === "local"))
          || !isValidEssayCorrectionResult(result.markdownReport)
        ) {
          state.errorCode = "ESSAY_FALLBACK_GRADE_INVALID"
          return null
        }
        return result
      } catch (error) {
        if (params.signal?.aborted) return null
        state.errorCode = error instanceof Error && error.message
          ? error.message
          : "ESSAY_FALLBACK_GRADE_FAILED"
        return null
      }
    })()

    return attemptPromise
  }

  return {
    attempt,
    getState: () => ({ ...state }),
  }
}
