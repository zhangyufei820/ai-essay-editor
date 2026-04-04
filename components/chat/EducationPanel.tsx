/**
 * 🎓 教育专区面板 - "灵感圣殿" 教育版
 *
 * 设计哲学：专注教育场景的浮动岛屿
 * 关键词：作文批改、教学助手、数学、英语、备课、班主任
 */

"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, GraduationCap } from "lucide-react"
import { ArtisticThinkingIcon } from "@/components/icons/ArtisticThinkingIcons"

// ============================================
// 🎨 Design Tokens - "智慧之光" 配色系统
// ============================================

const TOKENS = {
  // 主色调 - 深邃墨绿 (Deep Ink Green)
  primary: {
    50:  "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#14532d",  // 核心色
    900: "#0d3a1f",  // 深邃色
    950: "#052e16",  // 极深色
  },

  // 纸墨灰背景 (Paper Grey)
  surface: {
    white:   "#FEFEFA",  // 暖白 - 模拟纸张
    50:      "#F8FAF8",  // 微暖灰白
    100:     "#F1F5F3",  // 浅纸灰
    200:     "#E8EDEA",  // 纸灰
    300:     "#D4DED9",  // 中纸灰
  },

  // 极光荧光绿 (Aurora Glow) - 微量点缀
  aurora: {
    glow:    "#86EFAC",  // 灵感迸发色
    soft:    "rgba(134, 239, 172, 0.15)",  // 极光微光
  },

  // 文字层级
  text: {
    primary:   "rgba(14, 58, 31, 0.90)",   // 深邃墨绿文字
    secondary: "rgba(14, 58, 31, 0.60)",   // 次级文字
    tertiary:  "rgba(14, 58, 31, 0.40)",   // 弱化文字
  },

  // 玻璃态
  glass: {
    light:   "rgba(255, 255, 255, 0.70)",
    medium:  "rgba(255, 255, 255, 0.50)",
    heavy:   "rgba(255, 255, 255, 0.25)",
  },

  // 阴影 - 柔和弥散
  shadow: {
    soft:  "0 4px 24px rgba(14, 58, 31, 0.04), 0 8px 48px rgba(14, 58, 31, 0.02)",
    glow:  "0 0 40px rgba(14, 58, 31, 0.08), 0 0 80px rgba(14, 58, 31, 0.04)",
  }
} as const

// ============================================
// 类型定义
// ============================================

interface EducationAgent {
  key: string
  name: string
  description: string
  badge?: string
  href: string
}

interface EducationPanelProps {
  isOpen: boolean
  onClose: () => void
}

// ============================================
// 教育智能体数据
// ============================================

const EDUCATION_AGENTS: EducationAgent[] = [
  {
    key: "standard",
    name: "作文批改",
    description: "专业作文分析与点评",
    href: "/chat/standard",
  },
  {
    key: "teaching-pro",
    name: "教学助手",
    description: "教学评价与反馈",
    href: "/chat/teaching-pro",
  },
  {
    key: "quanquan-math",
    name: "数学助手",
    description: "一步步解题指导",
    href: "/chat/quanquan-math",
  },
  {
    key: "quanquan-english",
    name: "英语助手",
    description: "综合语言学习",
    href: "/chat/quanquan-english",
  },
  {
    key: "beike-pro",
    name: "备课助手",
    description: "智能备课准备",
    href: "/chat/beike-pro",
  },
  {
    key: "banzhuren",
    name: "班主任",
    description: "班级管理与沟通",
    href: "/chat/banzhuren",
  },
]

// ============================================
// 教育专区面板组件
// ============================================

