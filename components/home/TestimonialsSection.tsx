/**
 * 📝 沈翔智学 - 用户评价区域
 * 
 * 展示真实用户评价，使用响应式瀑布流布局。
 * 包含评价卡片、用户信息、点赞功能等。
 */

"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Quote, Star, ThumbsUp, X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================
// 设计系统颜色常量
// ============================================

const COLORS = {
  primary: {
    main: "#4CAF50",
    dark: "#2E7D32",
    light: "#E8F5E9",
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
  star: "#FFA000",
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
    content: "作为家长，终于不用为孩子的作文辅导发愁了。AI 批改既专业又及时，孩子也更愿意写作文了。",
    author: "王女士",
    role: "parent",
    roleLabel: "学生家长",
    rating: 5,
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
    content: "以前写作文总是凑字数，现在AI会告诉我哪里可以展开，怎么写更有深度。老师都说我进步很大！",
    author: "刘雨萱",
    role: "student",
    roleLabel: "初三学生",
    rating: 5,
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
    content: "半夜写作业遇到不会的题，问AI马上就有答案，还会一步步教我怎么做，简直是救星！",
    author: "周小雨",
    role: "student",
    roleLabel: "高二学生",
    rating: 5,
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
    content: "高考前用来练作文，每篇都能得到详细的反馈。最后高考作文拿了52分，超出预期！",
    author: "郑同学",
    role: "student",
    roleLabel: "高三毕业生",
    rating: 5,
    likes: 289
  },
  {
    id: "11",
    content: "女儿以前最怕写作文，现在每次写完都要让AI批改，还会根据建议修改。学习态度都变了！",
    author: "林女士",
    role: "parent",
    roleLabel: "学生家长",
    rating: 5,
    likes: 167
  },
  {
    id: "12",
    content: "数学题不会做，拍照上传就能得到解答，还会告诉我用了什么知识点，比问同学方便多了。",
    author: "黄小杰",
    role: "student",
    roleLabel: "初一学生",
    rating: 5,
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
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.33, 1, 0.68, 1] as [number, number, number, number]
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
      className="px-2 py-0.5 text-xs font-medium rounded-full"
      style={{
        backgroundColor: roleStyle.bg,
        color: roleStyle.text,
        height: "22px",
        lineHeight: "18px",
      }}
    >
      {label}
    </span>
  )
}

// ============================================
// 评价卡片组件
// ============================================

function TestimonialCard({ 
  testimonial, 
  index,
  onExpand 
}: { 
  testimonial: Testimonial
  index: number
  onExpand: (testimonial: Testimonial) => void
}) {
  const [isLiked, setIsLiked] = useState(false)
  const [likes, setLikes] = useState(testimonial.likes)
  const [isExpanded, setIsExpanded] = useState(false)
  
  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isLiked) {
      setLikes(prev => prev + 1)
      setIsLiked(true)
    }
  }

  const shouldTruncate = testimonial.content.length > 100

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.1)" }}
      className="relative bg-white rounded-2xl p-6 cursor-pointer transition-all duration-200"
      style={{
        width: "100%",
        minHeight: "200px",
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
      onClick={() => onExpand(testimonial)}
    >
      {/* 引号装饰 */}
      <Quote 
        className="absolute top-6 right-6 w-6 h-6 rotate-180" 
        style={{ color: COLORS.primary.main, opacity: 0.1 }}
      />

      {/* 评分星星 */}
      <div className="flex gap-1 mb-4">
        {Array.from({ length: testimonial.rating }).map((_, i) => (
          <Star 
            key={i} 
            className="w-4 h-4" 
            fill={COLORS.star}
            style={{ color: COLORS.star }}
          />
        ))}
      </div>

      {/* 评价内容 */}
      <div className="mb-6">
        <p 
          className={cn(
            "text-sm leading-relaxed",
            !isExpanded && shouldTruncate && "line-clamp-3"
          )}
          style={{ color: COLORS.gray[700], lineHeight: 1.6 }}
        >
          "{testimonial.content}"
        </p>
        {shouldTruncate && !isExpanded && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(true)
            }}
            className="text-xs font-medium mt-1 flex items-center gap-0.5"
            style={{ color: COLORS.primary.main }}
          >
            ...展开 <ChevronDown className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 用户信息和点赞 */}
      <div 
        className="flex items-center justify-between pt-4 border-t"
        style={{ borderColor: COLORS.border }}
      >
        <div className="flex items-center gap-3">
          {/* 头像 */}
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm"
            style={{ 
              background: `linear-gradient(135deg, ${COLORS.primary.light}, ${COLORS.primary.main}20)`,
              color: COLORS.primary.dark,
            }}
          >
            {testimonial.author.charAt(0)}
          </div>
          <div>
            <p 
              className="text-sm"
              style={{ color: COLORS.gray[900], fontWeight: 500 }}
            >
              {testimonial.author}
            </p>
            <RoleTag role={testimonial.role} label={testimonial.roleLabel} />
          </div>
        </div>

        {/* 点赞按钮 */}
        <button
          onClick={handleLike}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
            isLiked ? "bg-green-50" : "hover:bg-gray-50"
          )}
          style={{ 
            color: isLiked ? COLORS.primary.main : COLORS.gray[500],
          }}
        >
          <ThumbsUp className={cn("w-3.5 h-3.5", isLiked && "fill-current")} />
          <span>{likes}</span>
        </button>
      </div>
    </motion.div>
  )
}

