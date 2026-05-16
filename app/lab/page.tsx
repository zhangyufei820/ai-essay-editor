import type { Metadata } from "next"
import { PhetSimBrowserLoader } from "@/components/phet/PhetSimBrowserLoader"

export const metadata: Metadata = {
  title: "互动实验室 | 沈翔智学",
  description: "浏览 PhET 免费互动模拟实验，进行数学与物理探究学习。",
}

export default function LabPage() {
  return (
    <main className="min-h-screen bg-[#F7FAF9] text-emerald-950 dark:bg-slate-950 dark:text-emerald-50">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 overflow-hidden rounded-lg border border-emerald-900/10 bg-white p-6 shadow-sm dark:border-emerald-200/10 dark:bg-slate-900 sm:p-8">
          <div className="max-w-4xl">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">PhET Interactive Simulations</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">互动实验室</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
              170+ 免费互动模拟实验，浏览器即用，由科罗拉多大学开发。这里精选适合 K12 数学和物理学习的实验，帮助学生把公式、图像和真实现象连起来。
            </p>
          </div>
        </header>

        <PhetSimBrowserLoader />
      </section>
    </main>
  )
}
