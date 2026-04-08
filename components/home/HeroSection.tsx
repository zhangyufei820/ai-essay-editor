/**
 * 📝 沈翔学校 - Hero 区域组件
 *
 * 主页首屏展示区域，包含品牌标语、CTA 按钮和智能对话框演示动画。
 * 每个字都有从四面八方汇聚的动画效果，象征来自五湖四海的会员。
 * 背景有学科知识图标动画，展示全功能覆盖。
 */

"use client"

import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect, useCallback } from "react"
import {
  ArrowRight, Sparkles, MessageSquare, ChevronDown, Send, Paperclip, FileText, X
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"
import { cn } from "@/lib/utils"


// ============================================
// 演示对话数据
// ============================================

const demoConversation = [
  {
    type: "ai",
    content: "你好！我是沈翔智学 AI 助手。我可以帮你批改作文、解答问题、制定学习计划。有什么我可以帮助你的吗？"
  },
  {
    type: "file",
    fileName: "我的作文.jpg",
    fileSize: "2.3 MB"
  },
  {
    type: "user",
    content: "帮我批改一下这篇作文"
  },
  {
    type: "ai",
    content: "好的！我已收到你的作文图片。正在从结构、语言、内容等多个维度进行专业分析..."
  }
]

// ============================================
// 动画配置
// ============================================

// 为每个字生成随机的起始位置（从四面八方）
const getRandomDirection = (index: number) => {
  const directions = [
    { x: -150, y: -100 },
    { x: 150, y: -100 },
    { x: -150, y: 100 },
    { x: 150, y: 100 },
    { x: -200, y: 0 },
    { x: 200, y: 0 },
    { x: 0, y: -150 },
    { x: 0, y: 150 },
  ]
  return directions[index % directions.length]
}

const bgTopRightVariants = {
  hidden: { opacity: 0, x: 100, y: -100 },
  visible: {
    opacity: 0.2,
    x: 0,
    y: 0,
    transition: { duration: 1.2, ease: [0.32, 0.72, 0, 1] as const }
  }
}

const bgBottomLeftVariants = {
  hidden: { opacity: 0, x: -100, y: 100 },
  visible: {
    opacity: 0.2,
    x: 0,
    y: 0,
    transition: { duration: 1.2, ease: [0.32, 0.72, 0, 1] as const }
  }
}


// ============================================
// 字符汇聚动画组件
// ============================================

function AnimatedText({ text, className, style, delay = 0 }: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}) {
  const characters = text.split('')

  return (
    <span className={className} style={style}>
      {characters.map((char, index) => {
        const direction = getRandomDirection(index)
        return (
          <motion.span
            key={index}
            initial={{
              opacity: 0,
              x: direction.x,
              y: direction.y,
              scale: 0,
              rotate: Math.random() * 360 - 180
            }}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              rotate: 0
            }}
            transition={{
              duration: 0.8,
              delay: delay + index * 0.05,
              ease: [0.34, 1.56, 0.64, 1]
            }}
            className="inline-block"
            style={{
              display: char === ' ' ? 'inline' : 'inline-block',
              whiteSpace: char === ' ' ? 'pre' : 'normal'
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        )
      })}
    </span>
  )
}

// ============================================
// 打字效果组件
// ============================================

function TypewriterText({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const [displayText, setDisplayText] = useState("")
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex])
        setCurrentIndex(prev => prev + 1)
      }, 25 + Math.random() * 15)
      return () => clearTimeout(timeout)
    } else if (onComplete) {
      onComplete()
    }
  }, [currentIndex, text, onComplete])

  return (
    <span>
      {displayText}
      {currentIndex < text.length && (
        <motion.span
          className="inline-block w-0.5 h-4 ml-0.5"
          style={{ backgroundColor: brandColors[600] }}
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      )}
    </span>
  )
}

// ============================================
// 智能对话框演示组件（循环播放）
// ============================================

