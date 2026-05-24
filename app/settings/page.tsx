"use client"

import { ButtonV2 as Button, InputV2 as Input, LabelV2 as Label } from "@/components/ui/v2"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@supabase/supabase-js"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { extractUserId } from "@/lib/auth-user"
import { dispatchClientUserProfileUpdated } from "@/lib/client-user-profile"
import { clearStoredAuthTokens, getVerifiedAuthHeaders } from "@/lib/client-auth"
import { ProfilePageV2 } from "@/components/settings/v2/ProfilePageV2"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

function normalizeMembershipLabel(type?: string | null) {
  if (!type || type === "免费") return ""
  const labels: Record<string, string> = {
    basic: "基础版",
    pro: "专业版",
    premium: "豪华版",
    enterprise: "企业版",
    campus: "校园版",
  }
  return labels[type] || type
}

const MAX_AVATAR_FILE_SIZE = 8 * 1024 * 1024
const MAX_AVATAR_DATA_URL_LENGTH = 250_000
const AVATAR_CANVAS_SIZE = 256
const AVATAR_IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"

function readFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function getNestedRecord(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null
  const child = (value as Record<string, unknown>)[key]
  return child && typeof child === "object" ? child as Record<string, unknown> : null
}

function normalizeSettingsUser(rawUser: unknown) {
  const user = rawUser && typeof rawUser === "object" ? rawUser as Record<string, unknown> : {}
  const metadata = getNestedRecord(user, "user_metadata")
  const nestedUser = getNestedRecord(user, "user")
  const nestedMetadata = getNestedRecord(nestedUser, "user_metadata")

  const preferredName = readFirstString(
    metadata?.name,
    metadata?.nickname,
    user.name,
    user.nickname,
    user.display_name,
    user.username,
    nestedMetadata?.name,
    nestedUser?.name,
  )
  const contactName = readFirstString(
    nestedUser?.email,
    user.email,
    user.phone,
    user.phone_number,
  )
  const looksLikeAnonymousNumericName = /^\d{6,10}$/.test(preferredName)
  const name = looksLikeAnonymousNumericName && contactName ? contactName : preferredName || contactName

  return {
    raw: user,
    id: extractUserId(user),
    name: name || "学习用户",
    email: readFirstString(user.email, nestedUser?.email),
    phone: readFirstString(user.phone, user.phone_number, nestedUser?.phone, nestedUser?.phone_number),
    avatar: readFirstString(
      metadata?.avatar_url,
      metadata?.picture,
      user.avatar_url,
      user.avatarUrl,
      user.photo,
      user.picture,
      nestedMetadata?.avatar_url,
      nestedUser?.avatar_url,
      nestedUser?.photo,
    ),
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("头像读取失败"))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("头像图片解析失败"))
    image.src = src
  })
}

async function createAvatarDataUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件")
  }
  if (file.size > MAX_AVATAR_FILE_SIZE) {
    throw new Error("头像图片不能超过 8MB")
  }

  const originalDataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(originalDataUrl)
  const canvas = document.createElement("canvas")
  canvas.width = AVATAR_CANVAS_SIZE
  canvas.height = AVATAR_CANVAS_SIZE
  const context = canvas.getContext("2d")
  if (!context) throw new Error("当前浏览器不支持头像处理")

  const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)
  const sourceX = ((image.naturalWidth || image.width) - side) / 2
  const sourceY = ((image.naturalHeight || image.height) - side) / 2
  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, AVATAR_CANVAS_SIZE, AVATAR_CANVAS_SIZE)

  const dataUrl = canvas.toDataURL("image/webp", 0.82)
  if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("头像处理后仍过大，请换一张更小的图片")
  }
  return dataUrl
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
            const normalizedUser = normalizeSettingsUser(localUser)
            setUser(localUser)
            setDisplayName(normalizedUser.name)
            setAvatarUrl(normalizedUser.avatar)
            
            const userId = normalizedUser.id
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
                setMembershipType(normalizeMembershipLabel(data.type))
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
      const finalUrl = await createAvatarDataUrl(file)
      setAvatarUrl(finalUrl)
      toast.success("头像已更新预览，请点击【保存资料】")

    } catch (error: any) {
      console.error(error)
      setDebugError(error.message || "未知错误")
      toast.error(error.message || "头像处理失败")
    } finally {
      setUploading(false)
      event.target.value = ""
    }
  }

  const handleSave = async () => {
    setDebugError(null)
    setLoading(true)

    try {
      const normalizedUser = normalizeSettingsUser(user)
      const userId = normalizedUser.id
      
      const response = await fetch('/api/user/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getVerifiedAuthHeaders()),
        },
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
        avatar: avatarUrl,
        name: displayName,
        nickname: displayName,
        avatar_url: avatarUrl,
        avatarUrl: avatarUrl,
        photo: avatarUrl,
        picture: avatarUrl,
        user_metadata: {
          ...currentUser.user_metadata,
          name: displayName,
          avatar: avatarUrl,
          avatar_url: avatarUrl
        }
      }
      localStorage.setItem('currentUser', JSON.stringify(updatedUser))
      dispatchClientUserProfileUpdated()

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
    clearStoredAuthTokens()
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
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_IMAGE_ACCEPT}
        className="hidden"
        onChange={handleUploadAvatar}
      />
      <ProfilePageV2
        user={{
          name: displayName || normalizeSettingsUser(user).name,
          email: normalizeSettingsUser(user).email || normalizeSettingsUser(user).phone,
          avatar: avatarUrl || normalizeSettingsUser(user).avatar,
          credits: credits,
          memberTier: normalizeMembershipLabel(membershipType) || undefined,
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
        displayName={displayName}
        onDisplayNameChange={setDisplayName}
        onSaveProfile={handleSave}
        savingProfile={loading}
        onAvatarClick={() => fileInputRef.current?.click()}
        avatarUploading={uploading}
        onLogout={() => {
          supabase?.auth.signOut()
          localStorage.clear()
          window.location.href = "/login"
        }}
      />
    </>
  )
}
