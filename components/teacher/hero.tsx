import { Button } from "@/components/ui/button"
import { Award, BookOpen, Users } from "lucide-react"
import Link from "next/link"

export function TeacherHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 pt-32 pb-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Award className="h-4 w-4" />
            教师专业发展平台
          </div>

          <h1 className="mb-6 text-5xl font-bold tracking-tight text-balance md:text-6xl">
            教师专区
            <br />
            <span className="text-primary">专业成长的引擎</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground text-pretty leading-relaxed md:text-xl">
            为教师提供丰富的教学资源、专业发展课程、教研协作工具和认证体系， 助力每一位教师在职业道路上持续精进。
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link href="/teacher/resources">
                <BookOpen className="mr-2 h-5 w-5" />
                浏览资源库
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent" asChild>
              <Link href="/teacher/community">
                <Users className="mr-2 h-5 w-5" />
                加入教研社区
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
