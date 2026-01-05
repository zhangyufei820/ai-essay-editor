"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@supabase/supabase-js"
import { toast } from "sonner"
import { 
  Loader2, Upload, Camera, AlertCircle, User, Settings, BarChart3, 
  Zap, Coins, Gift, Users, CheckCircle, Mail, Phone, LogOut,
  ChevronRight, ArrowUpRight, ChevronLeft
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 设计系统颜色
const COLORS = {
  primary: {
    main: "#22C55E",
    dark: "#15803D",
    light: "#DCFCE7",
  },
  gray: {
    50: "#FAFAFA",
    100: "#F5F5F5",
    200: "#E5E7EB",
    300: "#D1D5DB",
    400: "#9CA3AF",
    500: "#6B7280",
    600: "#4B5563",
    700: "#374151",
    800: "#1F2937",
  },
  blue: "#3B82F6",
  red: "#EF4444",
}

// 积分类型标签颜色
const CREDIT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  "注册积分": { bg: "#1F2937", text: "#FFFFFF" },
  "邀请积分": { bg: "#FEF3C7", text: "#92400E" },
  "每日积分": { bg: "#DBEAFE", text: "#1E40AF" },
  "其他积分": { bg: "#F3F4F6", text: "#374151" },
  "购买积分": { bg: "#D1FAE5", text: "#065F46" },
  "消耗积分": { bg: "#FEE2E2", text: "#991B1B" },
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
              // 获取积分
              const creditsRes = await fetch(`/api/user/credits?user_id=${encodeURIComponent(userId)}`)
              if (creditsRes.ok) {
                const data = await creditsRes.json()
                setCredits(data.credits || 0)
              }
              
              // 获取会员信息
              const memberRes = await fetch(`/api/user/membership?user_id=${encodeURIComponent(userId)}`)
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
      const res = await fetch(`/api/user/transactions?user_id=${encodeURIComponent(userId)}`)
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
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium">返回</span>
          </button>
          <h1 className="text-lg font-semibold text-gray-900">设置</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        
        {/* 🔥 用户信息卡片 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-4">
            {/* 头像 */}
            <div 
              className="relative group cursor-pointer" 
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-gray-100 shadow-sm bg-gray-100 flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span 
                    className="text-2xl font-bold text-white flex items-center justify-center h-full w-full"
                    style={{ backgroundColor: COLORS.primary.main }}
                  >
                    {displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
                  </span>
                )}
              </div>
              <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-6 w-6 text-white" />
              </div>
              {uploading && (
                <div className="absolute inset-0 bg-white/80 rounded-full flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin" style={{ color: COLORS.primary.main }} />
                </div>
              )}
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleUploadAvatar} />
            
            {/* 用户信息 */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Input 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  placeholder="设置昵称"
                  className="h-8 text-base font-semibold border-0 p-0 focus-visible:ring-0 bg-transparent"
                />
              </div>
              <p className="text-sm text-gray-500">{user?.email || user?.phone || "-"}</p>
            </div>
            
            {/* 保存按钮 */}
            <Button 
              onClick={handleSave} 
              disabled={loading} 
              size="sm"
              className="text-white"
              style={{ backgroundColor: COLORS.primary.main }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
            </Button>
          </div>
          
          {/* 退出登录 */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>退出登录</span>
            </button>
          </div>
        </div>

        {/* 🔥 积分信息卡片 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">积分信息</h3>
          
          {/* 会员类型 + 升级按钮 */}
          <div className="flex items-center justify-between py-3 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">会员类型</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">{membershipType}</span>
              <Link href="/pricing">
                <Button 
                  size="sm" 
                  className="h-7 px-3 text-white text-xs font-medium rounded-full"
                  style={{ backgroundColor: COLORS.blue }}
                >
                  升级
                </Button>
              </Link>
            </div>
          </div>
          
          {/* 总可用积分 */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4" style={{ color: COLORS.primary.main }} />
              <span className="text-sm text-gray-600">总可用积分</span>
            </div>
            <span 
              className="text-xl font-bold"
              style={{ color: COLORS.primary.main }}
            >
              {credits.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 🔥 邀请系统卡片 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">邀请系统</h3>
          
          {/* 邀请好友 */}
          <div className="flex items-center justify-between py-3 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
              <span className="text-sm text-gray-600">邀请好友</span>
            </div>
            <Link href="/invite">
              <Button 
                size="sm" 
                className="h-7 px-3 text-white text-xs font-medium rounded-full"
                style={{ backgroundColor: COLORS.primary.main }}
              >
                立即邀请
              </Button>
            </Link>
          </div>
          
          {/* 累计邀请 */}
          <div className="flex items-center justify-between py-3 border-b border-gray-50">
            <span className="text-sm text-gray-600">累计邀请</span>
            <span className="text-sm font-medium text-gray-900">{inviteCount} 人</span>
          </div>
          
          {/* 累计奖励 */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-600">累计奖励</span>
            <span className="text-sm font-medium text-gray-900">{inviteRewards.toLocaleString()} 积分</span>
          </div>
        </div>

        {/* 🔥 使用记录卡片 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">使用记录</h3>
          
          {loadingTransactions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: COLORS.primary.main }} />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              暂无积分变化记录
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.slice(0, 10).map((t) => {
                const typeColors = CREDIT_TYPE_COLORS[t.credit_type] || CREDIT_TYPE_COLORS["其他积分"]
                return (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{t.description}</p>
                      <p className="text-xs text-gray-400">{formatDate(t.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span 
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: typeColors.bg, color: typeColors.text }}
                      >
                        {t.credit_type}
                      </span>
                      <span 
                        className="text-sm font-semibold min-w-[60px] text-right"
                        style={{ color: t.amount > 0 ? COLORS.primary.main : COLORS.red }}
                      >
                        {t.amount > 0 ? `+${t.amount}` : t.amount}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 🔥 账号安全卡片 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">账号安全</h3>
          
          {/* 邮箱/手机验证 */}
          <div className="flex items-center justify-between py-3 border-b border-gray-50">
            <div className="flex items-center gap-2">
              {user?.email ? (
                <Mail className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
              ) : (
                <Phone className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
              )}
              <span className="text-sm text-gray-600">
                {user?.email ? "邮箱" : "手机"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {user?.email || user?.phone || "-"}
              </span>
              <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.primary.main }}>
                <CheckCircle className="h-3.5 w-3.5" />
                已验证
              </span>
            </div>
          </div>
          
          {/* 登录方式 */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-gray-600">登录方式</span>
            <span className="text-sm text-gray-500">{getLoginMethod()}</span>
          </div>
        </div>

        {/* 调试信息 */}
        {debugError && (
          <div className="rounded-lg bg-red-50 p-4 border border-red-200 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="text-sm text-red-800 break-all font-mono">{debugError}</div>
          </div>
        )}
      </div>
    </div>
  )
}
