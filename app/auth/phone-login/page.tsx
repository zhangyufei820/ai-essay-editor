"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { AlertCircle } from "lucide-react"

export default function PhoneLoginPage() {
  const router = useRouter()
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSendCode = async () => {
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "发送失败")
      }

      setStep("code")
      setCountdown(60)

      // 倒计时
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "验证失败")
      }

      if (data.isNewUser) {
        // 新用户，跳转到完善信息页面
        router.push(`/auth/complete-profile?phone=${phone}`)
      } else {
        // 老用户，直接登录成功
        router.push("/chat")
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            手机号登录
          </CardTitle>
          <CardDescription>功能开发中</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800">手机号验证码登录功能正在配置中，短信服务商API审核通过后即可使用。</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">公测期间，请使用以下方式登录：</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>邮箱注册登录（推荐）</li>
              <li>注册即送1000积分</li>
              <li>可立即体验所有AI功能</li>
            </ul>
          </div>

          <Link href="/auth/login" className="block">
            <Button className="w-full">使用邮箱登录</Button>
          </Link>

          <div className="text-center text-sm">
            <Link href="/auth/sign-up" className="text-primary hover:underline">
              还没有账户？立即注册
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
