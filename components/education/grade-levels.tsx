import { Card } from "@/components/ui/card"
import { Baby, BookOpen, GraduationCap, School } from "lucide-react"
import Link from "next/link"

const gradeLevels = [
  {
    id: "primary",
    title: "小学教育",
    description: "1-6年级全科辅导，培养学习兴趣和基础能力",
    icon: Baby,
    subjects: ["语文", "数学", "英语", "科学"],
    href: "/subjects/primary",
  },
  {
    id: "middle",
    title: "初中教育",
    description: "7-9年级深度学习，夯实学科基础",
    icon: School,
    subjects: ["语文", "数学", "英语", "物理", "化学", "生物"],
    href: "/subjects/middle",
  },
  {
    id: "high",
    title: "高中教育",
    description: "高考备战，系统化知识梳理与提升",
    icon: BookOpen,
    subjects: ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"],
    href: "/subjects/high",
  },
  {
    id: "university",
    title: "大学教育",
    description: "专业课程辅导，学术论文写作指导",
    icon: GraduationCap,
    subjects: ["专业课", "论文写作", "考研辅导", "英语四六级"],
    href: "/subjects/university",
  },
]

export function GradeLevels() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-balance">全学段覆盖</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">
            从小学到大学，提供全方位的学习支持
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {gradeLevels.map((level) => {
            const Icon = level.icon
            return (
              <Link key={level.id} href={level.href}>
                <Card className="group relative h-full overflow-hidden border-2 p-6 transition-all hover:border-primary hover:shadow-lg">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="mb-2 text-xl font-bold">{level.title}</h3>
                  <p className="mb-4 text-sm text-muted-foreground leading-relaxed">{level.description}</p>

                  <div className="flex flex-wrap gap-2">
                    {level.subjects.slice(0, 4).map((subject) => (
                      <span
                        key={subject}
                        className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                      >
                        {subject}
                      </span>
                    ))}
                    {level.subjects.length > 4 && (
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                        +{level.subjects.length - 4}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
