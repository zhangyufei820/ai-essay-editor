import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BookOpen, Lightbulb, Target, TrendingUp, Heart, Award } from "lucide-react"

const features = [
  {
    icon: BookOpen,
    title: "深度内容分析",
    description: "评估主题深度、逻辑结构、论证有效性，全方位诊断文章质量",
  },
  {
    icon: Lightbulb,
    title: "语言艺术指导",
    description: "优化词汇选择、句式变化、修辞手法，提升表达的文学性",
  },
  {
    icon: Target,
    title: "创意思维启发",
    description: "提供独特写作角度和创新表达方式，让文章脱颖而出",
  },
  {
    icon: TrendingUp,
    title: "个性化建议",
    description: "根据学生年级和水平量身定制指导方案，循序渐进提升",
  },
  {
    icon: Heart,
    title: "情感共鸣培养",
    description: "帮助写出有温度、有感染力的文字，打动读者内心",
  },
  {
    icon: Award,
    title: "考场规范优化",
    description: "严格按照年级要求、题目规定、字数限制进行批改",
  },
]

export function Features() {
  return (
    <section id="features" className="py-20 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl mb-4">核心能力</h2>
          <p className="text-lg text-muted-foreground leading-relaxed">不仅批改作文，更激发学生的写作潜能</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <Card key={index} className="border-border/50 hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
