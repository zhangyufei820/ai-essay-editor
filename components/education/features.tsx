import { Card } from "@/components/ui/card"
import { Bot, FileText, LineChart, Sparkles, Target, Zap } from "lucide-react"

const features = [
  {
    icon: Bot,
    title: "AI智能批改",
    description: "三大AI模型协同工作，提供深度、专业的作业批改和学习建议",
  },
  {
    icon: Target,
    title: "个性化学习",
    description: "根据学生特点定制学习方案，精准定位薄弱环节",
  },
  {
    icon: Sparkles,
    title: "创意启发",
    description: "激发学习兴趣，培养创新思维和批判性思考能力",
  },
  {
    icon: LineChart,
    title: "学习分析",
    description: "可视化学习进度，追踪知识掌握情况和能力提升",
  },
  {
    icon: FileText,
    title: "海量资源",
    description: "覆盖全学段全学科的优质学习资源和练习题库",
  },
  {
    icon: Zap,
    title: "即时反馈",
    description: "快速响应学习需求，随时随地获得专业指导",
  },
]

export function Features() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-balance">核心功能</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">
            AI驱动的智能教育平台，为学习和教学提供全方位支持
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Card key={feature.title} className="border-2 p-6 transition-all hover:border-primary hover:shadow-md">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-bold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
