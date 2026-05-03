import { createServerClient } from "@/lib/supabase/server"
import { getUserCredits, getUserReferralCode } from "@/lib/credits"
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp } from 'lucide-react'
import Link from "next/link"
import { CopyButton } from "@/components/credits/copy-button"
import { ShenxiangInterfaceIcon } from "@/components/icons/ShenxiangInterfaceIcons"

export const dynamic = 'force-dynamic'

export default async function CreditsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const credits = await getUserCredits(user.id, { includeTotals: true })
  const referralCode = await getUserReferralCode(user.id)

  const { data: referrals } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_id", user.id)
    .eq("status", "completed")

  const referralCount = referrals?.length || 0
  const referralEarnings = referralCount * 1000

  const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.com"}/auth/sign-up?ref=${referralCode}`

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">我的积分</h1>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">当前积分</CardTitle>
              <ShenxiangInterfaceIcon name="credits" size={22} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{credits?.credits || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">可用于文本生成、图片和音乐创作</p>
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
              <ShenxiangInterfaceIcon name="share" size={22} />
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
              <ShenxiangInterfaceIcon name="invite" size={24} />
              邀请好友，赚取积分
            </CardTitle>
            <CardDescription>每邀请一位好友注册，双方各获得 1000 积分；邀请者累计奖励上限为 50000 积分。</CardDescription>
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
                <span>输入内容</span>
                <span className="font-medium">5积分 / 1K</span>
              </div>
              <div className="flex justify-between">
                <span>输出内容</span>
                <span className="font-medium">20积分 / 1K</span>
              </div>
              <div className="flex justify-between">
                <span>无实际输出内容</span>
                <span className="font-medium">不扣文本生成费用</span>
              </div>
              <div className="rounded-md bg-muted/50 p-3 leading-relaxed">
                <p className="font-medium">系统会在模型返回完成后，根据实际 token 用量扣除积分。</p>
                <p className="text-muted-foreground mt-1">
                  长文写作、作文批改、论文报告等功能通常会消耗更多积分。短作文批改约 100~300 积分，普通作文约 300~600 积分，长作文或详细批改可能消耗更多。
                </p>
              </div>
              <div className="rounded-md bg-muted/50 p-3 leading-relaxed">
                <p className="font-medium">图片和音乐</p>
                <p className="text-muted-foreground mt-1">
                  GPT Image 2 订阅用户可用，白名单用户可测试，按固定积分扣费；GPT Image 1.5 / 1 / Mini 按对应固定积分扣费；Suno 约 100 积分起，实际可能包含 token 补扣。
                </p>
              </div>
              <div className="flex justify-between">
                <span>注册赠送</span>
                <span className="font-medium text-green-600">+1000积分</span>
              </div>
              <div className="flex justify-between">
                <span>推荐好友</span>
                <span className="font-medium text-green-600">+1000积分</span>
              </div>
              <div className="flex justify-between">
                <span>被推荐注册</span>
                <span className="font-medium text-green-600">+1000积分</span>
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
