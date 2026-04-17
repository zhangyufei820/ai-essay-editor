/**
 * 📝 沈翔智学 - 用户评价区域
 *
 * 展示真实用户评价，使用响应式瀑布流布局。
 * 包含评价卡片、用户信息、点赞功能等。
 * 特性：悬停展开、3D倾斜、绿色星光
 */

"use client"

import { useState, useRef } from "react"
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion"
import { Quote, Star, ThumbsUp, X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================
// 🎨 Design Tokens - 与主页一致的绿色系
// ============================================

const COLORS = {
  primary: {
    main: "#00C896",     // 极光绿（与主页一致）
    dark: "#0d3a1f",     // 深邃墨绿
    light: "#E8F5E9",    // 浅绿背景
  },
  gray: {
    50: "#FAFAFA",
    100: "#F5F5F5",
    200: "#EEEEEE",
    300: "#E0E0E0",
    400: "#BDBDBD",
    500: "#9E9E9E",
    600: "#757575",
    700: "#616161",
    800: "#424242",
    900: "#212121",
  },
  star: "#00C896",       // 绿色星星（与主页一致）
  roles: {
    student: { bg: "#E3F2FD", text: "#1976D2" },
    parent: { bg: "#E8F5E9", text: "#2E7D32" },
    teacher: { bg: "#FFF3E0", text: "#F57C00" },
  },
  border: "#F0F0F0",
}

// ============================================
// 类型定义
// ============================================

interface Testimonial {
  id: string
  content: string
  author: string
  role: "student" | "parent" | "teacher"
  roleLabel: string
  rating: number
  likes: number
  avatar?: string
}

// ============================================
// 评价数据配置
// ============================================

const testimonials: Testimonial[] = [
  {
    id: "1",
    content: "沈翔的作文批改太专业了！每次都能精准指出我的问题，还给出具体的修改建议。用了三个月，作文成绩提高了一个档次。",
    author: "张小明",
    role: "student",
    roleLabel: "高三学生",
    rating: 5,
    likes: 128
  },
  {
    id: "2",
    content: "作为家长，终于不用为孩子的作文辅导发愁了。AI 批改既专业又及时，孩子也更愿意写作文了。偶尔有小错误，但整体很不错。",
    author: "王女士",
    role: "parent",
    roleLabel: "学生家长",
    rating: 4,
    likes: 96
  },
  {
    id: "3",
    content: "24小时都能问问题，再也不用等老师有空了。AI 解答得很清楚，还会举例子帮我理解，比自己看书高效多了。",
    author: "李同学",
    role: "student",
    roleLabel: "初二学生",
    rating: 5,
    likes: 87
  },
  {
    id: "4",
    content: "学习规划功能帮我合理安排了复习时间，不再盲目刷题。按照计划学习，效率提高了很多，强烈推荐！",
    author: "陈小华",
    role: "student",
    roleLabel: "高一学生",
    rating: 5,
    likes: 156
  },
  {
    id: "5",
    content: "以前写作文总是凑字数，现在AI会告诉我哪里可以展开，怎么写更有深度。老师都说我进步很大！界面操作可以更简单些。",
    author: "刘雨萱",
    role: "student",
    roleLabel: "初三学生",
    rating: 4,
    likes: 203
  },
  {
    id: "6",
    content: "孩子用了两个月，语文成绩从75分提到了88分！最重要的是他现在愿意主动写作文了，太感谢了。",
    author: "赵先生",
    role: "parent",
    roleLabel: "学生家长",
    rating: 5,
    likes: 178
  },
  {
    id: "7",
    content: "半夜写作业遇到不会的题，问AI马上就有答案，还会一步步教我怎么做，简直是救星！有时候网络有点慢。",
    author: "周小雨",
    role: "student",
    roleLabel: "高二学生",
    rating: 4,
    likes: 145
  },
  {
    id: "8",
    content: "我是语文老师，推荐给学生用的。批改质量很专业，能帮学生发现自己发现不了的问题。",
    author: "孙老师",
    role: "teacher",
    roleLabel: "语文教师",
    rating: 5,
    likes: 234
  },
  {
    id: "9",
    content: "之前作文总是写不长，现在AI教我怎么用细节描写，怎么加入自己的感受，作文终于能写满格子了！",
    author: "吴小凡",
    role: "student",
    roleLabel: "小学六年级",
    rating: 5,
    likes: 112
  },
  {
    id: "10",
    content: "高考前用来练作文，每篇都能得到详细的反馈。最后高考作文拿了52分，超出预期！希望能有更多模板。",
    author: "郑同学",
    role: "student",
    roleLabel: "高三毕业生",
    rating: 4,
    likes: 289
  },
  {
    id: "11",
    content: "女儿以前最怕写作文，现在每次写完都要让AI批改，还会根据建议修改，学习态度都变了！",
    author: "林女士",
    role: "parent",
    roleLabel: "学生家长",
    rating: 5,
    likes: 167
  },
  {
    id: "12",
    content: "数学题不会做，拍照上传就能得到解答，还会告诉我用了什么知识点，比问同学方便多了。识别准确率可以再提高。",
    author: "黄小杰",
    role: "student",
    roleLabel: "初一学生",
    rating: 4,
    likes: 98
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
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number]
    }
  }
}

