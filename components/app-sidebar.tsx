"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button" 
import { 
  Home, FileText, Users, CreditCard, 
  LogOut, School, Coins, Zap, Settings, ChevronRight,
  PanelLeftClose, PanelLeftOpen, User
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export function AppSidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState<number>(0)
  
  // 控制菜单显示 (点击触发)
  const [showUserMenu, setShowUserMenu] = useState(false)
  
  // ⚠️ 修改点1：默认状态 isOpen 虽然初始设为 true，但在下方的 useEffect 会立刻根据屏幕修正
  const [isOpen, setIsOpen] = useState(true)
  
  const menuRef = useRef<HTMLDivElement>(null)

  // ⚠️ 修改点2：智能识别设备宽度
  // 如果是手机 (<768px)，默认收起侧边栏，否则挡住屏幕无法操作
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth < 768) {
        setIsOpen(false) 
      } else {
        setIsOpen(true)
      }
    }

    // 初始化检查
    checkScreenSize()

    // 监听屏幕旋转或缩放
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  useEffect(() => {
    const loadUserData = async () => {
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
        const { data } = await supabase
          .from('user_credits')
          .select('credits')
          .eq('user_id', currentUserId)
          .single()
        
        if (data) setCredits(data.credits)
      }
    }
    loadUserData()

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('currentUser')
    window.location.href = "/login"
  }

  // ⚠️ 修改点3：手机端点击菜单项后，自动收起侧边栏
  // 否则用户跳转到新页面后，侧边栏还挡在前面
  const handleMobileClick = () => {
    if (window.innerWidth < 768) {
      setIsOpen(false)
    }
  }

  const getDisplayName = () => {
    if (!user) return "未登录"
    if (user.user_metadata?.name) return user.user_metadata.name
    const phone = user.phone || user.phoneNumber
    if (phone) return String(phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    return user.email?.split('@')[0] || "普通用户"
  }

  const getAvatarUrl = () => user?.user_metadata?.avatar_url || null

  const menuItems = [
    { title: "功能", items: [
      { name: "首页", href: "/", icon: Home },
      { name: "作文批改", href: "/chat", icon: FileText },
    ]},
    { title: "服务", items: [
      { name: "教师专区", href: "/teacher", icon: School },
      { name: "家长专区", href: "/parent", icon: Users },
      { name: "价格方案", href: "/pricing", icon: CreditCard },
    ]}
  ]

  return (
    <>
      {/* 悬浮展开按钮 */}
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
          // ⚠️ 保持之前的 sticky 修复，确保电脑端和手机端布局稳固
          "flex h-screen supports-[height:100dvh]:h-[100dvh] sticky top-0 flex-col border-r border-[#E5E0D6] bg-[#FDFBF7] transition-all duration-300 ease-in-out z-40",
          isOpen ? "w-64" : "w-0 -translate-x-full opacity-0 overflow-hidden border-none"
        )}
      >
        {/* 内部折叠按钮 */}
        <button
          onClick={() => setIsOpen(false)}
          className="absolute right-2 top-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-black/5 transition-colors z-10"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>

        {/* Logo 部分 */}
        <div className="p-6 pb-4 shrink-0">
          {/* Logo 也加上 handleMobileClick，防止点 Logo 回首页时被挡住 */}
          <Link href="/" className="block" onClick={handleMobileClick}>
             <img 
               src="/images/logo.png" 
               alt="沈翔智学" 
               className="h-16 w-auto object-contain"
             />
          </Link>
        </div>

        {/* 菜单列表 */}
        <div className="flex-1 overflow-y-auto py-2 px-3 space-y-6 pb-20"> 
          {menuItems.map((group, i) => (
            <div key={i}>
              <h3 className="mb-2 px-4 text-xs font-semibold text-muted-foreground/70">{group.title}</h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={handleMobileClick} // ⚠️ 关键：点击菜单跳转后，自动收起侧边栏
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                        isActive 
                          ? "bg-white text-[#0F766E] shadow-sm ring-1 ring-[#E5E0D6]" 
                          : "text-slate-600 hover:bg-[#F3EFE5] hover:text-slate-900"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-[#0F766E]" : "text-slate-400")} />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 底部用户信息 */}
        <div 
          className="absolute bottom-0 left-0 right-0 border-t border-[#E5E0D6] p-3 bg-[#FDFBF7] z-50" 
          ref={menuRef}
        >
          {/* 弹出菜单 */}
          {showUserMenu && (
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

          {/* 用户按钮 */}
          {user ? (
            <button 
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={cn(
                "flex items-center w-full h-12 rounded-xl border p-2 transition-all duration-200 hover:shadow-sm overflow-hidden",
                showUserMenu ? "bg-white border-[#E5E0D6]" : "border-transparent hover:bg-white/50"
              )}
            >
              <div className="w-[40px] flex items-center justify-center shrink-0">
                <div className="h-9 w-9 rounded-full bg-[#0F766E] text-white flex items-center justify-center font-bold text-sm overflow-hidden border-2 border-white shadow-sm">
                  {getAvatarUrl() ? <img src={getAvatarUrl()} alt="User" className="h-full w-full object-cover" /> : user.email?.[0]?.toUpperCase() || "S"}
                </div>
              </div>

              <div className="flex flex-1 flex-col items-start overflow-hidden ml-2">
                <span className="truncate text-sm font-bold text-slate-700 w-full text-left">{getDisplayName()}</span>
                <span className="truncate text-[10px] text-muted-foreground w-full text-left">点击管理账号</span>
              </div>
              <ChevronRight className={cn("h-4 w-4 text-slate-400 transition-transform", showUserMenu && "rotate-90")} />
            </button>
          ) : (
            // ⚠️ 按钮也加上 handleMobileClick
            <Link href="/login" onClick={handleMobileClick}>
              {/* ⚠️ 修改点4：强制 text-white font-bold 解决字体看不清问题 */}
              <Button className="w-full bg-[#0F766E] hover:bg-[#0d655d] text-white font-bold shadow-md">
                登录 / 注册
              </Button>
            </Link>
          )}
        </div>
      </div>
    </>
  )
}