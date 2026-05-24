"use client"

import { toast } from "sonner"

export const OPEN_DAILY_SURVEY_EVENT = "trial:open-daily-survey"

type TrialSurveyPromptOptions = {
  featureName?: string
  message?: string
}

type RuntimeFlags = {
  consumptionEnabled?: boolean
  autoPromptEnabled?: boolean
}

let runtimeFlagsCache: {
  value: RuntimeFlags | null
  expiresAt: number
} = {
  value: null,
  expiresAt: 0,
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

async function getRuntimeFlagsForSurveyGate() {
  if (typeof window === "undefined") return null
  if (runtimeFlagsCache.value && Date.now() < runtimeFlagsCache.expiresAt) {
    return runtimeFlagsCache.value
  }

  try {
    const response = await fetch("/api/free-trial/runtime-flags", { cache: "no-store" })
    const data = await response.json().catch(() => null)
    const value = {
      consumptionEnabled: data?.consumptionEnabled !== false,
      autoPromptEnabled: data?.autoPromptEnabled !== false,
    }
    runtimeFlagsCache = {
      value,
      expiresAt: Date.now() + 30_000,
    }
    return value
  } catch {
    return null
  }
}

export async function openTrialSurveyGate(options: TrialSurveyPromptOptions = {}) {
  const flags = await getRuntimeFlagsForSurveyGate()
  if (flags && (!flags.consumptionEnabled || !flags.autoPromptEnabled)) {
    console.info("[trial-survey-client] skip survey gate because runtime flags disabled it", flags)
    return false
  }

  const message = options.message || getTrialSurveyRequiredMessage(options.featureName)
  toast.info(message)

  if (typeof window === "undefined") return false
  window.dispatchEvent(
    new CustomEvent(OPEN_DAILY_SURVEY_EVENT, {
      detail: {
        featureName: options.featureName || "AI 学习体验",
        message,
      },
    }),
  )
  return true
}
