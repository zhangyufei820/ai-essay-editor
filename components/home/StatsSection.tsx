/**
 * 📝 沈翔智学 - 数据统计区域
 * 
 * 展示核心数据指标，用数字建立信任感。
 * 深绿色渐变背景，数字滚动动画，hover交互效果。
 */

"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useScroll, useTransform } from "framer-motion"
import { Users, ThumbsUp, FileText, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================
// 设计系统颜色常量
// ============================================

const COLORS = {
  primary: {
    dark: "#2E7D32",
    darker: "#1B5E20",
  },
  white: "#FFFFFF",
  divider: "rgba(255,255,255,0.2)",
  iconColor: "rgba(255,255,255,0.6)",
  labelColor: "rgba(255,255,255,0.9)",
}

// ============================================
// 类型定义
// ============================================

interface Stat {
  id: string
  value: number | string
  suffix: string
  label: string
  icon: React.ElementType
  isText?: boolean
}

// ============================================
// 数据配置
// ============================================

const stats: Stat[] = [
  { id: "users", value: 10000, suffix: "+", label: "累计服务学生", icon: Users },
  { id: "satisfaction", value: 98, suffix: "%", label: "用户满意度", icon: ThumbsUp },
  { id: "essays", value: 500, suffix: "万+", label: "作文批改次数", icon: FileText },
  { id: "service", value: "24/7", suffix: "", label: "全天候服务", icon: Clock, isText: true }
]

// ============================================
// SVG背景装饰组件
// ============================================

function BackgroundPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.05 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path
            d="M 60 0 L 0 0 0 60"
            fill="none"
            stroke="white"
            strokeWidth="1"
          />
        </pattern>
        <pattern id="circles" width="100" height="100" patternUnits="userSpaceOnUse">
          <circle cx="50" cy="50" r="20" fill="none" stroke="white" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="0.3" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <rect width="100%" height="100%" fill="url(#circles)" />
    </svg>
  )
}

// ============================================
// 数字动画组件
// ============================================

function AnimatedNumber({ 
  value, 
  suffix, 
  isText,
  isInView
}: { 
  value: number | string
  suffix: string
  isText?: boolean
  isInView: boolean
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (isInView && !isText && typeof value === 'number') {
      const duration = 2000
      const steps = 60
      const stepDuration = duration / steps
      const increment = value / steps
      let current = 0

      const timer = setInterval(() => {
        current += increment
        if (current >= value) {
          setDisplayValue(value)
          clearInterval(timer)
        } else {
          setDisplayValue(Math.floor(current))
        }
      }, stepDuration)

      return () => clearInterval(timer)
    }
  }, [isInView, value, isText])

  if (isText) {
    return <span>{value}{suffix}</span>
  }

  return (
    <span>
      {displayValue.toLocaleString()}{suffix}
    </span>
  )
}

// ============================================
// 单个统计项组件
// ============================================

function StatItem({ 
  stat, 
  index, 
  isInView,
  hoveredIndex,
  setHoveredIndex
}: { 
  stat: Stat
  index: number
  isInView: boolean
  hoveredIndex: number | null
  setHoveredIndex: (index: number | null) => void
}) {
  const Icon = stat.icon
  
  // 计算缩放比例
  const getScale = () => {
    if (hoveredIndex === null) return 1
    if (hoveredIndex === index) return 1.05
    return 0.95
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="text-center relative flex flex-col items-center justify-center"
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
      style={{
        transform: `scale(${getScale()})`,
        transition: "transform 0.3s ease-out",
      }}
    >
      {/* 图标 */}
      <div className="mb-4">
        <Icon 
          className="w-6 h-6 mx-auto"
          style={{ color: COLORS.iconColor }}
        />
      </div>

      {/* 数字 */}
      <div 
        className="text-4xl md:text-5xl lg:text-[56px] font-bold mb-3"
        style={{ 
          color: COLORS.white,
          fontFamily: "'Roboto Mono', monospace",
          fontWeight: 700,
          textShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
      >
        <AnimatedNumber 
          value={stat.value} 
          suffix={stat.suffix} 
          isText={stat.isText}
          isInView={isInView}
        />
      </div>
      
      {/* 标签 */}
      <p 
        className="text-sm"
        style={{ 
          color: COLORS.labelColor,
          fontSize: "14px",
          fontWeight: 400,
          letterSpacing: "0.5px",
        }}
      >
        {stat.label}
      </p>
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export function StatsSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef, { once: true, margin: "-100px" })
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  
  // 视差滚动效果
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })
  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "10%"])

  return (
    <section 
      ref={containerRef}
      className="relative overflow-hidden"
      style={{ 
        background: `linear-gradient(135deg, ${COLORS.primary.dark} 0%, ${COLORS.primary.darker} 100%)`,
      }}
    >
      {/* SVG背景装饰 - 带视差效果 */}
      <motion.div 
        className="absolute inset-0 pointer-events-none"
        style={{ y: backgroundY }}
      >
        <BackgroundPattern />
      </motion.div>

      {/* 内容容器 */}
      <div 
        className="max-w-6xl mx-auto relative z-10"
        style={{
          padding: "60px 20px",
        }}
      >
        {/* 桌面端：4列布局 */}
        <div className="hidden lg:grid lg:grid-cols-4 gap-10 items-center">
          {stats.map((stat, index) => (
            <div key={stat.id} className="relative flex items-center justify-center">
              <StatItem 
                stat={stat} 
                index={index} 
                isInView={isInView}
                hoveredIndex={hoveredIndex}
                setHoveredIndex={setHoveredIndex}
              />
              {/* 竖线分隔 */}
              {index < stats.length - 1 && (
                <div 
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-16"
                  style={{
                    width: "1px",
                    backgroundColor: COLORS.divider,
                    transform: "translateX(20px) translateY(-50%)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* 平板端：2x2布局 */}
        <div className="hidden md:grid md:grid-cols-2 lg:hidden gap-8">
          {stats.map((stat, index) => (
            <StatItem 
              key={stat.id}
              stat={stat} 
              index={index} 
              isInView={isInView}
              hoveredIndex={hoveredIndex}
              setHoveredIndex={setHoveredIndex}
            />
          ))}
        </div>

        {/* 移动端：单列布局 */}
        <div className="grid grid-cols-1 md:hidden gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="text-center"
            >
              {/* 图标 */}
              <div className="mb-3">
                <stat.icon 
                  className="w-5 h-5 mx-auto"
                  style={{ color: COLORS.iconColor }}
                />
              </div>

              {/* 数字 - 移动端40px */}
              <div 
                className="text-[40px] font-bold mb-2"
                style={{ 
                  color: COLORS.white,
                  fontFamily: "'Roboto Mono', monospace",
                  fontWeight: 700,
                  textShadow: "0 2px 4px rgba(0,0,0,0.2)",
                }}
              >
                <AnimatedNumber 
                  value={stat.value} 
                  suffix={stat.suffix} 
                  isText={stat.isText}
                  isInView={isInView}
                />
              </div>
              
              {/* 标签 */}
              <p 
                className="text-sm"
                style={{ 
                  color: COLORS.labelColor,
                  fontSize: "14px",
                  fontWeight: 400,
                  letterSpacing: "0.5px",
                }}
              >
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default StatsSection
