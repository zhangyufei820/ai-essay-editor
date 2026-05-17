"use client"

import {
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle
} from "@/components/ui/v2"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ShenxiangInterfaceIcon } from "@/components/icons/ShenxiangInterfaceIcons"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { createClient } from "@/lib/supabase/client"
import { TrendingUp } from "lucide-react"

type CreditTransaction = {
  id: string | number
  description: string
  amount: number
  type: string
  credit_type: string
  created_at: string
}

export const dynamic = "force-dynamic"

export default function CreditsPage() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [credits, setCredits] = useState(0)
  const [isPro, setIsPro] = useState(false)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])

  useEffect(() => {
    let mounted = true

    async function loadCredits() {
      const supabase = createClient()
      const localUserRaw = window.localStorage.getItem("currentUser")
      const localUser = localUserRaw ? JSON.parse(localUserRaw) : null
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } }
      const activeUser = localUser || sessionData.session?.user

      if (!activeUser) {
        if (mounted) {
          setIsAuthed(false)
          setLoading(false)
        }
        return
      }

      const headers = await getVerifiedAuthHeaders(activeUser)
      const [creditsResponse, transactionsResponse] = await Promise.all([
        fetch("/api/user/credits", { headers }),
        fetch("/api/user/transactions", { headers }),
      ])

      if (!mounted) return

      setIsAuthed(true)
      if (creditsResponse.ok) {
        const data = await creditsResponse.json()
        setCredits(data.credits || 0)
        setIsPro(Boolean(data.is_pro))
      }
      if (transactionsResponse.ok) {
        const data = await transactionsResponse.json()
        setTransactions(data.transactions || [])
      }
      setLoading(false)
    }

    loadCredits().catch((error) => {
      console.error("[CreditsPage] 加载积分失败:", error)
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [])

  const totalEarned = useMemo(
    () => transactions.reduce((sum, item) => sum + Math.max(0, item.amount || 0), 0),
    [transactions],
  )
  const totalSpent = useMemo(
    () => transactions.reduce((sum, item) => sum + Math.abs(Math.min(0, item.amount || 0)), 0),
    [transactions],
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--paper-50)] px-4 py-10 font-[var(--font-sans-v2)]">
        <div className="mx-auto max-w-4xl text-sm text-[var(--ink-500)]">正在读取积分...</div>
      </div>
    )
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[var(--paper-50)] px-4 py-10 font-[var(--font-sans-v2)]">
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>请先登录</CardTitle>
            <CardDescription>登录后查看你的积分余额和使用记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/auth/login">去登录</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold font-[var(--font-display)]">我的积分</h1>

        <div className="mb-8 grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">当前积分</CardTitle>
              <ShenxiangInterfaceIcon name="credits" size={22} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{credits}</div>
              <p className="mt-1 text-xs text-[var(--ink-500)]">可用于文本生成、图片和音乐创作</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">累计获得</CardTitle>
              <TrendingUp className="h-4 w-4 text-[var(--ink-500)]" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEarned}</div>
              <p className="mt-1 text-xs text-[var(--ink-500)]">按积分流水统计</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">累计消耗</CardTitle>
              <ShenxiangInterfaceIcon name="history" size={22} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSpent}</div>
              <p className="mt-1 text-xs text-[var(--ink-500)]">{isPro ? "会员账户" : "普通账户"}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>积分明细</CardTitle>
            <CardDescription>最近 50 条积分变动记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <p className="text-sm text-[var(--ink-500)]">暂无积分记录</p>
              ) : (
                transactions.map((item) => (
                  <div key={item.id} className="flex items-center justify-between border-b pb-3 last:border-b-0">
                    <div>
                      <p className="text-sm font-medium">{item.description || item.credit_type}</p>
                      <p className="text-xs text-[var(--ink-500)]">
                        {new Date(item.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <div className={item.amount >= 0 ? "font-semibold text-[var(--ink-600)]" : "font-semibold text-[var(--seal-500)]"}>
                      {item.amount >= 0 ? "+" : ""}
                      {item.amount}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
