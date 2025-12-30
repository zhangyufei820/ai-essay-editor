/**
 * 📝 沈翔学校 - 能力展示区域
 * 
 * 展示沈翔学校的核心 AI 能力，借鉴 LIM London 的品牌基因可视化理念。
 * 使用 Framer Motion 实现滚动触发动画。
 */

"use client"

import { motion } from "framer-motion"
import { FileText, Calendar, MessageCircle, BarChart, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

// ============================================
// 能力配置
// ============================================

interface Capability {
  icon: LucideIcon
  title: string
  description: string
}

const capabilities: Capability[] = [
  {
    icon: FileText,
    title: "智能作文批改",
    description: "AI 深度分析作文结构、语言表达、逻辑思维，提供专业批改建议与优化方向"
  },
  {
    icon: Calendar,
    title: "个性化学习规划",
    description: "根据你的学习目标和当前进度，智能制定专属学习计划，高效达成目标"
  },
  {
    icon: MessageCircle,
    title: "24小时智能答疑",
    description: "随时随地提问，AI 导师即时解答学习疑惑，不再为难题困扰"
  },
  {
    icon: BarChart,
    title: "学习数据分析",
    description: "可视化学习进度与成长轨迹，精准洞察知识薄弱点，针对性提升"
  }
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

function CapabilityCard({ capability, index }: { capability: Capability; index: number }) {
  const Icon = capability.icon
  
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative bg-white rounded-[20px] p-8 border transition-all duration-300 hover:shadow-lg"
      style={{ 
        borderColor: slateColors[100]
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = brandColors[200]
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = slateColors[100]
      }}
    >
      {/* 图标区 - 增强阴影立体感 */}
      <div 
        className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300"
        style={{ 
          backgroundColor: brandColors[50],
          boxShadow: `0 6px 20px ${brandColors[200]}80, 0 3px 8px ${brandColors[100]}60`
        }}
      >
        <Icon 
          className="w-7 h-7 transition-transform duration-300 group-hover:scale-110" 
          style={{ 
            color: brandColors[700],
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
          }} 
        />
      </div>

      {/* 标题 */}
      <h3 
        className="mt-6 text-xl font-semibold"
        style={{ color: slateColors[800] }}
      >
        {capability.title}
      </h3>

      {/* 描述 */}
      <p 
        className="mt-3 text-base leading-relaxed line-clamp-3"
        style={{ color: slateColors[500] }}
      >
        {capability.description}
      </p>

      {/* 悬停装饰渐变 */}
      <div 
        className="absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${brandColors[50]}50 0%, transparent 100%)`
        }}
      />
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
      className="py-24 md:py-32"
      style={{ backgroundColor: creamColors[50] }}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        {/* 板块标题 */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={titleVariants}
          className="text-center mb-16"
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
            className="text-3xl md:text-4xl lg:text-5xl font-black"
            style={{ 
              color: slateColors[900],
              textShadow: '0 4px 8px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            让学习更高效、更智能
          </h2>
        </motion.div>

        {/* 能力卡片网格 */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8"
        >
          {capabilities.map((capability, index) => (
            <CapabilityCard 
              key={index} 
              capability={capability} 
              index={index} 
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}

export default CapabilitiesSection
