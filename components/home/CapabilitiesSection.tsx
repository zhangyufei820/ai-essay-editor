/**
 * 📝 沈翔学校 - 能力展示区域
 * 
 * 展示首页保留的高频学习入口。
 */

"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight, FileText, HelpCircle, Blocks, Layers3, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

// ============================================
// 能力配置
// ============================================

interface Capability {
  icon: LucideIcon
  title: string
  description: string
  href: string
}

const capabilities: Capability[] = [
  {
    icon: Blocks,
    title: "智能体广场",
    description: "按写作、学科、教学与创作场景，快速挑选适合的 AI 智能体。",
    href: "/agents",
  },
  {
    icon: FileText,
    title: "智能作文批改",
    description: "从结构、表达、立意到修改方向，给出逐段点评。",
    href: "/essay",
  },
  {
    icon: HelpCircle,
    title: "题目解析",
    description: "拍题或输入题干，获得可复盘的分步讲解。",
    href: "/chat/problem",
  },
  {
    icon: Layers3,
    title: "闪卡复习",
    description: "把知识点沉淀成复习卡片，跟踪掌握状态。",
    href: "/flashcards",
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
      delayChildren: 0.1
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
      ease: [0.33, 1, 0.68, 1] as const
    }
  }
}

const titleVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { 
      duration: 0.6,
      ease: [0.33, 1, 0.68, 1] as const
    }
  }
}

// ============================================
// 能力卡片组件
// ============================================

function CapabilityCard({ capability }: { capability: Capability }) {
  const Icon = capability.icon
  
  return (
    <motion.div
      variants={itemVariants}
      className="h-full"
    >
      <Link
        href={capability.href}
        prefetch={false}
        className={cn(
          "group sx-card sx-card-interactive flex h-full flex-col p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-500)] md:p-7"
        )}
        style={{ borderColor: slateColors[100] }}
      >
        <div
          className="flex size-12 items-center justify-center rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--ink-50)] text-[var(--ink-700)] transition-colors duration-200 group-hover:bg-[var(--seal-500)] group-hover:text-white"
        >
          <Icon className="size-6" />
        </div>

        <h3 className="mt-5 text-lg font-bold" style={{ color: slateColors[800] }}>
          {capability.title}
        </h3>

        <p className="mt-3 flex-1 text-sm leading-7" style={{ color: slateColors[500] }}>
          {capability.description}
        </p>

        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ink-700)]">
          进入使用
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </Link>
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export function CapabilitiesSection() {
  return (
    <section 
      id="capabilities" 
      className="sx-section"
      style={{ backgroundColor: creamColors[50] }}
    >
      <div className="sx-container">
        {/* 板块标题 */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={titleVariants}
          className="text-center mb-12"
        >
          {/* 小标题（eyebrow） */}
          <span 
            className="inline-flex items-center gap-3 text-sm font-medium uppercase tracking-wider mb-4"
            style={{ color: brandColors[700] }}
          >
            <span 
              className="w-8 h-px"
              style={{ backgroundColor: brandColors[300] }}
            />
            核心能力
            <span 
              className="w-8 h-px"
              style={{ backgroundColor: brandColors[300] }}
            />
          </span>
          
          {/* 主标题 - 强烈立体感 */}
          <h2 
            className="sx-section-title"
            style={{ color: slateColors[900] }}
          >
            从高频学习场景开始
          </h2>
          <p className="sx-section-copy mx-auto mt-4 max-w-2xl">
            围绕作文、错题、答疑和复习，把学生每天遇到的问题整理成清晰可执行的反馈。
          </p>
        </motion.div>

        {/* 能力卡片网格 */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {capabilities.map((capability) => (
            <CapabilityCard 
              key={capability.href}
              capability={capability}
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}

export default CapabilitiesSection
