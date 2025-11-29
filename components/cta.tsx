"use client"

import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { WeChatDialog } from "@/components/wechat-dialog"
import { useState } from "react"
import Link from "next/link"

export function CTA() {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <section className="py-20 md:py-32">
      <div className="container px-4">
        <div className="mx-auto max-w-3xl rounded-2xl bg-primary p-8 md:p-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-primary-foreground md:text-4xl lg:text-5xl mb-4">
            准备好让作文焕发光彩了吗？
          </h2>
          <p className="text-lg text-primary-foreground/90 mb-8 leading-relaxed">立即注册，开启AI智能作文批改之旅</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/chat">
              <Button size="lg" variant="secondary" className="gap-2">
                立即开始批改
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent"
              onClick={() => setDialogOpen(true)}
            >
              微信注册
            </Button>
          </div>
        </div>
      </div>

      <WeChatDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  )
}
