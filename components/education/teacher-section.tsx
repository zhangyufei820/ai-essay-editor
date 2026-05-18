import { ButtonV2 as Button, CardV2 as Card } from "@/components/ui/v2"
import { TrendingUp } from "lucide-react"
import Link from "next/link"
import { IconBanzhuren, IconEnglish, IconSealStar } from "@/components/icons/v2"

const teacherFeatures = [
  {
    icon: IconEnglish,
    title: "教学资源库",
    description: "海量优质教案、课件、试题资源",
  },
  {
    icon: TrendingUp,
    title: "专业成长",
    description: "教学技能提升、学科前沿动态",
  },
  {
    icon: IconBanzhuren,
    title: "教研协作",
    description: "跨校交流、集体备课、经验分享",
  },
  {
    icon: IconSealStar,
    title: "认证体系",
    description: "专业发展证书、教学能力认证",
  },
]

export function TeacherSection() {
  return (
    <section className="relative py-20 bg-gradient-to-b from-primary/5 to-muted/30">
      <div className="container mx-auto px-4">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Left: Content */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-[var(--ink-50)] px-4 py-2 text-sm font-medium text-[var(--ink-700)] shadow-md">
              <IconBanzhuren className="h-4 w-4" />
              教师专业发展
            </div>

            <h2 className="mb-6 text-4xl font-bold tracking-tight text-balance">
              赋能教师
              <br />
              <span className="text-[var(--ink-700)]">成就卓越教育</span>
            </h2>

            <p className="mb-8 text-lg text-[var(--ink-500)] leading-relaxed">
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
          <div className="grid gap-6 sm:grid-cols-2">
            {teacherFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <Card 
                  key={feature.title} 
                  className="group relative overflow-hidden rounded-[var(--radius-sharp)] border-2 border-[var(--paper-200)]/50 bg-[var(--paper-50)] p-6 shadow-lg transition-all duration-300 hover:border-[var(--ink-500)] hover:shadow-xl hover:scale-[1.02]"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="relative">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-sharp)] bg-gradient-to-br from-primary/20 to-primary/10 text-[var(--ink-700)] shadow-md transition-all duration-300 group-hover:scale-110">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-lg font-bold">{feature.title}</h3>
                    <p className="text-sm text-[var(--ink-500)] leading-relaxed">{feature.description}</p>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
