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
    if (!params.verifiedOcr || params.signal?.aborted) return Promise.resolve(null)
    if (attemptPromise) return attemptPromise

    state.attempted = true
    state.reason = reason
    attemptPromise = (async () => {
      try {
        const result = await grade({
          text: params.verifiedOcr!.text,
          essayId: params.requestId,
          signal: params.signal,
          metadata: {
            source: "dify-chat-image-fallback",
            reason,
            file_count: params.verifiedOcr!.fileIds.length,
          },
        })
        if (params.signal?.aborted) return null
        if (
          (result.provider !== "llm" && result.provider !== "local")
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