// ============================================
// 详情模态框组件
// ============================================

function TestimonialModal({ 
  testimonial, 
  onClose 
}: { 
  testimonial: Testimonial | null
  onClose: () => void
}) {
  if (!testimonial) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl p-8 max-w-lg w-full relative"
          style={{ boxShadow: "0 24px 48px rgba(0,0,0,0.2)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: COLORS.gray[500] }} />
          </button>

          {/* 评分 */}
          <div className="flex gap-1 mb-4">
            {Array.from({ length: testimonial.rating }).map((_, i) => (
              <Star 
                key={i} 
                className="w-5 h-5" 
                fill={COLORS.star}
                style={{ color: COLORS.star }}
              />
            ))}
          </div>

          {/* 完整评价内容 */}
          <p 
            className="text-base leading-relaxed mb-6"
            style={{ color: COLORS.gray[700], lineHeight: 1.8 }}
          >
            "{testimonial.content}"
          </p>

          {/* 用户信息 */}
          <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: COLORS.border }}>
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center font-semibold"
              style={{ 
                background: `linear-gradient(135deg, ${COLORS.primary.light}, ${COLORS.primary.main}20)`,
                color: COLORS.primary.dark,
              }}
            >
              {testimonial.author.charAt(0)}
            </div>
            <div>
              <p 
                className="text-base font-medium"
                style={{ color: COLORS.gray[900] }}
              >
                {testimonial.author}
              </p>
              <RoleTag role={testimonial.role} label={testimonial.roleLabel} />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ============================================
// 主组件
// ============================================

export function TestimonialsSection() {
  const [selectedTestimonial, setSelectedTestimonial] = useState<Testimonial | null>(null)

  return (
    <section 
      id="testimonials" 
      className="py-24 md:py-32"
      style={{ backgroundColor: COLORS.gray[50] }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {/* 页面标题区域 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          {/* 小标签 */}
          <span 
            className="text-xs font-medium uppercase tracking-wider mb-4 block"
            style={{ color: COLORS.primary.main, fontSize: "12px" }}
          >
            用户评价
          </span>
          
          {/* 主标题 */}
          <h2 
            className="text-4xl md:text-5xl mb-4"
            style={{ 
              color: COLORS.gray[900],
              fontWeight: 700,
              fontSize: "40px",
            }}
          >
            听听他们怎么说
          </h2>

          {/* 副标题 */}
          <p 
            className="text-base"
            style={{ color: COLORS.gray[600], fontSize: "16px" }}
          >
            来自10,000+真实用户的学习体验分享
          </p>
        </motion.div>

        {/* 评价卡片网格 - 响应式瀑布流 */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="grid gap-6"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          }}
        >
          {testimonials.map((testimonial, index) => (
            <TestimonialCard
              key={testimonial.id}
              testimonial={testimonial}
              index={index}
              onExpand={setSelectedTestimonial}
            />
          ))}
        </motion.div>
      </div>

      {/* 详情模态框 */}
      {selectedTestimonial && (
        <TestimonialModal
          testimonial={selectedTestimonial}
          onClose={() => setSelectedTestimonial(null)}
        />
      )}
    </section>
  )
}

export default TestimonialsSection
