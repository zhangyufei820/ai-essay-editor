import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Award, BookOpen, TrendingUp, Users } from "lucide-react"
import Link from "next/link"

const teacherFeatures = [
  {
    icon: BookOpen,
    title: "教学资源库",
    description: "海量优质教案、课件、试题资源",
  },
  {
    icon: TrendingUp,
    title: "专业成长",
    description: "教学技能提升、学科前沿动态",
  },
  {
    icon: Users,
    title: "教研协作",
    description: "跨校交流、集体备课、经验分享",
  },
  {
    icon: Award,
    title: "认证体系",
    description: "专业发展证书、教学能力认证",
  },
]

export function TeacherSection() {
  return (
    <section className="relative py-20 bg-primary/5">
      <div className="container mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Left: Content */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Users className="h-4 w-4" />
              教师专业发展
            </div>

            <h2 className="mb-6 text-4xl font-bold tracking-tight text-balance">
              赋能教师
              <br />
              <span className="text-primary">成就卓越教育</span>
            </h2>

            <p className="mb-8 text-lg text-muted-foreground leading-relaxed">
              为教师提供全方位的专业发展支持，包括教学资源、技能提升、教研协作和职业认证。
              让每一位教师都能在专业道路上持续成长，为学生提供更优质的教育。
            </p>

            <div className="flex flex-col gap-4 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/teacher">进入教师专区</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/teacher/resources">浏览资源</Link>
              </Button>
            </div>
          </div>

          {/* Right: Features Grid */}
          <div className="grid gap-4 sm:grid-cols-2">
            {teacherFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <Card key={feature.title} className="border-2 p-6">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
