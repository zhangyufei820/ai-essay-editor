"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from 'lucide-react'
import QRCode from "qrcode"

export default function WeChatPaymentPage() {
  const params = useParams()
  const router = useRouter()
  const [qrCodeUrl, setQrCodeUrl] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const orderNo = Array.isArray(params.orderNo) ? params.orderNo[0] : params.orderNo
    
    if (!orderNo) {
      setError("订单号不存在")
      setLoading(false)
      return
    }

    // 获取支付二维码
    fetch("/api/payment/wechat/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNo }),
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success) {
          // 生成二维码图片
          const qrCode = await QRCode.toDataURL(data.codeUrl)
          setQrCodeUrl(qrCode)

          // 轮询查询支付状态
          const pollInterval = setInterval(async () => {
            const statusRes = await fetch(`/api/payment/status/${orderNo}`)
            const statusData = await statusRes.json()

            if (statusData.status === "paid") {
              clearInterval(pollInterval)
              router.push("/payment/success")
            }
          }, 3000)
        } else {
          setError(data.error)
        }
      })
      .catch((err) => {
        setError("加载失败")
      })
      .finally(() => {
        setLoading(false)
      })
  }, [params.orderNo, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardHeader>
            <CardTitle>支付失败</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>微信支付</CardTitle>
          <CardDescription>请使用微信扫描二维码完成支付</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center space-y-4">
          {qrCodeUrl && <img src={qrCodeUrl || "/placeholder.svg"} alt="支付二维码" className="w-64 h-64" />}
          <p className="text-sm text-muted-foreground">支付完成后页面将自动跳转</p>
        </CardContent>
      </Card>
    </div>
  )
}
