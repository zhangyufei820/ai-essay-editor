"use client"

import Link from "next/link"
import { usePathname, useSearchParams, useRouter } from "next/navigation"
import { useState, useEffect, useRef, Suspense, useCallback } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import {
  Settings, ChevronRight, ChevronDown,
  Menu, X, LogOut, Zap, Coins,
  Bot, GraduationCap, Brain,
  Gift, HelpCircle, Sparkles, Palette, User, Edit
} from "lucide-react"
import { cn } from "@/lib/utils"
import { AgentPanel } from "./chat/AgentPanel"
import { ModelPanel } from "./chat/ModelPanel"
import { CreativePanel } from "./chat/CreativePanel"
import { EducationPanel } from "./chat/EducationPanel"
import { AIPanel } from "./chat/AIPanel"
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
  ai_model?: string
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
// 🔥 全局事件：用于触发会话列表刷新
export const SESSION_LIST_REFRESH_EVENT = 'session-list-refresh'

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

  // 🔥 智能体专区面板状态
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false)

  // 🔥 AI模型专区面板状态
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false)

  // 🔥 创意生成专区面板状态
  const [isCreativePanelOpen, setIsCreativePanelOpen] = useState(false)

  // 🔥 教育专区面板状态
  const [isEducationPanelOpen, setIsEducationPanelOpen] = useState(false)

  // 🔥 AI写作专区面板状态
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false)

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

    // 🔥 监听会话列表刷新事件
    const handleSessionListRefresh = () => {
      console.log("📋 [侧边栏] 收到会话列表刷新指令")
      if (typeof window !== 'undefined') {
        const userStr = localStorage.getItem('currentUser')
        if (userStr) {
          try {
            const parsedUser = JSON.parse(userStr)
            const uid = parsedUser.id || parsedUser.sub || parsedUser.userId || parsedUser.user_id
            if (uid) {
              // 直接调用 API 获取最新会话列表
              fetch('/api/chat-session', {
                headers: { 'X-User-Id': uid }
              }).then(res => res.json()).then(data => {
                if (data.sessions) {
                  setSessions(data.sessions.map((s: any) => ({
                    id: s.id,
                    title: s.title || "新对话",
                    date: new Date(s.created_at).getTime(),
                    preview: s.preview || "",
                    ai_model: s.ai_model || "standard"
                  })))
                  console.log("📋 [侧边栏] 会话列表已刷新:", data.sessions.length)
                }
              }).catch(err => console.error("❌ [侧边栏] 会话列表刷新失败:", err))
            }
          } catch (e) { console.error(e) }
        }
      }
    }
    window.addEventListener(SESSION_LIST_REFRESH_EVENT, handleSessionListRefresh)

    // 🔥 监听页面可见性变化 - 移动端/PC端切换时自动刷新会话列表
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("📋 [侧边栏] 页面重新可见，刷新会话列表")
        handleSessionListRefresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

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

        // 使用 API 端点查询历史会话（绕过 RLS 限制）
        try {
          const sessionRes = await fetch('/api/chat-session', {
            headers: {
              'X-User-Id': userId
            }
          })
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json()
            if (sessionData.sessions) {
              setSessions(sessionData.sessions.map((s: any) => ({
                id: s.id,
                title: s.title || "新对话",
                date: new Date(s.created_at).getTime(),
                preview: s.preview || "",
                ai_model: s.ai_model || "standard"
              })))
            }
          } else {
            console.warn("⚠️ [侧边栏] 会话查询失败:", sessionRes.status)
          }
        } catch (e) {
          console.error("❌ [侧边栏] 会话查询异常:", e)
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
      window.removeEventListener(SESSION_LIST_REFRESH_EVENT, handleSessionListRefresh)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [fetchCredits])

  useEffect(() => {
    if (currentUserId) {
      console.log("🔄 [侧边栏] 路由变化，刷新积分和会话...")
      fetchCredits(currentUserId)
      // 🔥 刷新会话列表
      fetch('/api/chat-session', {
        headers: { 'X-User-Id': currentUserId }
      }).then(res => res.json()).then(data => {
        if (data.sessions) {
          setSessions(data.sessions.map((s: any) => ({
            id: s.id,
            title: s.title || "新对话",
            date: new Date(s.created_at).getTime(),
            preview: s.preview || "",
            ai_model: s.ai_model || "standard"
          })))
        }
      }).catch(console.error)
    }
  }, [pathname, searchParams, currentUserId])

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
  
  const getUserId = () => {
    if (!user) return ""
    return user.id || user.sub || user.userId || user.user_id || ""
  }

  const getAvatarUrl = () => user?.user_metadata?.avatar_url || null

  // --- 导航项组件 - 🎨 画廊导视风格，图标缩小10%，间距拉大15%
  const NavItem = ({
    href,
    icon: Icon,
    label,
    isActive,
    onClick,
    badge
  }: {
    href: string
    icon: React.ElementType
    label: string
    isActive: boolean
    onClick?: () => void
    badge?: string
  }) => (
    <Link
      href={href}
      onClick={onClick || handleNavClick}
      className={cn(
        "relative flex items-center gap-4 px-4 py-[14px] transition-all", // 间距拉大15%
        "rounded-xl",
        isActive
          ? "font-bold"
          : "font-semibold hover:bg-white/80"
      )}
      style={isActive ? {
        backgroundColor: "rgba(34, 197, 94, 0.15)", // 15%-20% 不透明度
        color: COLORS.primary.dark
      } : {
        color: COLORS.gray[700],
        textShadow: TEXT_SHADOWS.subtle
      }}
    >
      {/* 左侧色条 - 选中态，柔和光晕 */}
      {isActive && (
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full"
          style={{
            backgroundColor: COLORS.primary.main,
          }}
          animate={{
            boxShadow: [
              `0 0 8px ${COLORS.primary.main}40`,
              `0 0 16px ${COLORS.primary.main}60`,
              `0 0 8px ${COLORS.primary.main}40`,
            ],
          }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
      )}

      {/* 图标 - 18px (缩小10%)，Light权重 strokeWidth:1.5 */}
      <Icon
        className="h-[18px] w-[18px] shrink-0"
        style={{
          color: isActive ? COLORS.primary.dark : COLORS.gray[600],
          filter: isActive ? `drop-shadow(0 1px 3px ${COLORS.primary.main}30)` : "none"
        }}
        fill={isActive ? "currentColor" : "none"}
        strokeWidth={isActive ? 0 : 1.5}
      />

      <span
        className="text-sm"
        style={{
          textShadow: isActive ? TEXT_SHADOWS.medium : TEXT_SHADOWS.subtle
        }}
      >
        {label}
      </span>

      {/* 推荐标识 - 绿色呼吸光点，替代红色标签 */}
      {badge && (
        <motion.span
          className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
          style={{
            backgroundColor: COLORS.primary.main,
          }}
          animate={{
            boxShadow: [
              `0 0 4px ${COLORS.primary.main}60`,
              `0 0 8px ${COLORS.primary.main}80`,
              `0 0 4px ${COLORS.primary.main}60`,
            ],
            opacity: [0.7, 1, 0.7],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}
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
                isOpen ? "w-52" : "w-0 overflow-hidden"
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

        {/* 1. Logo 区域 - 🎨 呼吸间距，确保品牌标识有足够的视域空间 */}
        <div className="flex items-center shrink-0 px-3 py-5">
          <Link href="/" onClick={handleNavClick} className="flex items-center w-full">
            <img src="/images/logo.png" alt="Logo" className="w-full h-auto object-contain" style={{ maxWidth: "180px" }} />
          </Link>
        </div>

        {/* 2. 积分显示 - 可点击跳转 */}
        {user && (
          <Link
            href="/credits"
            onClick={handleNavClick}
            className="px-3 mb-4 flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-100/50 rounded-xl transition-all duration-300 py-1"
          >
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
          </Link>
        )}

        {/* --- 核心滚动区域 - 🎨 定制滚动条：3px宽，半透明浅灰，仅滚动时显示 --- */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(14, 58, 31, 0.15) transparent',
          }}
        >
          <style>{`
            div::-webkit-scrollbar {
              width: 3px;
            }
            div::-webkit-scrollbar-track {
              background: transparent;
            }
            div::-webkit-scrollbar-thumb {
              background: rgba(14, 58, 31, 0.15);
              border-radius: 2px;
            }
            div:hover::-webkit-scrollbar-thumb {
              background: rgba(14, 58, 31, 0.25);
            }
          `}</style>
          
          {/* 智能体专区入口 - OpenClaw 专区 */}
          <div className="mt-8 mb-4 px-3">
            <motion.button
              onClick={() => setIsAgentPanelOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-[9px] rounded-xl"
              style={{
                backgroundColor: "rgba(34, 197, 94, 0.08)",
                border: "1px solid rgba(34, 197, 94, 0.2)",
                boxShadow: "0 2px 8px rgba(34, 197, 94, 0.1), inset 0 1px 0 rgba(255,255,255,0.5)"
              }}
              whileHover={{
                scale: 1.03,
                boxShadow: "0 4px 16px rgba(34, 197, 94, 0.2), 0 8px 24px rgba(34, 197, 94, 0.15), inset 0 1px 0 rgba(255,255,255,0.8)"
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <Sparkles className="w-5 h-5" style={{ color: COLORS.primary.main }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLORS.primary.dark }}>
                OpenClaw
              </span>
            </motion.button>
          </div>

          {/* C. 教育专区入口 - 包含所有教育智能体 */}
          <div className="mb-4 px-3">
            <motion.button
              onClick={() => setIsEducationPanelOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-[9px] rounded-xl"
              style={{
                backgroundColor: "rgba(14, 58, 31, 0.04)",
                border: "1px solid rgba(14, 58, 31, 0.08)",
                boxShadow: "0 2px 8px rgba(14, 58, 31, 0.05), inset 0 1px 0 rgba(255,255,255,0.5)"
              }}
              whileHover={{
                scale: 1.03,
                boxShadow: "0 4px 16px rgba(14, 58, 31, 0.1), 0 8px 24px rgba(14, 58, 31, 0.08), inset 0 1px 0 rgba(255,255,255,0.8)"
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <GraduationCap className="w-5 h-5" style={{ color: COLORS.primary.dark }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLORS.primary.dark }}>
                教育专区
              </span>
            </motion.button>
          </div>

          {/* D. AI模型专区入口 */}
          <div className="mb-4 px-3">
            <motion.button
              onClick={() => setIsModelPanelOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-[9px] rounded-xl"
              style={{
                backgroundColor: "rgba(14, 58, 31, 0.04)",
                border: "1px solid rgba(14, 58, 31, 0.08)",
                boxShadow: "0 2px 8px rgba(14, 58, 31, 0.05), inset 0 1px 0 rgba(255,255,255,0.5)"
              }}
              whileHover={{
                scale: 1.03,
                boxShadow: "0 4px 16px rgba(14, 58, 31, 0.1), 0 8px 24px rgba(14, 58, 31, 0.08), inset 0 1px 0 rgba(255,255,255,0.8)"
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <Bot className="w-5 h-5" style={{ color: COLORS.primary.dark }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLORS.primary.dark }}>
                顶级模型专区
              </span>
            </motion.button>
          </div>

          {/* E. AI写作专区入口 */}
          <div className="mb-4 px-3">
            <motion.button
              onClick={() => setIsAIPanelOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-[9px] rounded-xl"
              style={{
                backgroundColor: "rgba(0, 200, 150, 0.02)",
                border: "1px solid rgba(0, 200, 150, 0.2)",
                boxShadow: "0 2px 8px rgba(0, 200, 150, 0.1), inset 0 1px 0 rgba(255,255,255,0.5)"
              }}
              whileHover={{
                scale: 1.03,
                boxShadow: "0 4px 16px rgba(0, 200, 150, 0.2), 0 8px 24px rgba(0, 200, 150, 0.15), inset 0 1px 0 rgba(255,255,255,0.8)"
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <Edit className="w-5 h-5" style={{ color: "#00C896" }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLORS.primary.dark }}>
                AI写作专区
              </span>
            </motion.button>
          </div>

          {/* F. 多媒体专区入口 */}
          <div className="mb-4 px-3">
            <motion.button
              onClick={() => setIsCreativePanelOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-[9px] rounded-xl"
              style={{
                backgroundColor: "rgba(0, 200, 150, 0.02)",
                border: "1px solid rgba(0, 200, 150, 0.2)",
                boxShadow: "0 2px 8px rgba(0, 200, 150, 0.1), inset 0 1px 0 rgba(255,255,255,0.5)"
              }}
              whileHover={{
                scale: 1.03,
                boxShadow: "0 4px 16px rgba(0, 200, 150, 0.2), 0 8px 24px rgba(0, 200, 150, 0.15), inset 0 1px 0 rgba(255,255,255,0.8)"
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <Palette className="w-5 h-5" style={{ color: "#00C896" }} />
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: COLORS.primary.dark }}>
                多媒体专区
              </span>
            </motion.button>
          </div>
        </div>

        {/* --- 底部用户固定区域 - 去框化，与侧边栏背景融合 --- */}
        <div
          className="mt-auto shrink-0 z-50 relative px-2 pb-4"
          ref={menuRef}
        >
          {/* 100% 宽度极细分割线 */}
          {user && <div className="h-px w-full bg-gray-100/50 mb-3" />}

          {/* 🎁 邀请和帮助按钮 - 极简化 */}
          {user && (
            <div className="flex flex-col gap-1 mb-3">
              <Link
                href="/invite"
                onClick={handleNavClick}
                className="flex items-center justify-center p-2 rounded-xl transition-all duration-300 hover:bg-[#10A37F]/10 cursor-pointer"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 8, -8, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Gift className="w-4 h-4 text-[#10A37F]" strokeWidth={1.5} />
                </motion.div>
              </Link>

              <Link
                href="/help"
                onClick={handleNavClick}
                className="flex items-center justify-center p-2 rounded-xl transition-all duration-300 hover:bg-[#10A37F]/10 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors duration-300" strokeWidth={1.5} />
              </Link>
            </div>
          )}

          {/* 用户信息区域 */}
          <div className="px-2">
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
              {/* 扁平化头像 */}
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg pointer-events-none"
                style={{ backgroundColor: "rgba(16, 163, 127, 0.1)" }}
              >
                {getAvatarUrl() ? (
                  <img src={getAvatarUrl()} alt="User" className="h-full w-full object-cover rounded-lg" />
                ) : (
                  <User className="h-5 w-5" style={{ color: "#10A37F" }} strokeWidth={2} />
                )}
              </div>
              {/* 昵称 + ID/手机号 */}
              <div className="flex flex-1 flex-col items-start overflow-hidden pointer-events-none min-w-0">
                <span className="text-sm font-semibold w-full text-left truncate" style={{ color: COLORS.gray[800] }}>
                  {getDisplayName()}
                </span>
                <span className="text-xs text-gray-400 w-full text-left truncate">
                  {getUserId().slice(0, 8)}...
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
            <button
              onClick={() => {
                handleNavClick()
                router.push('/login')
              }}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold rounded-lg h-11 transition-all hover:opacity-90"
              style={{
                backgroundColor: COLORS.primary.main,
                boxShadow: `0 4px 12px ${COLORS.primary.main}40`
              }}
            >
              登录 / 注册
            </button>
          )}
          </div>
        </div>
      </div>

      {/* 🔥 智能体专区面板 */}
      <AgentPanel
        isOpen={isAgentPanelOpen}
        onClose={() => setIsAgentPanelOpen(false)}
      />

      {/* 🔥 AI模型专区面板 */}
      <ModelPanel
        isOpen={isModelPanelOpen}
        onClose={() => setIsModelPanelOpen(false)}
      />

      {/* 🔥 创意生成专区面板 */}
      <CreativePanel
        isOpen={isCreativePanelOpen}
        onClose={() => setIsCreativePanelOpen(false)}
      />

      {/* 🔥 教育专区面板 */}
      <EducationPanel
        isOpen={isEducationPanelOpen}
        onClose={() => setIsEducationPanelOpen(false)}
      />

      {/* 🔥 AI写作专区面板 */}
      <AIPanel
        isOpen={isAIPanelOpen}
        onClose={() => setIsAIPanelOpen(false)}
      />
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

// 🔥 导出会话列表刷新函数
export const refreshSessionList = () => {
  if (typeof window !== 'undefined') {
    console.log("📤 [会话列表刷新] 触发全局会话列表刷新事件")
    window.dispatchEvent(new CustomEvent(SESSION_LIST_REFRESH_EVENT))
  }
}

export function AppSidebar() {
  return (
    <Suspense fallback={<div className="hidden md:block md:w-64 h-screen bg-white border-r border-gray-200" />}>
      <AppSidebarInner />
    </Suspense>
  )
}
