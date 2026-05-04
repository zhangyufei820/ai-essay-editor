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
  ArrowRight, Sparkles, MessageSquare, ChevronDown, Send, Paperclip, FileText, X, Calculator
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
  return (
    <span className={className} style={style}>
      {text}
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
      className="relative mx-auto w-full max-w-xl overflow-hidden rounded-[28px] border border-white/80"
      style={{
        backgroundColor: 'white',
        boxShadow: `
          0 2px 4px rgba(0, 0, 0, 0.02),
          0 16px 40px rgba(20, 83, 45, 0.10),
          0 40px 90px rgba(34, 197, 94, 0.14),
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
                className="rounded-2xl border px-4 py-3"
                style={{ backgroundColor: "#f7f7f5", borderColor: "#e6e3dc" }}
              >
                <p className="text-sm" style={{ color: "#2f3136" }}>
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
          <motion.button
            aria-label="发送消息"
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: brandColors[600] }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send className="w-5 h-5 text-white" />
          </motion.button>
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
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8 xl:py-16"
      style={{
        background: `linear-gradient(135deg, ${creamColors[50]} 0%, #ffffff 45%, ${brandColors[50]} 100%)`
      }}
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

      {/* 主内容 */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 xl:grid-cols-[minmax(0,0.96fr)_minmax(360px,0.72fr)] xl:gap-10 2xl:max-w-7xl 2xl:grid-cols-[minmax(0,1fr)_minmax(440px,0.8fr)] 2xl:gap-14">
        <div className="mx-auto w-full max-w-3xl text-center xl:mx-0 xl:text-left">
          {/* 标签 */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
            className="mb-6"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm"
              style={{
                backgroundColor: "rgba(255,255,255,0.82)",
                borderColor: brandColors[200],
                color: brandColors[800]
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: brandColors[600] }} />
              AI 作文批改 · 写作提分工具
            </span>
          </motion.div>

          <h1
            className="mb-7 text-4xl font-black leading-[1.08] tracking-normal sm:text-5xl lg:text-6xl 2xl:text-7xl"
            style={{
              color: brandColors[900],
              textShadow: '0 1px 0 rgba(255,255,255,0.9)'
            }}
          >
            <AnimatedText text="让 AI 成为你的" delay={0.2} />
            <br />
            <span className="relative inline-block">
              <AnimatedText text="专属学习伙伴" delay={0.8} />
            </span>
          </h1>

          {/* 副标题 */}
          <p
            className="mx-auto mb-8 max-w-2xl text-base leading-7 md:text-lg md:leading-8 xl:mx-0 xl:text-xl"
            style={{ color: slateColors[600] }}
          >
            上传作文，AI 逐段批改、指出问题、给出提分建议，
            <br className="hidden md:block" />
            先免费体验批改，再按需选择套餐。
          </p>

          

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row xl:justify-start">
            <Link href="/chat" prefetch={false}>
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
                  免费体验批改
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </motion.button>
            </Link>
            <Link href="/pricing" prefetch={false}>
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
          </div>

          {/* 快捷入口 */}
          <div className="mx-auto mt-8 grid max-w-xl gap-3 sm:grid-cols-2 xl:mx-0">
            <Link href="/chat?agent=quanquan-math" prefetch={false}>
              <motion.div
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary/15 bg-white/85 px-5 py-4 text-left shadow-sm backdrop-blur transition-colors hover:border-primary/30"
                whileHover={{ scale: 1.05, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Calculator className="size-5" />
                </span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800">全学段数学</div>
                  <div className="text-xs text-slate-500">数学问题解答</div>
                </div>
              </motion.div>
            </Link>
            <Link href="/chat/standard" prefetch={false}>
              <motion.div
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary/15 bg-white/85 px-5 py-4 text-left shadow-sm backdrop-blur transition-colors hover:border-primary/30"
                whileHover={{ scale: 1.05, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="size-5" />
                </span>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800">作文批改</div>
                  <div className="text-xs text-slate-500">逐段点评提分</div>
                </div>
              </motion.div>
            </Link>
          </div>
        </div>

        <div className="relative hidden min-w-0 xl:block">
          <div className="absolute -inset-4 rounded-[36px] bg-primary/10 blur-3xl 2xl:-inset-6" />
          <ChatDemo />
        </div>
      </div>
    </section>
  )
}

export default HeroSection
