"use client"

import {
  AlertV2 as Alert,
  AlertV2Description as AlertDescription,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  LabelV2 as Label
} from "@/components/ui/v2"
import type React from "react"

import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { CheckCircle2, Mail, Info } from "lucide-react"

export default function SignUpPage() {
  const searchParams = useSearchParams()
  const referralCode = searchParams.get("ref")
  const redirect = searchParams.get("redirect") || "/chat?welcome=true"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
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

      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://shenxiang.school"
      const fullRedirectUrl = `${baseUrl}/auth/callback?next=${encodeURIComponent(redirect)}`

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: fullRedirectUrl,
          data: metadata,
        },
      })

      if (error) throw error

      console.log("[v0] Sign up successful, showing email confirmation screen")
      setEmailSent(true)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "注册失败，请重试")
    } finally {
      setIsLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-green-50 to-blue-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ink-100)]">
              <CheckCircle2 className="h-10 w-10 text-[var(--ink-600)]" />
            </div>
            <CardTitle className="text-2xl">注册成功！</CardTitle>
            <CardDescription className="text-base">
              我们已向 <strong className="text-[var(--ink-900)]">{email}</strong> 发送了确认邮件
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p className="font-semibold">请按以下步骤完成注册：</p>
                <ol className="list-decimal list-inside space-y-1 ml-2 text-sm">
                  <li>打开您的邮箱（请检查收件箱和垃圾邮件箱）</li>
                  <li>查找来自 Supabase 的确认邮件</li>
                  <li>
                    点击邮件中的 <strong>&quot;Confirm your mail&quot;</strong> 链接
                  </li>
                  <li>完成邮箱验证后即可登录使用</li>
                </ol>
              </AlertDescription>
            </Alert>

            <div className="rounded-[var(--radius-soft)] bg-blue-50 border border-blue-200 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">温馨提示</p>
                  <ul className="text-sm text-blue-700 space-y-1 mt-1">
                    <li>邮件可能需要1-2分钟送达</li>
                    <li>链接有效期为24小时</li>
                    <li>确认邮箱后将自动获得1000积分</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button asChild className="w-full" size="lg">
              <Link href="/auth/email-login">返回登录页</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">注册账户</CardTitle>
            <CardDescription>
              创建您的创意作文批改师账户
              {referralCode && <span className="block mt-2 text-[var(--ink-600)]">🎉 使用推荐码注册，额外获得200积分！</span>}
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

                <div className="rounded-[var(--radius-soft)] bg-[var(--ink-50)] p-3 text-sm">
                  <p className="font-medium text-[var(--ink-900)]">🎁 注册即送1000积分</p>
                  <p className="text-[var(--ink-700)] mt-1">可用于AI对话、作文批改等功能</p>
                </div>

                {error && <p className="text-sm text-[var(--seal-500)]">{error}</p>}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "注册中..." : "立即注册"}
                </Button>

                <p className="text-xs text-[var(--ink-500)] text-center">注册即表示您同意我们的服务条款和隐私政策</p>
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
