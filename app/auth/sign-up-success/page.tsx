import {
  AlertV2 as Alert,
  AlertV2Description as AlertDescription,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Description as CardDescription,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle
} from "@/components/ui/v2"
import Link from "next/link"
import { InfoIcon } from "lucide-react"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">注册申请已提交</CardTitle>
            <CardDescription>完成邮箱确认后即可登录使用</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <InfoIcon className="h-4 w-4" />
              <AlertDescription>
                <strong>请完成邮箱确认：</strong>
                <br />
                请查收确认邮件并点击其中的确认链接。完成确认后，邀请关系和积分奖励会自动结算。
              </AlertDescription>
            </Alert>

            <p className="text-sm text-[var(--ink-500)]">
              如果收不到确认邮件，请检查垃圾邮件文件夹，或联系管理员手动激活您的账户。
            </p>

            <div className="space-y-2">
              <Button asChild className="w-full">
                <Link href="/auth/login">前往登录</Link>
              </Button>
              <Button asChild variant="outline" className="w-full bg-transparent">
                <Link href="/">返回首页</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
