import { Card } from "@/components/ui/card"
import { Atom, BookA, Calculator, Globe2, Palette, TestTube } from "lucide-react"
import Link from "next/link"

const categories = [
  {
    id: "languages",
    title: "语言文学",
    icon: BookA,
    subjects: ["语文", "英语", "作文批改", "阅读理解", "古诗词"],
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    href: "/subjects/languages",
  },
  {
    id: "math",
    title: "数学",
    icon: Calculator,
    subjects: ["代数", "几何", "微积分", "统计学", "线性代数"],
    color: "text-green-600 bg-green-50 dark:bg-green-950/30",
    href: "/subjects/math",
  },
  {
    id: "science",
    title: "自然科学",
    icon: Atom,
    subjects: ["物理", "化学", "生物", "地球科学", "天文学"],
    color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30",
    href: "/subjects/science",
  },
  {
    id: "lab",
    title: "实验与实践",
    icon: TestTube,
    subjects: ["实验设计", "数据分析", "科学探究", "项目实践"],
    color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
    href: "/subjects/lab",
  },
  {
    id: "social",
    title: "人文社科",
    icon: Globe2,
    subjects: ["历史", "地理", "政治", "哲学", "经济学"],
    color: "text-red-600 bg-red-50 dark:bg-red-950/30",
    href: "/subjects/social",
  },
  {
    id: "arts",
    title: "艺术与创造",
    icon: Palette,
    subjects: ["美术", "音乐", "设计", "创意写作", "表演"],
    color: "text-pink-600 bg-pink-50 dark:bg-pink-950/30",
    href: "/subjects/arts",
  },
]

export function SubjectCategories() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-balance">学科分类</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">
            涵盖所有主要学科领域，提供专业的学习辅导
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const Icon = category.icon
            return (
              <Link key={category.id} href={category.href}>
                <Card className="group h-full border-2 p-6 transition-all hover:border-primary hover:shadow-lg">
                  <div
                    className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-xl ${category.color} transition-transform group-hover:scale-110`}
                  >
                    <Icon className="h-7 w-7" />
                  </div>

                  <h3 className="mb-3 text-2xl font-bold">{category.title}</h3>

                  <ul className="space-y-2">
                    {category.subjects.map((subject) => (
                      <li key={subject} className="flex items-center text-sm text-muted-foreground">
                        <span className="mr-2 h-1.5 w-1.5 rounded-full bg-primary" />
                        {subject}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
