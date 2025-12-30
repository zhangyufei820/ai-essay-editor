/**
 * 📝 沈翔智学 - 空状态组件 (EmptyState)
 * 
 * 聊天页面消息列表为空时显示的欢迎界面。
 * 包含品牌图标、欢迎语和快捷建议卡片。
 */

"use client"

import { motion } from "framer-motion"
import { GraduationCap, FileEdit, Lightbulb, BarChart3, Target } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================
// 设计系统颜色常量
// ============================================

const COLORS = {
  primary: {
    main: "#4CAF50",
    dark: "#2E7D32",
    light: "#E8F5E9",
    lighter: "#F1F8E9",
  },
  gray: {
    50: "#FAFAFA",
    100: "#F5F5F5",
    200: "#EEEEEE",
    400: "#BDBDBD",
    500: "#9E9E9E",
    600: "#757575",
    700: "#616161",
    800: "#424242",
    900: "#212121",
  },
}

// ============================================
// 类型定义
// ============================================

interface QuickStartCard {
  id: string
  icon: string
  title: string
  description: string
  prompt: string
}

interface EmptyStateProps {
  /** 建议点击回调 - 自动填充到输入框 */
  onSuggestionClick?: (prompt: string) => void
  /** 自定义类名 */
  className?: string
}

// ============================================
// 快速开始卡片配置
// ============================================

const quickStartCards: QuickStartCard[] = [
  {
    id: "essay",
    icon: "📝",
    title: "作文批改",
    description: "上传作文，获得专业评分和修改建议",
    prompt: "请帮我批改这篇作文，给出详细的评分和修改建议",
  },
  {
    id: "inspiration",
    icon: "💡",
    title: "写作灵感",
    description: "生成作文题目和创意写作思路",
    prompt: "请给我推荐一些有创意的作文题目和写作思路",
  },
  {
    id: "analysis",
    icon: "📊",
    title: "学习分析",
    description: "查看学习数据和进步轨迹",
    prompt: "请帮我分析最近的学习情况和进步轨迹",
  },
  {
    id: "tutoring",
    icon: "🎯",
    title: "个性化辅导",
    description: "定制专属学习计划和练习",
    prompt: "请根据我的情况制定一份个性化的学习计划",
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
      staggerChildren: 0.08,
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
      duration: 0.4,
      ease: [0.32, 0.72, 0, 1] as [number, number, number, number]
    }
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.32, 0.72, 0, 1] as [number, number, number, number]
    }
  }
}

// ============================================
// 快速开始卡片组件
// ============================================

function QuickStartCardItem({
  card,
  onClick
}: {
  card: QuickStartCard
  onClick?: () => void
}) {
  return (
    <motion.button
      variants={cardVariants}
      whileHover={{ 
        y: -4, 
        boxShadow: "0 8px 24px rgba(76, 175, 80, 0.15)",
      }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start p-4 rounded-xl text-left",
        "cursor-pointer overflow-hidden",
        "transition-all duration-200 ease-out",
        "focus:outline-none focus:ring-2 focus:ring-offset-2"
      )}
      style={{
        width: "100%",
        height: "120px",
        background: `linear-gradient(135deg, ${COLORS.primary.lighter} 0%, ${COLORS.primary.light} 100%)`,
        border: `1px solid ${COLORS.primary.main}20`,
      }}
    >
      {/* 图标 */}
      <motion.span 
        className="text-2xl mb-2"
        whileHover={{ rotate: 5 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {card.icon}
      </motion.span>
      
      {/* 标题 */}
      <h3 
        className="text-sm font-semibold mb-1"
        style={{ color: COLORS.gray[900] }}
      >
        {card.title}
      </h3>
      
      {/* 描述 */}
      <p 
        className="text-xs leading-relaxed"
        style={{ color: COLORS.gray[600] }}
      >
        {card.description}
      </p>
    </motion.button>
  )
}

// ============================================
// 主组件
// ============================================

export function EmptyState({
  onSuggestionClick,
  className
}: EmptyStateProps) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={cn(
        "flex flex-col items-center justify-start",
        "pt-[15vh] pb-8 px-4",
        "w-full h-full",
        className
      )}
    >
      {/* 欢迎区域 */}
      <motion.div 
        variants={itemVariants}
        className="flex flex-col items-center text-center mb-10"
      >
        {/* 品牌Logo - 渐变绿色圆形背景 */}
        <motion.div
          className="mb-6 flex items-center justify-center rounded-full"
          style={{
            width: "80px",
            height: "80px",
            background: `linear-gradient(135deg, ${COLORS.primary.main} 0%, ${COLORS.primary.dark} 100%)`,
            boxShadow: `0 8px 24px ${COLORS.primary.main}40`,
          }}
          animate={{
            y: [0, -4, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <GraduationCap className="h-10 w-10 text-white" />
        </motion.div>

        {/* 主标题 */}
        <h1 
          className="text-2xl font-semibold mb-2"
          style={{ 
            color: COLORS.gray[900],
            fontWeight: 600,
          }}
        >
          欢迎使用沈翔智学
        </h1>

        {/* 副标题 */}
        <p 
          className="text-sm max-w-sm"
          style={{ color: COLORS.gray[600] }}
        >
          我是你的AI学习助手，专业批改作文、解答问题
        </p>
      </motion.div>

      {/* 快速开始卡片组 */}
      <motion.div 
        variants={itemVariants}
        className="w-full max-w-[600px]"
      >
        <p 
          className="text-xs font-medium mb-4 text-center"
          style={{ color: COLORS.gray[500] }}
        >
          快速开始
        </p>
        
        <div className="grid grid-cols-2 gap-4">
          {quickStartCards.map((card) => (
            <QuickStartCardItem
              key={card.id}
              card={card}
              onClick={() => onSuggestionClick?.(card.prompt)}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default EmptyState
