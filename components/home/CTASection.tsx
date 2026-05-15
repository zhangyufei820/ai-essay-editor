/**
 * 沈翔智学 - 最终 CTA 区域（精简版）
 * 单一容器淡入动画，无内部动效，所有跳转使用 <Link>
 */

"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import { brandColors, creamColors } from "@/lib/design-tokens"
import { cn } from "@/lib/utils"

const containerVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1] as const },
  },
}

export function CTASection() {
  return (
    <section className="overflow-hidden py-24 md:py-32" style={{ backgroundColor: creamColors[100] }}>
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="relative overflow-hidden rounded-3xl"
          style={{
            background: `linear-gradient(135deg, ${brandColors[900]} 0%, ${brandColors[800]} 50%, ${brandColors[900]} 100%)`,
          }}
        >
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute right-0 top-0 h-64 w-64 rounded-full opacity-20 blur-3xl"
              style={{ backgroundColor: brandColors[700] }}
            />
            <div
              className="absolute bottom-0 left-0 h-48 w-48 rounded-full opacity-15 blur-2xl"
              style={{ backgroundColor: brandColors[600] }}
            />
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "32px 32px",
              }}
            />
          </div>
          <div className="relative z-10 p-6 md:p-8">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-white/10 shadow-2xl md:aspect-[21/9]">
              <Image
                src="/images/design-mode/首页主图.jpg"
                alt="沈翔智学 - AI 学习伙伴"
                fill
                sizes="(min-width: 768px) 896px, 100vw"
                className="object-cover"
              />
            </div>
          </div>
          <div className="relative z-10 px-6 pb-10 text-center md:px-8 md:pb-16">
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <Sparkles className="h-7 w-7 text-white" />
            </div>

            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl lg:text-5xl">
              准备好开始了吗？
            </h2>

            <p className="mx-auto mb-10 max-w-xl text-lg md:text-xl" style={{ color: brandColors[100] }}>
              先免费体验 AI 批改与答疑，再按需选择套餐
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/chat"
                prefetch={false}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 font-semibold shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl"
                )}
                style={{ color: brandColors[900] }}
              >
                免费开始使用
                <ArrowRight className="h-5 w-5" />
              </Link>

              <Link
                href="/pricing"
                prefetch={false}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border-2 border-white/30 px-6 py-3 font-medium text-white transition-colors duration-200 hover:bg-white/10"
                )}
              >
                查看价格方案
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default CTASection
