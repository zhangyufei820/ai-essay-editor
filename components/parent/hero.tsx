import { Button } from "@/components/ui/button"
import { Heart, Users, TrendingUp, Sparkles } from "lucide-react"
import Link from "next/link"

export function ParentHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 to-background py-20 lg:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Heart className="h-4 w-4" />
            与孩子一起成长
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight lg:text-6xl">
            家长专区
            <span className="block text-primary">陪伴孩子，共同学习</span>
          </h1>
          <p className="mb-8 text-lg text-muted-foreground lg:text-xl leading-relaxed">
            通过AI技术赋能家庭教育，建立良好的亲子学习关系，
            <br className="hidden lg:block" />
            见证孩子的每一步成长，共创美好学习体验
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link href="/auth/sign-up">
              <Button size="lg" className="w-full sm:w-auto gap-2">
                <Sparkles className="h-5 w-5" />
                开始陪伴之旅
              </Button>
            </Link>
            <Link href="/#features">
              <Button size="lg" variant="outline" className="w-full sm:w-auto bg-transparent">
                了解更多功能
              </Button>
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div className="text-sm font-medium">亲子互动</div>
              <div className="text-xs text-muted-foreground">增进亲子关系</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div className="text-sm font-medium">成长追踪</div>
              <div className="text-xs text-muted-foreground">见证每步成长</div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div className="text-sm font-medium">AI共学</div>
              <div className="text-xs text-muted-foreground">智能学习助手</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
