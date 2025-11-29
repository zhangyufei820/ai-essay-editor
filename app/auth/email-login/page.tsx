"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { Mail, ArrowLeft, Info, KeyRound } from "lucide-react"

export default function EmailLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") || "/chat"

  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [otpSent, setOtpSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [devCode, setDevCode] = useState<string | null>(null)

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [countdown])

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/send-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "发送失败")
      }

      setOtpSent(true)
      setCountdown(60)
      if (data.devCode) {
        setDevCode(data.devCode)
      }
    } catch (err: any) {
      setError(err.message || "发送失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "验证失败")
      }

      const supabase = createClient()
      await supabase.auth.refreshSession()

      router.push(redirect)
      router.refresh()
    } catch (err: any) {
      setError(err.message || "验证码错误，请重试")
    } finally {
      setLoading(false)
    }
  }

  if (otpSent) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-green-50 to-blue-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <KeyRound className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">输入验证码</CardTitle>
            <CardDescription className="text-base">
              验证码已发送至 <strong className="text-foreground">{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {devCode && (
              <Alert className="bg-yellow-50 border-yellow-300">
                <Info className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-sm">
                  <div className="font-semibold text-yellow-800 mb-1">开发模式</div>
                  <div className="text-yellow-700">
                    您的验证码是：
                    <span className="font-mono font-bold text-xl ml-2 text-yellow-900">{devCode}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">6位验证码</Label>
                <Input
                  id="otp"
                  type="text"
                  placeholder="000000"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={loading}
                  className="h-12 text-center text-2xl tracking-widest font-mono"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-xs text-blue-800">
                  请检查您的邮箱收件箱和垃圾邮件箱。验证码5分钟内有效。
                </AlertDescription>
              </Alert>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
              )}

              <Button type="submit" className="w-full" disabled={loading || otp.length !== 6} size="lg">
                {loading ? "验证中..." : "确认登录"}
              </Button>

              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOtpSent(false)
                    setOtp("")
                    setError("")
                    setDevCode(null)
                  }}
                  className="text-sm"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  返回修改邮箱
                </Button>
              </div>

              {countdown > 0 ? (
                <p className="text-center text-sm text-muted-foreground">{countdown}秒后可重新发送</p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="w-full bg-transparent"
                >
                  重新发送验证码
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-green-50 to-blue-50">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Mail className="h-7 w-7 text-green-600" />
            </div>
            <CardTitle className="text-2xl">邮箱验证码登录</CardTitle>
            <CardDescription>输入邮箱获取验证码，无需密码</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱地址</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="h-11"
                />
              </div>

              <Alert className="bg-green-50 border-green-200">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-xs text-green-800">
                  我们会向您的邮箱发送6位数字验证码，输入验证码即可完成登录。
                </AlertDescription>
              </Alert>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
              )}

              <Button type="submit" className="w-full" disabled={loading} size="lg">
                {loading ? "发送中..." : "获取验证码"}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                <Link href="/auth/login" className="hover:underline inline-flex items-center gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  返回登录
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-2 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-green-600">公测期间完全免费</p>
          <p className="text-xs">首次登录即送 1000 积分</p>
        </div>
      </div>
    </div>
  )
}
