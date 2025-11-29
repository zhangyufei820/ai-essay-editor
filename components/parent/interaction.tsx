import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Heart, Smile, Target, MessageSquare } from "lucide-react"
import Link from "next/link"

const activities = [
  {
    icon: Heart,
    title: "情感沟通",
    description: "学习如何与孩子进行有效的情感交流，建立信任关系",
    color: "bg-red-500/10 text-red-600",
  },
  {
    icon: Smile,
    title: "兴趣培养",
    description: "发现和培养孩子的兴趣爱好，支持个性化发展",
    color: "bg-yellow-500/10 text-yellow-600",
  },
  {
    icon: Target,
    title: "目标设定",
    description: "与孩子共同制定学习目标，培养目标意识和执行力",
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    icon: MessageSquare,
    title: "学习讨论",
    description: "围绕学习内容展开深度讨论，提升思维能力",
    color: "bg-green-500/10 text-green-600",
  },
]

export function ParentInteraction() {
  return (
    <section className="py-20 lg:py-32 bg-muted/30">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="mb-4 text-3xl font-bold lg:text-4xl">亲子互动学习</h2>
          <p className="text-lg text-muted-foreground">通过多样化的互动方式，增进亲子关系，让学习成为快乐的家庭活动</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-12">
          {activities.map((activity) => (
            <Card key={activity.title} className="border-border/50 hover:shadow-lg transition-all">
              <CardContent className="p-6 text-center">
                <div
                  className={`mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full ${activity.color}`}
                >
                  <activity.icon className="h-8 w-8" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{activity.title}</h3>
                <p className="text-sm text-muted-foreground">{activity.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center">
          <Link href="/auth/sign-up">
            <Button size="lg">开始亲子互动</Button>
          </Link>
        </div>
      </div>
    </section>
  )
}
