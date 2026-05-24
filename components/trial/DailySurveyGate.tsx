"use client"

import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ButtonV2 as Button,
  DialogV2 as Dialog,
  DialogV2Content as DialogContent,
  DialogV2Description as DialogDescription,
  DialogV2Footer as DialogFooter,
  DialogV2Header as DialogHeader,
  DialogV2Title as DialogTitle,
  LabelV2 as Label,
  TextareaV2 as Textarea,
} from "@/components/ui/v2"
import { toast } from "sonner"
import { trackCampaignEvent } from "@/lib/campaign-events-client"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

type SurveyQuestion = {
  id: string
  type?: string
  title?: string
  required?: boolean
  options?: string[]
  min?: number
  max?: number
}

type TodaySurveyTemplate = {
  id: string
  template_key: string
  title: string
  description?: string | null
  questions_json: SurveyQuestion[]
}

type DailySurveyGateProps = {
  children?: React.ReactNode
  featureName: string
  enabled: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCompleted?: (trialStatus?: unknown) => void
  onDismiss?: () => void
  title?: string
  description?: string
  trackingSource?: "auto" | "core"
}

export type TrialSurveyStatus = {
  active_grant_id?: string | null
  trial_start_at?: string | null
  trial_end_at?: string | null
  daily_quota?: number | null
  requires_daily_survey?: boolean | null
  today_survey_completed?: boolean | null
  today_trial_used?: number | null
  today_trial_remaining?: number | null
  trial_active?: boolean | null
  current_streak_days?: number | null
}

function normalizeQuestions(template: TodaySurveyTemplate | null): SurveyQuestion[] {
  if (!template || !Array.isArray(template.questions_json)) return []
  return template.questions_json.slice(0, 5)
}

function hasAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === "number" || (typeof value === "string" && value.trim().length > 0)
}

