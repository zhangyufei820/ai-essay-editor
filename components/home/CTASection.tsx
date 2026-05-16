/**
 * 📝 沈翔学校 - 最终 CTA 区域
 * 
 * 主页的最后一个内容板块，用强有力的行动召唤促使用户转化。
 * 使用深色卡片容器，配合毕业照图片和强烈的汇聚动画效果。
 */

"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { ArrowRight, Sparkles } from "lucide-react"
import { brandColors, creamColors } from "@/lib/design-tokens"

// ============================================
// 动画配置 - 从四周汇聚的强烈动画
// ============================================

const containerVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1] as const }
  }
}

// 图标从上方落下
const iconVariants = {
  hidden: { 
    opacity: 0, 
    y: -100,
    scale: 0,
    rotate: -180
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: 0,
    transition: { 
      duration: 0.8, 
      ease: [0.34, 1.56, 0.64, 1] as const,
      delay: 0.2
    }
  }
}

// 主标题从左侧飞入
const titleVariants = {
  hidden: { 
    opacity: 0, 
    x: -200,
    scale: 0.5,
    filter: "blur(20px)"
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { 
      duration: 0.9, 
      ease: [0.25, 0.46, 0.45, 0.94] as const,
      delay: 0.4
    }
  }
}

// 副标题从右侧飞入
const subtitleVariants = {
  hidden: { 
    opacity: 0, 
    x: 200,
    scale: 0.5,
    filter: "blur(20px)"
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { 
      duration: 0.9, 
      ease: [0.25, 0.46, 0.45, 0.94] as const,
      delay: 0.6
    }
  }
}

// 按钮从下方弹出
const buttonVariants = {
  hidden: { 
    opacity: 0, 
    y: 100,
    scale: 0.3
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { 
      duration: 0.7, 
      ease: [0.34, 1.56, 0.64, 1] as const,
      delay: 0.8
    }
  }
}

// 图片区域淡入放大
const imageVariants = {
  hidden: { 
    opacity: 0, 
    scale: 0.8,
    y: 50
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { 
      duration: 1, 
      ease: [0.33, 1, 0.68, 1] as const
    }
  }
}


// ============================================
// 主组件
// ============================================

export function CTASection() {
  const router = useRouter()

  return (
    <section className="sx-section overflow-hidden" style={{ backgroundColor: creamColors[100] }}>
      <div className="mx-auto w-[min(100%-2rem,64rem)]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="relative overflow-hidden rounded-[28px] border border-white/10 shadow-2xl"
          style={{
            background: `linear-gradient(135deg, ${brandColors[900]} 0%, ${brandColors[800]} 50%, ${brandColors[900]} 100%)`
          }}
        >
          {/* 背景装饰 */}
          <div className="absolute inset-0 pointer-events-none">
            <div 
              className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-30 blur-3xl"
              style={{ backgroundColor: brandColors[700] }}
            />
            <div 
              className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-20 blur-2xl"
              style={{ backgroundColor: brandColors[600] }}
            />
            
            {/* 网格装饰 */}
            <div 
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                backgroundSize: '32px 32px'
              }}
            />

            {/* 静态光效 */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
              style={{ 
                background: `radial-gradient(circle, ${brandColors[500]}40 0%, transparent 70%)`
              }}
            />
          </div>

          {/* 毕业照图片区域 */}
          <motion.div 
            className="relative z-10 p-6 md:p-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={imageVariants}
          >
            <div className="relative w-full aspect-[16/9] md:aspect-[21/9] rounded-2xl overflow-hidden bg-white/10 shadow-2xl">
              <Image
                src="/images/design-mode/首页主图.jpg"
                alt="毕业学生"
                fill
                sizes="(min-width: 768px) 896px, 100vw"
                className="object-cover"
              />
            </div>
          </motion.div>

          {/* 内容区域 - 图片下方，带汇聚动画 */}
          <div className="relative z-10 px-6 md:px-8 pb-10 md:pb-16 text-center">
            {/* 图标 - 从上方落下 */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={iconVariants}
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm mb-6"
            >
              <Sparkles className="w-7 h-7 text-white" />
            </motion.div>

            {/* 主标题 - 从左侧飞入 */}
            <motion.h2 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={titleVariants}
              className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4"
            >
              准备好开始了吗？
            </motion.h2>

            {/* 副标题 - 从右侧飞入 */}
            <motion.p 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={subtitleVariants}
              className="text-lg md:text-xl max-w-xl mx-auto mb-10"
              style={{ color: brandColors[100] }}
            >
              加入 10,000+ 学生，体验 AI 智能学习带来的改变
            </motion.p>

            {/* CTA 按钮 - 从下方弹出 */}
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={buttonVariants}
              whileHover={{ 
                scale: 1.05,
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)"
              }}
              whileTap={{ scale: 0.95 }}
            >
              <button
                onClick={() => router.push("/chat")}
                className="group inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 font-semibold shadow-lg transition-all duration-300 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-green-900"
                style={{ color: brandColors[900] }}
              >
                <span>免费开始使用</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1">
                  <ArrowRight className="w-5 h-5" />
                </span>
              </button>
              
              {/* 副CTA按钮 */}
              <button
                onClick={() => router.push("/pricing")}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-white/30 px-6 py-3 font-medium text-white transition-all duration-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-green-900"
              >
                查看价格方案
              </button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default CTASection
