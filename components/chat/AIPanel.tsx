/**
 * AI写作专区面板 - 与教育专区面板风格完全一致
 */

"use client"

import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { X, BookOpen, FileText, Pen, GraduationCap, FlaskConical, Briefcase, Mic, Newspaper } from "lucide-react"

const TOKENS = {
  primary: {
    50:  "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#14532d",
    900: "#0d3a1f",
    950: "#052e16",
  },
  surface: {
    white:   "#FEFEFA",
    50:      "#F8FAF8",
    100:     "#F1F5F3",
    200:     "#E8EDEA",
    300:     "#D4DED9",
  },
  aurora: {
    glow:    "#86EFAC",
    soft:    "rgba(134, 239, 172, 0.15)",
  },
  text: {
    primary:   "rgba(14, 58, 31, 0.90)",
    secondary: "rgba(14, 58, 31, 0.60)",
    tertiary:  "rgba(14, 58, 31, 0.40)",
  },
  glass: {
    light:   "rgba(255, 255, 255, 0.70)",
    medium:  "rgba(255, 255, 255, 0.50)",
    heavy:   "rgba(255, 255, 255, 0.25)",
  },
  shadow: {
    soft:  "0 4px 24px rgba(14, 58, 31, 0.04), 0 8px 48px rgba(14, 58, 31, 0.02)",
    glow:  "0 0 40px rgba(14, 58, 31, 0.08), 0 0 80px rgba(14, 58, 31, 0.04)",
  }
} as const

interface WritingAgent {
  key: string
  name: string
  description: string
  badge?: string
  href: string
}

interface AIPanelProps {
  isOpen: boolean
  onClose: () => void
}

const AI_WRITING_AGENTS: WritingAgent[] = [
  {
    key: "ai-writing-paper",
    name: "论文写作",
    description: "学术论文写作辅助",
    href: "/chat/ai-writing-paper",
  },
  {
    key: "zhongying-essay",
    name: "中英文作文",
    description: "K12与四六级作文思路启发与语法润色",
    href: "/chat/zhongying-essay",
  },
  {
    key: "reading-report",
    name: "读书报告 / 观后感",
    description: "提炼书籍核心观点，深化阅读思考",
    href: "/chat/reading-report",
  },
  {
    key: "experiment-report",
    name: "实验报告助理",
    description: "规范理工科实验报告格式与结论分析",
    href: "/chat/experiment-report",
  },
  {
    key: "study-abroad",
    name: "留学与升学文书",
    description: "挖掘个人闪光点，打磨专属申请故事",
    href: "/chat/study-abroad",
  },
  {
    key: "resume-optimize",
    name: "实习简历优化",
    description: "提炼校园经历，生成专业职场简历",
    href: "/chat/resume",
  },
  {
    key: "speech-defense",
    name: "演讲与答辩稿",
    description: "竞选、比赛与论文答辩的逐字稿定制",
    href: "/chat/speech-defense",
  },
  {
    key: "school-wechat",
    name: "学校公众号写作",
    description: "校园宣传与活动稿件撰写",
    href: "/chat/school-wechat",
  },
]

export function AIPanel({ isOpen, onClose }: AIPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
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

            {/* 头部 */}
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
                    <BookOpen className="w-5 h-5 text-white" />
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
                    AI写作
                  </h2>
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: TOKENS.text.tertiary, letterSpacing: "2px", textTransform: "uppercase" }}
                  >
                    AI WRITING ZONE
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

            {/* 智能体网格 */}
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              <div className="grid grid-cols-2 gap-4">
                {AI_WRITING_AGENTS.map((agent, index) => (
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
                    <WritingIslandCard agent={agent} onClick={onClose} />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* 底部 */}
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
                  选 择 AI 写 作 助 手
                </p>
                <p
                  className="text-[10px] mt-2"
                  style={{ color: TOKENS.text.tertiary, letterSpacing: "1px" }}
                >
                  开启智能写作之旅
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function WritingIslandCard({
  agent,
  onClick,
}: {
  agent: WritingAgent
  onClick: () => void
}) {
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
      {/* 图标容器 */}
      <motion.div
        className="relative w-12 h-12 rounded-xl flex items-center justify-center mb-3.5"
        style={{
          background: "linear-gradient(135deg, rgba(134, 239, 172, 0.15) 0%, rgba(134, 239, 172, 0.05) 100%)",
          border: "1px solid rgba(134, 239, 172, 0.2)",
        }}
        whileHover={{
          boxShadow: "0 0 30px rgba(134, 239, 172, 0.25), 0 0 60px rgba(134, 239, 172, 0.1)",
          borderColor: "rgba(134, 239, 172, 0.4)",
        }}
        transition={{ duration: 0.3 }}
      >
        {agent.key === "ai-writing-paper" && <FileText className="w-6 h-6" style={{ color: "#10A37F" }} />}
        {agent.key === "zhongying-essay" && <Pen className="w-6 h-6" style={{ color: "#10A37F" }} />}
        {agent.key === "reading-report" && <BookOpen className="w-6 h-6" style={{ color: "#10A37F" }} />}
        {agent.key === "experiment-report" && <FlaskConical className="w-6 h-6" style={{ color: "#10A37F" }} />}
        {agent.key === "study-abroad" && <GraduationCap className="w-6 h-6" style={{ color: "#10A37F" }} />}
        {agent.key === "resume-optimize" && <Briefcase className="w-6 h-6" style={{ color: "#10A37F" }} />}
        {agent.key === "speech-defense" && <Mic className="w-6 h-6" style={{ color: "#10A37F" }} />}
        {agent.key === "school-wechat" && <Newspaper className="w-6 h-6" style={{ color: "#10A37F" }} />}
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
          background: "linear-gradient(to top, rgba(134, 239, 172, 0.1), transparent)",
        }}
      />
    </motion.a>
  )
}

export default AIPanel
