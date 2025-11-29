import { Card } from "@/components/ui/card"
import { Bot, FileText, LineChart, Sparkles, Target, Zap } from 'lucide-react'

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
    <section id="features" className="py-20 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-balance">核心功能</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">
            AI驱动的智能教育平台，为学习和教学提供全方位支持
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Card 
                key={feature.title} 
                className="group relative overflow-hidden rounded-2xl border-2 border-border/50 bg-card p-8 shadow-lg transition-all duration-300 hover:border-primary hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-1"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-md transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg">
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
