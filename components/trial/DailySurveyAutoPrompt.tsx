"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { trackCampaignEvent } from "@/lib/campaign-events-client"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { DailySurveyGate, type TrialSurveyStatus } from "@/components/trial/DailySurveyGate"
import { FreeTrialAnnouncementModal } from "@/components/trial/FreeTrialAnnouncementModal"

const ANNOUNCEMENT_KEY_PREFIX = "free-trial-announcement-shown"
const AUTO_SURVEY_KEY_PREFIX = "daily-survey-auto-shown"
const SURVEY_SNOOZE_KEY_PREFIX = "daily-survey-auto-snoozed-until"
const SURVEY_SNOOZE_MS = 2 * 60 * 60 * 1000
const OPEN_SURVEY_EVENT = "trial:open-daily-survey"

type SessionState = {
  loggedIn: boolean
  userId: string | null
  paidUser: boolean
  trialStatus: TrialSurveyStatus | null
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function readJsonStorage(key: string) {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function extractStoredUserId() {
  const currentUser = readJsonStorage("currentUser")
  if (!currentUser || typeof currentUser !== "object") return null
  const record = currentUser as Record<string, unknown>
  const id = record.id || record.sub || record.userId || record.user_id
  return typeof id === "string" && id ? id : null
}

function hasStoredAuthToken() {
  if (typeof window === "undefined") return false
  return Boolean(
    window.localStorage.getItem("idToken") ||
    window.localStorage.getItem("authingToken") ||
    window.localStorage.getItem("accessToken")
  )
}

function shouldRequireSurvey(status: TrialSurveyStatus | null, paidUser: boolean) {
  return Boolean(
    status?.active_grant_id &&
    status.requires_daily_survey !== false &&
    !status.today_survey_completed &&
    !paidUser
  )
}

export function DailySurveyAutoPrompt() {
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [session, setSession] = useState<SessionState>({
    loggedIn: false,
    userId: null,
    paidUser: false,
    trialStatus: null,
  })
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const localDate = useMemo(() => todayKey(), [])

  const refreshSession = useCallback(async () => {
    if (typeof window === "undefined") return null

    const headers = await getVerifiedAuthHeaders()
    const storedUserId = extractStoredUserId()
    const loggedIn = Boolean(storedUserId || headers.Authorization || hasStoredAuthToken())
    if (!loggedIn) {
      const nextSession = { loggedIn: false, userId: null, paidUser: false, trialStatus: null }
      setSession(nextSession)
      return nextSession
    }

    const [surveyResponse, creditsResponse] = await Promise.all([
      fetch("/api/surveys/today", { cache: "no-store", headers }),
      fetch("/api/user/credits", { cache: "no-store", headers }),
    ])

    const surveyData = await surveyResponse.json().catch(() => null)
    const creditsData = await creditsResponse.json().catch(() => null)
    const trialStatus = (surveyData?.trialStatus || null) as TrialSurveyStatus | null
    const nextSession = {
      loggedIn: true,
      userId: storedUserId || "verified-user",
      paidUser: Boolean(creditsData?.is_pro),
      trialStatus,
    }
    setSession(nextSession)
    return nextSession
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const shownKey = `${ANNOUNCEMENT_KEY_PREFIX}:${localDate}`
    if (!window.localStorage.getItem(shownKey)) {
      setAnnouncementOpen(true)
      window.localStorage.setItem(shownKey, "1")
    }
  }, [localDate])

  useEffect(() => {
    void refreshSession().catch((error) => {
      console.warn("[DailySurveyAutoPrompt] session refresh failed", error)
    })
  }, [refreshSession])

  useEffect(() => {
    if (typeof window === "undefined" || !session.loggedIn) return

    const userKey = session.userId || "verified-user"
    const autoKey = `${AUTO_SURVEY_KEY_PREFIX}:${userKey}:${localDate}`
    const snoozeKey = `${SURVEY_SNOOZE_KEY_PREFIX}:${userKey}`
    const snoozedUntil = Number(window.localStorage.getItem(snoozeKey) || 0)
    const autoAlreadyShown = Boolean(window.localStorage.getItem(autoKey))
    const snoozed = Number.isFinite(snoozedUntil) && Date.now() < snoozedUntil

    if (autoAlreadyShown || snoozed) return
    if (!shouldRequireSurvey(session.trialStatus, session.paidUser)) return

    autoTimerRef.current = setTimeout(() => {
      window.localStorage.setItem(autoKey, String(Date.now()))
      setSurveyOpen(true)
      void trackCampaignEvent("daily_survey_auto_prompt_shown", {
        userKey,
        remainingToday: session.trialStatus?.today_trial_remaining ?? null,
      })
    }, 3000)

    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current)
        autoTimerRef.current = null
      }
    }
  }, [localDate, session])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handleOpenSurvey = () => {
      if (!session.loggedIn || session.paidUser) return
      setSurveyOpen(true)
    }
    window.addEventListener(OPEN_SURVEY_EVENT, handleOpenSurvey)
    return () => window.removeEventListener(OPEN_SURVEY_EVENT, handleOpenSurvey)
  }, [session.loggedIn, session.paidUser])

  const hasTrial = Boolean(session.trialStatus?.active_grant_id)

  return (
    <>
      <FreeTrialAnnouncementModal
        open={announcementOpen}
        loggedIn={session.loggedIn}
        hasTrial={hasTrial}
        paidUser={session.paidUser}
        onOpenChange={setAnnouncementOpen}
        onDismiss={() => undefined}
      />

      <DailySurveyGate
        featureName="今日 AI 学习体验"
        enabled={session.loggedIn && shouldRequireSurvey(session.trialStatus, session.paidUser)}
        open={surveyOpen}
        onOpenChange={setSurveyOpen}
        title="完成今日反馈，解锁今日体验额度"
        description="填写 90 秒问卷后，即可解锁今日 2000 trial 积分。你的反馈会用于优化批改准确度、报告结构和学习功能。"
        trackingSource="auto"
        onDismiss={() => {
          if (typeof window === "undefined") return
          const userKey = session.userId || "verified-user"
          window.localStorage.setItem(`${SURVEY_SNOOZE_KEY_PREFIX}:${userKey}`, String(Date.now() + SURVEY_SNOOZE_MS))
        }}
        onCompleted={(trialStatus) => {
          setSession((previous) => ({
            ...previous,
            trialStatus: (trialStatus || previous.trialStatus) as TrialSurveyStatus | null,
          }))
          toast.success("今日体验额度已解锁")
        }}
      />
    </>
  )
}
