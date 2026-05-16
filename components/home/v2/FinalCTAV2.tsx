/**
 * 🖌 v2 首页 · 最终 CTA
 *
 * 极简版本：深墨色全屏 + 一句宋体大字 + 朱印按钮
 */

import * as React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { InkReveal } from "@/components/motion/InkMotion"

export function FinalCTAV2() {
  return (
    <section
      data-slot="v2-final-cta"
      className={cn(
        "relative overflow-hidden",
        "bg-[var(--ink-900)] text-[var(--paper-50)]"
      )}
    >
      {/* 装饰 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(178, 58, 44, 0.12) 0%, transparent 40%)," +
            "radial-gradient(circle at 90% 30%, rgba(135, 185, 140, 0.08) 0%, transparent 50%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-4xl px-4 py-20 text-center md:py-28">
        <InkReveal as="div">
          <h2 className="font-[var(--font-display)] text-[clamp(32px,5vw,56px)] font-black leading-[1.1] tracking-[-0.015em]">
            今天就让 AI 看一篇
            <br className="sm:hidden" />
            你的作文。
          </h2>

          <p className="mt-5 text-[15px] leading-[1.7] text-[var(--paper-200)] sm:text-[17px] font-[var(--font-sans-v2)]">
            60 秒生成可读、可改、可分享的报告。
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ButtonV2 asChild variant="seal" size="lg">
              <Link href="/chat/standard" prefetch={false}>
                立即开始批改
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </ButtonV2>
            <ButtonV2
              asChild
              variant="ghost"
              size="lg"
              className="text-[var(--paper-200)] hover:bg-[var(--paper-50)]/10 hover:text-white"
            >
              <Link href="/pricing" prefetch={false}>
                查看套餐
              </Link>
            </ButtonV2>
          </div>
        </InkReveal>
      </div>
    </section>
  )
}