export function DailySurveyGate({
  children,
  featureName,
  enabled,
  open = false,
  onOpenChange,
  onCompleted,
  onDismiss,
  title = "先完成今日 90 秒反馈",
  description,
  trackingSource = "core",
}: DailySurveyGateProps) {
  const [template, setTemplate] = useState<TodaySurveyTemplate | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)

  const questions = useMemo(() => normalizeQuestions(template), [template])

  const loadTemplate = useCallback(async () => {
    if (!enabled || template || loading) return
    setLoading(true)
    setStartedAt(Date.now())
    try {
      const response = await fetch("/api/surveys/today", {
        cache: "no-store",
        headers: await getVerifiedAuthHeaders(),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "今日问卷加载失败")
      }
      setTemplate(data.template)
      if (data.alreadySubmitted) {
        onCompleted?.(data.trialStatus)
        onOpenChange?.(false)
      }
    } catch (error) {
      console.error("[DailySurveyGate] load failed", error)
      toast.error("今日问卷加载失败，请稍后重试")
    } finally {
      setLoading(false)
    }
  }, [enabled, loading, onCompleted, onOpenChange, template])

  useEffect(() => {
    if (enabled && open) {
      if (trackingSource === "core") {
        void trackCampaignEvent("daily_survey_gate_shown", { featureName })
      }
      void loadTemplate()
    }
  }, [enabled, featureName, loadTemplate, open, trackingSource])

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen)
    if (nextOpen) {
      void loadTemplate()
    } else {
      onDismiss?.()
    }
  }

  const updateAnswer = (question: SurveyQuestion, value: unknown) => {
    setAnswers((previous) => ({ ...previous, [question.id]: value }))
  }

  const toggleMultiChoice = (question: SurveyQuestion, option: string) => {
    const current = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : []
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option]
    updateAnswer(question, next)
  }

  const submit = async () => {
    const missingRequired = questions.some((question) => question.required && !hasAnswer(answers[question.id]))
    if (missingRequired) {
      toast.error("请先完成必填问题")
      return
    }

    setSubmitting(true)
    try {
      const durationSeconds = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : undefined
      const response = await fetch("/api/surveys/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          answers,
          metadata: {
            durationSeconds,
            source: `daily_survey_gate:${featureName}`,
          },
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "提交问卷失败")
      }

      toast.success("今日 2000 trial 积分已解锁")
      void trackCampaignEvent("daily_survey_submit_success", {
        featureName,
        qualityScore: data.qualityScore,
        streakDay: data.streakDay,
        source: `daily_survey_gate:${featureName}`,
      })
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("credits-refresh"))
      }
      onCompleted?.(data.trialStatus)
      onOpenChange?.(false)
    } catch (error) {
      console.error("[DailySurveyGate] submit failed", error)
      toast.error("提交问卷失败，请稍后重试")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {children}
      <Dialog open={enabled && open} onOpenChange={handleOpenChange}>
        <DialogContent className="top-[max(0.5rem,env(safe-area-inset-top))] flex h-[calc(100svh-1rem)] max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-xl translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:top-1/2 sm:h-auto sm:max-h-[min(42rem,calc(100dvh-2rem))] sm:w-[calc(100%-2rem)] sm:-translate-y-1/2">
          <DialogHeader className="shrink-0 px-4 pt-4 pr-12 sm:px-6 sm:pt-6">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description || `填写后解锁今日 2000 trial 积分，用于${featureName}。稍后再说也可以，但不会解锁今日免费额度。`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-contain px-4 py-4 [-webkit-overflow-scrolling:touch] sm:px-6">
            {loading ? (
              <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-4 text-sm text-[var(--ink-600)]">
                正在加载今日问卷...
              </div>
            ) : questions.length === 0 ? (
              <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-4 text-sm text-[var(--ink-600)]">
                今日问卷暂不可用，请稍后重试。
              </div>
            ) : (
              questions.map((question, index) => (
                <div key={question.id} className="space-y-2">
                  <Label className="text-sm font-semibold text-[var(--ink-800)]">
                    {index + 1}. {question.title || question.id}
                    {question.required ? <span className="ml-1 text-[var(--seal-500)]">*</span> : null}
                  </Label>

                  {question.type === "single_choice" ? (
                    <div className="flex flex-wrap gap-2">
                      {(question.options || []).map((option) => (
                        <Button
                          key={option}
                          type="button"
                          size="sm"
                          variant={answers[question.id] === option ? "primary" : "outline"}
                          onClick={() => updateAnswer(question, option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : question.type === "multiple_choice" ? (
                    <div className="flex flex-wrap gap-2">
                      {(question.options || []).map((option) => {
                        const selected = Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option)
                        return (
                          <Button
                            key={option}
                            type="button"
                            size="sm"
                            variant={selected ? "primary" : "outline"}
                            onClick={() => toggleMultiChoice(question, option)}
                          >
                            {option}
                          </Button>
                        )
                      })}
                    </div>
                  ) : question.type === "rating" ? (
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: Math.max(1, (question.max || 5) - (question.min || 1) + 1) }, (_, offset) => (question.min || 1) + offset).map((score) => (
                        <Button
                          key={score}
                          type="button"
                          size="sm"
                          variant={answers[question.id] === score ? "primary" : "outline"}
                          onClick={() => updateAnswer(question, score)}
                        >
                          {score}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <Textarea
                      value={typeof answers[question.id] === "string" ? answers[question.id] as string : ""}
                      onChange={(event) => updateAnswer(question, event.target.value)}
                      placeholder="简单写一句就可以"
                      className="min-h-20"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter className="mt-0 grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--paper-200)] bg-[var(--paper-50)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex sm:px-6 sm:pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void trackCampaignEvent("daily_survey_later_clicked", { featureName, trackingSource })
                handleOpenChange(false)
              }}
              disabled={submitting}
            >
              稍后再说
            </Button>
            <Button type="button" onClick={submit} disabled={submitting || loading || questions.length === 0}>
              {submitting ? "提交中..." : "提交并解锁"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
