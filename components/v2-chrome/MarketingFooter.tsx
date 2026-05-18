/**
 * 🖌 沈翔智学 v2「墨砚」营销页面页脚
 *
 * 视觉：米白底 + 4 列链接 + 底部版权一行
 */

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"

const FOOTER_LINKS = {
  product: {
    title: "产品",
    links: [
      { label: "智能体广场", href: "/agents" },
      { label: "作文批改", href: "/chat/standard" },
      { label: "AI 对话", href: "/chat" },
      { label: "闪卡复习", href: "/flashcards" },
      { label: "互动实验室", href: "/lab" },
    ],
  },
  resources: {
    title: "资源",
    links: [
      { label: "创作广场", href: "/explore" },
      { label: "套餐与价格", href: "/pricing" },
      { label: "帮助中心", href: "/help" },
      { label: "邀请好友", href: "/invite" },
    ],
  },
  company: {
    title: "关于",
    links: [
      { label: "关于我们", href: "/about" },
      { label: "面向家长", href: "/parent" },
      { label: "面向教师", href: "/teacher" },
    ],
  },
  legal: {
    title: "法律",
    links: [
      { label: "服务条款", href: "/terms" },
      { label: "隐私政策", href: "/privacy" },
      { label: "退款政策", href: "/refund-policy" },
    ],
  },
} as const

export function MarketingFooter({ className }: { className?: string }) {
  return (
    <footer
      data-slot="v2-marketing-footer"
      className={cn(
        "border-t border-[var(--paper-200)] bg-[var(--paper-50)]",
        "font-[var(--font-sans-v2)]",
        className
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* 品牌列 */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" prefetch={false} className="inline-block mb-3">
              <Image
                src="/images/design-mode/home-logo-transparent.png"
                alt="沈翔智学"
                width={140}
                height={32}
                className="h-8 w-auto object-contain"
              />
            </Link>
            <p className="text-[13px] leading-[1.7] text-[var(--ink-500)]">
              上传材料，看见能拿走的学习成果。
            </p>
            <p className="mt-4 text-[12px] leading-[1.6] text-[var(--ink-400)]">
              客服：support@shenxiang.school
            </p>
          </div>

          {/* 链接列 */}
          {Object.values(FOOTER_LINKS).map((section) => (
            <div key={section.title}>
              <h4 className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-[var(--ink-500)]">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      prefetch={false}
                      className="text-[14px] text-[var(--ink-700)] transition-colors duration-200 hover:text-[var(--ink-900)] hover:underline underline-offset-[3px]"
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
        <div className="mt-12 h-px w-full bg-[var(--paper-200)]" />

        {/* 版权 */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-[var(--ink-400)]">
            © {new Date().getFullYear()} 沈翔智学 · All rights reserved.
          </p>
          <p className="text-[12px] text-[var(--ink-400)] font-[var(--font-mono-v2)]">
            shenxiang.school
          </p>
        </div>
      </div>
    </footer>
  )
}
