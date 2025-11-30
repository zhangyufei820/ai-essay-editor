import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">抱歉，出现了一些问题</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {params?.error ? (
              <p className="text-sm text-muted-foreground">错误代码: {params.error}</p>
            ) : (
              <p className="text-sm text-muted-foreground">发生了未知错误</p>
            )}
            <Button asChild className="w-full">
              <Link href="/auth/login">返回登录</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
