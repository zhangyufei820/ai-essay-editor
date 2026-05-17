"use client"

import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { WorkspaceShell } from "@/components/v2-chrome"
import type { WorkspaceSidebarSection } from "@/components/v2-chrome"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

type WorkspaceUser = { name?: string; avatar?: string; credits?: number } | null

const PAGE_TITLES: Array<[string, string]> = [
  ["/admin", "管理后台"],
  ["/chat", "AI 对话"],
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

function parseStoredUser(): WorkspaceUser {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem("currentUser")
    if (!raw) return null
    const user = JSON.parse(raw)

    return {
      name:
        user?.name ||
        user?.nickname ||
        user?.display_name ||
        user?.username ||
        user?.email ||
        user?.phone ||
        user?.user_metadata?.name ||
        "用户",
      avatar:
        user?.photo ||
        user?.avatar_url ||
        user?.avatarUrl ||
        user?.user_metadata?.avatar_url,
    }
  } catch {
    return null
  }
}

function hasStoredAuthToken() {
  if (typeof window === "undefined") return false
  return Boolean(
    window.localStorage.getItem("idToken") ||
      window.localStorage.getItem("authingToken") ||
      window.localStorage.getItem("accessToken")
  )
}

function buildSidebarSections(): WorkspaceSidebarSection[] {
  return [
    {
      title: "学习",
      items: [
        { label: "对话", href: "/chat" },
        { label: "拍卷诊断", href: "/worksheet-diagnosis" },
        { label: "闪卡复习", href: "/flashcards" },
        { label: "互动实验室", href: "/lab" },
        { label: "教师平台", href: "/teacher/agents" },
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
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [user, setUser] = useState<WorkspaceUser>(null)
  const sidebarSections = useMemo(() => buildSidebarSections(), [])

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      const storedUser = parseStoredUser()
      if (cancelled) return
      setUser(storedUser)

      if (!storedUser && !hasStoredAuthToken()) return

      try {
        const headers = await getVerifiedAuthHeaders()
        const response = await fetch("/api/user/credits", { headers })
        if (!response.ok) return
        const data = await response.json()
        if (cancelled) return
        setUser((current) => ({
          ...(current ?? storedUser ?? { name: "用户" }),
          credits: typeof data.credits === "number" ? data.credits : current?.credits,
        }))
      } catch {
        // Keep the local user fallback if the credits endpoint is temporarily unavailable.
      }
    }

    loadUser()

    const refresh = () => loadUser()
    window.addEventListener("storage", refresh)
    window.addEventListener("credits-refresh", refresh)

    return () => {
      cancelled = true
      window.removeEventListener("storage", refresh)
      window.removeEventListener("credits-refresh", refresh)
    }
  }, [])

  return (
    <WorkspaceShell
      pageTitle={resolvePageTitle(pathname)}
      sidebarSections={sidebarSections}
      user={user}
    >
      {children}
    </WorkspaceShell>
  )
}
