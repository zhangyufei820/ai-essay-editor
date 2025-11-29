import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, MessageSquare, Calendar, Share2 } from "lucide-react"
import Link from "next/link"

const communityFeatures = [
  {
    icon: Users,
    title: "教研小组",
    description: "跨校组建教研小组，共同备课、研讨教学",
  },
  {
    icon: MessageSquare,
    title: "经验交流",
    description: "分享教学心得、解决教学难题、互相学习",
  },
  {
    icon: Calendar,
    title: "在线研讨",
    description: "定期举办线上教研活动、专家讲座",
  },
  {
    icon: Share2,
    title: "资源共享",
    description: "优质资源共建共享，促进教育均衡发展",
  },
]

export function TeacherCommunity() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-balance">教研协作社区</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">连接全国教师，共同探索教育创新</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-12">
          {communityFeatures.map((feature) => {
            const Icon = feature.icon
            return (
              <Card key={feature.title} className="border-2 p-6 text-center">
                <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-7 w-7" />
                </div>
                <h3 className="mb-2 text-lg font-bold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            )
          })}
        </div>

        <div className="text-center">
          <Button size="lg" asChild>
            <Link href="/teacher/community/join">加入教研社区</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
