"use client"

import { usePathname } from "next/navigation"
import type React from "react"

import { WorkspaceShell } from "@/components/v2-chrome"

const PAGE_TITLES: Array<[string, string]> = [
  ["/admin", "管理后台"],
  ["/credits", "积分中心"],
  ["/dashboard", "学习看板"],
  ["/flashcards", "闪卡复习"],
  ["/folder", "资料夹"],
  ["/history", "历史记录"],
  ["/invite", "邀请好友"],
  ["/lab", "互动实验室"],
  ["/my/shares", "我的分享"],
  ["/settings", "个人中心"],
  ["/teacher/agents", "教师智能体"],
  ["/teacher", "教师专区"],
  ["/tools", "工具箱"],
  ["/worksheet-diagnosis", "拍卷诊断"],
]

function resolvePageTitle(pathname: string | null) {
  const match = PAGE_TITLES.find(([prefix]) => pathname === prefix || pathname?.startsWith(`${prefix}/`))
  return match?.[1] ?? "工作台"
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <WorkspaceShell pageTitle={resolvePageTitle(pathname)}>
      {children}
    </WorkspaceShell>
  )
}
