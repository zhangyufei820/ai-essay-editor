import type { Metadata } from "next"
import { PhetSimBrowserLoader } from "@/components/phet/PhetSimBrowserLoader"

export const metadata: Metadata = {
  title: "互动实验室 | 沈翔智学",
  description: "浏览 PhET 免费互动模拟实验，进行数学与物理探究学习。",
}

export default function LabPage() {
  return (
    <main className="min-h-screen bg-[var(--paper-50)] text-[var(--ink-900)] dark:bg-[var(--paper-50)] dark:text-[var(--ink-50)]">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 overflow-hidden rounded-[var(--radius-soft)] border border-[var(--ink-200)] bg-[var(--paper-50)] p-6 shadow-sm dark:border-[var(--ink-200)]/10 dark:bg-[var(--paper-100)] sm:p-8">
          <div className="max-w-4xl">
            <p className="text-sm font-medium text-[var(--ink-700)] dark:text-[var(--ink-200)]">PhET Interactive Simulations</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl font-[var(--font-display)]">互动实验室</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--ink-600)] dark:text-[var(--ink-300)]">
              170+ 免费互动模拟实验，浏览器即用，由科罗拉多大学开发。这里精选适合 K12 数学和物理学习的实验，帮助学生把公式、图像和真实现象连起来。
            </p>
          </div>
        </header>

        <PhetSimBrowserLoader />
      </section>
    </main>
  )
}
