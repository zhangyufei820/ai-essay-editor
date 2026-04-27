/**
 * 📝 沈翔智学 - 网站页脚
 * 
 * 包含品牌信息、导航链接、版权信息等。
 * 四列布局，响应式设计，带回到顶部按钮。
 */

"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { GraduationCap, ArrowUp, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

// ============================================
// 设计系统颜色常量
// ============================================

const COLORS = {
  background: "#FAF8F3",
  copyrightBg: "#F5F3EE",
  border: "#E5E7EB",
  primary: "#4CAF50",
  title: "#212121",
  link: "#757575",
  linkHover: "#4CAF50",
  slogan: "#616161",
  copyright: "#9E9E9E",
  white: "#FFFFFF",
}

// ============================================
// 链接配置
// ============================================

interface FooterLink {
  label: string
  href: string
}

interface FooterSection {
  title: string
  links: FooterLink[]
}

const footerSections: FooterSection[] = [
  {
    title: "产品",
    links: [
      { label: "智能对话", href: "/chat" },
      { label: "作文批改", href: "/chat?agent=standard" },
      { label: "学习规划", href: "/chat?agent=teaching-pro" },
      { label: "价格方案", href: "/pricing" }
    ]
  },
    {
    title: "支持",
    links: [
      { label: "帮助中心", href: "/help" },
      { label: "使用指南", href: "/help" },
      { label: "常见问题", href: "/help" },
      { label: "联系我们", href: "/help" },
      { label: "管理后台", href: "/admin" }
    ]
  },
  {
    title: "关于",
    links: [
      { label: "关于我们", href: "/about" },
      { label: "隐私政策", href: "/privacy" },
      { label: "服务条款", href: "/terms" },
      { label: "用户协议", href: "/agreement" }
    ]
  }
]

// ============================================
// 社交媒体图标组件
// ============================================

function SocialIcons() {
  const socialLinks = [
    { name: "微信", icon: "wechat" },
    { name: "微博", icon: "weibo" },
    { name: "抖音", icon: "douyin" },
  ]

  return (
    <div className="flex items-center gap-4 mt-6">
      {socialLinks.map((social) => (
        <motion.button
          key={social.name}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-6 h-6 flex items-center justify-center rounded-full"
          style={{ backgroundColor: `${COLORS.primary}20` }}
          aria-label={social.name}
        >
          <span 
            className="text-xs font-medium"
            style={{ color: COLORS.primary }}
          >
            {social.name.charAt(0)}
          </span>
        </motion.button>
      ))}
    </div>
  )
}

// ============================================
// 链接列组件
// ============================================

function LinkColumn({ section }: { section: FooterSection }) {
  return (
    <div>
      <h3 
        className="text-base mb-4"
        style={{ 
          color: COLORS.title,
          fontWeight: 600,
          fontSize: "16px",
        }}
      >
        {section.title}
      </h3>
      <ul className="space-y-3">
        {section.links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="text-sm transition-all duration-200 hover:underline"
              style={{ 
                color: COLORS.link,
                fontSize: "14px",
                fontWeight: 400,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = COLORS.linkHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = COLORS.link
              }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================
// 移动端手风琴组件
// ============================================

function MobileAccordion({ section }: { section: FooterSection }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b" style={{ borderColor: COLORS.border }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4"
      >
        <span 
          className="text-base font-semibold"
          style={{ color: COLORS.title }}
        >
          {section.title}
        </span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5" style={{ color: COLORS.link }} />
        ) : (
          <ChevronDown className="w-5 h-5" style={{ color: COLORS.link }} />
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
            <ul className="pb-4 space-y-3">
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm block py-1"
                    style={{ color: COLORS.link }}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// 回到顶部按钮组件
// ============================================

function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener("scroll", toggleVisibility)
    return () => window.removeEventListener("scroll", toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    })
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.95 }}
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full shadow-lg"
          style={{
            width: "48px",
            height: "48px",
            backgroundColor: COLORS.primary,
          }}
          aria-label="回到顶部"
        >
          <ArrowUp className="w-5 h-5" style={{ color: COLORS.white }} />
        </motion.button>
      )}
    </AnimatePresence>
  )
}

// ============================================
// 主组件
// ============================================

export function Footer() {
  return (
    <>
      <footer style={{ backgroundColor: COLORS.background }}>
        {/* 主内容区 */}
        <div 
          className="max-w-[1200px] mx-auto"
          style={{ padding: "60px 40px" }}
        >
          {/* 桌面端：四列布局 */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* 品牌信息列 */}
            <div className="lg:col-span-1">
              {/* Logo - 使用品牌图片 */}
              <div className="mb-4">
                <img 
                  src="/images/design-mode/主页logo.jpg" 
                  alt="沈翔智学" 
                  className="h-12 w-auto object-contain"
                />
              </div>

              {/* Slogan */}
              <p 
                className="text-sm leading-relaxed max-w-xs"
                style={{ 
                  color: COLORS.slogan,
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                AI驱动的智能学习平台，为每一位学生提供个性化学习体验
              </p>

              {/* 社交媒体图标 */}
              <SocialIcons />
            </div>

            {/* 链接列 */}
            {footerSections.map((section) => (
              <LinkColumn key={section.title} section={section} />
            ))}
          </div>

          {/* 移动端：手风琴布局 */}
          <div className="md:hidden">
            {/* 品牌信息 */}
            <div className="mb-8">
              {/* Logo - 使用品牌图片 */}
              <div className="mb-4">
                <img 
                  src="/images/design-mode/主页logo.jpg" 
                  alt="沈翔智学" 
                  className="h-10 w-auto object-contain"
                />
              </div>
              <p 
                className="text-sm leading-relaxed"
                style={{ color: COLORS.slogan, lineHeight: 1.6 }}
              >
                AI驱动的智能学习平台，为每一位学生提供个性化学习体验
              </p>
              <SocialIcons />
            </div>

            {/* 手风琴链接 */}
            {footerSections.map((section) => (
              <MobileAccordion key={section.title} section={section} />
            ))}
          </div>
        </div>

        {/* 版权区域 */}
        <div 
          style={{ 
            backgroundColor: COLORS.copyrightBg,
            borderTop: `1px solid ${COLORS.border}`,
            height: "60px",
          }}
        >
          <div 
            className="max-w-[1200px] mx-auto h-full flex flex-col md:flex-row items-center justify-between gap-2"
            style={{ padding: "0 40px" }}
          >
            {/* 左侧版权信息 */}
            <p 
              className="text-xs"
              style={{ color: COLORS.copyright, fontSize: "12px" }}
            >
              © 2026 沈翔智学. All rights reserved.
            </p>

            {/* 右侧链接 */}
            <div className="flex items-center gap-2">
              <Link
                href="/privacy"
                className="text-xs hover:underline"
                style={{ color: COLORS.copyright, fontSize: "12px" }}
              >
                隐私权政策
              </Link>
              <span style={{ color: COLORS.copyright }}>|</span>
              <Link
                href="/terms"
                className="text-xs hover:underline"
                style={{ color: COLORS.copyright, fontSize: "12px" }}
              >
                服务条款
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* 回到顶部按钮 */}
      <BackToTopButton />
    </>
  )
}

export default Footer
