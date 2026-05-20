"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Gift, ShieldCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { trackCampaignEvent } from "@/lib/campaign-events-client"
import {
  BadgeV2 as Badge,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
} from "@/components/ui/v2"

type TrialStatus = {
  active_grant_id?: string | null
  trial_end_at?: string | null
  today_survey_completed?: boolean
  today_trial_used?: number
  today_trial_remaining?: number
  current_streak_days?: number
  trial_active?: boolean
}

function formatDate(value?: string | null) {
  if (!value) return "暂未领取"
  return new Date(value).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export default function FreeTrialCampaignPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null)

  const hasTrial = Boolean(trialStatus?.active_grant_id)

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getVerifiedAuthHeaders()
      const isLoggedIn = Boolean(headers.Authorization)
      setLoggedIn(isLoggedIn)

      if (!isLoggedIn) {
        setTrialStatus(null)
        return
      }

      const response = await fetch("/api/surveys/today", {
        headers,
        cache: "no-store",
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) {
        setTrialStatus(data.trialStatus || null)
      }
    } catch (error) {
      console.warn("[free-trial-campaign] status load failed", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const handleClaim = async () => {
    void trackCampaignEvent("free_trial_claim_clicked", { source: "campaign_page" })
    setClaiming(true)
    try {
      const response = await fetch("/api/free-trial/claim", {
        method: "POST",
        headers: await getVerifiedAuthHeaders(),
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) {
        void trackCampaignEvent("free_trial_claim_success", { source: "campaign_page" })
        setTrialStatus(data.trialStatus || null)
        toast.success(data.message || "60 天共创体验已领取")
      } else {
        toast.error(data?.message || data?.error || "领取失败，请稍后重试")
      }
    } catch (error) {
      console.warn("[free-trial-campaign] claim failed", error)
      toast.error("领取失败，请稍后重试")
    } finally {
      setClaiming(false)
    }
  }

  const statusItems = useMemo(() => [
    ["体验状态", hasTrial ? "共创体验中" : "未领取"],
    ["到期时间", formatDate(trialStatus?.trial_end_at)],
    ["今日已用 trial 积分", `${Number(trialStatus?.today_trial_used || 0).toLocaleString()}`],
    ["今日剩余额度", `${Number(trialStatus?.today_trial_remaining || 0).toLocaleString()}`],
    ["今日问卷", trialStatus?.today_survey_completed ? "已完成" : "未完成"],
    ["当前连击", `${Number(trialStatus?.current_streak_days || 0)} 天`],
  ], [hasTrial, trialStatus])

  return (
    <main className="min-h-screen bg-[var(--paper-50)] text-[var(--ink-900)]">
      <section className="border-b border-[var(--paper-200)] bg-[var(--paper-100)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[minmax(0,1fr)_360px] md:px-6 md:py-20">
          <div className="max-w-3xl">
            <Badge className="mb-5 w-fit">共创体验已开启</Badge>
            <h1 className="font-[var(--font-display)] text-4xl font-black leading-tight text-[var(--ink-900)] md:text-6xl">
              沈翔智学 60 天共创体验计划
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[var(--ink-600)] md:text-lg">
              每天填写 90 秒反馈，解锁当天 AI 学习体验额度，和我们一起打造更好用的作文批改与学习反馈工具。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {!loggedIn ? (
                <Button asChild size="lg">
                  <Link href="/login">
                    去登录/注册
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : hasTrial ? (
                <Button asChild size="lg">
                  <Link href="/settings">查看我的体验期</Link>
                </Button>
              ) : (
                <Button size="lg" onClick={handleClaim} disabled={claiming || loading}>
                  {claiming ? "领取中..." : "立即领取"}
                  <Gift className="size-4" />
                </Button>
              )}
              <Button asChild variant="outline" size="lg">
                <Link href="/essay">去体验作文批改</Link>
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-[var(--seal-500)]" />
                我的共创体验
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {statusItems.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-[var(--paper-200)] pb-3 text-sm last:border-0 last:pb-0">
                  <span className="text-[var(--ink-500)]">{label}</span>
                  <span className="font-semibold text-[var(--ink-800)]">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-10 md:grid-cols-2 md:px-6 lg:grid-cols-4">
        {[
          ["免费体验 60 天", "所有注册用户已获得 60 天共创体验资格。"],
          ["每日问卷解锁", "每天提交约 90 秒反馈后，解锁 2000 trial 积分。"],
          ["超额扣真实积分", "免费额度之外的高成本使用会回到真实积分逻辑。"],
          ["会员权益保护", "已付费会员自动顺延 60 天，不强制填写问卷。"],
        ].map(([title, desc]) => (
          <Card key={title}>
            <CardContent className="space-y-3 pt-6">
              <CheckCircle2 className="size-5 text-[var(--ink-600)]" />
              <h2 className="font-[var(--font-display)] text-lg font-bold">{title}</h2>
              <p className="text-sm leading-6 text-[var(--ink-600)]">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14 md:px-6">
        <div className="rounded-[var(--radius-card)] border border-[var(--paper-200)] bg-white p-5">
          <h2 className="flex items-center gap-2 font-[var(--font-display)] text-xl font-bold">
            <ShieldCheck className="size-5 text-[var(--ink-600)]" />
            数据说明
          </h2>
          <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--ink-600)] md:grid-cols-3">
            <p>反馈仅用于产品优化。</p>
            <p>未成年人需监护人同意。</p>
            <p>不公开展示作文原文和个人信息。</p>
          </div>
        </div>
      </section>
    </main>
  )
}
