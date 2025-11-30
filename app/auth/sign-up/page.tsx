"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from "react"

export default function SignUpPage() {
  const searchParams = useSearchParams()
  const referralCode = searchParams.get("ref") // 从URL获取推荐码

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (!supabase) {
      setError("认证服务未配置，请联系管理员")
      setIsLoading(false)
      return
    }

    if (password !== repeatPassword) {
      setError("两次输入的密码不一致")
      setIsLoading(false)
      return
    }

    if (password.length < 6) {
      setError("密码长度至少为6位")
      setIsLoading(false)
      return
    }

    try {
      const metadata: Record<string, string> = {
        display_name: displayName,
      }

      if (phone) {
        metadata.phone = phone
      }

      if (referralCode) {
        metadata.referral_code = referralCode
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/chat`,
          data: metadata,
        },
      })

      if (error) throw error

      if (referralCode && data.user) {
        await fetch("/api/referral/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.user.id,
            referralCode,
          }),
        })
      }

      router.push("/chat?welcome=true")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "注册失败，请重试")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">注册账户</CardTitle>
            <CardDescription>
              创建您的创意作文批改师账户
              {referralCode && <span className="block mt-2 text-green-600">🎉 使用推荐码注册，额外获得200积分！</span>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp}>
              <div className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="display-name">昵称</Label>
                  <Input
                    id="display-name"
                    placeholder="您的昵称"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">手机号（可选）</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="13800138000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="至少6位字符"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="repeat-password">确认密码</Label>
                  <Input
                    id="repeat-password"
                    type="password"
                    placeholder="再次输入密码"
                    required
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                  />
                </div>

                <div className="rounded-lg bg-green-50 p-3 text-sm">
                  <p className="font-medium text-green-900">🎁 注册即送1000积分</p>
                  <p className="text-green-700 mt-1">可用于AI对话、作文批改等功能</p>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "注册中..." : "立即注册"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">注册即表示您同意我们的服务条款和隐私政策</p>
              </div>
            </form>

            <div className="mt-4 text-center text-sm">
              已有账户？{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                立即登录
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
