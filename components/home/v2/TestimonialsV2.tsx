/**
 * 🖌 v2 首页 · 用户反馈三视角
 */

import * as React from "react"
import { Quote } from "lucide-react"
import { cn } from "@/lib/utils"
import { CardV2, CardV2Content } from "@/components/ui/v2/card"
import { InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"

interface Testimonial {
  id: string
  content: string
  author: string
  role: string
  initial: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: "parent",
    content:
      "孩子以前写完作文只知道分数，现在能看到哪里要改、下一篇怎么练，家长沟通也轻松很多。",
    author: "王女士",
    role: "初中学生家长",
    initial: "王",
  },
  {
    id: "student",
    content:
      "AI 会把我的作文拆开讲，不只是说好不好，还告诉我哪些句子可以展开，修改起来有方向。",
    author: "刘同学",
    role: "初三学生",
    initial: "刘",
  },
  {
    id: "teacher",
    content:
      "错题反馈适合课后复盘，能把共性问题先整理出来，老师再针对性讲解会更省时间。",
    author: "孙老师",
    role: "语文教师",
    initial: "孙",
  },
]

export function TestimonialsV2() {
  return (
    <section
      data-slot="v2-testimonials"
      className="bg-[var(--paper-50)]"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-24">
        <div className="mb-10 max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            真实场景反馈
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-[clamp(28px,4vw,40px)] font-bold leading-[1.2] text-[var(--ink-800)]">
            学生 / 家长 / 老师 三方共享同一份学习反馈
          </h2>
        </div>

        <InkStagger
          stagger={0.1}
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {TESTIMONIALS.map((t) => (
            <InkStaggerItem key={t.id}>
              <TestimonialCard testimonial={t} />
            </InkStaggerItem>
          ))}
        </InkStagger>
      </div>
    </section>
  )
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <CardV2 variant="paper" className="relative h-full overflow-hidden">
      <CardV2Content className="flex flex-col gap-5">
        <Quote className="size-5 text-[var(--seal-500)]" aria-hidden="true" />
        <p className="flex-1 font-[var(--font-display)] text-[16px] leading-[1.8] text-[var(--ink-800)]">
          &ldquo;{testimonial.content}&rdquo;
        </p>
        <div className="flex items-center gap-3 border-t border-[var(--paper-200)] pt-4">
          <div className={cn(
            "flex size-9 items-center justify-center rounded-full",
            "bg-[var(--ink-100)] text-[var(--ink-700)]",
            "font-[var(--font-display)] text-[14px] font-bold"
          )}>
            {testimonial.initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-[var(--font-sans-v2)] text-[13px] font-bold text-[var(--ink-800)]">
              {testimonial.author}
            </div>
            <div className="text-[12px] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
              {testimonial.role}
            </div>
          </div>
        </div>
      </CardV2Content>
    </CardV2>
  )
}