// ============================================
// 角色标签组件
// ============================================

function RoleTag({ role, label }: { role: "student" | "parent" | "teacher"; label: string }) {
  const roleStyle = COLORS.roles[role]

  return (
    <span
      className="px-2.5 py-1 text-xs font-medium rounded-full"
      style={{
        backgroundColor: roleStyle.bg,
        color: roleStyle.text,
      }}
    >
      {label}
    </span>
  )
}

// ============================================
// 评价卡片组件 - 悬停展开 + 3D倾斜
// ============================================

function TestimonialCard({
  testimonial,
  index,
}: {
  testimonial: Testimonial
  index: number
}) {
  const [isLiked, setIsLiked] = useState(false)
  const [likes, setLikes] = useState(testimonial.likes)
  const [isHovered, setIsHovered] = useState(false)

  // 3D 倾斜 refs
  const cardRef = useRef<HTMLDivElement>(null)
  const rotateX = useMotionValue(0)
  const rotateY = useMotionValue(0)

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!isLiked) {
      setLikes(prev => prev + 1)
      setIsLiked(true)
    }
  }

  // 3D 倾斜处理
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateXValue = (y - centerY) / 25
    const rotateYValue = (centerX - x) / 25
    rotateX.set(rotateXValue)
    rotateY.set(rotateYValue)
  }

  const handleMouseLeave = () => {
    rotateX.set(0)
    rotateY.set(0)
    setIsHovered(false)
  }

  // 瀑布流高度变化
  const baseHeight = 200 + (index % 3) * 30

  return (
    <motion.div
      ref={cardRef}
      variants={cardVariants}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        height: isHovered ? `${baseHeight + 80}px` : `${baseHeight}px`,
      }}
      whileHover={{
        y: -8,
        transition: { duration: 0.3 }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative bg-white rounded-2xl p-6 cursor-pointer overflow-hidden"
      onClick={() => {}}
    >
      {/* 科技感背景光晕 - 悬停时显示 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${COLORS.primary.main}08 0%, transparent 70%)`,
        }}
      />

      {/* 左侧科技光条 */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{
          opacity: isHovered ? 1 : 0,
          scaleY: isHovered ? 1 : 0
        }}
        transition={{ duration: 0.3 }}
        style={{
          background: `linear-gradient(180deg, ${COLORS.primary.main} 0%, ${COLORS.primary.main}60 100%)`,
          boxShadow: `0 0 20px ${COLORS.primary.main}40`,
        }}
      />

      {/* 右上角装饰引号 */}
      <Quote
        className="absolute top-4 right-4 w-10 h-10 rotate-180"
        style={{
          color: COLORS.primary.main,
          opacity: isHovered ? 0.15 : 0.05,
          transition: "opacity 0.3s"
        }}
      />

      {/* 评分星星 - 绿色系 */}
      <div className="flex gap-1 mb-4">
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <Star
              className="w-4 h-4"
              fill={COLORS.star}
              style={{ color: COLORS.star }}
            />
          </motion.div>
        ))}
      </div>

      {/* 评价内容 - 悬停展开 */}
      <div className="mb-4">
        <p
          className={cn(
            "text-sm leading-relaxed transition-all duration-300",
          )}
          style={{
            color: COLORS.gray[700],
            lineHeight: 1.7,
            display: isHovered ? "-webkit-box" : "-webkit-box",
            WebkitLineClamp: isHovered ? "unset" : 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          "{testimonial.content}"
        </p>
      </div>

      {/* 用户信息和点赞 - 底部固定 */}
      <div
        className="absolute bottom-4 left-6 right-6 flex items-center justify-between"
        style={{
          opacity: isHovered ? 1 : 0.8,
          transform: `translateY(${isHovered ? 0 : 10}px)`,
          transition: "all 0.3s ease"
        }}
      >
        <div className="flex items-center gap-3">
          {/* 头像 - 科技感光晕 */}
          <motion.div
            className="relative w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm"
            whileHover={{ scale: 1.1 }}
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary.main}20 0%, ${COLORS.primary.main}10 100%)`,
              color: COLORS.primary.dark,
              boxShadow: `0 0 20px ${COLORS.primary.main}20`,
            }}
          >
            {testimonial.author.charAt(0)}
            {/* 头像呼吸光效 */}
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{
                boxShadow: [
                  `0 0 10px ${COLORS.primary.main}20`,
                  `0 0 20px ${COLORS.primary.main}30`,
                  `0 0 10px ${COLORS.primary.main}20`,
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </motion.div>
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: COLORS.gray[900] }}
            >
              {testimonial.author}
            </p>
            <RoleTag role={testimonial.role} label={testimonial.roleLabel} />
          </div>
        </div>

        {/* 点赞按钮 - 科技感 */}
        <motion.button
          onClick={handleLike}
          aria-label={`点赞 ${likes}`}
          aria-pressed={isLiked}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
            isLiked
              ? "bg-gradient-to-r from-emerald-50 to-green-50"
              : "bg-slate-50 hover:from-emerald-50 hover:to-green-50"
          )}
          style={{
            color: isLiked ? COLORS.primary.main : COLORS.gray[500],
            boxShadow: isLiked ? `0 0 15px ${COLORS.primary.main}20` : "none",
          }}
        >
          <motion.div
            animate={isLiked ? {
              scale: [1, 1.3, 1],
            } : {}}
            transition={{ duration: 0.3 }}
          >
            <ThumbsUp
              className={cn("w-3.5 h-3.5", isLiked && "fill-current")}
            />
          </motion.div>
          <span>{likes}</span>
        </motion.button>
      </div>

      {/* 底部渐变遮罩 - 非悬停时 */}
      {!isHovered && (
        <div
          className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{
            background: "linear-gradient(to top, white 30%, transparent 100%)",
          }}
        />
      )}
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="py-24 md:py-32 relative overflow-hidden"
      style={{ backgroundColor: "#FAFAFA" }}
    >
      {/* 背景装饰 - 科技感网格 */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(${COLORS.primary.main} 1px, transparent 1px),
            linear-gradient(90deg, ${COLORS.primary.main} 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px"
        }}
      />

      {/* 背景光晕 */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${COLORS.primary.main}08 0%, transparent 70%)`,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
        {/* 页面标题区域 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-20"
        >
          {/* 小标签 - 科技感胶囊 */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary.main}15 0%, ${COLORS.primary.main}08 100%)`,
              border: `1px solid ${COLORS.primary.main}30`,
            }}
            whileHover={{
              boxShadow: `0 0 30px ${COLORS.primary.main}20`,
            }}
          >
            <motion.div
              className="w-1.5 h-1.5 rounded-full"
              animate={{
                boxShadow: [
                  `0 0 6px ${COLORS.primary.main}`,
                  `0 0 12px ${COLORS.primary.main}`,
                  `0 0 6px ${COLORS.primary.main}`,
                ],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ backgroundColor: COLORS.primary.main }}
            />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: COLORS.primary.main, letterSpacing: "2px" }}
            >
              用户评价
            </span>
          </motion.div>

          {/* 主标题 */}
          <h2
            className="text-4xl md:text-5xl mb-6 font-bold"
            style={{
              color: COLORS.primary.dark,
              letterSpacing: "1px",
            }}
          >
            听听他们怎么说
          </h2>

          {/* 副标题 */}
          <motion.p
            className="text-base md:text-lg"
            style={{ color: COLORS.gray[600] }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            来自<span className="font-semibold" style={{ color: COLORS.primary.main }}>10,000+</span>真实用户的学习体验分享
          </motion.p>
        </motion.div>

        {/* 评价卡片网格 - 瀑布流布局，间距加大 */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="grid gap-8 md:gap-10"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          }}
        >
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={testimonial.id}
              testimonial={testimonial}
              index={index}
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}

export default TestimonialsSection