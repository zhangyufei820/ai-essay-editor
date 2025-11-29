import { Button } from "@/components/ui/button"
import { BookOpen, GraduationCap, Users } from "lucide-react"
import Link from "next/link"

export function EducationHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 pt-32 pb-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <GraduationCap className="h-4 w-4" />
            全学段·全学科·AI驱动
          </div>

          <h1 className="mb-6 text-5xl font-bold tracking-tight text-balance md:text-6xl lg:text-7xl">
            智能教育平台
            <br />
            <span className="text-primary">点亮每一个学习梦想</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground text-pretty leading-relaxed md:text-xl">
            从小学到大学，涵盖所有学科领域。AI智能批改、个性化学习方案、教师专业发展，
            为学生和教师提供全方位的教育支持。
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" asChild>
              <Link href="/chat">
                <BookOpen className="mr-2 h-5 w-5" />
                开始学习
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent" asChild>
              <Link href="/teacher">
                <Users className="mr-2 h-5 w-5" />
                教师专区
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 transform">
          <div className="h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        </div>
      </div>
    </section>
  )
}
