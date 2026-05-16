/**
 * 📱 沈翔学校 - 移动端导航组件 (Mobile Navigation)
 * 
 * 包含底部标签栏和汉堡菜单两种模式。
 */

"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Home, 
  MessageSquare, 
  User, 
  Menu, 
  X,
  Sparkles,
  LogOut,
  ChevronRight,
  Layers3,
  ClipboardCheck,
  FileText,
  Calculator,
  Bot,
  Tag,
  HelpCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { brandColors } from "@/lib/design-tokens"

// ============================================
// 导航项配置
// ============================================

const bottomNavItems = [
  { href: "/", icon: Home, label: "首页" },
  { href: "/chat", icon: MessageSquare, label: "对话" },
  { href: "/worksheet-diagnosis", icon: ClipboardCheck, label: "诊断" },
  { href: "/flashcards", icon: Layers3, label: "闪卡" },
  { href: "/settings", icon: User, label: "我的" }
]

const menuItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/chat/standard", label: "作文批改", icon: FileText },
  { href: "/chat/quanquan-math", label: "数学答疑", icon: Calculator },
  { href: "/chat/open-claw", label: "AI 助手", icon: Bot },
  { href: "/pricing", label: "定价", icon: Tag },
  { href: "/help", label: "帮助", icon: HelpCircle }
]

// ============================================
// 底部标签栏导航
// ============================================

export function MobileBottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-100 bg-white/95 pb-safe backdrop-blur-lg md:hidden">
      <div className="mx-auto flex min-h-16 max-w-md items-center justify-around px-1">
        {bottomNavItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/" && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl",
                "transition-colors duration-200",
                isActive ? "text-emerald-700" : "text-slate-400"
              )}
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="relative"
              >
                <item.icon 
                  className={cn(
                    "w-6 h-6 mb-1 transition-all duration-200",
                    isActive && "fill-emerald-100 stroke-emerald-700"
                  )} 
                  strokeWidth={isActive ? 2.5 : 2}
                />
                
                {/* 选中指示器 */}
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ backgroundColor: brandColors[700] }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
              
              <span className={cn(
                "text-[10px] font-medium transition-colors duration-200",
                isActive ? "text-emerald-700" : "text-slate-400"
              )}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

// ============================================
// 汉堡菜单
// ============================================

interface HamburgerMenuProps {
  /** 用户信息 */
  user?: {
    name?: string
    email?: string
    avatar?: string
  }
  /** 登出回调 */
  onLogout?: () => void
}

export function HamburgerMenu({ user, onLogout }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  // 路由变化时关闭菜单
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // 打开菜单时禁止滚动
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  return (
    <>
      {/* 触发按钮 */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-slate-600 hover:text-slate-900 md:hidden rounded-lg hover:bg-slate-100 transition-colors"
        aria-label={isOpen ? "关闭菜单" : "打开菜单"}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="menu"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Menu className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* 菜单面板 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
            />

            {/* 菜单面板 */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(86vw,320px)] flex-col bg-white shadow-2xl md:hidden"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between p-4 border-b border-slate-100 pt-safe">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-700" />
                  <span className="font-semibold text-slate-800">沈翔学校</span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 用户信息 */}
              {user && (
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {user.name || "用户"}
                      </p>
                      <p className="text-sm text-slate-500 truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 链接列表 */}
              <nav className="flex-1 py-4 overflow-y-auto">
                {menuItems.map((item, index) => {
                  const isActive = pathname === item.href || 
                    (item.href !== "/" && pathname.startsWith(item.href))

                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-6 py-4 text-base transition-colors",
                          isActive
                            ? "text-emerald-700 bg-emerald-50 border-r-2 border-emerald-700"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        )}
                      >
                        <item.icon className={cn(
                          "w-5 h-5",
                          isActive ? "text-emerald-700" : "text-slate-400"
                        )} />
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight className={cn(
                          "w-4 h-4 transition-transform",
                          isActive ? "text-emerald-700" : "text-slate-300"
                        )} />
                      </Link>
                    </motion.div>
                  )
                })}
              </nav>

              {/* 底部操作区 */}
              <div className="p-4 border-t border-slate-100 pb-safe space-y-3">
                {user ? (
                  <button
                    onClick={() => {
                      setIsOpen(false)
                      onLogout?.()
                    }}
                    className="flex items-center justify-center gap-2 w-full py-3 text-slate-600 bg-slate-100 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="block w-full py-3 text-center text-white bg-emerald-900 rounded-xl font-medium hover:bg-emerald-800 transition-colors"
                  >
                    登录 / 注册
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

// ============================================
// 组合导航组件
// ============================================

interface MobileNavProps {
  /** 导航模式 */
  mode?: "bottom" | "hamburger" | "both"
  /** 用户信息 */
  user?: {
    name?: string
    email?: string
    avatar?: string
  }
  /** 登出回调 */
  onLogout?: () => void
}

export function MobileNav({ 
  mode = "bottom", 
  user, 
  onLogout 
}: MobileNavProps) {
  if (mode === "hamburger") {
    return <HamburgerMenu user={user} onLogout={onLogout} />
  }

  if (mode === "both") {
    return (
      <>
        <HamburgerMenu user={user} onLogout={onLogout} />
        <MobileBottomNav />
      </>
    )
  }

  return <MobileBottomNav />
}

// ============================================
// 默认导出
// ============================================

export default MobileNav
