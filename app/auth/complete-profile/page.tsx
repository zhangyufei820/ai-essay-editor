"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UserCircle } from "lucide-react"

// 内部组件，使用 useSearchParams
function CompleteProfileForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [phone, setPhone] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const redirect = searchParams.get("redirect") || "/chat"

  useEffect(() => {
    const phoneParam = searchParams.get("phone")
    if (phoneParam) {
      setPhone(phoneParam)
    } else {
      router.push("/auth/phone-login")
    }
  }, [searchParams, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const response = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, displayName }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "保存失败")
      }

      router.push(redirect)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <UserCircle className="h-7 w-7 text-green-600" />
        </div>
        <CardTitle className="text-2xl">完善个人信息</CardTitle>
        <CardDescription>欢迎加入沈翔智学！</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">昵称</Label>
            <Input
              id="displayName"
              type="text"
              placeholder="给自己起个名字"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
              className="h-11"
              autoFocus
              required
            />
          </div>

          <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-2">
            <p className="font-medium text-green-900">🎁 新用户福利</p>
            <ul className="text-sm text-green-700 space-y-1">
              <li>✓ 注册即送1000积分</li>
              <li>✓ 免费体验AI对话</li>
              <li>✓ 免费作文批改</li>
            </ul>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>
          )}

          <Button type="submit" disabled={loading || !displayName.trim()} className="w-full" size="lg">
            {loading ? "保存中..." : "开始使用"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// 加载骨架屏
function LoadingSkeleton() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 animate-pulse" />
        <div className="h-8 bg-slate-100 rounded w-1/2 mx-auto animate-pulse" />
        <div className="h-4 bg-slate-100 rounded w-2/3 mx-auto animate-pulse" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-11 bg-slate-100 rounded animate-pulse" />
        <div className="h-24 bg-slate-100 rounded animate-pulse" />
        <div className="h-11 bg-slate-100 rounded animate-pulse" />
      </CardContent>
    </Card>
  )
}

// 主页面组件
export default function CompleteProfilePage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 bg-gradient-to-br from-green-50 to-blue-50">
      <Suspense fallback={<LoadingSkeleton />}>
        <CompleteProfileForm />
      </Suspense>
    </div>
  )
}
