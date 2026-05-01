"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertCircle, CheckCircle, Loader2, RefreshCw } from "lucide-react"
import QRCode from "qrcode"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PaymentStatusResponse = {
  status?: "paid" | "pending" | "failed" | string
  orderNo?: string
  productName?: string
  amount?: number
  creditsAmount?: number
  message?: string
  error?: string
}

function formatCurrency(amount?: number) {
  if (typeof amount !== "number") return "--"
  return `¥${amount.toFixed(2)}`
}

export default function WeChatPaymentPage() {
  const params = useParams()
  const router = useRouter()
  const orderNo = useMemo(() => {
    const value = params.orderNo
    return Array.isArray(value) ? value[0] : value || ""
  }, [params.orderNo])

  const [status, setStatus] = useState<"loading" | "pending" | "paid" | "failed" | "error">("loading")
  const [order, setOrder] = useState<PaymentStatusResponse | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!orderNo) {
      setStatus("error")
      setError("订单号不存在")
      return
    }

    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    async function checkStatus(redirectOnPaid = false) {
      const statusRes = await fetch(`/api/payment/status/${encodeURIComponent(orderNo)}`, { cache: "no-store" })
      const statusData: PaymentStatusResponse = await statusRes.json().catch(() => ({}))

      if (cancelled) return

      if (!statusRes.ok) {
        setStatus(statusRes.status === 404 ? "failed" : "error")
        setError(statusData.error || "支付状态查询失败")
        return
      }

      setOrder(statusData)
      setError("")

      if (statusData.status === "paid") {
        setStatus("paid")
        if (pollTimer) clearInterval(pollTimer)
        if (redirectOnPaid) {
          router.push(`/payment/success?orderNo=${encodeURIComponent(orderNo)}`)
        }
        return
      }

      if (statusData.status === "failed") {
        setStatus("failed")
        if (pollTimer) clearInterval(pollTimer)
        return
      }

      setStatus("pending")
    }

    async function bootstrap() {
      try {
        await checkStatus(false)
        if (cancelled) return

        const createRes = await fetch("/api/payment/wechat/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNo }),
        })
        const createData = await createRes.json().catch(() => ({}))

        if (cancelled) return

        if (createData.success && createData.codeUrl) {
          const qrCode = await QRCode.toDataURL(createData.codeUrl)
          if (!cancelled) setQrCodeUrl(qrCode)
        } else if (createData.error) {
          setError(createData.error)
        }

        pollTimer = setInterval(() => {
          checkStatus(true).catch(() => {
            if (!cancelled) {
              setStatus("error")
              setError("支付状态查询失败，请稍后刷新")
            }
          })
        }, 3000)
      } catch {
        if (!cancelled) {
          setStatus("error")
          setError("加载失败，请稍后刷新")
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [orderNo, router])

  const isLoading = status === "loading"
  const isPaid = status === "paid"
  const isPending = status === "pending" || isLoading
  const isFailure = status === "failed" || status === "error"

  if (isLoading && !qrCodeUrl && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {isPaid ? (
              <CheckCircle className="h-14 w-14 text-green-600" />
            ) : isFailure ? (
              <AlertCircle className="h-14 w-14 text-red-500" />
            ) : (
              <Loader2 className="h-14 w-14 animate-spin text-amber-500" />
            )}
          </div>
          <CardTitle>{isPaid ? "支付成功" : isFailure ? "支付遇到问题" : "微信支付"}</CardTitle>
          <CardDescription>
            {isPaid ? "支付成功，权益已到账。" : isFailure ? error || "支付未完成，请核对订单。" : "请使用微信扫码支付，页面会自动确认到账结果。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qrCodeUrl && !isPaid && (
            <div className="flex flex-col items-center space-y-3">
              <img src={qrCodeUrl} alt="微信支付二维码" className="h-64 w-64 rounded-lg border bg-white p-2" />
              <p className="text-sm text-muted-foreground">支付完成后无需重复点击，系统每 3 秒自动确认一次。</p>
            </div>
          )}

          <div className="rounded-lg border bg-white/70 p-4 text-sm space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">订单号</span>
              <span className="font-mono text-right break-all">{order?.orderNo || orderNo}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">状态</span>
              <Badge variant={isPaid ? "default" : isFailure ? "destructive" : "secondary"}>
                {isPaid ? "已支付" : isFailure ? "未完成" : "确认中"}
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
              <span className="text-muted-foreground">预计到账</span>
              <span>{typeof order?.creditsAmount === "number" ? `${order.creditsAmount} 积分` : "支付成功后自动到账"}</span>
            </div>
          </div>

          {isFailure && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>如果已经扣款，请不要重复支付</AlertTitle>
              <AlertDescription>保存订单号，联系 support@shenxiang.school，我们会帮你核对。</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={() => router.push(`/payment/success?orderNo=${encodeURIComponent(orderNo)}`)} className="w-full">
              查看支付结果
            </Button>
            <Button variant="outline" className="w-full bg-transparent" onClick={() => window.location.reload()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
