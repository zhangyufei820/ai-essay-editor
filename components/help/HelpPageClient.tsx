'use client'

import Image from "next/image"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { 
  BookOpen, 
  MessageCircle, 
  CreditCard, 
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ExternalLink,
  Phone
} from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"
import { ShenxiangInterfaceIcon } from "@/components/icons/ShenxiangInterfaceIcons"

// 客服联系方式配置
const contactInfo = {
  phone: "19132896773",
  email: "support@shenxiang.school",
  wechatQR: "/images/design-mode/站长微信.jpg",
}

// ============================================
// 常见问题数据
// ============================================

const faqCategories = [
  {
    title: "开始使用",
    icon: BookOpen,
    questions: [
      {
        q: "我第一次来，应该先做什么？",
        a: "先登录账号，再从首页选择你想用的功能。最常用的是作文批改、智能对话和图片生成。"
      },
      {
        q: "我找不到功能入口怎么办？",
        a: "先回到首页，再看顶部菜单或底部导航。你也可以直接进入对应页面，比如作文批改、积分页或价格页。"
      },
      {
        q: "这个网站主要能帮我做什么？",
        a: "可以帮你批改作文、回答问题、整理学习内容、生成图片，也可以查看积分和购买套餐。"
      }
    ]
  },
  {
    title: "账号和积分",
    icon: CreditCard,
    questions: [
      {
        q: "怎么查看我的积分？",
        a: "登录后进入积分页或设置页，就能看到当前余额和使用记录。"
      },
      {
        q: "付完钱以后，积分没到账怎么办？",
        a: "先刷新页面，等几分钟再看。如果还是没有到账，请保留订单号和支付时间，联系客服电话或邮箱。"
      },
      {
        q: "我余额不够了怎么办？",
        a: "可以先去价格页看看适合你的套餐或积分包，再按需要购买。"
      }
    ]
  },
  {
    title: "上传和结果",
    icon: MessageCircle,
    questions: [
      {
        q: "可以上传哪些文件？",
        a: "常见的图片、PDF、Word 和 TXT 都可以。作文照片尽量拍清楚一点，效果会更好。"
      },
      {
        q: "文件太大怎么办？",
        a: "可以先压缩图片，或者把文件拆小一点，再重新上传。"
      },
      {
        q: "AI 的结果不够好，怎么办？",
        a: "可以换一种说法，补充更多信息，再试一次。必要时也可以重新生成。"
      }
    ]
  }
]

// ============================================
// FAQ 折叠项组件
// ============================================

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div 
      className="border-b last:border-b-0"
      style={{ borderColor: slateColors[100] }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-5 text-left"
      >
        <span 
          className="font-medium pr-4"
          style={{ color: slateColors[800], fontSize: '15px' }}
        >
          {question}
        </span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 shrink-0" style={{ color: brandColors[600] }} />
        ) : (
          <ChevronDown className="w-5 h-5 shrink-0" style={{ color: slateColors[400] }} />
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div 
              className="pb-5 text-sm leading-relaxed whitespace-pre-line"
              style={{ color: slateColors[600] }}
            >
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// 快速链接卡片
// ============================================

function QuickLinks() {
  const links = [
    {
      title: "开始使用",
      desc: "先去首页或对话页试试",
      href: "/chat",
      icon: MessageCircle
    },
    {
      title: "查看积分",
      desc: "看余额和使用记录",
      href: "/credits",
      icon: CreditCard
    },
    {
      title: "价格方案",
      desc: "了解套餐和购买方式",
      href: "/pricing",
      icon: FileText
    }
  ]

  return (
    <motion.div 
      className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={{
        visible: {
          transition: {
            staggerChildren: 0.15
          }
        }
      }}
    >
      {links.map((link) => (
        <motion.div
          key={link.href}
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { 
              opacity: 1, 
              y: 0,
              transition: { duration: 0.5, ease: "easeOut" }
            }
          }}
          whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
        >
          <Link
            href={link.href}
            className="flex items-center gap-4 p-4 rounded-xl transition-all h-full"
            style={{ 
              backgroundColor: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}
          >
            <motion.div 
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: brandColors[50] }}
              whileHover={{ rotate: 10 }}
            >
              <link.icon className="w-6 h-6" style={{ color: brandColors[600] }} />
            </motion.div>
            <div>
              <h3 className="font-medium" style={{ color: slateColors[800] }}>
                {link.title}
              </h3>
              <p className="text-sm" style={{ color: slateColors[500] }}>
                {link.desc}
              </p>
            </div>
            <ExternalLink className="w-4 h-4 ml-auto" style={{ color: slateColors[400] }} />
          </Link>
        </motion.div>
      ))}
    </motion.div>
  )
}

