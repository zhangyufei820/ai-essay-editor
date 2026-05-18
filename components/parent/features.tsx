import { CardV2 as Card, CardV2Content as CardContent } from "@/components/ui/v2"
import { Calendar, Bell } from "lucide-react"
import { IconDashboard, IconEnglish, IconFollowup, IconSealStar } from "@/components/icons/v2"

const features = [
  {
    icon: IconEnglish,
    title: "共同阅读计划",
    description: "与孩子一起制定阅读目标，分享阅读心得，培养阅读习惯",
  },
  {
    icon: IconFollowup,
    title: "学习陪伴对话",
    description: "通过AI辅助，开展有效的学习讨论，增进亲子沟通",
  },
  {
    icon: IconDashboard,
    title: "学习数据分析",
    description: "实时了解孩子学习进度和薄弱环节，科学规划学习路径",
  },
  {
    icon: IconSealStar,
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
          <h2 className="mb-4 text-3xl font-bold lg:text-4xl font-[var(--font-display)]">核心功能</h2>
          <p className="text-lg text-[var(--ink-500)]">全方位支持家长参与孩子的学习过程，建立高质量的家庭教育环境</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-[var(--paper-200)]/50 hover:border-[var(--ink-300)] transition-colors">
              <CardContent className="p-6">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--radius-soft)] bg-[var(--ink-50)]">
                  <feature.icon className="h-6 w-6 text-[var(--ink-600)]" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-[var(--ink-500)]">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
