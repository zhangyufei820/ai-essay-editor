"use client"

import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { useState, useEffect, useRef, Suspense, useCallback } from "react"
import { Button } from "@/components/ui/button" 
import { 
  Home, Settings, ChevronRight, ChevronDown,
  Menu, X, LogOut, Zap, Coins,
  History, Bot, GraduationCap, Brain,
  Gift, HelpCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@supabase/supabase-js"

// --- 设计系统颜色常量 ---
const COLORS = {
  primary: {
    main: "#22C55E",      // 主品牌色（更鲜艳的绿色）
    dark: "#15803D",      // 深色（选中文字）
    darker: "#14532D",    // 更深色（标题）
    light: "#DCFCE7",     // 浅色背景
    hover: "rgba(34, 197, 94, 0.12)", // 选中态背景
  },
  // 🎨 侧边栏专用配色 - 基于主页风格的浅绿灰色
  sidebar: {
    bg: "#F8FAF9",           // 主背景 - 带绿调的浅灰
    bgGradient: "linear-gradient(180deg, #F0F7F4 0%, #F8FAF9 50%, #FAFBFA 100%)", // 渐变背景
    cardBg: "#FFFFFF",       // 卡片背景
    border: "#E2E8E4",       // 边框色 - 带绿调
    divider: "#E5EBE7",      // 分割线
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
    900: "#111827",
  },
  error: "#EF4444",
  divider: "#E5EBE7",
}

// 🎨 文字阴影样式
const TEXT_SHADOWS = {
  subtle: "0 1px 2px rgba(0,0,0,0.05)",
  medium: "0 1px 3px rgba(0,0,0,0.1)",
  strong: "0 2px 4px rgba(0,0,0,0.12)",
}

// --- 类型定义 ---
type ChatSession = {
  id: string
  title: string
  date: number
  preview: string
}

// --- 初始化 Supabase ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 🔥 全局状态：用于跨组件控制侧边栏折叠
const SIDEBAR_COLLAPSE_EVENT = 'sidebar-collapse'
// 🔥 全局事件：用于触发积分刷新
const CREDITS_REFRESH_EVENT = 'credits-refresh'

// 内部组件
function AppSidebarInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const currentAgent = searchParams.get("agent")
  
  // --- 状态管理 ---
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState<number>(0)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentUserId, setCurrentUserId] = useState<string>("")
  
  // 侧边栏整体开关
  const [isOpen, setIsOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  
  // 🔥 历史对话折叠状态
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  
  // 底部用户菜单开关
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 🔥 积分查询函数 - 使用专用 API（绕过 RLS 限制）
  const fetchCredits = useCallback(async (uid: string) => {
    if (!uid) return
    console.log("🔍 [侧边栏] 通过 API 查询积分，用户ID:", uid)
    
    try {
      // 使用专用 API 查询积分（使用 Service Role Key，绕过 RLS）
      const res = await fetch(`/api/user/credits?user_id=${encodeURIComponent(uid)}`)
      
      if (res.ok) {
        const data = await res.json()
        console.log("✅ [侧边栏] 积分查询成功:", data)
        setCredits(data.credits || 0)
        
        if (data.isNew) {
          console.log("🆕 [侧边栏] 新用户，已自动初始化 1000 积分")
        }
      } else {
        const errorData = await res.json().catch(() => ({}))
        console.error("❌ [侧边栏] 积分 API 返回错误:", res.status, errorData)
        
        // 如果 API 失败，尝试直接查询数据库作为备用
        const { data: creditData } = await supabase
          .from('user_credits')
          .select('credits')
          .eq('user_id', uid)
          .maybeSingle()
        
        if (creditData) {
          console.log("✅ [侧边栏] 备用查询成功:", creditData.credits)
          setCredits(creditData.credits)
        }
      }
    } catch (err) {
      console.error("❌ [侧边栏] 积分查询异常:", err)
      
      // 网络错误时尝试直接查询
      try {
        const { data: creditData } = await supabase
          .from('user_credits')
          .select('credits')
          .eq('user_id', uid)
          .maybeSingle()
        
        if (creditData) {
          setCredits(creditData.credits)
        }
      } catch (e) {
        console.error("❌ [侧边栏] 备用查询也失败:", e)
      }
    }
  }, [])

  // --- 初始化逻辑 ---
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setIsOpen(false)
      else setIsOpen(true)
    }
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)

    const handleCollapse = () => {
      console.log("📥 [侧边栏] 收到折叠指令")
      setIsOpen(false)
    }
    window.addEventListener(SIDEBAR_COLLAPSE_EVENT, handleCollapse)

    // 🔥 监听积分刷新事件
    const handleCreditsRefresh = () => {
      console.log("💰 [侧边栏] 收到积分刷新指令")
      if (typeof window !== 'undefined') {
        const userStr = localStorage.getItem('currentUser')
        if (userStr) {
          try {
            const parsedUser = JSON.parse(userStr)
            const uid = parsedUser.id || parsedUser.sub || parsedUser.userId
            if (uid) {
              fetchCredits(uid)
            }
          } catch (e) { console.error(e) }
        }
      }
    }
    window.addEventListener(CREDITS_REFRESH_EVENT, handleCreditsRefresh)

    const loadData = async () => {
      let userId = ""
      if (typeof window !== 'undefined') {
        const userStr = localStorage.getItem('currentUser')
        console.log("🔍 [侧边栏] localStorage currentUser:", userStr?.substring(0, 200))
        if (userStr) {
          try {
            const parsedUser = JSON.parse(userStr)
            console.log("🔍 [侧边栏] 解析用户数据:", {
              id: parsedUser.id,
              sub: parsedUser.sub,
              userId: parsedUser.userId,
              user_id: parsedUser.user_id,
              email: parsedUser.email,
              phone: parsedUser.phone
            })
            setUser(parsedUser)
            // 🔥 扩展用户 ID 获取方式
            userId = parsedUser.id || parsedUser.sub || parsedUser.userId || parsedUser.user_id || ""
            console.log("🔍 [侧边栏] 最终用户ID:", userId)
            setCurrentUserId(userId)
          } catch (e) { console.error("❌ [侧边栏] 解析用户数据失败:", e) }
        }
        
        // 🔥 如果没有用户 ID，打印警告
        if (!userId) {
          console.warn("⚠️ [侧边栏] 用户已登录但无法获取用户ID，检查 localStorage 数据结构")
        }
      }

      if (userId) {
        console.log("🚀 [侧边栏] 开始查询积分，用户ID:", userId)
        await fetchCredits(userId)
        const { data: sessionData } = await supabase.from('chat_sessions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        if (sessionData) {
          setSessions(sessionData.map((s: any) => ({
            id: s.id, title: s.title || "新对话", date: new Date(s.created_at).getTime(), preview: s.preview || ""
          })))
        }
      }
    }
    loadData()
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowUserMenu(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      window.removeEventListener('resize', checkScreenSize)
      window.removeEventListener(SIDEBAR_COLLAPSE_EVENT, handleCollapse)
      window.removeEventListener(CREDITS_REFRESH_EVENT, handleCreditsRefresh)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [fetchCredits])

  useEffect(() => {
    if (currentUserId) {
      console.log("🔄 [侧边栏] 路由变化，刷新积分...")
      fetchCredits(currentUserId)
    }
  }, [pathname, searchParams, currentUserId, fetchCredits])

  // --- 交互处理 ---
  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('currentUser')
    window.location.href = "/login"
  }
  
  const handleNavClick = () => { 
    if (isMobile) setIsOpen(false) 
  }
  
  // 🔥 修复：显示完整用户名（邮箱或手机号）
  const getDisplayName = () => {
    if (!user) return "用户"
    // 优先显示手机号
    if (user.phone) return user.phone
    // 其次显示邮箱
    if (user.email) return user.email
    // 再次显示用户名
    if (user.user_metadata?.name) return user.user_metadata.name
    return "用户"
  }
  
  const getAvatarUrl = () => user?.user_metadata?.avatar_url || null

  // --- 导航项组件 - 🎨 增强立体感和字体样式 ---
  const NavItem = ({ 
    href, 
    icon: Icon, 
    label, 
    isActive,
    onClick 
  }: { 
    href: string
    icon: React.ElementType
    label: string
    isActive: boolean
    onClick?: () => void
  }) => (
    <Link
      href={href}
      onClick={onClick || handleNavClick}
      className={cn(
        "relative flex items-center gap-3 px-3 py-3 transition-all",
        "rounded-xl",
        isActive 
          ? "font-bold" 
          : "font-semibold hover:bg-white/80"
      )}
      style={isActive ? { 
        backgroundColor: "rgba(34, 197, 94, 0.15)",
        boxShadow: "0 2px 8px rgba(34, 197, 94, 0.15), inset 0 1px 0 rgba(255,255,255,0.5)",
        color: COLORS.primary.dark
      } : {
        color: COLORS.gray[700],
        textShadow: TEXT_SHADOWS.subtle
      }}
    >
      {/* 左侧色条 - 选中态，更粗更明显 */}
      {isActive && (
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[4px] h-8 rounded-r-full"
          style={{ 
            backgroundColor: COLORS.primary.main,
            boxShadow: `2px 0 8px ${COLORS.primary.main}60`
          }}
        />
      )}
      
      {/* 图标 - 20px，选中态填充样式，增加阴影 */}
      <Icon 
        className="h-5 w-5 shrink-0"
        style={{
          color: isActive ? COLORS.primary.dark : COLORS.gray[600],
          filter: isActive ? `drop-shadow(0 2px 4px ${COLORS.primary.main}40)` : "none"
        }}
        fill={isActive ? "currentColor" : "none"}
        strokeWidth={isActive ? 0 : 2}
      />
      
      <span 
        className="text-sm"
        style={{
          textShadow: isActive ? TEXT_SHADOWS.medium : TEXT_SHADOWS.subtle
        }}
      >
        {label}
      </span>
    </Link>
  )

  // --- 主逻辑渲染 ---
  return (
    <>
      {/* 🍎 移动端：顶部汉堡菜单按钮 */}
      {isMobile && !isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-md text-[#757575] hover:bg-[#F5F5F5] transition-all"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* 🍎 移动端：半透明遮罩层 */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div 
        className={cn(
          "flex h-screen supports-[height:100dvh]:h-[100dvh] flex-col transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] z-40",
          isMobile 
            ? cn(
                "fixed left-0 top-0 bottom-0 w-72 shadow-2xl",
                isOpen ? "translate-x-0" : "-translate-x-full"
              )
            : cn(
                "sticky top-0 border-r",
                isOpen ? "w-64" : "w-0 overflow-hidden"
              )
        )}
        style={{ 
          background: COLORS.sidebar.bgGradient,
          borderColor: COLORS.sidebar.border,
          boxShadow: isMobile ? "4px 0 24px rgba(0,0,0,0.12)" : "1px 0 8px rgba(0,0,0,0.04)"
        }}
      >
        {/* 🍎 移动端：关闭按钮 */}
        {isMobile && (
          <button
            onClick={() => setIsOpen(false)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-[#9E9E9E] hover:text-[#616161] hover:bg-[#F5F5F5] transition-all z-50"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* 1. Logo 区域 - 放大至最大，填满宽度 */}
        <div className="flex items-center shrink-0 px-3 py-4">
          <Link href="/" onClick={handleNavClick} className="flex items-center w-full">
            <img src="/images/logo.png" alt="Logo" className="w-full h-auto object-contain" style={{ maxWidth: "180px" }} />
          </Link>
        </div>

        {/* 2. 积分显示 - 🎨 简洁轻量化，无底色 */}
        {user && (
          <div className="px-5 mb-3 flex items-center gap-2">
            <Coins className="h-4 w-4" style={{ color: COLORS.primary.main }} />
            <span 
              className="text-sm font-semibold"
              style={{ color: COLORS.primary.dark }}
            >
              {credits.toLocaleString()}
            </span>
            <span 
              className="text-xs"
              style={{ color: COLORS.gray[500] }}
            >
              积分
            </span>
          </div>
        )}

        {/* --- 核心滚动区域 --- */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 scrollbar-thin scrollbar-thumb-gray-200/50">
          
          {/* A. 主页 */}
          <NavItem 
            href="/"
            icon={Home}
            label="主页"
            isActive={pathname === "/"}
          />

          {/* B. 智能体列表 */}
          <div className="mt-5 mb-3 px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLORS.gray[500] }}>
              智能体
            </span>
          </div>
          
          {/* 作文批改 - 🔥 使用新路由 /chat/standard */}
          <NavItem 
            href="/chat/standard"
            icon={GraduationCap}
            label="作文批改"
            isActive={pathname === "/chat/standard" || (pathname === "/chat" && !currentAgent)}
          />
          
          {/* 教学评助手 - 🔥 使用新路由 /chat/teaching-pro */}
          <NavItem 
            href="/chat/teaching-pro"
            icon={Brain}
            label="教学评助手"
            isActive={pathname === "/chat/teaching-pro" || currentAgent === "teaching-pro"}
          />

          {/* 分割线 - 智能体和最近对话之间 */}
          <div 
            className="my-5 mx-3 h-px"
            style={{ backgroundColor: COLORS.divider }}
          />

          {/* C. 历史会话 */}
          {sessions.length > 0 && (
            <>
              <button 
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                className="mb-2 px-3 flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
              >
                <History className="h-4 w-4" style={{ color: COLORS.gray[500] }} />
                <span 
                  className="text-[11px] font-semibold uppercase tracking-wider flex-1"
                  style={{ color: COLORS.gray[500] }}
                >
                  最近对话
                </span>
                <ChevronDown 
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    isHistoryExpanded && "rotate-180"
                  )}
                  style={{ color: COLORS.gray[400] }}
                />
              </button>
              
              {/* 折叠内容 */}
              <div className={cn(
                "space-y-0.5 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                isHistoryExpanded ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"
              )}>
                {sessions.map(session => (
                  <Link 
                    key={session.id}
                    href={`/chat?id=${session.id}`} 
                    onClick={handleNavClick}
                    className="block rounded-lg px-3 py-2.5 transition-all group"
                    style={{ backgroundColor: "transparent" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.gray[100]}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <div 
                      className="text-[13px] font-medium truncate"
                      style={{ color: COLORS.gray[700] }}
                    >
                      {session.title}
                    </div>
                    <div 
                      className="text-[11px] truncate mt-0.5"
                      style={{ color: COLORS.gray[500] }}
                    >
                      {session.preview}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* --- 底部用户固定区域 - 🎨 透明背景，不遮挡历史对话 --- */}
        <div 
          className="mt-auto shrink-0 z-50 relative" 
          ref={menuRef}
          style={{ 
            background: "transparent",
            borderTop: "none",
            boxShadow: "none"
          }}
        >
          {/* 🎁 邀请和帮助按钮 - 垂直排列，无底色 */}
          {user && (
            <div className="flex flex-col gap-1 py-2 px-3">
              <Link 
                href="/invite" 
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-gray-100/60 group cursor-pointer"
              >
                <Gift className="w-5 h-5" style={{ color: COLORS.primary.main }} />
                <span 
                  className="text-sm font-medium"
                  style={{ color: COLORS.gray[700] }}
                >
                  邀请好友
                </span>
              </Link>
              
              <Link 
                href="/help" 
                onClick={handleNavClick}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-gray-100/60 group cursor-pointer"
              >
                <HelpCircle className="w-5 h-5" style={{ color: COLORS.gray[500] }} />
                <span 
                  className="text-sm font-medium"
                  style={{ color: COLORS.gray[700] }}
                >
                  帮助中心
                </span>
              </Link>
            </div>
          )}
          
          {/* 分割线 */}
          {user && <div className="h-px mx-4" style={{ backgroundColor: COLORS.sidebar.divider }} />}
          
          {/* 用户信息区域 */}
          <div className="p-3">
          {/* 🍎 弹出菜单 - 在用户头像右侧弹出 */}
          {showUserMenu && (
            <div 
              className="absolute left-full bottom-0 ml-2 w-48 bg-white rounded-xl shadow-lg border animate-in fade-in slide-in-from-left-2 duration-200 z-[100]"
              style={{ borderColor: COLORS.gray[200] }}
            >
              <div className="p-1.5">
                <Link href="/settings" onClick={() => setShowUserMenu(false)}>
                  <div 
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors"
                    style={{ color: COLORS.gray[700] }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.gray[100]}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <Settings className="h-4 w-4" style={{ color: COLORS.gray[500] }} /> 
                    账号设置
                  </div>
                </Link>
                <Link href="/pricing" onClick={() => setShowUserMenu(false)}>
                  <div 
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors"
                    style={{ color: COLORS.gray[700] }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = COLORS.gray[100]}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <Zap className="h-4 w-4" style={{ color: COLORS.gray[500] }} /> 
                    升级会员
                  </div>
                </Link>
                <div className="my-1 h-px mx-2" style={{ backgroundColor: COLORS.divider }} />
                <button 
                  onClick={handleLogout} 
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
                  style={{ color: COLORS.gray[600] }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = COLORS.gray[100]
                    e.currentTarget.style.color = COLORS.error
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent"
                    e.currentTarget.style.color = COLORS.gray[600]
                  }}
                >
                  <LogOut className="h-4 w-4" /> 
                  退出登录
                </button>
              </div>
            </div>
          )}

          {user ? (
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log("🔥 [用户按钮] 点击触发，当前菜单状态:", showUserMenu)
                setShowUserMenu(!showUserMenu)
              }}
              className={cn(
                "flex items-center w-full rounded-xl transition-all duration-200 overflow-hidden h-14 p-2.5 gap-3 cursor-pointer select-none"
              )}
              style={{ 
                backgroundColor: showUserMenu ? "rgba(34, 197, 94, 0.08)" : "transparent",
                boxShadow: showUserMenu ? "0 2px 8px rgba(0,0,0,0.04)" : "none"
              }}
              onMouseEnter={(e) => {
                if (!showUserMenu) {
                  e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.03)"
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"
                }
              }}
              onMouseLeave={(e) => {
                if (!showUserMenu) {
                  e.currentTarget.style.backgroundColor = "transparent"
                  e.currentTarget.style.boxShadow = "none"
                }
              }}
            >
              <div 
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white text-sm font-black overflow-hidden pointer-events-none"
                style={{ 
                  background: `linear-gradient(135deg, ${COLORS.primary.main} 0%, #16A34A 100%)`,
                  boxShadow: `0 3px 10px ${COLORS.primary.main}40`
                }}
              >
                {getAvatarUrl() ? (
                  <img src={getAvatarUrl()} alt="User" className="h-full w-full object-cover" />
                ) : (
                  // 🔥 修复：优先使用手机号或邮箱的首字符
                  (user.phone?.[0] || user.email?.[0] || user.user_metadata?.name?.[0] || "U").toUpperCase()
                )}
              </div>
              {/* 用户邮箱信息 - 🎨 加粗加阴影 */}
              <div className="flex flex-1 flex-col items-start overflow-hidden pointer-events-none min-w-0">
                <span 
                  className="text-sm font-bold w-full text-left truncate"
                  style={{ 
                    color: COLORS.gray[800],
                    textShadow: TEXT_SHADOWS.subtle,
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap"
                  }}
                >
                  {getDisplayName()}
                </span>
              </div>
              <ChevronRight 
                className={cn(
                  "h-4 w-4 transition-transform duration-200 pointer-events-none shrink-0",
                  showUserMenu && "rotate-90"
                )}
                style={{ color: COLORS.gray[500] }}
              />
            </button>
          ) : (
            <Link href="/login" onClick={handleNavClick}>
              <Button 
                className="w-full text-white font-semibold rounded-lg h-11"
                style={{ 
                  backgroundColor: COLORS.primary.main,
                  boxShadow: `0 4px 12px ${COLORS.primary.main}40`
                }}
              >
                登录 / 注册
              </Button>
            </Link>
          )}
          </div>
        </div>
      </div>
    </>
  )
}

// 🔥 导出折叠函数
export const collapseSidebar = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SIDEBAR_COLLAPSE_EVENT))
  }
}

// 🔥 导出积分刷新函数
export const refreshCredits = () => {
  if (typeof window !== 'undefined') {
    console.log("📤 [积分刷新] 触发全局积分刷新事件")
    window.dispatchEvent(new CustomEvent(CREDITS_REFRESH_EVENT))
  }
}

export function AppSidebar() {
  return (
    <Suspense fallback={<div className="w-64 h-screen bg-white border-r border-gray-200" />}>
      <AppSidebarInner />
    </Suspense>
  )
}
