"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Lock } from "lucide-react"
import { IconAllInOne, IconBanzhuren, IconCopy, IconInvite, IconShare } from "@/components/icons/v2"
import { toast } from "sonner"
import { createClient } from "@supabase/supabase-js"
import { BadgeV2 as Badge, ButtonV2 as Button, CardV2 as Card, LoadingStateV2, ProgressV2 } from "@/components/ui/v2"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

const REWARD_LIMIT = 50000
const REWARD_PER_INVITE = 1000

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function InvitePage() {
  const router = useRouter()
  const [referralCode, setReferralCode] = React.useState("")
  const [inviteCount, setInviteCount] = React.useState(0)
  const [totalReward, setTotalReward] = React.useState(0)
  const [copied, setCopied] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)
  const [isPaidMember, setIsPaidMember] = React.useState(false)

  const loadUserData = React.useCallback(async () => {
    setIsLoading(true)
    const userStr = localStorage.getItem("currentUser")
    if (!userStr) {
      router.push("/login")
      return
    }

    try {
      const parsedUser = JSON.parse(userStr)
      const userId = parsedUser.id || parsedUser.sub || parsedUser.userId
      let referralOwnerId = userId

      if (userId) {
        try {
          const response = await fetch("/api/user/membership", {
            headers: await getVerifiedAuthHeaders(parsedUser),
          })
          const result = await response.json()
          if (response.ok && result.isPaidMember === true) {
            setIsPaidMember(true)
            referralOwnerId = result.userId || result.latestOrder?.user_id || userId
          } else {
            setIsPaidMember(false)
          }
        } catch {
          setIsPaidMember(false)
        }

        try {
          const refResponse = await fetch("/api/referral/get-code", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(await getVerifiedAuthHeaders()),
            },
            body: JSON.stringify({ userId: referralOwnerId }),
          })
          const refResult = await refResponse.json()
          if (refResult.code) {
            setReferralCode(refResult.code)
            setInviteCount(refResult.uses || 0)
          } else {
            setReferralCode("")
          }
        } catch {
          setReferralCode("")
        }

        try {
          const { data: referrals } = await supabase
            .from("referrals")
            .select("reward_credits")
            .eq("referrer_id", referralOwnerId)
            .eq("status", "completed")

          const total = (referrals || []).reduce((sum, row) => sum + (row.reward_credits || 0), 0)
          setTotalReward(total)
        } catch {
          setTotalReward(0)
        }
      }
    } catch {
      toast.error("邀请数据加载失败，请刷新后重试")
    } finally {
      setIsLoading(false)
    }
  }, [router])

  React.useEffect(() => {
    loadUserData()
  }, [loadUserData])

  const inviteLink = typeof window !== "undefined"
    ? `${window.location.origin}/auth/sign-up?ref=${encodeURIComponent(referralCode)}`
    : ""

  const handleCopy = async () => {
    if (!referralCode) {
      toast.error("推荐码尚未生成，请稍后重试")
      return
    }

    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      toast.success("邀请链接已复制")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("复制失败，请手动复制")
    }
  }

  const handleShareClick = async () => {
    if (!referralCode) {
      toast.error("推荐码尚未生成，请稍后重试")
      return
    }

    if (!isPaidMember) {
      toast.info("成为会员后即可分享邀请链接")
      setTimeout(() => router.push("/pricing"), 500)
      return
    }

    const isWechat = /MicroMessenger/i.test(navigator.userAgent)
    if (isWechat) {
      await handleCopy()
      toast.success("链接已复制，请从微信右上角分享")
      return
    }

    const canShare = typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      navigator.canShare?.({ url: inviteLink, text: "沈翔智学邀请" })

    if (canShare) {
      try {
        await navigator.share({
          title: "沈翔智学邀请",
          text: `我在用沈翔智学。通过我的邀请链接注册，我们都能获得 ${REWARD_PER_INVITE} 积分奖励。`,
          url: inviteLink,
        })
      } catch (error: any) {
        if (error?.name !== "AbortError") await handleCopy()
      }
    } else {
      await handleCopy()
    }
  }

  const remainingReward = Math.max(0, REWARD_LIMIT - totalReward)
  const progressPercent = Math.min((totalReward / REWARD_LIMIT) * 100, 100)

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--paper-50)]">
        <LoadingStateV2 label="正在加载邀请数据..." />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--paper-50)] px-4 py-6 font-[var(--font-sans-v2)] text-[var(--ink-900)] md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              返回首页
            </Link>
          </Button>
          <Badge variant={isPaidMember ? "seal" : "paper"}>
            {isPaidMember ? "会员邀请权益已开启" : "会员专属邀请权益"}
          </Badge>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="overflow-hidden border-[var(--ink-200)] bg-[linear-gradient(180deg,var(--ink-50),var(--paper-50))] shadow-[0_24px_80px_rgba(16,55,35,0.12)]">
            <div className="p-6 md:p-8">
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--paper-50)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-700)]">
                <IconInvite className="size-3.5" aria-hidden="true" />
                邀请奖励
              </span>
              <h1 className="mt-5 max-w-2xl font-[var(--font-display)] text-[clamp(32px,5vw,52px)] font-black leading-[1.08] text-[var(--ink-900)]">
                邀请好友加入沈翔智学，双方各得 {REWARD_PER_INVITE} 积分。
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-[1.85] text-[var(--ink-600)] sm:text-[16px]">
                专属邀请链接会自动绑定你的账号。好友完成注册后，奖励将进入双方积分账户，最高可累计 {REWARD_LIMIT} 积分。
              </p>

              <div className="mt-7 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)]">专属链接</p>
                    <p className="mt-1 text-[13px] text-[var(--ink-500)]">
                      {isPaidMember ? "复制或直接分享给好友" : "开通会员后可生成并分享"}
                    </p>
                  </div>
                  {!isPaidMember ? <Lock className="size-5 text-[var(--ink-400)]" aria-hidden="true" /> : null}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="min-h-11 flex-1 rounded-[var(--radius-soft)] border border-[var(--paper-300)] bg-[var(--paper-100)] px-4 py-3 text-[13px] text-[var(--ink-600)]">
                    <p className="truncate">{isPaidMember && referralCode ? inviteLink : "会员专属邀请链接"}</p>
                  </div>
                  <Button variant="outline" onClick={handleCopy} disabled={!isPaidMember || !referralCode}>
                    {copied ? <Check className="size-4" aria-hidden="true" /> : <IconCopy className="size-4" aria-hidden="true" />}
                    {copied ? "已复制" : "复制"}
                  </Button>
                  <Button onClick={handleShareClick} disabled={!referralCode}>
                    <IconShare className="size-4" aria-hidden="true" />
                    {isPaidMember ? "立即分享" : "开通后分享"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-200)] bg-[var(--ink-50)] text-[var(--ink-700)]">
                  <IconBanzhuren className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[var(--ink-500)]">已邀请好友</p>
                  <p className="font-[var(--font-display)] text-[28px] font-black text-[var(--ink-800)]">{inviteCount}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-200)] bg-[var(--ink-50)] text-[var(--ink-700)]">
                  <IconAllInOne className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[var(--ink-500)]">已获得积分</p>
                  <p className="font-[var(--font-display)] text-[28px] font-black text-[var(--ink-800)]">{totalReward}</p>
                </div>
              </div>
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-[12px] text-[var(--ink-500)]">
                  <span>奖励进度</span>
                  <span>{totalReward} / {REWARD_LIMIT}</span>
                </div>
                <ProgressV2 value={progressPercent} />
                <p className="mt-2 text-[12px] text-[var(--ink-400)]">
                  还可获得 {remainingReward} 积分
                </p>
              </div>
            </Card>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <RuleCard index="1" title="会员专属链接" description="系统会为会员生成可追踪的邀请码，避免奖励丢失。" />
          <RuleCard index="2" title="双方获得积分" description={`好友通过链接注册后，你和好友各获得 ${REWARD_PER_INVITE} 积分。`} />
          <RuleCard index="3" title="奖励自动累计" description={`邀请奖励最高累计 ${REWARD_LIMIT} 积分，可用于站内 AI 服务。`} />
        </section>
      </div>
    </main>
  )
}

function RuleCard({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex size-8 items-center justify-center rounded-full bg-[var(--ink-700)] text-[13px] font-bold text-white">
        {index}
      </div>
      <h2 className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-800)]">{title}</h2>
      <p className="mt-2 text-[13px] leading-[1.7] text-[var(--ink-500)]">{description}</p>
    </Card>
  )
}
