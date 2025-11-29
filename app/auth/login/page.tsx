"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Mail, Sparkles } from "lucide-react"
import Link from "next/link"

const VALID_INVITE_CODES = ["BETA2024", "TEST2024", "DEMO2024"]

export default function LoginPage() {
  const [inviteCode, setInviteCode] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (!VALID_INVITE_CODES.includes(inviteCode.toUpperCase())) {
        throw new Error("邀请码无效，请输入正确的公测邀请码")
      }

      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`
      const userName = displayName.trim() || "用户"

      localStorage.setItem("user_id", userId)
      localStorage.setItem("user_name", userName)
      localStorage.setItem("invite_code", inviteCode.toUpperCase())
      localStorage.setItem("login_time", new Date().toISOString())
      localStorage.setItem("credits", "1000")

      router.push("/chat")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "登录失败，请重试")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-green-50 to-blue-50">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Sparkles className="h-7 w-7 text-green-600" />
            </div>
            <CardTitle className="text-2xl">欢迎使用沈翔智学</CardTitle>
            <CardDescription>选择登录方式开始体验</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/auth/email-login" className="block">
              <Button variant="default" size="lg" className="w-full gap-2">
                <Mail className="h-5 w-5" />
                邮箱验证码登录
              </Button>
            </Link>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">测试登录</span>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inviteCode">邀请码</Label>
                <Input
                  id="inviteCode"
                  type="text"
                  placeholder="请输入邀请码"
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  公测邀请码：<span className="font-mono font-semibold text-green-600">BETA2024</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">昵称（可选）</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="给自己起个名字"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={20}
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
              )}

              <Button type="submit" className="w-full bg-transparent" disabled={isLoading} size="lg" variant="outline">
                {isLoading ? "登录中..." : "快速体验（测试）"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-green-600">🎉 公测期间完全免费</p>
          <p className="text-xs">注册即送 1000 积分，邀请好友再得 500 积分</p>
          <p className="text-xs">支持 AI 对话、作文批改、文件上传等全部功能</p>
        </div>
      </div>
    </div>
  )
}
