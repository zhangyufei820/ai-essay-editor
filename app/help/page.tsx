'use client'

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { 
  HelpCircle, 
  BookOpen, 
  MessageCircle, 
  CreditCard, 
  User, 
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ExternalLink,
  Phone
} from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

// 客服联系方式配置
const contactInfo = {
  phone: "19132896773",
  wechatQR: "/images/wechat-qr.jpg"
}

// ============================================
// 常见问题数据
// ============================================

const faqCategories = [
  {
    title: "快速入门",
    icon: BookOpen,
    questions: [
      {
        q: "如何开始使用沈翔智学？",
        a: "1. 首先在首页登录或注册账号\n2. 登录后即可进入主界面\n3. 选择想要使用的 AI 功能（如作文批改、智能对话等）\n4. 开始你的 AI 学习之旅！"
      },
      {
        q: "有哪些 AI 功能可以体验？",
        a: "沈翔智学提供多种 AI 功能：\n\n• 作文批改：上传作文图片，AI 自动批改并提供修改建议\n• 智能对话：与 AI 助手进行问答交流\n• 学习规划：制定个性化的学习计划\n• 图片生成：输入描述生成精美图片\n• 音乐创作：利用 AI 创作原创音乐"
      },
      {
        q: "如何联系客服？",
        a: "你可以通过以下方式联系我们：\n\n• 微信：扫码下方二维码添加客服微信\n• 电话：19132896773\n• 邮件：support@shenxiang.school\n\n我们工作时间为：周一至周五 9:00-18:00"
      }
    ]
  },
  {
    title: "账户与登录",
    icon: User,
    questions: [
      {
        q: "支持哪些登录方式？",
        a: "我们支持多种登录方式：\n\n• 手机号 + 验证码登录\n• 邮箱 + 验证码登录\n• 微信一键登录\n\n建议使用微信登录，最为便捷！"
      },
      {
        q: "忘记密码怎么办？",
        a: "如果你忘记了密码，可以通过以下方式找回：\n\n1. 在登录页面点击「忘记密码」\n2. 输入注册时的手机号或邮箱\n3. 获取验证码\n4. 设置新密码\n\n如果是微信登录用户，请直接在微信中重新授权。"
      },
      {
        q: "如何修改个人资料？",
        a: "登录后，点击页面右上角的头像，进入「设置」页面，你可以修改：\n\n• 头像\n• 昵称\n• 绑定手机号/邮箱\n• 其他个人信息"
      }
    ]
  },
  {
    title: "积分与会员",
    icon: CreditCard,
    questions: [
      {
        q: "积分有什么用？",
        a: "积分是沈翔智学的虚拟货币，可以用于：\n\n• 使用付费 AI 功能\n• 兑换会员特权\n• 参与平台活动\n\n新用户注册即送积分，每日签到也可领取！"
      },
      {
        q: "如何获得更多积分？",
        a: "获取积分的多种方式：\n\n• 每日签到（+10积分/天）\n• 分享功能给朋友（+50积分/次）\n• 邀请好友注册（+100积分/人）\n• 完善个人资料（+20积分）\n• 充值会员（获得大量积分）"
      },
      {
        q: "会员有哪些特权？",
        a: "成为会员后享受：\n\n• 无限次使用所有 AI 功能\n• 专属客服通道\n• 优先体验新功能\n• 会员专属折扣\n• 更高的积分收益比例\n\n点击「价格方案」查看详细会员套餐。"
      },
      {
        q: "如何充值/购买？",
        a: "在任意页面点击「价格方案」或「充值」按钮，选择适合你的套餐，支持微信支付、支付宝等主流支付方式。"
      }
    ]
  },
  {
    title: "使用技巧",
    icon: MessageCircle,
    questions: [
      {
        q: "作文批改支持哪些格式？",
        a: "目前支持上传：\n\n• JPG 图片\n• PNG 图片\n• PDF 文档\n• Word 文档 (.docx)\n• TXT 文本\n\n建议上传清晰的作文图片，AI 识别更准确！"
      },
      {
        q: "上传文件大小有限制吗？",
        a: "为保证服务质量，我们做了以下限制：\n\n• 小文件（<5MB）：可直接上传\n• 大文件（>5MB）：需配置直连服务器\n\n如果上传大文件失败，建议将文件压缩或分割后上传。"
      },
      {
        q: "AI 回答不满意怎么办？",
        a: "如果 AI 的回答不够理想，你可以：\n\n• 点击「重新生成」按钮获取新答案\n• 调整问题描述，更清晰地表达需求\n• 提供更多上下文信息\n• 换一个提问方式\n\n我们会持续优化 AI 模型，感谢你的反馈！"
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
// 分类组件
// ============================================

function CategorySection({ 
  title, 
  icon: Icon, 
  questions 
}: { 
  title: string
  icon: any
  questions: { q: string; a: string }[]
}) {
  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-6">
        <div 
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: brandColors[100] }}
        >
          <Icon className="w-5 h-5" style={{ color: brandColors[600] }} />
        </div>
        <h2 className="text-xl font-semibold" style={{ color: slateColors[800] }}>
          {title}
        </h2>
      </div>
      <div 
        className="bg-white rounded-2xl p-6"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
      >
        {questions.map((item, index) => (
          <FAQItem key={index} question={item.q} answer={item.a} />
        ))}
      </div>
    </div>
  )
}

// ============================================
// 快速链接卡片
// ============================================

function QuickLinks() {
  const links = [
    { 
      title: "价格方案", 
      desc: "查看会员套餐和积分价格",
      href: "/pricing",
      icon: CreditCard 
    },
    { 
      title: "开始对话", 
      desc: "体验 AI 智能对话",
      href: "/chat",
      icon: MessageCircle 
    },
    { 
      title: "账户设置", 
      desc: "管理个人资料",
      href: "/settings",
      icon: User 
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="flex items-center gap-4 p-4 rounded-xl transition-all hover:scale-[1.02]"
          style={{ 
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
        >
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: brandColors[50] }}
          >
            <link.icon className="w-6 h-6" style={{ color: brandColors[600] }} />
          </div>
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
      ))}
    </div>
  )
}

