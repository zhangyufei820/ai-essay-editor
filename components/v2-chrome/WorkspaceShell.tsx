/**
 * 🖌 沈翔智学 v2「墨砚」工作台外壳
 *
 * 用于：所有登录用户使用的工作台路径
 *   /chat、/dashboard、/flashcards、/history、/credits、/settings、
 *   /worksheet-diagnosis、/explore、/teacher/agents、/folder
 *
 * 三栏式布局：
 *   ┌──────────────────────────────────────────┐
 *   │ WorkspaceTopBar (高 56px sticky)          │
 *   ├────┬─────────────────────────────┬───────┤
 *   │ 侧 │           主区               │ 右侧抽│
 *   │ 栏 │           main               │ 屉    │
 *   │    │                              │ slot  │
 *   └────┴─────────────────────────────┴───────┘
 *
 * Sidebar 默认 240px / 折叠后 64px / 移动端隐藏
 * 右侧抽屉默认隐藏，业务可注入
 */

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { WorkspaceTopBar } from "./WorkspaceTopBar"
import { WorkspaceSidebar, type WorkspaceSidebarSection } from "./WorkspaceSidebar"

export interface WorkspaceShellProps {
  children: React.ReactNode
  /** 侧栏配置 */
  sidebarSections?: WorkspaceSidebarSection[]
  /** 顶栏中央显示的页面标题 */
  pageTitle?: React.ReactNode
  /** 顶栏右侧 user 数据 */
  user?: { name?: string; avatar?: string; credits?: number } | null
  /** 右侧固定抽屉（用于 chat 的产物面板） */
  rightDrawer?: React.ReactNode
  /** 移动端汉堡菜单是否显示侧栏 */
  className?: string
}

export function WorkspaceShell({
  children,
  sidebarSections,
  pageTitle,
  user,
  rightDrawer,
  className,
}: WorkspaceShellProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  return (
    <div
      data-slot="v2-workspace-shell"
      className={cn(
        "flex h-screen w-full flex-col overflow-hidden bg-[var(--paper-50)] text-[var(--ink-900)]",
        className
      )}
    >
      <WorkspaceTopBar
        pageTitle={pageTitle}
        user={user}
        onMenuClick={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 桌面侧栏 */}
        <WorkspaceSidebar
          sections={sidebarSections}
          className="hidden md:flex"
        />

        {/* 移动端侧栏 */}
        {sidebarOpen ? (
          <div
            className="fixed inset-0 z-30 bg-[rgba(14,27,17,0.4)] backdrop-blur-[2px] md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          >
            <div
              className="absolute inset-y-0 left-0 w-[80vw] max-w-xs animate-in slide-in-from-left duration-300 ease-[var(--ease-paper-fold)]"
              onClick={(e) => e.stopPropagation()}
            >
              <WorkspaceSidebar
                sections={sidebarSections}
                onItemClick={() => setSidebarOpen(false)}
                className="flex h-full"
              />
            </div>
          </div>
        ) : null}

        {/* 主内容 */}
        <main
          id="main-content"
          className="flex-1 overflow-auto"
        >
          {children}
        </main>

        {/* 右侧抽屉 */}
        {rightDrawer ? (
          <aside className="hidden lg:block w-80 border-l border-[var(--paper-200)] bg-[var(--paper-50)]">
            {rightDrawer}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
