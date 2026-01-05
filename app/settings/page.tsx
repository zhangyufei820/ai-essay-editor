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
  ChevronRight, ArrowUpRight
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

// 侧边栏导航项
type NavItem = {
  id: string
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { id: "account", label: "账户", icon: User },
  { id: "settings", label: "设置", icon: Settings },
  { id: "usage", label: "使用情况", icon: BarChart3 },
]

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [debugError, setDebugError] = useState<string | null>(null)
  
  // 当前选中的导航项
  const [activeNav, setActiveNav] = useState("account")
  
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
            setDisplayName(localUser.user_metadata?.name || "")
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
      // 使用专用 API 获取积分记录（绕过 RLS）
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

  // 渲染账户页面（图1）
  const renderAccountPage = () => (
    <div className="space-y-6">
      {/* 用户头像和名称 */}
      <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
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
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {displayName || user?.email || user?.phone || "用户"}
          </h2>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-red-500 transition-colors mt-1"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>退出登录</span>
          </button>
        </div>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleUploadAvatar} />
      </div>

      {/* 账户信息 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">账户信息</h3>
        
        {/* 会员类型 */}
        <div className="flex items-center justify-between py-3">
          <span className="text-sm text-gray-600">{membershipType}</span>
          <Link href="/pricing">
            <Button 
              size="sm" 
              className="h-8 px-4 text-white text-xs font-medium rounded-full"
              style={{ backgroundColor: COLORS.blue }}
            >
              升级
            </Button>
          </Link>
        </div>
        
        {/* 总可用积分 */}
        <div className="flex items-center justify-between py-3 border-t border-gray-50">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
            <span className="text-sm text-gray-600">总可用积分</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">{credits.toLocaleString()} 积分</span>
        </div>
      </div>

      {/* 邀请系统 */}
      <div className="pt-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">邀请系统</h3>
        
        {/* 邀请好友 */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
            <span className="text-sm text-gray-600">邀请好友</span>
          </div>
          <Link href="/invite">
            <Button 
              size="sm" 
              className="h-8 px-4 text-white text-xs font-medium rounded-full"
              style={{ backgroundColor: COLORS.primary.main }}
            >
              立即邀请
            </Button>
          </Link>
        </div>
        
        {/* 累计邀请 */}
        <div className="flex items-center justify-between py-3 border-t border-gray-50">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
            <span className="text-sm text-gray-600">累计邀请</span>
          </div>
          <span className="text-sm text-gray-900">{inviteCount} 人</span>
        </div>
        
        {/* 累计奖励 */}
        <div className="flex items-center justify-between py-3 border-t border-gray-50">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
            <span className="text-sm text-gray-600">累计奖励</span>
          </div>
          <span className="text-sm text-gray-900">{inviteRewards.toLocaleString()} 积分</span>
        </div>
      </div>

      {/* 账号安全 */}
      <div className="pt-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">账号安全</h3>
        
        {/* 邮箱/手机验证 */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            {user?.email ? (
              <Mail className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
            ) : (
              <Phone className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
            )}
            <span className="text-sm text-gray-600">
              {user?.email ? "邮箱验证" : "手机验证"}
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
        <div className="flex items-center justify-between py-3 border-t border-gray-50">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
            <span className="text-sm text-gray-600">登录方式</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{getLoginMethod()}</span>
            <span className="flex items-center gap-1 text-xs" style={{ color: COLORS.primary.main }}>
              <CheckCircle className="h-3.5 w-3.5" />
              已启用
            </span>
          </div>
        </div>
      </div>

      {/* Google 登录提示 */}
      {user?.app_metadata?.provider === "google" && (
        <div 
          className="flex items-center gap-2 p-4 rounded-xl text-sm"
          style={{ backgroundColor: COLORS.blue + "10", color: COLORS.blue }}
        >
          <CheckCircle className="h-4 w-4" />
          <span>您使用 Google 账号登录，密码由 Google 管理，无需在此处修改。</span>
        </div>
      )}
    </div>
  )

  // 渲染设置页面
  const renderSettingsPage = () => (
    <div className="space-y-6">
      {/* 头像设置 */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">个人头像</Label>
        <div className="flex items-center gap-6 pb-6 border-b border-gray-100">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="h-24 w-24 rounded-full overflow-hidden border-4 border-gray-50 shadow-sm bg-gray-100 flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-gray-300">
                  {displayName?.[0]?.toUpperCase() || "U"}
                </span>
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-8 w-8 text-white" />
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-white/80 rounded-full flex items-center justify-center opacity-100">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: COLORS.primary.main }} />
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium text-gray-900">点击左侧圆形上传</h3>
            <p className="text-sm text-gray-500">支持 JPG, PNG, GIF</p>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleUploadAvatar} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "上传中..." : "选择图片"}
            </Button>
          </div>
        </div>
      </div>

      {/* 调试信息 */}
      {debugError && (
        <div className="rounded-lg bg-red-50 p-4 border border-red-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="text-sm text-red-800 break-all font-mono">{debugError}</div>
        </div>
      )}

      {/* 昵称设置 */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>账号</Label>
          <Input value={user?.email || user?.phone || ""} disabled className="bg-gray-50 text-gray-500" />
        </div>
        <div className="space-y-2">
          <Label>昵称</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="请输入您的昵称" />
        </div>
      </div>

      <div className="pt-4">
        <Button 
          onClick={handleSave} 
          disabled={loading} 
          className="w-full sm:w-auto text-white"
          style={{ backgroundColor: COLORS.primary.dark }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          保存修改
        </Button>
      </div>
    </div>
  )

  // 渲染使用情况页面（图2）
  const renderUsagePage = () => (
    <div className="space-y-6">
      {/* 账户信息 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">账户信息</h3>
        
        {/* 会员类型 */}
        <div className="flex items-center justify-between py-3">
          <span className="text-sm text-gray-600">{membershipType}</span>
          <Link href="/pricing">
            <Button 
              size="sm" 
              className="h-8 px-4 text-white text-xs font-medium rounded-full"
              style={{ backgroundColor: COLORS.blue }}
            >
              升级
            </Button>
          </Link>
        </div>
        
        {/* 总可用积分 - 大字显示 */}
        <div className="flex items-center justify-between py-4 border-t border-gray-50">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5" style={{ color: COLORS.primary.main }} />
            <span className="text-sm text-gray-600">总可用积分</span>
          </div>
          <span 
            className="text-2xl font-bold"
            style={{ color: COLORS.primary.main }}
          >
            {credits.toLocaleString()} 积分
          </span>
        </div>
      </div>

      {/* 详情表格 */}
      <div className="pt-4 border-t border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">详情</h3>
        
        {loadingTransactions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: COLORS.primary.main }} />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            暂无积分变化记录
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-2 font-medium text-gray-500">对话</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">积分变化</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">类型</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">积分类型</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">时间</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-500">状态</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const typeColors = CREDIT_TYPE_COLORS[t.credit_type] || CREDIT_TYPE_COLORS["其他积分"]
                  return (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-3 px-2 text-gray-700 max-w-[200px] truncate">
                        {t.description}
                      </td>
                      <td className="py-3 px-2">
                        <span 
                          className="font-medium"
                          style={{ color: t.amount > 0 ? COLORS.primary.main : COLORS.red }}
                        >
                          {t.amount > 0 ? `+ ${t.amount}` : t.amount}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {t.amount > 0 ? (
                          <span className="text-gray-600">
                            {t.credit_type === "注册积分" ? "注册赠送" : 
                             t.credit_type === "邀请积分" ? "被邀请奖励" :
                             t.credit_type === "每日积分" ? "每日登录" :
                             t.credit_type === "购买积分" ? "购买充值" : "积分获得"}
                          </span>
                        ) : (
                          <span className="text-gray-600">积分消耗</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span 
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{ 
                            backgroundColor: typeColors.bg, 
                            color: typeColors.text 
                          }}
                        >
                          {t.credit_type}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-500 text-xs">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="py-3 px-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          永久
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      {/* 左侧导航 */}
      <div className="w-48 bg-white border-r border-gray-100 p-4 shrink-0">
        <div className="mb-6">
          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logo.png" alt="Logo" className="h-8" />
          </Link>
        </div>
        
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                activeNav === item.id
                  ? "text-white"
                  : "text-gray-600 hover:bg-gray-50"
              )}
              style={activeNav === item.id ? { backgroundColor: COLORS.primary.main } : {}}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 p-8">
        <div className="max-w-3xl mx-auto">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900">
              {navItems.find(n => n.id === activeNav)?.label}
            </h1>
            <button 
              onClick={() => router.push("/")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 内容卡片 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            {activeNav === "account" && renderAccountPage()}
            {activeNav === "settings" && renderSettingsPage()}
            {activeNav === "usage" && renderUsagePage()}
          </div>
        </div>
      </div>
    </div>
  )
}
