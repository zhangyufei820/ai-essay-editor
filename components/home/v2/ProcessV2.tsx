/**
 * 🖌 v2 首页 · 三步学习闭环
 *
 * 把"上传 → AI → 复盘"画成 3 张并排卡片，中间用墨色虚线连接。
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { InkReveal } from "@/components/motion/InkMotion"
import { IconDiagnosis, IconProblem, IconSealCheck } from "@/components/icons/v2"

interface Step {
  number: string
  icon: React.ComponentType<any>
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    number: "01",
    icon: IconDiagnosis,
    title: "上传材料",
    description: "作文、试卷、题目或学习问题都可以作为入口。",
  },
  {
    number: "02",
    icon: IconSealCheck,
    title: "生成反馈",
    description: "AI 把问题、原因、修改方向和训练建议整理成清晰清单。",
  },
  {
    number: "03",
    icon: IconProblem,
    title: "复盘提升",
    description: "学生按建议修改和练习，家长老师都能基于同一份反馈跟进。",
  },
]

export function ProcessV2() {
  return (
    <section
      data-slot="v2-process"
      className={cn(
        "border-t border-[var(--paper-200)]",
        "bg-[var(--paper-100)]"
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-16 md:px-6 md:py-24">
        <InkReveal as="div" className="mb-12 max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            学习闭环
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-[clamp(28px,4vw,40px)] font-bold leading-[1.2] text-[var(--ink-800)]">
            从发现问题到真正改进
          </h2>
          <p className="mt-3 text-[15px] leading-[1.7] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            首页不再讲复杂模型编排，只呈现学生每天能用上的路径。
          </p>
        </InkReveal>

        {/* 三步卡片 + 桌面端连接线 */}
        <div className="relative">
          {/* 桌面端连接虚线 */}
          <div
            aria-hidden="true"
            className="absolute left-[16.66%] right-[16.66%] top-7 hidden h-px md:block"
            style={{
              backgroundImage: "linear-gradient(to right, var(--paper-300) 50%, transparent 0%)",
              backgroundSize: "8px 1px",
              backgroundRepeat: "repeat-x",
            }}
          />

          <ol className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
            {STEPS.map((step, idx) => (
              <li key={step.number} className="relative">
                <InkReveal as="div" delay={idx * 0.1}>
                  <StepCard {...step} />
                </InkReveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function StepCard({ number, icon: Icon, title, description }: Step) {
  return (
    <div className="flex flex-col items-start gap-4">
      {/* 编号圆 + 图标 */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex size-14 items-center justify-center rounded-full",
            "bg-[var(--ink-700)] text-white",
            "font-[var(--font-display)] text-[18px] font-black",
            "shadow-[0_2px_0_var(--ink-800)]"
          )}
          aria-hidden="true"
        >
          {number}
        </span>
        <span className="inline-flex size-10 items-center justify-center rounded-[var(--radius-soft)] bg-[var(--ink-50)] text-[var(--ink-700)]">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>

      <div>
        <h3 className="font-[var(--font-display)] text-[20px] font-bold text-[var(--ink-800)]">
          {title}
        </h3>
        <p className="mt-2 text-[14px] leading-[1.7] text-[var(--ink-500)] font-[var(--font-sans-v2)] max-w-sm">
          {description}
        </p>
      </div>
    </div>
  )
}
