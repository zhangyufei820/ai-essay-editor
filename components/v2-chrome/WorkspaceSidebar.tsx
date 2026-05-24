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
import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft, Plus, X, type LucideIcon } from "lucide-react"
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
  /** 移动端抽屉用：显式关闭入口 */
  onMobileClose?: () => void
  /** 移动端抽屉态：使用更宽触控区域和品牌统一色 */
  mobileMode?: boolean
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
  onMobileClose,
  mobileMode = false,
  className,
}: WorkspaceSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [appLauncherOpen, setAppLauncherOpen] = React.useState(false)

  React.useEffect(() => {
    if (collapsed) setAppLauncherOpen(false)
  }, [collapsed])

  const handleLauncherItemClick = () => {
    setAppLauncherOpen(false)
    onItemClick?.()
  }

  const handleInternalNavigation = (href: string, event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault()
    setAppLauncherOpen(false)
    onItemClick?.()
    if (href !== pathname) {
      router.push(href)
    }
  }

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
          <Icon className="size-4 shrink-0 text-current" aria-hidden="true" />
        ) : (
          <span className="size-4" aria-hidden="true" />
        )}
        {!collapsed ? (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge ? (
              <span className="rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--ink-50)] px-1.5 py-0.5 font-[var(--font-sans-v2)] text-[11px] font-semibold text-[var(--ink-700)]">
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
        "flex w-60 shrink-0 flex-col border-r border-[var(--paper-200)] bg-[var(--paper-50)] text-[var(--ink-900)]",
        "font-[var(--font-sans-v2)]",
        mobileMode && "w-full max-w-none shadow-[8px_0_28px_rgba(14,27,17,0.16)]",
        collapsed && "w-16",
        className
      )}
    >
      {/* 顶部 "新对话" 主 CTA */}
      <div className={cn("px-3 pt-4 pb-2", mobileMode && "px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3")}>
        {mobileMode ? (
          <div className="mb-3 flex items-center justify-between">
            <span className="font-[var(--font-display)] text-[18px] font-bold text-[var(--ink-900)]">
              工作台
            </span>
            <button
              type="button"
              onClick={onMobileClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--ink-700)] transition-colors hover:bg-[var(--ink-50)] active:bg-[var(--ink-100)]"
              aria-label="关闭工作台导航"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <ButtonV2
          variant="primary"
          size="default"
          className={cn(
            "w-full justify-start gap-2",
            "text-white [&_svg]:text-white",
            mobileMode && "h-12 rounded-[var(--radius-soft)] px-4 text-[15px]"
          )}
          onClick={() => setAppLauncherOpen((value) => !value)}
          aria-expanded={appLauncherOpen}
          aria-controls="workspace-app-launcher"
        >
          <Plus className="size-4 text-white" aria-hidden="true" />
          {!collapsed ? "新对话" : null}
        </ButtonV2>

        {appLauncherOpen && !collapsed ? (
          <div
            id="workspace-app-launcher"
            className="mt-3 max-h-[58vh] overflow-auto rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-2 shadow-[0_16px_36px_rgba(14,27,17,0.14)]"
          >
            <div className="px-2 pb-2 text-[12px] font-semibold text-[var(--ink-700)]">
              选择应用开始
            </div>
            {sections.map((section, idx) => (
              <div key={section.title ?? idx} className="mb-2 last:mb-0">
                {section.title ? (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-400)]">
                    {section.title}
                  </div>
                ) : null}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const external = /^https?:\/\//.test(item.href)
                    const itemClassName = cn(
                      "flex items-center gap-2 rounded-[var(--radius-soft)] px-2 py-2 text-[13px]",
                      "text-[var(--ink-700)] hover:bg-[var(--ink-50)] hover:text-[var(--ink-900)]"
                    )

                    const content = (
                      <>
                        {Icon ? (
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <span className="size-4 shrink-0" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="rounded-[var(--radius-pill)] border border-[var(--ink-200)] bg-[var(--ink-50)] px-1.5 py-0.5 font-[var(--font-sans-v2)] text-[10px] font-semibold text-[var(--ink-700)]">
                            {item.badge}
                          </span>
                        ) : null}
                      </>
                    )

                    if (external) {
                      return (
                        <li key={`launcher-${item.href}`}>
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            onClick={handleLauncherItemClick}
                            className={itemClassName}
                          >
                            {content}
                          </a>
                        </li>
                      )
                    }

                    return (
                      <li key={`launcher-${item.href}`}>
                        <a
                          href={item.href}
                          onClick={(event) => handleInternalNavigation(item.href, event)}
                          className={itemClassName}
                        >
                          {content}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* 滚动分组列表 */}
      <nav className={cn("flex-1 overflow-auto px-2 py-2", mobileMode && "px-4 pb-[max(env(safe-area-inset-bottom),16px)]")}>
        {sections.map((section, idx) => (
          <div key={section.title ?? idx} className={cn("mb-4", mobileMode && "mb-5")}>
            {section.title && !collapsed ? (
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-normal text-[var(--ink-500)]">
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
                  "group relative flex min-h-11 items-center gap-3 rounded-[var(--radius-soft)] px-3 py-2 text-[14px]",
                  "transition-colors duration-200",
                  mobileMode && "min-h-12 text-[15px]",
                  active
                    ? "bg-[var(--ink-50)] text-[var(--ink-800)] font-semibold"
                    : "text-[var(--ink-700)] hover:bg-[var(--ink-50)]/70 hover:text-[var(--ink-900)]"
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
                    <a
                      href={item.href}
                      onClick={(event) => handleInternalNavigation(item.href, event)}
                      className={itemClassName}
                    >
                      {renderItemContent(item, active)}
                    </a>
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
