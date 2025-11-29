"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"
import Link from "next/link"

export default function WeChatLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            微信登录
          </CardTitle>
          <CardDescription>功能开发中</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800">微信登录功能正在配置中，微信开放平台企业认证通过后即可使用。</p>
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
