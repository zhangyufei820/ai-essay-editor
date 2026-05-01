"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle, Clock, Loader2, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type OrderStatus = "loading" | "paid" | "pending" | "failed" | "not_found" | "unauthorized" | "error"

type PaymentStatusResponse = {
  status?: "paid" | "pending" | "failed" | string
  rawStatus?: string
  orderNo?: string
  productName?: string
  amount?: number
  creditsAmount?: number
  paidAt?: string | null
  updatedAt?: string
  message?: string
  error?: string
}

function formatCurrency(amount?: number) {
  if (typeof amount !== "number") return "--"
  return `¥${amount.toFixed(2)}`
}

function formatTime(value?: string | null) {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return date.toLocaleString("zh-CN", { hour12: false })
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const orderNo = useMemo(() => searchParams.get("orderNo") || searchParams.get("trade_order_id") || "", [searchParams])
  const [status, setStatus] = useState<OrderStatus>(orderNo ? "loading" : "paid")
  const [order, setOrder] = useState<PaymentStatusResponse | null>(null)
  const [message, setMessage] = useState(orderNo ? "正在确认支付结果..." : "支付成功后，权益会自动到账。")

  useEffect(() => {
    if (!orderNo) return

    let cancelled = false

    async function loadStatus() {
      try {
        setStatus("loading")
        const response = await fetch(`/api/payment/status/${encodeURIComponent(orderNo)}`, { cache: "no-store" })
        const data: PaymentStatusResponse = await response.json().catch(() => ({}))

        if (cancelled) return

        if (response.status === 401) {
          setStatus("unauthorized")
          setMessage("请先登录，再查看订单支付结果。")
          return
        }

        if (response.status === 404) {
          setStatus("not_found")
          setMessage("没有找到这笔订单，请核对订单号或联系客服。")
          return
        }

        if (!response.ok) {
          setStatus("error")
          setMessage(data.error || "支付结果查询失败，请稍后刷新重试。")
          return
        }

        setOrder(data)
        if (data.status === "paid") {
          setStatus("paid")
          setMessage(data.message || "支付成功，权益已到账。")
        } else if (data.status === "failed") {
          setStatus("failed")
          setMessage(data.message || "支付未完成或已关闭，如已扣款请联系客服。")
        } else {
          setStatus("pending")
          setMessage(data.message || "支付结果还在确认中，请稍后刷新。")
        }
      } catch {
        if (!cancelled) {
          setStatus("error")
          setMessage("网络异常，暂时无法确认支付结果。")
        }
      }
    }

    loadStatus()
    return () => {
      cancelled = true
    }
  }, [orderNo])

  const isSuccess = status === "paid"
  const isPending = status === "loading" || status === "pending"
  const isFailure = status === "failed" || status === "not_found" || status === "unauthorized" || status === "error"

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          {isSuccess ? (
            <CheckCircle className="h-16 w-16 text-green-600" />
          ) : isPending ? (
            <Clock className="h-16 w-16 text-amber-500" />
          ) : (
            <AlertCircle className="h-16 w-16 text-red-500" />
          )}
        </div>
        <CardTitle className="text-2xl">
          {isSuccess ? "支付成功" : isPending ? "正在确认支付结果" : "支付结果需要处理"}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {orderNo && (
          <div className="rounded-lg border bg-white/70 p-4 text-sm space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">订单号</span>
              <span className="font-mono text-right break-all">{order?.orderNo || orderNo}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">支付状态</span>
              <Badge variant={isSuccess ? "default" : isFailure ? "destructive" : "secondary"}>
                {isSuccess ? "已支付" : isPending ? "确认中" : "未完成"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">购买内容</span>
              <span>{order?.productName || "--"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">支付金额</span>
              <span>{formatCurrency(order?.amount)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">到账积分</span>
              <span>{typeof order?.creditsAmount === "number" ? `${order.creditsAmount} 积分` : "--"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">到账时间</span>
              <span>{formatTime(order?.paidAt || order?.updatedAt)}</span>
            </div>
          </div>
        )}

        {status === "unauthorized" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>需要登录</AlertTitle>
            <AlertDescription>为了保护订单隐私，订单结果只允许本人查看。</AlertDescription>
          </Alert>
        )}

        {isFailure && status !== "unauthorized" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>如果已经扣款，不要重复支付</AlertTitle>
            <AlertDescription>请保存订单号，联系 support@shenxiang.school，我们会帮你核对。</AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-900 space-y-2">
          <p className="font-semibold">下一步建议：</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>先到“账户权益”确认积分或会员状态。</li>
            <li>权益到账后，回到 AI 作文批改继续写作。</li>
            <li>如果 5 分钟后仍未到账，请保存订单号联系 support@shenxiang.school。</li>
          </ul>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {isSuccess ? (
            <Button asChild className="w-full">
              <Link href="/chat/standard">继续作文批改</Link>
            </Button>
          ) : (
            <Button asChild className="w-full">
              <Link href="/pricing">返回套餐页</Link>
            </Button>
          )}
          <Button asChild variant="outline" className="w-full bg-transparent">
            <Link href="/settings">查看账户权益</Link>
          </Button>
          <Button asChild variant="outline" className="w-full bg-transparent">
            <Link href="mailto:support@shenxiang.school">联系客服</Link>
          </Button>
        </div>

        {orderNo && (
          <Button variant="ghost" className="w-full" onClick={() => window.location.reload()}>
            {status === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            刷新支付结果
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
        <PaymentSuccessContent />
      </Suspense>
    </div>
  )
}
