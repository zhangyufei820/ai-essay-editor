import { Card, CardContent } from "@/components/ui/card"
import { BookOpen, MessageCircle, BarChart3, Award, Calendar, Bell } from "lucide-react"

const features = [
  {
    icon: BookOpen,
    title: "共同阅读计划",
    description: "与孩子一起制定阅读目标，分享阅读心得，培养阅读习惯",
  },
  {
    icon: MessageCircle,
    title: "学习陪伴对话",
    description: "通过AI辅助，开展有效的学习讨论，增进亲子沟通",
  },
  {
    icon: BarChart3,
    title: "学习数据分析",
    description: "实时了解孩子学习进度和薄弱环节，科学规划学习路径",
  },
  {
    icon: Award,
    title: "成就激励系统",
    description: "记录孩子的每一次进步，及时给予鼓励和认可",
  },
  {
    icon: Calendar,
    title: "学习日程管理",
    description: "帮助���子建立良好作息，合理安排学习和休息时间",
  },
  {
    icon: Bell,
    title: "智能提醒助手",
    description: "重要事项及时提醒，不错过任何关键学习节点",
  },
]

export function ParentFeatures() {
  return (
    <section className="py-20 lg:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="mb-4 text-3xl font-bold lg:text-4xl">核心功能</h2>
          <p className="text-lg text-muted-foreground">全方位支持家长参与孩子的学习过程，建立高质量的家庭教育环境</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border/50 hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
