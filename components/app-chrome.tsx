"use client"

import { Box, Image } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { IconDiagnosis, IconMusic, IconSettings } from "@/components/icons/v2"
import { WorkspaceShell } from "@/components/v2-chrome"
import type { WorkspaceSidebarSection } from "@/components/v2-chrome"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { readClientUserProfile, USER_PROFILE_UPDATED_EVENT } from "@/lib/client-user-profile"
import { CELLFORGE_EXTERNAL_URL } from "@/lib/tripo3d"

type WorkspaceUser = {
  name?: string
  avatar?: string
  credits?: number
  trialRemaining?: number
  trialUnlocked?: boolean
} | null

const PAGE_TITLES: Array<[string, string]> = [
  ["/admin", "管理后台"],
  ["/agents", "智能体广场"],
  ["/chat", "智能对话"],
  ["/credits", "积分中心"],
  ["/dashboard", "学习看板"],
  ["/flashcards", "闪卡复习"],
  ["/folder", "资料夹"],
  ["/history", "历史记录"],
  ["/invite", "邀请好友"],
  ["/lab", "互动实验室"],
  ["/my/shares", "我的分享"],
  ["/settings", "个人中心"],
  ["/suno", "suno音乐创作"],
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
  const user = readClientUserProfile()
  if (!user) return null
  return { name: user.name || "用户", avatar: user.avatar }
}

function hasStoredAuthToken() {
  if (typeof window === "undefined") return false
  return Boolean(
    window.localStorage.getItem("idToken") ||
      window.localStorage.getItem("authingToken") ||
      window.localStorage.getItem("accessToken")
  )
}

export function buildSidebarSections(): WorkspaceSidebarSection[] {
  return [
    {
      title: "学习",
      items: [
        { label: "对话", href: "/chat" },
        { label: "拍卷诊断", href: "/worksheet-diagnosis", icon: IconDiagnosis, badge: "主打" },
        { label: "智能体广场", href: "/agents" },
        { label: "闪卡复习", href: "/flashcards" },
        { label: "互动实验室", href: "/lab" },
        { label: "教师平台", href: "/teacher/agents" },
      ],
    },
    {
      title: "多媒体专区",
      items: [
        { label: "图像生成", href: "/chat/gpt-image-2", icon: Image, badge: "图像" },
        { label: "suno音乐创作", href: "/suno", icon: IconMusic, badge: "音乐" },
        { label: "三维细胞实验室", href: CELLFORGE_EXTERNAL_URL, icon: Box, badge: "三维" },
        { label: "全部工具", href: "/tools", icon: IconSettings },
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
          trialRemaining: typeof data.trialStatus?.today_trial_remaining === "number"
            ? data.trialStatus.today_trial_remaining
            : current?.trialRemaining,
          trialUnlocked: Boolean(data.trialStatus?.trial_active && data.trialStatus?.today_survey_completed),
        }))
      } catch {
        // Keep the local user fallback if the credits endpoint is temporarily unavailable.
      }
    }

    loadUser()

    const refresh = () => loadUser()
    window.addEventListener("storage", refresh)
    window.addEventListener(USER_PROFILE_UPDATED_EVENT, refresh)
    window.addEventListener("credits-refresh", refresh)

    return () => {
      cancelled = true
      window.removeEventListener("storage", refresh)
      window.removeEventListener(USER_PROFILE_UPDATED_EVENT, refresh)
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
