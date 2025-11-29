"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, CheckCircle2, AlertCircle } from "lucide-react"
import Link from "next/link"

export function AuthTester({ onResult }: { onResult: (result: "pass" | "fail") => void }) {
  const authMethods = [
    {
      name: "邮箱注册/登录",
      status: "available",
      description: "使用Supabase Auth，无需额外配置",
      testUrl: "/auth/sign-up",
      configRequired: false,
    },
    {
      name: "手机号验证码登录",
      status: "needs-config",
      description: "需要配置短信服务商（阿里云/腾讯云）",
      testUrl: "/auth/phone-login",
      configRequired: true,
      envVars: ["SMS_PROVIDER", "SMS_ACCESS_KEY_ID", "SMS_ACCESS_KEY_SECRET"],
    },
    {
      name: "微信OAuth登录",
      status: "needs-config",
      description: "需要微信开放平台企业认证",
      testUrl: "/auth/wechat-login",
      configRequired: true,
      envVars: ["WECHAT_APP_ID", "WECHAT_APP_SECRET", "NEXT_PUBLIC_WECHAT_REDIRECT_URI"],
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>认证功能测试</CardTitle>
        <CardDescription>测试各种登录和注册方式</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {authMethods.map((method) => (
          <div key={method.name} className="flex items-start justify-between p-4 border rounded-lg">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{method.name}</h3>
                {method.status === "available" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {method.status === "needs-config" && <AlertCircle className="h-4 w-4 text-yellow-500" />}
              </div>
              <p className="text-sm text-muted-foreground">{method.description}</p>
              {method.configRequired && method.envVars && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">需要的环境变量:</p>
                  <div className="flex flex-wrap gap-1">
                    {method.envVars.map((env) => (
                      <Badge key={env} variant="outline" className="text-xs">
                        {env}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Link href={method.testUrl}>
              <Button size="sm" variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />
                测试
              </Button>
            </Link>
          </div>
        ))}

        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-2">
          <h4 className="font-medium text-sm">测试建议</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>邮箱登录可以立即测试，无需额外配置</li>
            <li>手机号和微信登录需要先配置相应的环境变量</li>
            <li>测试时请使用真实的邮箱地址以接收确认邮件</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
