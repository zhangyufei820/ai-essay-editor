"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight, Sparkles } from "lucide-react"
import { WeChatDialog } from "@/components/wechat-dialog"
import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export function Hero() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-primary/50 bg-primary/10 px-4 py-2 text-sm font-medium">
            <Badge className="bg-primary text-primary-foreground">新增</Badge>
            <span className="text-foreground">徐贲式论述文批改指导</span>
          </div>

          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">AI驱动的专业作文批改服务</span>
          </div>

          <h1 className="mb-6 text-balance text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
            让每篇作文都
            <span className="text-primary">焕发光彩</span>
          </h1>

          <p className="mb-8 text-balance text-lg text-muted-foreground md:text-xl lg:text-2xl leading-relaxed">
            融合汪曾祺、王小波、简媜等文学大师风格
            <br />
            新增徐贲式学者型论述文专业指导
            <br />
            为学生习作提供深度点评、创意建议和个性化指导
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/chat">
              <Button size="lg" className="gap-2">
                立即开始批改
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" onClick={() => setDialogOpen(true)}>
              微信注册
            </Button>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 border-t border-border pt-8">
            <div>
              <div className="text-3xl font-bold text-primary">10,000+</div>
              <div className="text-sm text-muted-foreground">学生用户</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">50,000+</div>
              <div className="text-sm text-muted-foreground">批改作文</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">98%</div>
              <div className="text-sm text-muted-foreground">满意度</div>
            </div>
          </div>
        </div>
      </div>

      <WeChatDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  )
}