// ============================================
// 主组件
// ============================================

export default function HelpPage() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: creamColors[100] }}>
      {/* 顶部背景 */}
      <div 
        className="relative py-16 md:py-20"
        style={{ 
          background: `linear-gradient(135deg, ${brandColors[700]} 0%, ${brandColors[800]} 100%)`
        }}
      >
        <div className="max-w-4xl mx-auto px-4">
          {/* 返回按钮 */}
          <Link 
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回首页</span>
          </Link>
          
          {/* 标题 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-4 mb-4">
              <HelpCircle className="w-10 h-10 text-white" />
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                帮助中心
              </h1>
            </div>
            <p className="text-white/80 text-lg max-w-2xl">
              这里是沈翔智学的使用指南和问题解答，
              <br className="hidden md:block" />
              如果没有找到答案，请联系我们的客服。
            </p>
          </motion.div>
        </div>
        
        {/* 波浪装饰 */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg 
            viewBox="0 0 1440 60" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="w-full"
            preserveAspectRatio="none"
          >
            <path 
              d="M0 60 C240 30 480 0 720 0 C960 0 1200 30 1440 60 L1440 60 L0 60Z" 
              fill={creamColors[100]}
            />
          </svg>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        {/* 快速链接 */}
        <QuickLinks />

        {/* FAQ 分类 */}
        {faqCategories.map((category) => (
          <CategorySection
            key={category.title}
            title={category.title}
            icon={category.icon}
            questions={category.questions}
          />
        ))}

        {/* 联系客服 - 带二维码 */}
        <div 
          className="rounded-2xl p-8"
          style={{ 
            background: `linear-gradient(135deg, ${brandColors[600]} 0%, ${brandColors[700]} 100%)`
          }}
        >
          <div className="text-center mb-6">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-white" />
            <h3 className="text-xl font-semibold text-white mb-2">
              联系客服
            </h3>
            <p className="text-white/80">
              扫描下方二维码添加客服微信，或拨打客服电话
            </p>
          </div>
          
          {/* 联系方式展示 */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
            {/* 微信二维码 */}
            <div className="flex flex-col items-center">
              <div 
                className="w-40 h-40 md:w-48 md:h-48 bg-white rounded-xl p-2 shadow-lg mb-3"
              >
                <img 
                  src={contactInfo.wechatQR} 
                  alt="客服微信二维码" 
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-white font-medium">扫码添加客服微信</span>
            </div>
            
            {/* 分隔线（移动端不显示） */}
            <div className="hidden md:block w-px h-32 bg-white/30" />
            
            {/* 电话 */}
            <div className="flex flex-col items-center">
              <div 
                className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-3"
              >
                <Phone className="w-8 h-8 text-white" />
              </div>
              <a 
                href={`tel:${contactInfo.phone}`}
                className="text-2xl font-bold text-white hover:underline"
              >
                {contactInfo.phone}
              </a>
              <span className="text-white/70 text-sm mt-1">工作日 9:00-18:00</span>
            </div>
          </div>
          
          {/* 在线客服按钮 */}
          <div className="text-center mt-8">
            <Link 
              href="/chat"
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-green-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              在线客服
            </Link>
          </div>
        </div>
      </div>

      {/* 底部导航 */}
      <div className="border-t" style={{ borderColor: slateColors[100], backgroundColor: 'white' }}>
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/pricing" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              价格方案
            </Link>
            <Link href="/about" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              关于我们
            </Link>
            <Link href="/privacy" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              隐私政策
            </Link>
            <Link href="/terms" className="text-sm hover:underline" style={{ color: slateColors[600] }}>
              服务条款
            </Link>
          </div>
          <p className="text-center text-sm mt-4" style={{ color: slateColors[400] }}>
            © {new Date().getFullYear()} 沈翔智学. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  )
}
