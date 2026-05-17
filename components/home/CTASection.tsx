/**
 * 沈翔智学 - 最终 CTA 区域
 * 单一容器淡入动画，无内部循环动效，所有跳转使用 Link。
 */

"use client"

import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import { brandColors, creamColors } from "@/lib/design-tokens"

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
    <section className="sx-section overflow-hidden" style={{ backgroundColor: creamColors[100] }}>
      <div className="mx-auto w-[min(100%-2rem,64rem)]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="relative overflow-hidden rounded-[28px] border border-white/10 shadow-2xl"
          style={{
            background: `linear-gradient(135deg, ${brandColors[900]} 0%, ${brandColors[800]} 50%, ${brandColors[900]} 100%)`,
          }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-3xl"
              style={{ backgroundColor: brandColors[700] }}
            />
            <div
              className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-15 blur-2xl"
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
            <div className="relative w-full aspect-[16/9] md:aspect-[21/9] rounded-[var(--radius-sharp)] overflow-hidden bg-[var(--paper-50)]/10 shadow-2xl">
              <Image
                src="/images/design-mode/site-main.jpg"
                alt="沈翔智学 AI 学习伙伴"
                fill
                sizes="(min-width: 768px) 896px, 100vw"
                className="object-cover"
              />
            </div>
          </div>

          <div className="relative z-10 px-6 md:px-8 pb-10 md:pb-16 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-[var(--radius-sharp)] bg-[var(--paper-50)]/10 backdrop-blur-sm mb-6">
              <Sparkles className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
              准备好开始了吗？
            </h2>

            <p
              className="text-lg md:text-xl max-w-xl mx-auto mb-10"
              style={{ color: brandColors[100] }}
            >
              先免费体验 AI 批改与答疑，再按需选择适合的学习工具
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/chat"
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-[var(--radius-sharp)] bg-[var(--paper-50)] px-8 py-4 font-semibold shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-green-900"
                style={{ color: brandColors[900] }}
              >
                免费开始使用
                <ArrowRight className="w-5 h-5" />
              </Link>

              <Link
                href="/pricing"
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-[var(--radius-sharp)] border border-white/30 px-6 py-3 font-medium text-white transition-colors duration-200 hover:bg-[var(--paper-50)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-green-900"
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
