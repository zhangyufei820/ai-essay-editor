/**
 * 🖌 v2 首页 · Stats 朱印数据
 *
 * 4 枚朱印盖在米黄宣纸上：
 *   [批改]  [上线]  [覆盖]  [响应]
 *   10K+    2 年    K12-高中  60s
 *
 * 替换原 emerald 渐变背景 + 数字滚动 → 极简纸面排版
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { InkStagger, InkStaggerItem } from "@/components/motion/InkMotion"

const STATS = [
  { seal: "批改", value: "10,000+", caption: "已批改作文" },
  { seal: "上线", value: "2 年", caption: "稳定服务" },
  { seal: "覆盖", value: "K12 - 高中", caption: "全学段适配" },
  { seal: "响应", value: "60s", caption: "平均生成时间" },
] as const

export function StatsSealsV2() {
  return (
    <section
      data-slot="v2-stats-seals"
      className={cn("border-y border-[var(--paper-200)]", "bg-[var(--paper-100)]")}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="mb-10 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)] font-[var(--font-sans-v2)]">
            被信任的数据
          </p>
          <h2 className="mt-2 font-[var(--font-display)] text-[clamp(24px,3.5vw,32px)] font-bold text-[var(--ink-800)]">
            真实学习现场，长期使用
          </h2>
        </div>

        <InkStagger
          stagger={0.12}
          className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8"
        >
          {STATS.map((s) => (
            <InkStaggerItem key={s.seal}>
              <SealNumberCard seal={s.seal} value={s.value} caption={s.caption} />
            </InkStaggerItem>
          ))}
        </InkStagger>
      </div>
    </section>
  )
}

function SealNumberCard({
  seal,
  value,
  caption,
}: {
  seal: string
  value: string
  caption: string
}) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* 顶部小朱印 */}
      <div
        className={cn(
          "mb-3 inline-flex size-10 items-center justify-center rounded-sm border-2",
          "border-[var(--seal-500)] bg-[var(--seal-50)]/80",
          "font-[var(--font-display)] text-[12px] font-bold text-[var(--seal-500)]",
          "shadow-[0_2px_0_var(--seal-500)]"
        )}
        style={{ transform: "rotate(-4deg)" }}
        aria-hidden="true"
      >
        {seal}
      </div>

      {/* 数字 — 等宽 */}
      <div className="font-[var(--font-mono-v2)] text-[clamp(28px,4vw,40px)] font-bold tabular-nums text-[var(--ink-800)]">
        {value}
      </div>

      {/* caption */}
      <div className="mt-1 text-[13px] text-[var(--ink-500)] font-[var(--font-sans-v2)]">
        {caption}
      </div>
    </div>
  )
}
