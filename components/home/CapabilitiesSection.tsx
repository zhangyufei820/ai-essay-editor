/**
 * 📝 沈翔学校 - 能力展示区域
 * 
 * 展示首页保留的高频学习入口。
 */

import Link from "next/link"
import { ArrowRight, FileText, HelpCircle, ClipboardCheck, Layers3, type LucideIcon } from "lucide-react"
import { FadeIn } from "@/components/motion/FadeIn"
import { Stagger } from "@/components/motion/Stagger"
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
    icon: ClipboardCheck,
    title: "错题诊断海报",
    description: "上传试卷图片，AI 归因错题并生成适合家长沟通的训练建议。",
    href: "/worksheet-diagnosis",
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
// 能力卡片组件
// ============================================

function CapabilityCard({ capability }: { capability: Capability }) {
  const Icon = capability.icon
  
  return (
    <Link
      href={capability.href}
      prefetch={false}
      className={cn(
        "group sx-card sx-card-interactive flex h-full flex-col p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-7"
      )}
      style={{ borderColor: slateColors[100] }}
    >
      <div
        className="flex size-12 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <Icon className="size-6" />
      </div>

      <h3 className="mt-5 text-lg font-bold" style={{ color: slateColors[800] }}>
        {capability.title}
      </h3>

      <p className="mt-3 flex-1 text-sm leading-7" style={{ color: slateColors[500] }}>
        {capability.description}
      </p>

      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
        进入使用
        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
      </span>
    </Link>
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
        <FadeIn className="text-center mb-12">
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
            首页只保留最常用的学习动作
          </h2>
          <p className="sx-section-copy mx-auto mt-4 max-w-2xl">
            不把所有 AI 能力一次性摊开，而是先帮学生完成最容易产生结果的四件事。
          </p>
        </FadeIn>

        {/* 能力卡片网格 */}
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((capability) => (
            <CapabilityCard 
              key={capability.href}
              capability={capability}
            />
          ))}
        </Stagger>
      </div>
    </section>
  )
}

export default CapabilitiesSection
