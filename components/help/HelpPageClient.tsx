'use client'

import Image from "next/image"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { CreditCard, ChevronDown, ChevronUp, ArrowLeft, ExternalLink, Phone } from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"
import { ShenxiangInterfaceIcon } from "@/components/icons/ShenxiangInterfaceIcons"
import { IconEnglish, IconEssay, IconFollowup, IconUser } from "@/components/icons/v2"

// 客服联系方式配置
const contactInfo = {
  phone: "19132896773",
  wechatQR: "/images/design-mode/站长微信.jpg"
}

// ============================================
// 常见问题数据
// ============================================

const faqCategories = [
  {
    title: "快速入门",
    icon: IconEnglish,
    questions: [
      {
        q: "如何开始使用沈翔智学？",
        a: "1. 首先在首页登录或注册账号\n2. 登录后即可进入主界面\n3. 选择想要使用的 AI 功能（如作文批改、智能对话等）\n4. 开始你的 AI 学习之旅！"
      },
      {
        q: "有哪些 AI 功能可以体验？",
        a: "沈翔智学提供多种 AI 功能：\n\n• 作文批改：上传作文图片，AI 自动批改并提供修改建议\n• 智能对话：与全球顶尖三大模型进行对话\n• 学习规划：制定个性化的学习计划\n• 图片生成：输入描述生成精美图片\n• 音乐创作：利用 AI 创作原创音乐"
      },
      {
        q: "如何联系客服？",
        a: "你可以通过以下方式联系我们：\n\n• 微信：扫码下方二维码添加客服微信\n• 电话：19132896773\n• 邮件：support@shenxiang.school\n\n我们工作时间为：周一至周五 9:00-18:00"
      }
    ]
  },
  {
    title: "账户与登录",
    icon: IconUser,
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
        a: "积分是沈翔智学的虚拟货币，可以用于：\n\n• 使用文本 AI、作文批改、图片生成、音乐创作等付费功能\n• 兑换平台增值服务\n• 参与平台活动\n\n新用户注册即送 1000 积分。"
      },
      {
        q: "如何获得更多积分？",
        a: "获取积分的主要方式：\n\n• 订阅会员套餐：基础版 28 元/月到账 2,000 积分，专业版 68 元/月到账 5,000 积分，豪华版 128 元/月到账 12,000 积分\n• 购买积分包：500 积分 5 元、1,000 积分 10 元，订阅用户可买；5,000 积分 48 元，专业版及以上可买；10,000 积分 108 元，豪华版及以上可买\n• 企业版 / 校园版：联系商务\n• 邀请好友注册，双方各得 1000 积分，邀请者累计奖励上限 50000 积分\n• 分享奖励按平台活动规则发放"
      },
      {
        q: "文本 AI 如何扣费？",
        a: "文本生成按实际输入和输出内容计费：\n\n• 输入内容：5 积分 / 1K tokens\n• 输出内容：20 积分 / 1K tokens\n• 输入和输出都会消耗积分\n• 输出越长，消耗越多\n• 系统会在模型返回完成后，根据实际 token 用量扣除积分\n• 无实际输出内容不扣文本生成费用\n• 长文写作、作文批改、论文报告等功能通常会消耗更多积分"
      },
      {
        q: "作文批改如何消耗积分？",
        a: "作文批改按实际输入和生成内容计费。输入和输出都会消耗积分，输出内容越详细，消耗积分越多。\n\n通常可以参考以下区间：\n\n• 短作文批改：约 100~300 积分\n• 普通作文批改：约 300~600 积分\n• 长作文或详细批改：可能 600 积分以上\n\n以上是预计积分区间，不是固定价格。实际消耗会随作文长度、批改详细程度和生成内容多少变化。"
      },
      {
        q: "图片和音乐如何扣费？",
        a: "图片和音乐按功能规则消耗积分：\n\n• GPT Image 2：订阅用户可用，白名单用户可测试，按固定积分扣费\n• GPT Image 1.5 / 1 / Mini：按对应固定积分扣费\n• Suno：约 100 积分起，实际可能包含 token 补扣\n\n余额不足时系统会提示充值或升级会员。"
      }
    ]
  },
  {
    title: "使用技巧",
    icon: IconFollowup,
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
      style={{ borderColor: "var(--paper-200)" }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-5 text-left"
      >
        <span
          className="font-medium pr-4"
          style={{ color: "var(--ink-800)", fontSize: '15px' }}
        >
          {question}
        </span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 shrink-0" style={{ color: "var(--ink-600)" }} />
        ) : (
          <ChevronDown className="w-5 h-5 shrink-0" style={{ color: "var(--ink-400)" }} />
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
              style={{ color: "var(--ink-600)" }}
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
      title: "价格方案",
      desc: "查看会员套餐和积分价格",
      href: "/pricing",
      icon: CreditCard
    },
    {
      title: "开始对话",
      desc: "体验 AI 智能对话",
      href: "/chat",
      icon: IconFollowup
    },
    {
      title: "账户设置",
      desc: "管理个人资料",
      href: "/settings",
      icon: IconUser
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
            className="flex items-center gap-4 p-4 rounded-[var(--radius-sharp)] transition-all h-full"
            style={{
              backgroundColor: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}
          >
            <motion.div
              className="w-12 h-12 rounded-[var(--radius-sharp)] flex items-center justify-center"
              style={{ backgroundColor: "var(--ink-50)" }}
              whileHover={{ rotate: 10 }}
            >
              <link.icon className="w-6 h-6" style={{ color: "var(--ink-600)" }} />
            </motion.div>
            <div>
              <h3 className="font-medium" style={{ color: "var(--ink-800)" }}>
                {link.title}
              </h3>
              <p className="text-sm" style={{ color: "var(--ink-500)" }}>
                {link.desc}
              </p>
            </div>
            <ExternalLink className="w-4 h-4 ml-auto" style={{ color: "var(--ink-400)" }} />
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
          className="w-10 h-10 rounded-[var(--radius-sharp)] flex items-center justify-center"
          style={{ backgroundColor: "var(--ink-50)" }}
          whileHover={{ rotate: 90, scale: 1.1 }}
        >
          <Icon className="w-5 h-5" style={{ color: "var(--ink-600)" }} />
        </motion.div>
        <h2 className="text-xl font-semibold font-[var(--font-display)]" style={{ color: "var(--ink-800)" }}>
          {title}
        </h2>
      </motion.div>
      <div
        className="bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-6"
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
      className="rounded-[var(--radius-sharp)] p-8"
      style={{
        background: "linear-gradient(135deg, var(--ink-50) 0%, var(--paper-50) 100%)",
        border: "1px solid var(--ink-200)"
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
          <IconFollowup className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--ink-600)" }} />
        </motion.div>
        <h3 className="text-xl font-semibold mb-2" style={{ color: "var(--ink-800)" }}>
          联系客服
        </h3>
        <p style={{ color: "var(--ink-600)" }}>
          扫描下方二维码添加客服微信，或拨打客服电话
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
            className="w-40 h-40 md:w-48 md:h-48 bg-[var(--paper-50)] rounded-[var(--radius-sharp)] p-2 shadow-lg mb-3"
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
          <span className="font-medium" style={{ color: "var(--ink-700)" }}>扫码添加客服微信</span>
        </motion.div>

        {/* 分隔线（移动端不显示） */}
        <motion.div
          className="hidden md:block w-px h-32"
          style={{ backgroundColor: "var(--ink-200)" }}
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
            style={{ backgroundColor: "var(--ink-50)" }}
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(34, 197, 94, 0.2)",
                "0 0 0 10px rgba(34, 197, 94, 0)",
              ]
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Phone className="w-8 h-8" style={{ color: "var(--ink-600)" }} />
          </motion.div>
          <motion.a
            href={`tel:${contactInfo.phone}`}
            className="text-2xl font-bold flex items-center gap-2 hover:underline"
            style={{ color: "var(--ink-700)" }}
            whileHover={{ scale: 1.05 }}
          >
            <Phone className="w-5 h-5" />
            {contactInfo.phone}
          </motion.a>
          <span className="text-sm mt-1" style={{ color: "var(--ink-500)" }}>工作日 9:00-18:00</span>
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
            href="/chat"
            className="inline-flex items-center gap-2 px-6 py-3 font-medium rounded-[var(--radius-sharp)] transition-colors"
            style={{
              backgroundColor: "var(--seal-500)",
              color: "white",
              boxShadow: "var(--shadow-paper)"
            }}
          >
            <IconFollowup className="w-5 h-5" />
            在线客服
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
    <main className="min-h-screen bg-[var(--paper-50)] font-[var(--font-sans-v2)] text-[var(--ink-900)]">
      {/* 顶部标题区 */}
      <div
        className="relative overflow-hidden border-b border-[var(--paper-200)] bg-[var(--paper-50)] py-12 md:py-16"
      >
        <motion.div
          className="absolute top-16 right-10 hidden opacity-[0.04] md:block"
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
              className="mb-8 inline-flex items-center gap-2 text-[var(--ink-500)] transition-colors hover:text-[var(--ink-800)]"
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
                  "0 0 0 rgba(0,0,0,0)",
                  "0 0 0 rgba(0,0,0,0)",
                  "0 0 0 rgba(0,0,0,0)"
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
              <h1 className="font-[var(--font-display)] text-3xl font-bold text-[var(--ink-800)] md:text-4xl">
                帮助中心
              </h1>
            </motion.div>
            <motion.p
              className="max-w-2xl text-lg leading-8 text-[var(--ink-600)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              这里是沈翔智学的使用指南和问题解答，
              <br className="hidden md:block" />
              如果没有找到答案，请联系我们的客服。
            </motion.p>
          </motion.div>
        </div>
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
        style={{ borderColor: "var(--paper-200)", backgroundColor: "var(--paper-50)" }}
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
                whileHover={{ scale: 1.1, color: "var(--ink-600)" }}
              >
                <Link href={item.href} className="text-sm hover:underline" style={{ color: "var(--ink-600)" }}>
                  {item.text}
                </Link>
              </motion.div>
            ))}
          </motion.div>
          <motion.p
            className="text-center text-sm mt-4"
            style={{ color: "var(--ink-400)" }}
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
