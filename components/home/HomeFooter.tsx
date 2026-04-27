/**
 * 📝 沈翔学校 - 主页页脚
 * 
 * 包含链接导航、版权信息和社交媒体。
 */

"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { brandColors, slateColors, creamColors } from "@/lib/design-tokens"

// 导航链接配置
const footerLinks = {
  product: {
    title: "产品",
    links: [
      { label: "智能对话", href: "/chat" },
      { label: "作文批改", href: "/chat?agent=standard" },
      { label: "学习规划", href: "/chat?agent=teaching-pro" },
      { label: "价格方案", href: "/pricing" }
    ]
  },
  support: {
    title: "支持",
    links: [
      { label: "帮助中心", href: "/help" },
      { label: "使用指南", href: "/help" },
      { label: "常见问题", href: "/help" },
      { label: "联系我们", href: "/help" }
    ]
  },
  company: {
    title: "关于",
    links: [
      { label: "关于我们", href: "/about" },
      { label: "隐私政策", href: "/privacy" },
      { label: "服务条款", href: "/terms" },
      { label: "用户协议", href: "/terms" }
    ]
  }
}

export function HomeFooter() {
  return (
    <footer 
      className="py-16 md:py-20"
      style={{ backgroundColor: creamColors[200] }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        {/* 主内容 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* 品牌区 */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" prefetch={false} className="inline-block mb-4">
              <img 
                src="/images/design-mode/主页logo.jpg" 
                alt="沈翔智学" 
                className="h-12 w-auto object-contain"
              />
            </Link>
            <p 
              className="text-sm leading-relaxed"
              style={{ color: slateColors[500] }}
            >
              AI 驱动的智能学习平台，为每一位学生提供个性化的学习辅导体验。
            </p>
          </div>

          {/* 链接区 */}
          {Object.values(footerLinks).map((section, index) => (
            <div key={index}>
              <h4 
                className="text-sm font-semibold mb-4"
                style={{ color: slateColors[800] }}
              >
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <Link 
                      href={link.href}
                      prefetch={false}
                      className="text-sm transition-colors hover:text-brand-600"
                      style={{ color: slateColors[500] }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 分隔线 */}
        <div 
          className="h-px mb-8"
          style={{ backgroundColor: slateColors[200] }}
        />

        {/* 版权信息 */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p 
            className="text-sm"
            style={{ color: slateColors[400] }}
          >
            © {new Date().getFullYear()} 沈翔智学. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              prefetch={false}
              className="text-sm transition-colors hover:text-brand-600"
              style={{ color: slateColors[400] }}
            >
              隐私政策
            </Link>
            <Link
              href="/terms"
              prefetch={false}
              className="text-sm transition-colors hover:text-brand-600"
              style={{ color: slateColors[400] }}
            >
              服务条款
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default HomeFooter
