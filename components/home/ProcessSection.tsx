/**
 * 📝 沈翔学校 - 使用流程区域
 * 
 * 展示从上传材料到复盘提升的三步学习流程。
 */

"use client"

import { motion } from "framer-motion"
import { Camera, CheckCircle2, Lightbulb, type LucideIcon } from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

// ============================================
// 流程步骤配置
// ============================================

interface Step {
  number: string
  icon: LucideIcon
  title: string
  description: string
}

const steps: Step[] = [
  {
    number: "01",
    icon: Camera,
    title: "上传材料",
    description: "作文、试卷、题目或学习问题都可以作为入口，先把真实学习现场放进来。"
  },
  {
    number: "02",
    icon: CheckCircle2,
    title: "生成反馈",
    description: "AI 把问题、原因、修改方向和训练建议整理成清晰清单，减少来回解释。"
  },
  {
    number: "03",
    icon: Lightbulb,
    title: "复盘提升",
    description: "学生按建议修改和练习，家长、老师也能基于同一份反馈继续跟进。"
  }
]

// ============================================
// 动画配置
// ============================================

const titleVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1] as const }
  }
}

const stepVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { 
      delay: index * 0.2, 
      duration: 0.5,
      ease: [0.33, 1, 0.68, 1] as const
    }
  })
}

const mobileStepVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: { 
      delay: index * 0.15, 
      duration: 0.5,
      ease: [0.33, 1, 0.68, 1] as const
    }
  })
}

const lineVariants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { delay: 0.3, duration: 0.8, ease: [0.33, 1, 0.68, 1] as const }
  }
}

// ============================================
// 桌面端步骤卡片
// ============================================

function DesktopStepCard({ step, index }: { step: Step; index: number }) {
  const Icon = step.icon
  
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={stepVariants}
      className="flex flex-col items-center text-center relative z-10 w-1/3 px-4"
    >
      {/* 步骤编号 */}
      <div 
        className="w-12 h-12 rounded-full text-white font-bold text-lg flex items-center justify-center mb-6 shadow-md"
        style={{ backgroundColor: brandColors[900] }}
      >
        {step.number}
      </div>

      {/* 图标 */}
      <div 
        className="mb-6 flex size-16 items-center justify-center rounded-lg border border-primary/15 bg-primary/10"
        style={{ 
          backgroundColor: brandColors[50]
        }}
      >
        <Icon 
          className="size-8"
          style={{ 
            color: brandColors[700]
          }} 
        />
      </div>

      {/* 标题 */}
      <h3 
        className="text-lg font-semibold mb-3"
        style={{ color: slateColors[800] }}
      >
        {step.title}
      </h3>

      {/* 描述 */}
      <p 
        className="text-sm leading-relaxed max-w-[280px]"
        style={{ color: slateColors[500] }}
      >
        {step.description}
      </p>

    </motion.div>
  )
}

// ============================================
// 移动端步骤卡片
// ============================================

function MobileStepCard({ step, index, isLast }: { step: Step; index: number; isLast: boolean }) {
  const Icon = step.icon
  
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={mobileStepVariants}
      className="flex gap-4"
    >
      {/* 左侧：编号和连接线 */}
      <div className="flex flex-col items-center">
        <div 
          className="w-10 h-10 rounded-full text-white font-bold flex items-center justify-center shrink-0 text-sm"
          style={{ backgroundColor: brandColors[900] }}
        >
          {step.number}
        </div>
        {!isLast && (
          <div 
            className="w-0.5 flex-1 mt-4"
            style={{ 
              background: `linear-gradient(to bottom, ${brandColors[300]}, ${brandColors[100]})`
            }}
          />
        )}
      </div>

      {/* 右侧：内容 */}
      <div className="min-w-0 flex-1 pb-8">
        <div 
          className="w-14 h-14 rounded-xl flex items-center justify-center mb-4"
          style={{ backgroundColor: brandColors[50] }}
        >
          <Icon className="w-7 h-7" style={{ color: brandColors[700] }} />
        </div>
        <h3 
          className="text-base font-semibold mb-2"
          style={{ color: slateColors[800] }}
        >
          {step.title}
        </h3>
        <p 
          className="text-sm leading-relaxed"
          style={{ color: slateColors[500] }}
        >
          {step.description}
        </p>
        
      </div>
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export function ProcessSection() {
  return (
    <section id="process" className="sx-section" style={{ backgroundColor: creamColors[100] }}>
      <div className="sx-container">
        {/* 板块标题 */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={titleVariants}
          className="text-center mb-16 md:mb-20"
        >
          {/* 小标题 */}
          <span 
            className="text-sm font-medium uppercase tracking-wider mb-4 block"
            style={{ color: brandColors[700] }}
          >
            学习闭环
          </span>
          
          {/* 主标题 - 强烈立体感 */}
          <h2 
            className="sx-section-title mb-4"
            style={{ color: slateColors[900] }}
          >
            从发现问题到真正改进
          </h2>

          {/* 副标题 */}
          <p 
            className="text-lg md:text-xl max-w-2xl mx-auto"
            style={{ color: slateColors[500] }}
          >
            首页不再讲复杂模型编排，只呈现学生每天能用上的路径。
          </p>
        </motion.div>

        {/* 流程步骤 - 桌面端 */}
        <div className="hidden md:flex items-start justify-between relative">
          {/* 连接线 */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={lineVariants}
            className="absolute top-16 left-[20%] right-[20%] h-0.5 origin-left"
            style={{ 
              background: `linear-gradient(to right, ${brandColors[200]}, ${brandColors[300]}, ${brandColors[200]})`
            }}
          />

          {steps.map((step, index) => (
            <DesktopStepCard key={index} step={step} index={index} />
          ))}
        </div>

        {/* 流程步骤 - 移动端 */}
        <div className="md:hidden space-y-0">
          {steps.map((step, index) => (
            <MobileStepCard 
              key={index} 
              step={step} 
              index={index} 
              isLast={index === steps.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default ProcessSection
