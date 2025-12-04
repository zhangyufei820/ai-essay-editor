"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button" 
import { 
  Home, FileText, Settings, ChevronRight,
  PanelLeftClose, PanelLeftOpen, LogOut, Zap, Coins,
  ChevronDown, History, BookOpen, GraduationCap, School, 
  Library, PenTool, Calculator, Globe, Microscope,
  FlaskConical, Dna, Hourglass, Landmark, Gavel,
  BookA, Bot, LayoutGrid, Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@supabase/supabase-js"

// --- 类型定义 ---
type ChatSession = {
  id: string
  title: string
  date: number
  preview: string
}

type StageGroup = {
  id: string
  title: string
  icon: any
  items: { name: string; href: string; icon?: any }[]
}

// --- 初始化 Supabase ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function AppSidebar() {
  const pathname = usePathname()
  
  // --- 状态管理 ---
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState<number>(0)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  
  // 侧边栏整体开关
  const [isOpen, setIsOpen] = useState(true)
  
  // 底部用户菜单开关
  const [showUserMenu, setShowUserMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // --- 菜单折叠状态 ---
  // 1. 一级菜单折叠状态
  const [isAgentsExpanded, setIsAgentsExpanded] = useState(true) // 智能体合集默认展开
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false) // 历史记录默认收起

  // 2. 二级菜单（学段）折叠状态
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({
    "primary": false, "middle": false, "high": false, "uni": false
  })

  // --- 智能体数据结构 (全学段) ---
  const stageGroups: StageGroup[] = [
    {
      id: "primary",
      title: "小学智能体",
      icon: School,
      items: [
        { name: "小学语文", href: "/chat?agent=primary-chinese", icon: BookA },
        { name: "小学数学", href: "/chat?agent=primary-math", icon: Calculator },
        { name: "小学英语", href: "/chat?agent=primary-english", icon: Globe },
        { name: "科学启蒙", href: "/chat?agent=primary-science", icon: Microscope },
      ]
    },
    {
      id: "middle",
      title: "初中智能体",
      icon: Library,
      items: [
        { name: "初中语文", href: "/chat?agent=middle-chinese", icon: BookA },
        { name: "初中数学", href: "/chat?agent=middle-math", icon: Calculator },
        { name: "初中英语", href: "/chat?agent=middle-english", icon: Globe },
        { name: "初中物理", href: "/chat?agent=middle-physics", icon: Zap },
        { name: "初中化学", href: "/chat?agent=middle-chemistry", icon: FlaskConical },
        { name: "初中历史", href: "/chat?agent=middle-history", icon: Hourglass },
      ]
    },
    {
      id: "high",
      title: "高中智能体",
      icon: Landmark,
      items: [
        { name: "高中语文", href: "/chat?agent=high-chinese", icon: BookA },
        { name: "高中数学", href: "/chat?agent=high-math", icon: Calculator },
        { name: "高中英语", href: "/chat?agent=high-english", icon: Globe },
        { name: "高中物理", href: "/chat?agent=high-physics", icon: Zap },
        { name: "高中化学", href: "/chat?agent=high-chemistry", icon: FlaskConical },
        { name: "高中历史", href: "/chat?agent=high-history", icon: Hourglass },
      ]
    },
    {
      id: "uni",
      title: "大学智能体",
      icon: GraduationCap,
      items: [
        { name: "高等数学", href: "/chat?agent=uni-math", icon: Calculator },
        { name: "大学英语", href: "/chat?agent=uni-english", icon: Globe },
        { name: "论文写作", href: "/chat?agent=uni-thesis", icon: PenTool },
      ]
    }
  ]

  // --- 初始化逻辑 ---
  useEffect(() => {
    // 屏幕宽度检测
    const checkScreenSize = () => {
      if (window.innerWidth < 768) setIsOpen(false)
      else setIsOpen(true)
    }
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)

    // 加载数据
    const loadData = async () => {
      let currentUserId = ""
      if (typeof window !== 'undefined') {
        const userStr = localStorage.getItem('currentUser')
        if (userStr) {
          try {
            const parsedUser = JSON.parse(userStr)
            setUser(parsedUser)
            currentUserId = parsedUser.id || parsedUser.sub || parsedUser.userId
          } catch (e) { console.error(e) }
        }
      }

      if (currentUserId) {
        const { data: creditData } = await supabase.from('user_credits').select('credits').eq('user_id', currentUserId).single()
        if (creditData) setCredits(creditData.credits)

        const { data: sessionData } = await supabase.from('chat_sessions').select('*').eq('user_id', currentUserId).order('created_at', { ascending: false }).limit(20)
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
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // --- 交互处理 ---
  const toggleStage = (id: string) => setExpandedStages(prev => ({ ...prev, [id]: !prev[id] }))
  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('currentUser')
    window.location.href = "/login"
  }
  const handleMobileClick = () => { if (window.innerWidth < 768) setIsOpen(false) }
  const getDisplayName = () => user?.user_metadata?.name || user?.email?.split('@')[0] || "普通用户"
  const getAvatarUrl = () => user?.user_metadata?.avatar_url || null

  // --- 主逻辑渲染 ---
  return (
    <>
      {/* 悬浮展开按钮 (仅当侧边栏完全隐藏/收起时显示) */}
      {!isOpen && (
        <div className="fixed left-4 top-4 z-50">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsOpen(true)}
            className="h-9 w-9 bg-white shadow-md border-gray-200 text-slate-600 hover:bg-slate-50"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div 
        className={cn(
          "flex h-screen supports-[height:100dvh]:h-[100dvh] sticky top-0 flex-col border-r border-[#E5E0D6] bg-[#FDFBF7] transition-all duration-300 ease-in-out z-40",
          isOpen ? "w-64" : "w-[70px]" // 收起时保留 70px 宽度显示图标
        )}
      >
        {/* 内部折叠/展开按钮 */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "absolute -right-3 top-6 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-slate-400 shadow-sm hover:text-slate-600 transition-all z-50",
            !isOpen && "rotate-180"
          )}
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>

        {/* 1. Logo 区域 */}
        <div className={cn("flex items-center justify-center h-20 shrink-0 transition-all", isOpen ? "px-6" : "px-2")}>
          <Link href="/" onClick={handleMobileClick}>
             {isOpen ? (
               <img src="/images/logo.png" alt="Logo" className="h-14 w-auto object-contain" />
             ) : (
               // 收起时显示小 Logo 或图标
               <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F766E] text-white">
                 <span className="text-lg font-bold">沈</span>
               </div>
             )}
          </Link>
        </div>

        {/* --- 核心滚动区域 --- */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 pb-24 scrollbar-thin scrollbar-thumb-gray-200">
          
          {/* A. 主页 (一级菜单) */}
          <Link
            href="/"
            onClick={handleMobileClick}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors mb-2 group relative",
              pathname === "/" 
                ? "bg-white text-[#0F766E] shadow-sm ring-1 ring-[#E5E0D6]" 
                : "text-slate-600 hover:bg-[#F3EFE5] hover:text-slate-900"
            )}
            title={!isOpen ? "主页" : ""}
          >
            <Home className="h-5 w-5 shrink-0" />
            {isOpen && <span>主页</span>}
          </Link>

          {/* B. 智能体合集 (一级菜单) */}
          <div className="mb-2">
            <button
              onClick={() => {
                if (!isOpen) setIsOpen(true) // 如果是收起状态，点击图标则展开侧边栏
                setIsAgentsExpanded(!isAgentsExpanded)
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-colors group",
                isAgentsExpanded ? "text-slate-900 bg-[#F3EFE5]/50" : "text-slate-600 hover:bg-[#F3EFE5]"
              )}
              title={!isOpen ? "智能体合集" : ""}
            >
              <div className="flex items-center gap-3">
                <LayoutGrid className="h-5 w-5 shrink-0 text-[#0F766E]" />
                {isOpen && <span>智能体合集</span>}
              </div>
              {isOpen && (
                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isAgentsExpanded && "rotate-180")} />
              )}
            </button>

            {/* 智能体子菜单 (仅在侧边栏展开 + 菜单展开时显示) */}
            {isOpen && isAgentsExpanded && (
              <div className="mt-2 pl-2 space-y-4 animate-in slide-in-from-top-2">
                
                {/* B-1. 核心功能板块 */}
                <div>
                  <div className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">核心功能</div>
                  <Link
                    href="/chat"
                    onClick={handleMobileClick}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ml-2",
                      pathname === "/chat" 
                        ? "bg-[#0F766E] text-white shadow-md" 
                        : "bg-white text-[#0F766E] shadow-sm ring-1 ring-[#0F766E]/10 hover:bg-[#0F766E]/5"
                    )}
                  >
                    <Bot className="h-4 w-4 shrink-0" />
                    作文批改智能体
                  </Link>
                </div>

                {/* B-2. 全学段智能体板块 */}
                <div>
                  <div className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">全学段智能体</div>
                  <div className="space-y-1 ml-2">
                    {stageGroups.map((group) => {
                      const isStageOpen = expandedStages[group.id];
                      return (
                        <div key={group.id}>
                          <button 
                            onClick={() => toggleStage(group.id)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center gap-2">
                              <group.icon className="h-3.5 w-3.5 text-slate-500" />
                              {group.title}
                            </div>
                            <ChevronDown className={cn("h-3 w-3 text-slate-400 transition-transform", isStageOpen && "rotate-180")} />
                          </button>
                          
                          {/* 三级菜单 (具体科目) */}
                          {isStageOpen && (
                            <div className="ml-2 mt-1 space-y-0.5 border-l-2 border-slate-200 pl-2">
                              {group.items.map((item, idx) => (
                                <Link
                                  key={idx}
                                  href={item.href}
                                  onClick={handleMobileClick}
                                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:text-[#0F766E] hover:bg-slate-50 transition-colors"
                                >
                                  {item.name}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* C. 历史会话 (一级菜单) */}
          <div className="mt-2">
             <button
              onClick={() => {
                if (!isOpen) setIsOpen(true)
                setIsHistoryExpanded(!isHistoryExpanded)
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition-colors group",
                isHistoryExpanded ? "text-slate-900 bg-[#F3EFE5]/50" : "text-slate-600 hover:bg-[#F3EFE5]"
              )}
              title={!isOpen ? "历史会话" : ""}
            >
              <div className="flex items-center gap-3">
                <History className="h-5 w-5 shrink-0 text-slate-500" />
                {isOpen && <span>历史会话</span>}
              </div>
              {isOpen && (
                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isHistoryExpanded && "rotate-180")} />
              )}
            </button>

            {/* 历史记录列表 */}
            {isOpen && isHistoryExpanded && (
              <div className="mt-2 pl-2 space-y-1 animate-in slide-in-from-top-2">
                 {sessions.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-400 text-center bg-slate-50 rounded-lg mx-2 border border-dashed border-slate-200">
                      暂无记录
                    </div>
                 ) : (
                    sessions.map(session => (
                       <Link 
                         key={session.id}
                         href="/chat" // 实际项目中应带上 id: /chat?id=xxx
                         onClick={handleMobileClick}
                         className="block mx-2 rounded-lg px-3 py-2 hover:bg-white hover:shadow-sm transition-all group"
                       >
                         <div className="text-xs font-medium text-slate-700 truncate group-hover:text-[#0F766E]">{session.title}</div>
                         <div className="text-[10px] text-slate-400 truncate mt-0.5">{session.preview}</div>
                       </Link>
                    ))
                 )}
              </div>
            )}
          </div>

        </div>

        {/* --- 底部用户固定区域 --- */}
        <div 
          className="absolute bottom-0 left-0 right-0 border-t border-[#E5E0D6] p-3 bg-[#FDFBF7] z-50" 
          ref={menuRef}
        >
          {showUserMenu && isOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-3 w-56 rounded-xl border border-border/50 bg-white p-1 shadow-2xl animate-in slide-in-from-bottom-2 z-[60]">
              <div className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-slate-700 bg-slate-50/50">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Coins className="h-4 w-4" /></div>
                <div className="flex flex-col"><span>{credits} 积分</span><span className="text-[10px] text-muted-foreground font-normal">当前余额</span></div>
              </div>
              <div className="my-1 h-px bg-slate-100" />
              <Link href="/settings" onClick={() => setShowUserMenu(false)}>
                 <div className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">
                   <Settings className="h-4 w-4" /> 账号设置
                 </div>
              </Link>
              <Link href="/pricing" onClick={() => setShowUserMenu(false)}>
                 <div className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer">
                   <Zap className="h-4 w-4" /> 升级套餐
                 </div>
              </Link>
              <div className="my-1 h-px bg-slate-100" />
              <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" /> 退出登录</button>
            </div>
          )}

          {user ? (
            <button 
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={cn(
                "flex items-center w-full rounded-xl border transition-all duration-200 hover:shadow-sm overflow-hidden",
                showUserMenu ? "bg-white border-[#E5E0D6]" : "border-transparent hover:bg-white/50",
                isOpen ? "h-12 p-2" : "h-12 justify-center border-none p-0"
              )}
            >
              <div className="w-[40px] flex items-center justify-center shrink-0">
                <div className="h-9 w-9 rounded-full bg-[#0F766E] text-white flex items-center justify-center font-bold text-sm overflow-hidden border-2 border-white shadow-sm">
                  {getAvatarUrl() ? <img src={getAvatarUrl()} alt="User" className="h-full w-full object-cover" /> : user.email?.[0]?.toUpperCase() || "S"}
                </div>
              </div>
              
              {isOpen && (
                <>
                  <div className="flex flex-1 flex-col items-start overflow-hidden ml-2">
                    <span className="truncate text-sm font-bold text-slate-700 w-full text-left">{getDisplayName()}</span>
                    <span className="truncate text-[10px] text-muted-foreground w-full text-left">点击管理账号</span>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 text-slate-400 transition-transform", showUserMenu && "rotate-90")} />
                </>
              )}
            </button>
          ) : (
            <Link href="/login" onClick={handleMobileClick}>
              {isOpen ? (
                <Button className="w-full bg-[#0F766E] hover:bg-[#0d655d] text-white font-bold shadow-md">
                  登录 / 注册
                </Button>
              ) : (
                 <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F766E] text-white mx-auto">
                   <LogOut className="h-4 w-4" />
                 </div>
              )}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}