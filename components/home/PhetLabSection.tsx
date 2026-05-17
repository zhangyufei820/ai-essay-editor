"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Atom, BadgeCheck, Calculator, FlaskConical } from "lucide-react"
import { PHET_SIMS } from "@/lib/phet/sims-catalog"
import { brandColors, slateColors } from "@/lib/design-tokens"

const featuredSims = PHET_SIMS.filter((sim) =>
  ["forces-and-motion-basics", "density", "area-builder"].includes(sim.id),
)

export function PhetLabSection() {
  return (
    <section id="lab" className="relative overflow-hidden bg-[var(--paper-50)] py-20 md:py-28">
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `linear-gradient(${brandColors[600]} 1px, transparent 1px), linear-gradient(90deg, ${brandColors[600]} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 md:px-6 lg:grid-cols-[0.95fr_1.05fr]">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
        >
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--ink-100)] bg-[var(--ink-50)] px-3 py-1 text-xs font-semibold text-[var(--ink-700)]">
            <FlaskConical className="h-3.5 w-3.5" />
            PhET 互动实验
          </span>
          <h2 className="text-3xl font-bold leading-tight text-[var(--ink-900)] md:text-5xl">
            把数学和物理知识
            <span className="block">变成可以动手玩的实验</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-[var(--ink-600)] md:text-lg">
            内置 30 个 PhET HTML5 模拟实验，学生可以调参数、看变化、做观察，再把实验结果联动到闪卡、测验和动画讲解。
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/lab"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-sharp)] bg-[var(--seal-500)] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--ink-700)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-500)]"
            >
              进入互动实验室
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/lab/forces-and-motion-basics"
              className="inline-flex h-12 items-center justify-center rounded-[var(--radius-sharp)] border border-[var(--ink-200)] bg-[var(--paper-50)] px-6 text-sm font-semibold text-[var(--ink-700)] transition hover:bg-[var(--ink-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-500)]"
            >
              体验力和运动
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="grid gap-4"
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[var(--radius-soft)] border border-[var(--ink-900)]/10 bg-[var(--ink-50)] p-4">
              <Atom className="mb-3 h-6 w-6 text-[var(--ink-700)]" />
              <div className="text-2xl font-bold text-[var(--ink-900)]">30</div>
              <p className="mt-1 text-sm text-[var(--ink-600)]">数学/物理实验</p>
            </div>
            <div className="rounded-[var(--radius-soft)] border border-[var(--ink-900)]/10 bg-[var(--paper-50)] p-4">
              <Calculator className="mb-3 h-6 w-6 text-[var(--ink-700)]" />
              <div className="text-2xl font-bold text-[var(--ink-900)]">K-12</div>
              <p className="mt-1 text-sm text-[var(--ink-600)]">按年级筛选</p>
            </div>
            <div className="rounded-[var(--radius-soft)] border border-[var(--ink-900)]/10 bg-[var(--paper-50)] p-4">
              <BadgeCheck className="mb-3 h-6 w-6 text-[var(--ink-700)]" />
              <div className="text-2xl font-bold text-[var(--ink-900)]">15</div>
              <p className="mt-1 text-sm text-[var(--ink-600)]">完成奖励积分</p>
            </div>
          </div>

          <div className="rounded-[var(--radius-soft)] border border-[var(--ink-900)]/10 bg-[var(--paper-50)] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--ink-900)]">热门实验</h3>
              <Link href="/lab" className="text-sm font-medium text-[var(--ink-700)] hover:text-[var(--ink-700)]/80">
                查看全部
              </Link>
            </div>
            <div className="grid gap-3">
              {featuredSims.map((sim) => (
                <Link
                  key={sim.id}
                  href={`/lab/${sim.id}`}
                  className="group flex items-center justify-between gap-4 rounded-[var(--radius-soft)] border border-transparent bg-[var(--paper-50)] px-4 py-3 transition hover:border-[var(--ink-200)] hover:bg-[var(--ink-50)]"
                >
                  <div>
                    <div className="text-sm font-semibold text-[var(--ink-900)]">{sim.name_zh}</div>
                    <div className="mt-1 text-xs" style={{ color: slateColors[500] }}>
                      {sim.topics.slice(0, 3).join(" · ")}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-400)] transition group-hover:translate-x-1 group-hover:text-[var(--ink-700)]" />
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default PhetLabSection
