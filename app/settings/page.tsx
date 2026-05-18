"use client"

import { ButtonV2 as Button, InputV2 as Input, LabelV2 as Label } from "@/components/ui/v2"
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */

import { useState, useEffect, useRef } from "react"
import { createClient } from "@supabase/supabase-js"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { extractUserId } from "@/lib/auth-user"
import { ProfilePageV2 } from "@/components/settings/v2/ProfilePageV2"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function getVerifiedAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") {
    const authingToken = localStorage.getItem("idToken") || localStorage.getItem("authingToken") || localStorage.getItem("accessToken")
    try {
      const currentUserId = extractUserId(JSON.parse(localStorage.getItem("currentUser") || "null"))
      if (authingToken && /^[a-f0-9]{24}$/i.test(currentUserId)) {
        return { Authorization: `Bearer ${authingToken}` }
      }
    } catch {
      // Fall through to the verified Supabase session check.
    }
  }

  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) return { Authorization: `Bearer ${data.session.access_token}` }
  if (typeof window === "undefined") return {}
  const authingToken = localStorage.getItem("idToken") || localStorage.getItem("authingToken") || localStorage.getItem("accessToken")
  return authingToken ? { Authorization: `Bearer ${authingToken}` } : {}
}

// 设计系统颜色
const COLORS = {
  primary: {
    main: "var(--ink-600)",
    dark: "var(--ink-700)",
    light: "var(--ink-50)",
  },
  gray: {
    50: "var(--paper-50)",
    100: "var(--paper-100)",
    200: "var(--paper-200)",
    300: "var(--ink-300)",
    400: "var(--ink-400)",
    500: "var(--ink-500)",
    600: "var(--ink-600)",
    700: "var(--ink-700)",
    800: "var(--ink-800)",
  },
  blue: "var(--ink-600)",
  red: "var(--seal-500)",
}

// 积分类型标签颜色
const CREDIT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "注册积分": { bg: "var(--ink-900)", text: "white" },
  "邀请积分": { bg: "var(--seal-50)", text: "var(--seal-600)" },
  "每日积分": { bg: "var(--ink-50)", text: "var(--ink-700)" },
  "其他积分": { bg: "var(--paper-100)", text: "var(--ink-700)" },
  "购买积分": { bg: "var(--ink-50)", text: "var(--ink-700)" },
  "消耗积分": { bg: "var(--seal-50)", text: "var(--seal-500)" },
}

// 积分变化记录类型
type CreditTransaction = {
  id: string
  description: string
  amount: number
  type: "消耗" | "获得"
  credit_type: string
  created_at: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [debugError, setDebugError] = useState<string | null>(null)
  const [showDataExportDialog, setShowDataExportDialog] = useState(false)
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false)
  
  // 积分和会员信息
  const [credits, setCredits] = useState(0)
  const [membershipType, setMembershipType] = useState("免费")
  const [inviteCount, setInviteCount] = useState(0)
  const [inviteRewards, setInviteRewards] = useState(0)
  
  // 积分变化记录
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const initUser = async () => {
      if (typeof window !== 'undefined') {
        const localStr = localStorage.getItem('currentUser')
        if (localStr) {
          try {
            const localUser = JSON.parse(localStr)
            setUser(localUser)
            setDisplayName(localUser.user_metadata?.name || localUser.nickname || "")
            setAvatarUrl(localUser.user_metadata?.avatar_url || "")
            
            const userId = localUser.id || localUser.sub || localUser.userId
            if (userId) {
              const authHeaders = await getVerifiedAuthHeaders()
              // 获取积分
              const creditsRes = await fetch(`/api/user/credits`, { headers: authHeaders })
              if (creditsRes.ok) {
                const data = await creditsRes.json()
                setCredits(data.credits || 0)
              }
              
              // 获取会员信息
              const memberRes = await fetch(`/api/user/membership`, { headers: authHeaders })
              if (memberRes.ok) {
                const data = await memberRes.json()
                setMembershipType(data.type || "免费")
              }
              
              // 获取邀请统计
              const { data: inviteData } = await supabase
                .from('invite_codes')
                .select('used_count, total_rewards')
                .eq('user_id', userId)
                .single()
              
              if (inviteData) {
                setInviteCount(inviteData.used_count || 0)
                setInviteRewards(inviteData.total_rewards || 0)
              }
              
              // 获取积分变化记录
              await fetchTransactions(userId)
            }
          } catch (e) {
            console.error("初始化用户失败:", e)
          }
        }
      }
    }
    initUser()
  }, [])

  const fetchTransactions = async (userId: string) => {
    setLoadingTransactions(true)
    try {
      const res = await fetch(`/api/user/transactions`, { headers: await getVerifiedAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions || [])
      } else {
        console.error("获取积分记录失败:", await res.text())
      }
    } catch (e) {
      console.error("获取积分记录失败:", e)
    } finally {
      setLoadingTransactions(false)
    }
  }

  const handleUploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setDebugError(null) 
    try {
      setUploading(true)
      
      if (!event.target.files || event.target.files.length === 0) return

      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `avatar_${Date.now()}.${fileExt}`

      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        throw new Error(`Upload Error: ${(uploadError as any).message}`)
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      const finalUrl = `${publicUrl}?t=${Date.now()}`
      setAvatarUrl(finalUrl)
      toast.success("上传成功！请点击【保存修改】")

    } catch (error: any) {
      console.error(error)
      setDebugError(error.message || "未知错误")
      toast.error("上传失败")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setDebugError(null)
    setLoading(true)

    try {
      const userId = user.id || user.sub || user.userId
      
      const response = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          name: displayName,
          avatarUrl: avatarUrl
        })
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "更新失败")
      }

      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
      const updatedUser = {
        ...currentUser,
        user_metadata: {
          ...currentUser.user_metadata,
          name: displayName,
          avatar_url: avatarUrl
        }
      }
      localStorage.setItem('currentUser', JSON.stringify(updatedUser))

      toast.success("保存成功！")
      
      setTimeout(() => {
        window.location.reload()
      }, 800)
      
    } catch (error: any) {
      console.error(error)
      setDebugError(`Save Error: ${error.message}`)
      toast.error("保存失败")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('currentUser')
    router.push("/login")
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  }

  const getLoginMethod = () => {
    if (user?.phone) return "手机+密码"
    if (user?.email) return "邮箱+密码"
    return "未知"
  }

  return (
    <ProfilePageV2
      user={{
        name: user?.name || user?.nickname || user?.display_name,
        email: user?.email,
        avatar: avatarUrl || user?.photo || user?.avatar_url,
        credits: credits,
        memberTier: membershipType || undefined,
        memberDaysLeft: undefined,
      }}
      stats={{
        essaysReviewed: undefined,
        flashcardsMastered: undefined,
        mistakesArchived: undefined,
        experimentsCompleted: undefined,
        streakDays: undefined,
      }}
      achievements={[
        { label: "首次批改", earned: true },
        { label: "连续7天", earned: false },
        { label: "1000积分", earned: credits >= 1000 },
        { label: "邀请好友", earned: false },
        { label: "闪卡100张", earned: false },
        { label: "创作分享", earned: false },
      ]}
      onLogout={() => {
        supabase?.auth.signOut()
        localStorage.clear()
        window.location.href = "/login"
      }}
    />
  )
}
