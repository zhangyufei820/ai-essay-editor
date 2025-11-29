import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bot, Brain, Lightbulb, Zap, Sparkles, MessageCircle } from "lucide-react"
import Link from "next/link"

const aiFeatures = [
  {
    icon: Bot,
    title: "AI学习助手",
    description: "24小时在线的智能学习伙伴，随时解答学习疑问",
    features: ["智能答疑", "个性化推荐", "学习规划"],
  },
  {
    icon: Brain,
    title: "思维训练",
    description: "通过AI互动游戏，提升逻辑思维和创造力",
    features: ["逻辑推理", "创意激发", "问题解决"],
  },
  {
    icon: Lightbulb,
    title: "知识探索",
    description: "AI引导下的探究式学习，激发求知欲和探索精神",
    features: ["主题探索", "深度学习", "跨学科整合"],
  },
  {
    icon: Zap,
    title: "即时反馈",
    description: "AI实时分析学习过程，提供精准的改进建议",
    features: ["实时诊断", "精准反馈", "个性指导"],
  },
]

export function ParentAI() {
  return (
    <section className="py-20 lg:py-32 bg-gradient-to-b from-primary/5 to-background">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            AI赋能教育
          </div>
          <h2 className="mb-4 text-3xl font-bold lg:text-4xl">AI共同学习</h2>
          <p className="text-lg text-muted-foreground">
            利用人工智能技术，为家长和孩子提供智能化的学习支持，
            <br className="hidden lg:block" />
            让学习更高效、更有趣、更个性化
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-12">
          {aiFeatures.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/50 hover:border-primary/50 hover:shadow-lg transition-all"
            >
              <CardContent className="p-6">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                  <feature.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                <p className="mb-4 text-sm text-muted-foreground">{feature.description}</p>
                <div className="flex flex-wrap gap-2">
                  {feature.features.map((item) => (
                    <span key={item} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {item}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mx-auto max-w-3xl rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-8 lg:p-12">
          <div className="text-center">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 text-primary" />
            <h3 className="mb-3 text-2xl font-bold">开启AI学习之旅</h3>
            <p className="mb-6 text-muted-foreground">与孩子一起体验AI技术带来的学习革新，共同成长，共享快乐</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/chat">
                <Button size="lg" className="w-full sm:w-auto gap-2">
                  <Sparkles className="h-5 w-5" />
                  开始AI对话
                </Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent">
                  注册家长账户
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
