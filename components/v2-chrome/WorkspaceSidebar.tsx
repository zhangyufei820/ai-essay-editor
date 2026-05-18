/**
 * 🖌 沈翔智学 v2「墨砚」工作台侧栏
 *
 * 视觉：
 *   - 米白底 + 1px 右侧分隔
 *   - 分组标题用宋体小字
 *   - active 项墨绿色背景 + 朱印红圆点（左侧 4px 圆点）
 *   - 折叠态保持 64px 宽，仅显示图标
 */

"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"

export interface WorkspaceSidebarItem {
  label: string
  href: string
  icon?: LucideIcon | React.ComponentType<{ className?: string }>
  badge?: string
}

export interface WorkspaceSidebarSection {
  title?: string
  items: WorkspaceSidebarItem[]
}

export interface WorkspaceSidebarProps {
  sections?: WorkspaceSidebarSection[]
  /** 折叠状态（持久化由调用方做） */
  collapsed?: boolean
  onToggleCollapse?: () => void
  /** 移动端用：点击 item 后通知父组件关闭侧栏 */
  onItemClick?: () => void
  className?: string
}

const DEFAULT_SECTIONS: WorkspaceSidebarSection[] = [
  {
    title: "学习",
    items: [
      { label: "对话", href: "/chat" },
      { label: "智能体广场", href: "/agents" },
      { label: "闪卡复习", href: "/flashcards" },
      { label: "互动实验室", href: "/lab" },
    ],
  },
  {
    title: "我的",
    items: [
      { label: "学习看板", href: "/dashboard" },
      { label: "历史记录", href: "/history" },
      { label: "资料夹", href: "/folder" },
      { label: "积分", href: "/credits" },
    ],
  },
  {
    title: "社区",
    items: [
      { label: "创作广场", href: "/explore" },
      { label: "我的分享", href: "/my/shares" },
      { label: "邀请好友", href: "/invite" },
    ],
  },
]

export function WorkspaceSidebar({
  sections = DEFAULT_SECTIONS,
  collapsed = false,
  onToggleCollapse,
  onItemClick,
  className,
}: WorkspaceSidebarProps) {
  const pathname = usePathname()
  const renderItemContent = (item: WorkspaceSidebarItem, active: boolean) => {
    const Icon = item.icon

    return (
      <>
        {active ? (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 size-1.5 rounded-full bg-[var(--seal-500)]"
            aria-hidden="true"
          />
        ) : null}
        {Icon ? (
          <Icon className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <span className="size-4" aria-hidden="true" />
        )}
        {!collapsed ? (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="text-[11px] px-1.5 py-0.5 rounded-[var(--radius-pill)] bg-[var(--seal-50)] text-[var(--seal-600)] font-mono">
                {item.badge}
              </span>
            ) : null}
          </>
        ) : null}
      </>
    )
  }

  return (
    <aside
      data-slot="v2-workspace-sidebar"
      className={cn(
        "flex w-60 shrink-0 flex-col bg-[var(--paper-50)] border-r border-[var(--paper-200)]",
        "font-[var(--font-sans-v2)]",
        collapsed && "w-16",
        className
      )}
    >
      {/* 顶部 "新对话" 主 CTA */}
      <div className="px-3 pt-4 pb-2">
        <ButtonV2
          asChild
          variant="primary"
          size="default"
          className="w-full justify-start gap-2"
        >
          <Link href="/chat" prefetch={false} onClick={onItemClick}>
            <span aria-hidden="true">＋</span>
            {!collapsed ? "新对话" : null}
          </Link>
        </ButtonV2>
      </div>

      {/* 滚动分组列表 */}
      <nav className="flex-1 overflow-auto px-2 py-2">
        {sections.map((section, idx) => (
          <div key={section.title ?? idx} className="mb-4">
            {section.title && !collapsed ? (
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-400)]">
                {section.title}
              </div>
            ) : null}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const external = /^https?:\/\//.test(item.href)
                const active = external
                  ? false
                  : item.href === "/chat"
                  ? pathname === item.href
                  : pathname === item.href || pathname?.startsWith(`${item.href}/`)
                const itemClassName = cn(
                  "group relative flex items-center gap-3 px-3 py-2 rounded-[var(--radius-soft)] text-[14px]",
                  "transition-colors duration-200",
                  active
                    ? "bg-[var(--ink-50)] text-[var(--ink-800)] font-semibold"
                    : "text-[var(--ink-600)] hover:bg-[var(--ink-50)]/60 hover:text-[var(--ink-700)]"
                )

                if (external) {
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={onItemClick}
                        className={itemClassName}
                      >
                        {renderItemContent(item, active)}
                      </a>
                    </li>
                  )
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      onClick={onItemClick}
                      className={itemClassName}
                    >
                      {renderItemContent(item, active)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 底部折叠按钮 */}
      {onToggleCollapse ? (
        <div className="border-t border-[var(--paper-200)] p-2">
          <ButtonV2
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
            className={cn(collapsed && "rotate-180", "transition-transform duration-300")}
          >
            <ChevronLeft className="size-4" />
          </ButtonV2>
        </div>
      ) : null}
    </aside>
  )
}
