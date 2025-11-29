import { Card } from "@/components/ui/card"
import { GraduationCap, TrendingUp, Award, Target } from "lucide-react"

const developmentPaths = [
  {
    icon: GraduationCap,
    title: "教学技能提升",
    description: "课堂管理、教学方法、学生评价等核心技能培训",
    courses: ["课堂互动技巧", "差异化教学", "教学评价方法"],
  },
  {
    icon: TrendingUp,
    title: "学科前沿",
    description: "最新学科动态、教育研究成果、课程标准解读",
    courses: ["新课标解读", "学科前沿研究", "教材分析"],
  },
  {
    icon: Target,
    title: "教研能力",
    description: "教学研究、论文写作、课题申报指导",
    courses: ["教研方法", "论文写作", "课题研究"],
  },
  {
    icon: Award,
    title: "专业认证",
    description: "教师资格认证、学科专业认证、教学能力认证",
    courses: ["教师资格", "学科认证", "骨干教师"],
  },
]

export function TeacherDevelopment() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-4xl font-bold tracking-tight text-balance">专业发展路径</h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground text-pretty">系统化的教师专业发展课程体系</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {developmentPaths.map((path) => {
            const Icon = path.icon
            return (
              <Card key={path.title} className="border-2 p-6">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-3 text-xl font-bold">{path.title}</h3>
                <p className="mb-4 text-sm text-muted-foreground leading-relaxed">{path.description}</p>
                <div className="space-y-2">
                  {path.courses.map((course) => (
                    <div key={course} className="flex items-center text-sm">
                      <span className="mr-2 h-1.5 w-1.5 rounded-full bg-primary" />
                      {course}
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
