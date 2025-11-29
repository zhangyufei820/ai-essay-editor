"use client"

import type React from "react"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import { Smartphone, ArrowLeft, Info } from "lucide-react"

export default function PhoneLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") || "/chat"

  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"phone" | "code">("phone")
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [devCode, setDevCode] = useState("")

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
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

      // 开发环境显示验证码
      if (data.code) {
        setDevCode(data.code)
      }

      setStep("code")
      setCountdown(60)

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

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
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
        router.push(`/auth/complete-profile?phone=${phone}&redirect=${encodeURIComponent(redirect)}`)
      } else {
        router.push(redirect)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = () => {
    setStep("phone")
    setCode("")
    setError("")
    setDevCode("")
  }

  if (step === "code") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-green-50 to-blue-50">
        <div className="w-full max-w-sm space-y-4">
          <Card>
            <CardHeader className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <Smartphone className="h-7 w-7 text-green-600" />
              </div>
              <CardTitle className="text-2xl">输入验证码</CardTitle>
              <CardDescription>
                验证码已发送至 <strong className="text-foreground">{phone}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">验证码</Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="请输入6位验证码"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    className="text-center text-2xl tracking-widest h-14"
                    autoFocus
                  />
                </div>

                {devCode && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <Info className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      开发模式 - 验证码：<strong className="text-lg ml-2">{devCode}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
                )}

                <Button type="submit" className="w-full" disabled={loading || code.length !== 6} size="lg">
                  {loading ? "验证中..." : "确认登录"}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-primary hover:underline"
                    disabled={countdown > 0}
                  >
                    {countdown > 0 ? `${countdown}秒后重新发送` : "重新发送"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("phone")}
                    className="text-muted-foreground hover:underline"
                  >
                    更换手机号
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground">
            <p className="font-semibold text-green-600">首次登录即送1000积分</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-green-50 to-blue-50">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Smartphone className="h-7 w-7 text-green-600" />
            </div>
            <CardTitle className="text-2xl">手机号登录</CardTitle>
            <CardDescription>验证后自动登录或注册</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">手机号</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="请输入11位手机号"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  maxLength={11}
                  className="h-12 text-lg"
                  autoFocus
                />
              </div>

              <Alert className="bg-green-50 border-green-200">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-xs text-green-800">
                  首次登录将自动创建账户并赠送1000积分，无需密码，使用验证码即可快速登录。
                </AlertDescription>
              </Alert>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
              )}

              <Button type="submit" className="w-full" disabled={loading || phone.length !== 11} size="lg">
                {loading ? "发送中..." : "获取验证码"}
              </Button>

              <div className="text-center text-sm">
                <Link
                  href="/auth/login"
                  className="text-muted-foreground hover:underline inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  其他登录方式
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-2 text-center text-xs text-muted-foreground">
          <p>登录即表示同意《用户协议》和《隐私政策》</p>
        </div>
      </div>
    </div>
  )
}
