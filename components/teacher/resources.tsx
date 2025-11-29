import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Presentation, ClipboardList, BookOpen } from "lucide-react"
import Link from "next/link"

const resourceTypes = [
  {
    icon: FileText,
    title: "教案库",
    count: "10,000+",
    description: "各学科优质教案模板",
    href: "/teacher/resources/lesson-plans",
  },
  {
    icon: Presentation,
    title: "课件资源",
    count: "8,000+",
    description: "互动课件与演示文稿",
    href: "/teacher/resources/slides",
  },
  {
    icon: ClipboardList,
    title: "试题题库",
    count: "50,000+",
    description: "分级分类练习与测试",
    href: "/teacher/resources/tests",
  },
  {
    icon: BookOpen,
    title: "教学案例",
    count: "5,000+",
    description: "优秀教学实践分享",
    href: "/teacher/resources/cases",
  },
]

export function TeacherResources() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-balance">教学资源库</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">
            海量优质教学资源，覆盖全学段全学科
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {resourceTypes.map((resource) => {
            const Icon = resource.icon
            return (
              <Card key={resource.title} className="border-2 p-6 transition-all hover:border-primary hover:shadow-lg">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="mb-2 text-2xl font-bold text-primary">{resource.count}</div>
                <h3 className="mb-2 text-xl font-bold">{resource.title}</h3>
                <p className="mb-4 text-sm text-muted-foreground leading-relaxed">{resource.description}</p>
                <Button variant="outline" size="sm" className="w-full bg-transparent" asChild>
                  <Link href={resource.href}>浏览资源</Link>
                </Button>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
