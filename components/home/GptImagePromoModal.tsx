"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"

const DISMISS_KEY = "gpt-image-2-promo-dismissed-at"
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000
const SHOW_DELAY = 800

const MEMBERSHIP_BENEFITS = [
  {
    name: "基础会员",
    access: "2K / 4K 每日额度",
    quotaValue: "100",
    quotaUnit: "张 / 日",
    extra: "含 1K 每日免费 100 张",
  },
  {
    name: "标准会员",
    access: "2K / 4K 每日额度",
    quotaValue: "150",
    quotaUnit: "张 / 日",
    extra: "含 1K 每日免费 100 张",
  },
  {
    name: "豪华会员",
    access: "2K / 4K 每日额度",
    quotaValue: "200",
    quotaUnit: "张 / 日",
    extra: "含 1K 每日免费 100 张",
  },
] as const

export function GptImagePromoModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [hasUser, setHasUser] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    const currentUser = window.localStorage.getItem("currentUser")
    setHasUser(Boolean(currentUser))

    const dismissedAt = window.localStorage.getItem(DISMISS_KEY)
    if (dismissedAt) {
      const dismissedTimestamp = Number(dismissedAt)
      const isWithinQuietPeriod =
        Number.isFinite(dismissedTimestamp) && Date.now() - dismissedTimestamp < DISMISS_TTL

      if (isWithinQuietPeriod) {
        return
      }
    }

    const timer = window.setTimeout(() => {
      setOpen(true)
    }, SHOW_DELAY)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!open || typeof document === "undefined") return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const dismissPromo = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }

    setOpen(false)
  }

  const handlePrimaryAction = () => {
    dismissPromo()

    if (hasUser) {
      router.push("/chat/creative-image-gpt2")
      return
    }

    router.push("/login?redirect=%2Fchat%2Fcreative-image-gpt2")
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/28 px-4 py-6 backdrop-blur-[8px]">
      <div
        className="absolute inset-0"
        aria-hidden="true"
        onClick={dismissPromo}
      />

      <div className="relative w-full max-w-3xl overflow-hidden rounded-[32px] border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,247,0.98))] shadow-[0_10px_24px_rgba(15,23,42,0.06),0_28px_80px_rgba(15,23,42,0.12),0_1px_0_rgba(255,255,255,0.75)_inset]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_top_left,rgba(20,83,45,0.15),transparent_48%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.08),transparent_34%)]" />

        <button
          type="button"
          onClick={dismissPromo}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/80 text-slate-500 shadow-[0_6px_18px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:text-slate-700"
          aria-label="关闭推广弹窗"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6 sm:p-8 md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-3.5 py-1.5 text-sm font-medium text-emerald-900 shadow-[0_6px_18px_rgba(16,185,129,0.08)]">
            <Sparkles className="h-4 w-4" />
            GPT Image 2 新品体验计划
          </div>

          <div className="mt-5 max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              绘见万象 | GPT Image 2 巅峰上线
            </h2>
            <p className="mt-3 text-base leading-8 text-slate-600 sm:text-lg">
              从 1K 灵感草图到 4K 视觉成片，重新定义你的图像表达。
            </p>
          </div>

          <div className="mt-6 rounded-[24px] border border-emerald-100 bg-white/84 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04),0_20px_40px_rgba(20,83,45,0.05),0_1px_0_rgba(255,255,255,0.92)_inset]">
            <p className="text-sm font-medium text-emerald-900">新用户专属</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              注册即领 GPT Image 2 1K 限时免费 30 天
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-500">
              免费用户每日最多 50 张，累计体验不超过 1500 张；超出限额后将进入标准计费流程。
            </p>
          </div>

          <div className="mt-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04),0_18px_36px_rgba(15,23,42,0.05),0_1px_0_rgba(255,255,255,0.9)_inset]">
            <p className="text-sm font-medium text-slate-700">订阅用户权益说明</p>
            <div className="mt-3 grid gap-2 text-sm leading-7 text-slate-500">
              <p>1K 尺寸每日免费 100 张，超出当日额度后按标准计费。</p>
              <p>2K / 4K 尺寸按会员等级享受每日额度，超出后按标准计费。</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-3">
            {MEMBERSHIP_BENEFITS.map((item) => (
              <div
                key={item.name}
                className="group rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04),0_18px_40px_rgba(15,23,42,0.05),0_1px_0_rgba(255,255,255,0.92)_inset] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_12px_24px_rgba(15,23,42,0.06),0_28px_60px_rgba(20,83,45,0.09),0_1px_0_rgba(255,255,255,0.95)_inset]"
              >
                <p className="text-sm font-medium text-slate-500">{item.name}</p>
                <p className="mt-3 text-base font-semibold text-slate-900">{item.access}</p>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-bold tracking-tight text-emerald-900 sm:text-[2.75rem]">
                    {item.quotaValue}
                  </span>
                  <span className="pb-1 text-sm font-medium text-slate-500">{item.quotaUnit}</span>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-500">{item.extra}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-2xl border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-slate-50"
              onClick={dismissPromo}
            >
              稍后再看
            </Button>
            <Button
              type="button"
              className="h-12 rounded-2xl px-6 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(20,83,45,0.16),0_18px_34px_rgba(20,83,45,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-[1.03] hover:shadow-[0_14px_26px_rgba(20,83,45,0.2),0_24px_42px_rgba(20,83,45,0.18)] active:translate-y-0 active:shadow-[0_8px_18px_rgba(20,83,45,0.16)]"
              style={{ backgroundColor: "#14532d" }}
              onClick={handlePrimaryAction}
            >
              {hasUser ? "立即开启灵感之旅" : "登录 / 注册，开始创作"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