function ChatDemo() {
  const [visibleMessages, setVisibleMessages] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [userInput, setUserInput] = useState("")
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [cycleKey, setCycleKey] = useState(0)

  // 重置并重新播放动画
  const resetAndPlay = useCallback(() => {
    setVisibleMessages(0)
    setIsTyping(false)
    setUserInput("")
    setShowFileUpload(false)
    setCycleKey(prev => prev + 1)
  }, [])

  // 自动播放对话演示（循环）
  useEffect(() => {
    // 追踪所有嵌套定时器，组件卸载或 cycleKey 变化时统一清理
    const timers: ReturnType<typeof setTimeout | typeof setInterval>[] = []

    const addTimer = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms)
      timers.push(id)
      return id
    }

    const addInterval = (fn: () => void, ms: number) => {
      const id = setInterval(fn, ms)
      timers.push(id)
      return id
    }

    // 外层延迟启动
    addTimer(() => {
      setVisibleMessages(1)

      addTimer(() => {
        setShowFileUpload(true)

        addTimer(() => {
          setShowFileUpload(false)
          setVisibleMessages(2)

          addTimer(() => {
            setIsTyping(true)
            const userText = "帮我批改一下这篇作文"
            let i = 0
            addInterval(() => {
              if (i < userText.length) {
                setUserInput(userText.slice(0, i + 1))
                i++
              } else {
                clearInterval(timers.pop()) // 移除 interval
                addTimer(() => {
                  setIsTyping(false)
                  setUserInput("")
                  setVisibleMessages(3)

                  addTimer(() => {
                    setVisibleMessages(4)

                    addTimer(() => {
                      resetAndPlay()
                    }, 4000)
                  }, 800)
                }, 400)
              }
            }, 60)
          }, 1000)
        }, 1500)
      }, 2500)
    }, 1000)

    // 组件卸载或 cycleKey 变化时清理所有定时器
    return () => timers.forEach(id => {
      clearTimeout(id)
      clearInterval(id)
    })
  }, [cycleKey, resetAndPlay])

  return (
    <motion.div
      key={cycleKey}
      initial={{ opacity: 0, y: 40, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.8, delay: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="rounded-3xl overflow-hidden max-w-2xl mx-auto relative"
      style={{
        backgroundColor: 'white',
        transform: "rotate(-1deg)",
        boxShadow: `
          0 2px 4px rgba(0, 0, 0, 0.02),
          0 8px 16px rgba(0, 0, 0, 0.04),
          0 20px 40px rgba(0, 0, 0, 0.06),
          0 40px 80px rgba(34, 197, 94, 0.08),
          inset 0 1px 0 rgba(255,255,255,0.8)
        `
      }}
    >
      {/* 顶部栏 */}
      <div
        className="px-4 py-3 flex items-center justify-between border-b"
        style={{ borderColor: slateColors[100] }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="w-4 h-4" style={{ color: brandColors[600] }} strokeWidth={2} />
          </motion.div>
          <span className="text-sm font-medium" style={{ color: slateColors[700] }}>
            沈翔智学
          </span>
        </div>
        <span className="text-xs" style={{ color: slateColors[400] }}>
          AI 助手
        </span>
      </div>

      {/* 对话区域 */}
      <div className="p-4 min-h-[240px] relative">
        <AnimatePresence mode="popLayout">
          {/* AI 消息 1 */}
          {visibleMessages >= 1 && (
            <motion.div
              key="ai-message-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 mb-4"
            >
              <motion.div
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: brandColors[100] }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Sparkles className="h-4 w-4" style={{ color: brandColors[600] }} />
              </motion.div>
              <div
                className="flex-1 rounded-2xl px-4 py-3"
                style={{ backgroundColor: slateColors[50] }}
              >
                <p className="text-sm leading-relaxed" style={{ color: slateColors[600] }}>
                  {demoConversation[0].content}
                </p>
              </div>
            </motion.div>
          )}

          {/* 文件上传消息 */}
          {visibleMessages >= 2 && (
            <motion.div
              key="file-message"
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 mb-4 justify-end"
            >
              <div
                className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: brandColors[50], border: `1px solid ${brandColors[200]}` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: brandColors[100] }}
                >
                  <FileText className="w-5 h-5" style={{ color: brandColors[600] }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: slateColors[700] }}>
                    我的作文.jpg
                  </p>
                  <p className="text-xs" style={{ color: slateColors[400] }}>
                    2.3 MB
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* 用户文字消息 */}
          {visibleMessages >= 3 && (
            <motion.div
              key="user-message"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3 mb-4 justify-end"
            >
              <div
                className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: brandColors[600] }}
              >
                <p className="text-sm text-white">
                  {demoConversation[2].content}
                </p>
              </div>
            </motion.div>
          )}

          {/* AI 消息 2 */}
          {visibleMessages >= 4 && (
            <motion.div
              key="ai-message-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-3"
            >
              <motion.div
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: brandColors[100] }}
              >
                <Sparkles className="h-4 w-4" style={{ color: brandColors[600] }} />
              </motion.div>
              <div
                className="flex-1 rounded-2xl px-4 py-3"
                style={{ backgroundColor: slateColors[50] }}
              >
                <p className="text-sm leading-relaxed" style={{ color: slateColors[600] }}>
                  <TypewriterText text={demoConversation[3].content as string} />
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 输入框 */}
      <div className="px-4 pb-4">
        {/* 文件上传预览 */}
        <AnimatePresence>
          {showFileUpload && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mb-3"
            >
              <div
                className="rounded-xl p-3 flex items-center gap-3"
                style={{ backgroundColor: brandColors[50], border: `1px solid ${brandColors[200]}` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: brandColors[100] }}
                >
                  <FileText className="w-5 h-5" style={{ color: brandColors[600] }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: slateColors[700] }}>
                    我的作文.jpg
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <motion.div
                      className="h-1 rounded-full flex-1"
                      style={{ backgroundColor: brandColors[100] }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: brandColors[500] }}
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1.2 }}
                      />
                    </motion.div>
                    <span className="text-xs" style={{ color: slateColors[400] }}>上传中...</span>
                  </div>
                </div>
                <button className="p-1 rounded hover:bg-slate-100">
                  <X className="w-4 h-4" style={{ color: slateColors[400] }} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="rounded-2xl border flex items-center gap-2 px-4 py-3"
          style={{
            borderColor: slateColors[200],
            backgroundColor: slateColors[50]
          }}
        >
          <Paperclip className="w-5 h-5" style={{ color: brandColors[500] }} />
          <div className="flex-1">
            <span className="text-sm" style={{ color: isTyping ? slateColors[700] : slateColors[400] }}>
              {isTyping ? userInput : "输入内容开始对话..."}
            </span>
            {isTyping && (
              <motion.span
                className="inline-block w-0.5 h-4 ml-0.5"
                style={{ backgroundColor: slateColors[700] }}
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
            )}
          </div>
          <motion.div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: brandColors[600] }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send className="w-5 h-5 text-white" />
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}


