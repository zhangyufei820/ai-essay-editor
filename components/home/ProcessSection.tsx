/**
 * 📝 沈翔学校 - 使用流程区域
 * 
 * 展示多智能体协同的三步学习流程。
 * 包含跑马灯式的 AI 模型展示。
 */

"use client"

import { motion } from "framer-motion"
import { Camera, Cpu, Lightbulb, type LucideIcon } from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

// ============================================
// AI 模型列表（跑马灯展示）
// ============================================

const aiModels = [
  "GPT-5.4",
  "Claude 4.6",
  "Gemini 3.1",
  "Math Expert Agent",
  "Writing Coach Agent",
  "Logic Analyzer",
  "DeepSeek V3",
  "Qwen 3.0",
  "Essay Master Agent",
  "Grammar Expert",
]

// ============================================
// 流程步骤配置
// ============================================

interface Step {
  number: string
  icon: LucideIcon
  title: string
  description: string
  hasMarquee?: boolean
}

const steps: Step[] = [
  {
    number: "01",
    icon: Camera,
    title: "全维感知：多模态灵感接入",
    description: "拍照、文档或语音，支持全场景信息输入。多模态识别技术精准捕捉每一个知识点，让你的学习痕迹无缝同步，化琐碎为系统。"
  },
  {
    number: "02",
    icon: Cpu,
    title: "集群调度：多智能体深度协同",
    description: "瞬间调动全球顶尖模型集群。根据任务属性自动指派垂直领域 Agent，通过多轮博弈与思维链推理，为你输出多维度、高精度的深度解析。",
    hasMarquee: true
  },
  {
    number: "03",
    icon: Lightbulb,
    title: "知识内化：个性化成长全案",
    description: "超越标准答案。基于 Agent 的深度洞察，为你生成量身定制的反馈闭环。不仅解决当下难题，更通过思路拆解与弱项强化，实现能力的跨越式进化。"
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
// 跑马灯组件
// ============================================

function AIModelMarquee() {
  // 复制两份实现无缝滚动
  const doubledModels = [...aiModels, ...aiModels]
  
  return (
    <div className="mt-4 overflow-hidden relative">
      {/* 左侧渐变遮罩 */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-8 z-10"
        style={{ 
          background: `linear-gradient(to right, ${brandColors[50]}, transparent)`
        }}
      />
      {/* 右侧渐变遮罩 */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-8 z-10"
        style={{ 
          background: `linear-gradient(to left, ${brandColors[50]}, transparent)`
        }}
      />
      
      <motion.div
        animate={{ x: [0, -50 * aiModels.length] }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: "loop",
            duration: 20,
            ease: "linear",
          },
        }}
        className="flex gap-3 whitespace-nowrap"
      >
        {doubledModels.map((model, index) => (
          <span
            key={index}
            className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium"
            style={{ 
              backgroundColor: brandColors[100],
              color: brandColors[800]
            }}
          >
            <span 
              className="w-1.5 h-1.5 rounded-full mr-2"
              style={{ backgroundColor: brandColors[500] }}
            />
            {model}
          </span>
        ))}
      </motion.div>
    </div>
  )
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
        className="w-12 h-12 rounded-full text-white font-bold text-lg flex items-center justify-center mb-6 shadow-lg"
        style={{ backgroundColor: brandColors[900] }}
      >
        {step.number}
      </div>

      {/* 图标 - 增强阴影立体感 */}
      <div 
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ 
          backgroundColor: brandColors[50],
          boxShadow: `0 8px 24px ${brandColors[200]}80, 0 4px 10px ${brandColors[100]}60`
        }}
      >
        <Icon 
          className="w-10 h-10" 
          style={{ 
            color: brandColors[700],
            filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.12))'
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

      {/* 跑马灯（仅第二步显示） */}
      {step.hasMarquee && <AIModelMarquee />}
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
      <div className="flex-1 pb-8">
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
        
        {/* 跑马灯（仅第二步显示） */}
        {step.hasMarquee && <AIModelMarquee />}
      </div>
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export function ProcessSection() {
  return (
    <section id="process" className="py-24 md:py-32" style={{ backgroundColor: creamColors[100] }}>
      <div className="max-w-6xl mx-auto px-4 md:px-6">
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
            集合全球智慧
          </span>
          
          {/* 主标题 - 强烈立体感 */}
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl font-black mb-4"
            style={{ 
              color: slateColors[900],
              textShadow: '0 4px 8px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            三步开启深度进化
          </h2>

          {/* 副标题 */}
          <p 
            className="text-lg md:text-xl max-w-2xl mx-auto"
            style={{ color: slateColors[500] }}
          >
            多智能体协同，定义未来学习新范式
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
