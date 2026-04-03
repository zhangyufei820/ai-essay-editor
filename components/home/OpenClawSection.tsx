/**
 * 🤖 OpenClaw 专区组件
 *
 * 展示 OpenClaw 通用 AI 助手，作为独立版块位于创意生成下方
 */

"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { Bot, Sparkles, ArrowRight } from "lucide-react"
import { brandColors, slateColors } from "@/lib/design-tokens"

// ============================================
// OpenClaw 区域配置
// ============================================

const FEATURES = [
  {
    title: "智能问答",
    description: "随时提问，即时解答各类学习和生活问题"
  },
  {
    title: "写作辅助",
    description: "帮你润色、修改、校对各类文字内容"
  },
  {
    title: "代码助手",
    description: "编程问题解答，代码调试与优化建议"
  },
  {
    title: "翻译助手",
    description: "多语言翻译，精准传达原意"
  },
]

// ============================================
// 动画配置
// ============================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.34, 1.56, 0.64, 1]
    }
  }
}

// ============================================
// 主组件
// ============================================

export function OpenClawSection() {
  return (
    <section
      id="openclaw"
      className="py-24 md:py-32 relative overflow-hidden"
      style={{ backgroundColor: "#FAFAFA" }}
    >
      {/* 背景装饰 - 科技感网格 */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(${brandColors[600]} 1px, transparent 1px),
            linear-gradient(90deg, ${brandColors[600]} 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px"
        }}
      />

      {/* 背景光晕 */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${brandColors[200]}20 0%, transparent 70%)`,
        }}
      />

      <div className="max-w-6xl mx-auto px-4 md:px-6 relative z-10">
        {/* 页面标题区域 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          {/* 小标签 */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
            style={{
              background: `linear-gradient(135deg, ${brandColors[600]}15 0%, ${brandColors[600]}08 100%)`,
              border: `1px solid ${brandColors[600]}30`,
            }}
            whileHover={{
              boxShadow: `0 0 30px ${brandColors[600]}20`,
            }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              animate={{
                boxShadow: [
                  `0 0 6px ${brandColors[600]}`,
                  `0 0 12px ${brandColors[600]}`,
                  `0 0 6px ${brandColors[600]}`,
                ],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ backgroundColor: brandColors[600] }}
            />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: brandColors[600], letterSpacing: "2px" }}
            >
              OpenClaw
            </span>
          </motion.div>

          {/* 主标题 */}
          <h2
            className="text-4xl md:text-5xl mb-6 font-bold"
            style={{
              color: brandColors[800],
              letterSpacing: "1px",
            }}
          >
            通用智能助手
          </h2>

          {/* 副标题 */}
          <motion.p
            className="text-base md:text-lg max-w-2xl mx-auto"
            style={{ color: slateColors[600] }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            OpenClaw 是您的专属 AI 助手，可以帮助您完成各种任务
          </motion.p>
        </motion.div>

        {/* OpenClaw 卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-4xl mx-auto mb-16"
        >
          <div
            className="relative rounded-3xl p-8 md:p-12 overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.90)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(14, 58, 31, 0.06)",
              boxShadow: "0 8px 40px rgba(14, 58, 31, 0.06), 0 0 80px rgba(14, 58, 31, 0.03)",
            }}
          >
            {/* 背景光晕 */}
            <motion.div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full blur-3xl pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${brandColors[200]}30 0%, transparent 70%)`,
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{ duration: 4, repeat: Infinity }}
            />

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
              {/* 左侧：图标和标题 */}
              <div className="flex flex-col items-center md:items-start gap-4 flex-1">
                {/* OpenClaw 图标 */}
                <motion.div
                  className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${brandColors[600]} 0%, ${brandColors[700]} 100%)`,
                    boxShadow: `0 8px 30px ${brandColors[600]}40`,
                  }}
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                >
                  <Bot className="w-10 h-10 text-white" />
                  {/* 呼吸光效 */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      boxShadow: `0 0 30px ${brandColors[600]}50`,
                    }}
                    animate={{
                      opacity: [0.3, 0.6, 0.3],
                      scale: [1, 1.05, 1],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </motion.div>

                <div className="text-center md:text-left">
                  <h3 className="text-2xl font-bold mb-2" style={{ color: brandColors[800] }}>
                    Open Claw
                  </h3>
                  <p className="text-sm" style={{ color: slateColors[500] }}>
                    AI Assistant · 通用智能助手
                  </p>
                </div>

                <Link href="/chat/open-claw">
                  <motion.button
                    className="group relative h-12 px-8 text-base font-semibold rounded-2xl text-white overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${brandColors[600]} 0%, ${brandColors[700]} 100%)`,
                      boxShadow: `0 4px 20px ${brandColors[600]}40`,
                    }}
                    whileHover={{
                      scale: 1.03,
                      boxShadow: `0 8px 30px ${brandColors[500]}50`,
                    }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className="relative flex items-center gap-2">
                      开始对话
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </motion.button>
                </Link>
              </div>

              {/* 右侧：功能列表 */}
              <div className="flex-1 grid grid-cols-2 gap-4">
                {FEATURES.map((feature, index) => (
                  <motion.div
                    key={index}
                    className="p-4 rounded-xl"
                    style={{
                      background: `${brandColors[50]}`,
                      border: `1px solid ${brandColors[100]}`,
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    whileHover={{
                      y: -2,
                      boxShadow: `0 4px 20px ${brandColors[100]}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4" style={{ color: brandColors[600] }} />
                      <span className="text-sm font-medium" style={{ color: brandColors[700] }}>
                        {feature.title}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: slateColors[500] }}>
                      {feature.description}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default OpenClawSection