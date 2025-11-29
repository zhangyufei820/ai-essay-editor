import { createServerClient } from "@/lib/supabase/server"
import { getUserCredits, getUserReferralCode } from "@/lib/credits"
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Gift, Share2, Coins, TrendingUp } from 'lucide-react'
import Link from "next/link"
import { CopyButton } from "@/components/credits/copy-button"

export const dynamic = 'force-dynamic'

export default async function CreditsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const credits = await getUserCredits(user.id)
  const referralCode = await getUserReferralCode(user.id)

  const { data: referrals } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_id", user.id)
    .eq("status", "completed")

  const referralCount = referrals?.length || 0
  const referralEarnings = referralCount * 500

  const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.com"}/auth/sign-up?ref=${referralCode}`

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">我的积分</h1>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">当前积分</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{credits?.credits || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">可用于AI对话和作文批改</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">累计获得</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{credits?.total_earned || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">包括注册和推荐奖励</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">推荐人数</CardTitle>
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{referralCount}</div>
              <p className="text-xs text-muted-foreground mt-1">已获得 {referralEarnings} 积分</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              邀请好友，赚取积分
            </CardTitle>
            <CardDescription>每邀请一位好友注册，您将获得500积分，好友也将获得200积分奖励</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">您的专属推荐码</label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={referralCode || ""}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded-md bg-muted"
                  />
                  <CopyButton text={referralCode || ""} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">推荐链接</label>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={shareUrl}
                    readOnly
                    className="flex-1 px-3 py-2 border rounded-md bg-muted text-sm"
                  />
                  <CopyButton text={shareUrl} label="复制链接" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>积分使用说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>AI对话（每条消息）</span>
                <span className="font-medium">10积分</span>
              </div>
              <div className="flex justify-between">
                <span>作文批改（每次）</span>
                <span className="font-medium">50积分</span>
              </div>
              <div className="flex justify-between">
                <span>文档处理（每个文件）</span>
                <span className="font-medium">20积分</span>
              </div>
              <div className="flex justify-between">
                <span>注册赠送</span>
                <span className="font-medium text-green-600">+1000积分</span>
              </div>
              <div className="flex justify-between">
                <span>推荐好友</span>
                <span className="font-medium text-green-600">+500积分</span>
              </div>
              <div className="flex justify-between">
                <span>被推荐注册</span>
                <span className="font-medium text-green-600">+200积分</span>
              </div>
            </div>

            <div className="mt-6">
              <Link href="/chat">
                <Button className="w-full">开始使用</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