export function EducationPanel({ isOpen, onClose }: EducationPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 - 极微模糊 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-40"
            style={{ background: "rgba(14, 58, 31, 0.15)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* 滑出面板 */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            className="fixed left-0 top-0 bottom-0 w-full sm:w-[380px] z-50 flex flex-col"
            style={{
              background: "rgba(255, 255, 255, 0.80)",
              backdropFilter: "blur(30px) saturate(200%)",
              WebkitBackdropFilter: "blur(30px) saturate(200%)",
              borderRight: "1px solid rgba(14, 58, 31, 0.04)",
              boxShadow: "0 0 100px rgba(14, 58, 31, 0.06), 0 0 200px rgba(14, 58, 31, 0.03), 0 25px 50px rgba(14, 58, 31, 0.04)",
            }}
          >
            {/* 顶部极光光条 */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(134, 239, 172, 0.5) 30%, rgba(134, 239, 172, 0.8) 50%, rgba(134, 239, 172, 0.5) 70%, transparent 100%)",
              }}
            />
            <motion.div
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(134, 239, 172, 0.5) 30%, rgba(134, 239, 172, 0.8) 50%, rgba(134, 239, 172, 0.5) 70%, transparent 100%)",
              }}
              animate={{
                opacity: [0.5, 1, 0.5],
                scaleX: [0.8, 1, 0.8],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* 扫描光效 */}
            <motion.div
              className="absolute left-0 right-0 h-20 pointer-events-none z-50"
              style={{
                background: "linear-gradient(180deg, rgba(134, 239, 172, 0.15) 0%, transparent 100%)",
                filter: "blur(8px)",
                top: "-20px"
              }}
              initial={{ y: "-100%" }}
              animate={{ y: "calc(100vh + 100%)" }}
              transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
            />

            {/* 头部 - 教育专区导览 */}
            <motion.div
              className="flex items-center justify-between px-6 py-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <motion.div
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 }}
              >
                {/* 智慧光环 */}
                <div className="relative">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #0d3a1f 0%, #14532d 100%)",
                      boxShadow: "0 4px 20px rgba(14, 58, 31, 0.25), 0 0 40px rgba(134, 239, 172, 0.1)",
                    }}
                  >
                    <GraduationCap className="w-5 h-5 text-white" />
                  </div>
                  {/* 呼吸光环 */}
                  <motion.div
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "transparent",
                      boxShadow: "0 0 20px rgba(134, 239, 172, 0.3)",
                    }}
                    animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.1, 1] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  />
                </div>

                <div>
                  <h2
                    className="text-base font-semibold tracking-[0.5px]"
                    style={{ color: TOKENS.primary[800], letterSpacing: "1.5px" }}
                  >
                    教育专区
                  </h2>
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: TOKENS.text.tertiary, letterSpacing: "2px", textTransform: "uppercase" }}
                  >
                    EDUCATION ZONE
                  </p>
                </div>
              </motion.div>

              <motion.button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
                style={{ background: "rgba(14, 58, 31, 0.04)" }}
                whileHover={{ background: "rgba(14, 58, 31, 0.08)" }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                transition={{ delay: 0.2 }}
              >
                <X className="w-4.5 h-4.5" style={{ color: TOKENS.text.secondary }} />
              </motion.button>
            </motion.div>

            {/* 教育智能体网格 */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              <div className="grid grid-cols-2 gap-4">
                {EDUCATION_AGENTS.map((agent, index) => (
                  <motion.div
                    key={agent.key}
                    initial={{ opacity: 0, y: 30, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      delay: 0.2 + index * 0.08,
                      duration: 0.5,
                      ease: [0.32, 0.72, 0, 1],
                    }}
                  >
                    <FloatingIslandCard agent={agent} onClick={onClose} />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* 底部 - 诗意引导 */}
            <motion.div
              className="px-6 py-5"
              style={{ borderTop: "1px solid rgba(14, 58, 31, 0.04)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <motion.div
                className="py-4 px-4 rounded-2xl text-center"
                style={{
                  background: "linear-gradient(135deg, rgba(134, 239, 172, 0.06) 0%, rgba(134, 239, 172, 0.02) 100%)",
                  border: "1px solid rgba(134, 239, 172, 0.1)",
                }}
                animate={{
                  boxShadow: [
                    "0 0 20px rgba(134, 239, 172, 0.05)",
                    "0 0 40px rgba(134, 239, 172, 0.08)",
                    "0 0 20px rgba(134, 239, 172, 0.05)",
                  ],
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <p
                  className="text-xs tracking-[3px]"
                  style={{ color: TOKENS.text.tertiary, letterSpacing: "4px" }}
                >
                  选 择 教 育 智 能 体
                </p>
                <p
                  className="text-[10px] mt-2"
                  style={{ color: TOKENS.text.tertiary, letterSpacing: "1px" }}
                >
                  开启智慧学习之旅
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ============================================
// 浮动岛屿卡片 - "教育展品"
// ============================================

function FloatingIslandCard({
  agent,
  onClick,
}: {
  agent: EducationAgent
  onClick: () => void
}) {
  const isRecommended = agent.badge === "推荐"

  return (
    <motion.a
      href={agent.href}
      onClick={onClick}
      className="group relative block p-5 rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: "rgba(255, 255, 255, 0.60)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow: "0 4px 24px rgba(14, 58, 31, 0.04), 0 8px 48px rgba(14, 58, 31, 0.02)",
        transition: "all 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
      whileHover={{
        y: -4,
        boxShadow: "0 8px 32px rgba(14, 58, 31, 0.08), 0 0 60px rgba(134, 239, 172, 0.08)",
      }}
      whileTap={{ scale: 0.97 }}
    >
      {/* 推荐状态 - 极光光晕 */}
      {isRecommended && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, rgba(134, 239, 172, 0.12) 0%, transparent 70%)",
          }}
          animate={{
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* 推荐标签 - 绿色呼吸光点 */}
      {agent.badge && (
        <motion.div
          className="absolute top-3 right-3 z-20 w-2 h-2 rounded-full"
          style={{
            backgroundColor: TOKENS.primary[500],
          }}
          animate={{
            boxShadow: [
              `0 0 6px ${TOKENS.primary[500]}60`,
              `0 0 12px ${TOKENS.primary[500]}80`,
              `0 0 6px ${TOKENS.primary[500]}60`,
            ],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* 图标容器 */}
      <motion.div
        className="relative w-12 h-12 rounded-xl flex items-center justify-center mb-3.5"
        style={{
          background: isRecommended
            ? "linear-gradient(135deg, rgba(134, 239, 172, 0.15) 0%, rgba(134, 239, 172, 0.05) 100%)"
            : "linear-gradient(135deg, rgba(14, 58, 31, 0.06) 0%, rgba(14, 58, 31, 0.02) 100%)",
          border: isRecommended
            ? "1px solid rgba(134, 239, 172, 0.2)"
            : "1px solid rgba(14, 58, 31, 0.06)",
        }}
        whileHover={{
          boxShadow: isRecommended
            ? "0 0 30px rgba(134, 239, 172, 0.25), 0 0 60px rgba(134, 239, 172, 0.1)"
            : "0 0 20px rgba(14, 58, 31, 0.1)",
          borderColor: isRecommended ? "rgba(134, 239, 172, 0.4)" : "rgba(14, 58, 31, 0.12)",
        }}
        transition={{ duration: 0.3 }}
      >
        <ArtisticThinkingIcon
          modelKey={agent.key as any}
          size={24}
          style={{ color: "#10A37F" }}
        />

        {/* 悬停时图标微光 */}
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background: "radial-gradient(circle at center, rgba(134, 239, 172, 0.2) 0%, transparent 70%)",
            opacity: 0,
          }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>

      {/* 中文名 */}
      <p
        className="text-sm font-medium"
        style={{ color: TOKENS.text.primary, letterSpacing: "0.3px" }}
      >
        {agent.name}
      </p>

      {/* 描述 */}
      <p
        className="text-[10px] mt-1 leading-relaxed"
        style={{ color: TOKENS.text.tertiary, letterSpacing: "0.3px" }}
      >
        {agent.description}
      </p>

      {/* 底部渐变 */}
      <div
        className="absolute bottom-0 left-0 right-0 h-12 opacity-30 pointer-events-none"
        style={{
          background: isRecommended
            ? "linear-gradient(to top, rgba(134, 239, 172, 0.1), transparent)"
            : "linear-gradient(to top, rgba(14, 58, 31, 0.03), transparent)",
        }}
      />
    </motion.a>
  )
}

export default EducationPanel