// ============================================
// 主组件
// ============================================

export function HeroSection() {
  const router = useRouter()
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden py-20"
      style={{ backgroundColor: creamColors[100] }}
    >
      {/* 背景装饰 - 渐变光晕 */}
      <motion.div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        initial="hidden"
        animate="visible"
      >
        <motion.div
          variants={bgTopRightVariants}
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full blur-[100px]"
          style={{ backgroundColor: `${brandColors[300]}40` }}
        />
        <motion.div
          variants={bgBottomLeftVariants}
          className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full blur-[100px]"
          style={{ backgroundColor: `${brandColors[200]}30` }}
        />
        {/* 微妙的网格背景 */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(${slateColors[400]} 1px, transparent 1px), linear-gradient(90deg, ${slateColors[400]} 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </motion.div>

      {/* 主内容 - 垂直布局 */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-6 lg:px-8">
        {/* 上半部分：文字内容 */}
        <div className="text-center mb-16">
          {/* 标签 */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
            className="mb-6"
          >
            <span
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
              style={{
                backgroundColor: brandColors[50],
                color: brandColors[700]
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: brandColors[600] }} />
              AI 驱动的智能学习平台
            </span>
          </motion.div>

          {/* 主标题 - 每个字从四面八方汇聚，超大字体突出显示，强烈立体感 */}
          <h1
            className="text-5xl md:text-6xl lg:text-8xl font-black tracking-tight mb-8"
            style={{
              color: brandColors[900],
              textShadow: '0 6px 12px rgba(0,0,0,0.15), 0 3px 6px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)'
            }}
          >
            <AnimatedText text="让 AI 成为你的" delay={0.2} />
            <br />
            <span className="relative inline-block">
              <AnimatedText text="专属学习伙伴" delay={0.8} />
            </span>
          </h1>

          {/* 副标题 */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.2, ease: [0.32, 0.72, 0, 1] }}
            className="text-lg md:text-xl max-w-2xl mx-auto mb-8"
            style={{ color: slateColors[600] }}
          >
            沈翔智学为每一位学生提供个性化的 AI 辅导体验，
            <br className="hidden md:block" />
            从作文批改到学习规划，全方位助力学业进步。
          </motion.p>

          

          {/* CTA 按钮组 - 🎨 增强渐变和发光效果 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 1.4, ease: [0.32, 0.72, 0, 1] }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/chat">
              <motion.button
                className="group relative h-14 px-8 text-base font-bold rounded-2xl text-white overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${brandColors[600]} 0%, ${brandColors[700]} 50%, ${brandColors[800]} 100%)`,
                  boxShadow: `0 8px 24px ${brandColors[600]}40, 0 4px 12px ${brandColors[700]}30`
                }}
                whileHover={{
                  scale: 1.05,
                  boxShadow: `0 12px 32px ${brandColors[500]}50, 0 6px 16px ${brandColors[600]}40, 0 0 40px ${brandColors[400]}30`
                }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                {/* 发光效果层 */}
                <motion.div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${brandColors[500]}40 0%, transparent 50%, ${brandColors[400]}20 100%)`
                  }}
                />
                {/* 闪光动画 */}
                <motion.div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100"
                  initial={{ x: '-100%' }}
                  whileHover={{ x: '100%' }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                    width: '50%'
                  }}
                />
                <span className="relative flex items-center">
                  <MessageSquare className="mr-2 h-5 w-5" />
                  开始智能对话
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </motion.button>
            </Link>
            <Link href="/pricing">
              <motion.button
                className="group h-14 px-8 text-base font-semibold rounded-2xl border-2 bg-white/80 backdrop-blur-sm"
                style={{
                  borderColor: slateColors[200],
                  color: slateColors[700],
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                }}
                whileHover={{
                  scale: 1.05,
                  borderColor: brandColors[300],
                  color: brandColors[700],
                  boxShadow: `0 8px 24px ${brandColors[100]}80`
                }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                查看套餐价格
              </motion.button>
            </Link>
          </motion.div>

          {/* 快捷入口 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.6, ease: [0.32, 0.72, 0, 1] }}
            className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/chat?agent=quanquan-math">
              <motion.div
                className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm cursor-pointer"
                whileHover={{ scale: 1.05, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-2xl">&#x1F4D0;</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800">全学段数学</div>
                  <div className="text-xs text-slate-500">数学问题解答</div>
                </div>
              </motion.div>
            </Link>
            <Link href="/chat/standard">
              <motion.div
                className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm cursor-pointer"
                whileHover={{ scale: 1.05, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-2xl">&#x1F4A1;</span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800">题目解析</div>
                  <div className="text-xs text-slate-500">详细步骤讲解</div>
                </div>
              </motion.div>
            </Link>
          </motion.div>
        </div>

        {/* 下半部分：对话框演示（循环播放） */}
        <ChatDemo />
      </div>
    </section>
  )
}

export default HeroSection