// ============================================
// 分类组件 - 动画版本
// ============================================

function CategorySection({ 
  title, 
  icon: Icon, 
  questions,
  index
}: { 
  title: string
  icon: any
  questions: { q: string; a: string }[]
  index: number
}) {
  return (
    <motion.div 
      className="mb-12"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      variants={{
        hidden: { opacity: 0, y: 40 },
        visible: { 
          opacity: 1, 
          y: 0,
          transition: { duration: 0.6, ease: "easeOut", delay: index * 0.1 }
        }
      }}
    >
      <motion.div 
        className="flex items-center gap-3 mb-6"
        initial={{ x: -20, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: index * 0.1 + 0.2 }}
      >
        <motion.div 
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: brandColors[100] }}
          whileHover={{ rotate: 90, scale: 1.1 }}
        >
          <Icon className="w-5 h-5" style={{ color: brandColors[600] }} />
        </motion.div>
        <h2 className="text-xl font-semibold" style={{ color: slateColors[800] }}>
          {title}
        </h2>
      </motion.div>
      <div 
        className="bg-white rounded-2xl p-6"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        {questions.map((item, qIndex) => (
          <motion.div
            key={qIndex}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 + qIndex * 0.05 + 0.3 }}
          >
            <FAQItem question={item.q} answer={item.a} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// ============================================
// 联系客服区域 - 动画版本
// ============================================

function ContactSection() {
  return (
    <motion.div
      className="rounded-2xl p-8"
      style={{
        background: `linear-gradient(135deg, ${brandColors[50]} 0%, ${brandColors[100]}50 100%)`,
        border: `1px solid ${brandColors[200]}40`
      }}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.div
        className="text-center mb-6"
        initial={{ y: -20, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatDelay: 3
          }}
        >
          <MessageCircle className="w-12 h-12 mx-auto mb-4" style={{ color: brandColors[600] }} />
        </motion.div>
        <h3 className="text-xl font-semibold mb-2" style={{ color: brandColors[800] }}>
          联系客服
        </h3>
        <p style={{ color: slateColors[600] }}>
          如果你刚开始用网站，先看上面的常见问题。
          <br />
          还没解决，再联系人工客服。
        </p>
      </motion.div>
      
      {/* 联系方式展示 */}
      <motion.div 
        className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        {/* 微信二维码 */}
        <motion.div
          className="flex flex-col items-center"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <motion.div
            className="w-40 h-40 md:w-48 md:h-48 bg-white rounded-xl p-2 shadow-lg mb-3"
            animate={{
              boxShadow: [
                "0 4px 20px rgba(0,0,0,0.1)",
                "0 8px 30px rgba(0,0,0,0.15)",
                "0 4px 20px rgba(0,0,0,0.1)"
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Image
              src={contactInfo.wechatQR}
              alt="客服微信二维码"
              width={160}
              height={160}
              className="w-full h-full object-contain"
            />
          </motion.div>
          <span className="font-medium" style={{ color: brandColors[700] }}>扫码添加客服微信</span>
        </motion.div>
        
        {/* 分隔线（移动端不显示） */}
        <motion.div
          className="hidden md:block w-px h-32"
          style={{ backgroundColor: brandColors[200] }}
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6, duration: 0.5 }}
        />

        {/* 电话 */}
        <motion.div
          className="flex flex-col items-center"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <motion.div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
            style={{ backgroundColor: brandColors[100] }}
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(34, 197, 94, 0.2)",
                "0 0 0 10px rgba(34, 197, 94, 0)",
              ]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Phone className="w-8 h-8" style={{ color: brandColors[600] }} />
          </motion.div>
          <motion.a
            href={`tel:${contactInfo.phone}`}
            className="text-2xl font-bold flex items-center gap-2 hover:underline"
            style={{ color: brandColors[700] }}
            whileHover={{ scale: 1.05 }}
          >
            <Phone className="w-5 h-5" />
            {contactInfo.phone}
          </motion.a>
          <span className="text-sm mt-1" style={{ color: slateColors[500] }}>工作日 9:00-18:00</span>
          <span className="text-sm mt-1" style={{ color: slateColors[500] }}>{contactInfo.email}</span>
        </motion.div>
      </motion.div>

      {/* 在线客服按钮 */}
      <motion.div
        className="text-center mt-8"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Link
            href={`mailto:${contactInfo.email}`}
            className="inline-flex items-center gap-2 px-6 py-3 font-medium rounded-xl transition-colors"
            style={{
              backgroundColor: brandColors[600],
              color: "white",
              boxShadow: `0 4px 12px ${brandColors[600]}40`
            }}
          >
            <MessageCircle className="w-5 h-5" />
            发送邮件联系
          </Link>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

// ============================================
// 主组件
// ============================================

export function HelpPageClient() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: creamColors[100] }}>
      {/* 顶部背景 - 渐变到透明的有机光影流 */}
      <div
        className="relative py-16 md:py-20 overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${brandColors[700]} 0%, ${brandColors[800]}60 50%, transparent 100%)`
        }}
      >
        {/* 动态背景装饰 - 有机光影流 */}
        <motion.div
          className="absolute inset-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-64 h-64 rounded-full"
              style={{
                background: `radial-gradient(circle, ${brandColors[400]}15 0%, transparent 70%)`,
                left: `${20 + i * 20}%`,
                top: `${10 + (i % 3) * 30}%`,
              }}
              animate={{
                y: [0, -40, 0],
                x: [0, 20, 0],
                scale: [1, 1.15, 1],
                opacity: [0.2, 0.5, 0.2],
              }}
              transition={{
                duration: 8 + i * 2,
                repeat: Infinity,
                delay: i * 1,
                ease: "linear",
              }}
            />
          ))}
        </motion.div>

        {/* 浮动图标装饰 - 透明度调低50%成为皮肤肌理 */}
        <motion.div
          className="absolute top-20 right-10 opacity-[0.05]"
          animate={{
            y: [0, -15, 0],
            rotate: [0, 10, 0],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <ShenxiangInterfaceIcon name="help" size={130} />
        </motion.div>
        
        <div className="max-w-4xl mx-auto px-4 relative z-10">
          {/* 返回按钮 */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link 
              href="/"
              className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-8 transition-colors"
            >
              <motion.span
                whileHover={{ x: -5 }}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>返回首页</span>
              </motion.span>
            </Link>
          </motion.div>
          
          {/* 标题 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <motion.div 
              className="flex items-center gap-4 mb-4"
              animate={{ 
                textShadow: [
                  "0 0 20px rgba(255,255,255,0.3)",
                  "0 0 40px rgba(255,255,255,0.5)",
                  "0 0 20px rgba(255,255,255,0.3)"
                ]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <motion.div
                animate={{ 
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
              >
                <ShenxiangInterfaceIcon name="help" size={46} />
              </motion.div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                帮助中心
              </h1>
            </motion.div>
            <motion.p 
              className="text-white/80 text-lg max-w-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              这里整理了最常见的问题，
              <br className="hidden md:block" />
              适合第一次使用网站的人快速查看。
            </motion.p>
          </motion.div>
        </div>
        
        {/* 波浪装饰 */}
        <motion.div 
          className="absolute bottom-0 left-0 right-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <svg 
            viewBox="0 0 1440 60" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="w-full"
            preserveAspectRatio="none"
          >
            <motion.path 
              d="M0 60 C240 30 480 0 720 0 C960 0 1200 30 1440 60 L1440 60 L0 60Z" 
              fill={creamColors[100]}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, delay: 0.5 }}
            />
          </svg>
        </motion.div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        {/* 快速链接 */}
        <QuickLinks />

        {/* FAQ 分类 */}
        {faqCategories.map((category, index) => (
          <CategorySection
            key={category.title}
            title={category.title}
            icon={category.icon}
            questions={category.questions}
            index={index}
          />
        ))}

        {/* 联系客服 - 带二维码 */}
        <ContactSection />
      </div>

      {/* 底部导航 */}
      <motion.div 
        className="border-t"
        style={{ borderColor: slateColors[100], backgroundColor: 'white' }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-4xl mx-auto px-4 py-8">
          <motion.div 
            className="flex flex-wrap justify-center gap-6"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.1
                }
              }
            }}
          >
            {[
              { href: "/pricing", text: "价格方案" },
              { href: "/about", text: "关于我们" },
              { href: "/privacy", text: "隐私政策" },
              { href: "/terms", text: "服务条款" }
            ].map((item) => (
              <motion.div
                key={item.href}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0 }
                }}
                whileHover={{ scale: 1.1, color: brandColors[600] }}
              >
                <Link href={item.href} className="text-sm hover:underline" style={{ color: slateColors[600] }}>
                  {item.text}
                </Link>
              </motion.div>
            ))}
          </motion.div>
          <motion.p 
            className="text-center text-sm mt-4"
            style={{ color: slateColors[400] }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            © {new Date().getFullYear()} 沈翔智学. All rights reserved.
          </motion.p>
        </div>
      </motion.div>
    </main>
  )
}
