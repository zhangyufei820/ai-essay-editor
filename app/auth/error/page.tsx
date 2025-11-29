import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AlertCircle, Settings, ExternalLink } from "lucide-react"

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; description?: string }>
}) {
  const params = await searchParams
  const errorCode = params?.error || "unknown_error"
  const errorDescription = params?.description || params?.message || ""

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-gradient-to-br from-green-50 to-blue-50">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-7 w-7 text-red-600" />
            </div>
            <CardTitle className="text-2xl">登录遇到问题</CardTitle>
            <CardDescription className="font-mono text-xs bg-muted px-2 py-1 rounded">{errorCode}</CardDescription>
            {errorDescription && <p className="text-sm text-muted-foreground">{errorDescription}</p>}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <p className="font-medium mb-1">可能的原因：</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>登录链接已过期（有效期1小时）</li>
                <li>链接已被使用过</li>
                <li>Supabase URL配置不正确</li>
                <li>网络连接问题</li>
              </ul>
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              <div className="flex items-start gap-2 mb-2">
                <Settings className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p className="font-medium">管理员配置检查</p>
              </div>
              <p className="text-xs mb-2">请确保Supabase控制台中已正确配置：</p>
              <ol className="list-decimal list-inside space-y-1 text-xs ml-1">
                <li>
                  打开 <strong>Authentication → URL Configuration</strong>
                </li>
                <li>
                  设置 <strong>Site URL</strong> 为：
                  <br />
                  <code className="bg-blue-100 px-1 rounded text-[10px]">https://shenxiang.school</code>
                </li>
                <li>
                  在 <strong>Redirect URLs</strong> 中添加：
                  <br />
                  <code className="bg-blue-100 px-1 rounded text-[10px]">https://shenxiang.school/auth/callback</code>
                </li>
              </ol>
              <a
                href="https://supabase.com/dashboard/project/_/auth/url-configuration"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
              >
                打开Supabase配置 <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <Button asChild className="w-full" size="lg">
              <Link href="/auth/email-login">重新发送登录邮件</Link>
            </Button>
            <Button asChild variant="outline" className="w-full bg-transparent">
              <Link href="/">返回首页</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
