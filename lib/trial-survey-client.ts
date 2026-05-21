"use client"

import { toast } from "sonner"

export const OPEN_DAILY_SURVEY_EVENT = "trial:open-daily-survey"

type TrialSurveyPromptOptions = {
  featureName?: string
  message?: string
}

export function getTrialSurveyRequiredMessage(featureName = "当前功能") {
  return `请先完成今日问卷，解锁体验额度后继续使用${featureName}。`
}

export function isSurveyRequiredPayload(payload: unknown) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "surveyRequired" in payload &&
      (payload as { surveyRequired?: unknown }).surveyRequired,
  )
}

export function openTrialSurveyGate(options: TrialSurveyPromptOptions = {}) {
  const message = options.message || getTrialSurveyRequiredMessage(options.featureName)
  toast.info(message)

  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(OPEN_DAILY_SURVEY_EVENT, {
      detail: {
        featureName: options.featureName || "AI 学习体验",
        message,
      },
    }),
  )
}
