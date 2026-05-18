/**
 * 🖌 沈翔智学 v2「墨砚」营销页面顶栏
 *
 * 用于：首页 / about / pricing / parent / teacher 等无侧栏的公开页
 * 不用于：已登录的工作台路径（那些走 AppSidebar）
 *
 * 视觉：
 *   - 米白底 + 1px 墨色细线
 *   - 滚动后自动加 paper 阴影
 *   - 移动端汉堡菜单 + 桌面端文字导航
 *   - 右侧"登录 / 开始使用"双 CTA
 */

"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { SheetV2, SheetV2Content, SheetV2Trigger } from "@/components/ui/v2/sheet"

const NAV_ITEMS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "智能体广场", href: "/agents" },
  { label: "创作广场", href: "/explore" },
  { label: "套餐", href: "/pricing" },
  { label: "帮助", href: "/help" },
] as const

export interface MarketingHeaderProps {
  /** 用户已登录时显示的名字 / 头像（前端从 localStorage 兼容拿） */
  user?: { name?: string; avatar?: string } | null
  /** 自定义类名 */
  className?: string
}

export function MarketingHeader({ user, className }: MarketingHeaderProps) {
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [localUser, setLocalUser] = React.useState<MarketingHeaderProps["user"]>(user ?? null)
  const pathname = usePathname()
  const activeUser = user ?? localUser

  React.useEffect(() => {
    if (user) {
      setLocalUser(user)
      return
    }

    function readStoredUser() {
      try {
        const raw = window.localStorage.getItem("currentUser")
        const token =
          window.localStorage.getItem("idToken") ||
          window.localStorage.getItem("authingToken") ||
          window.localStorage.getItem("accessToken")
        if (!raw || !token) {
          setLocalUser(null)
          return
        }

        const parsed = JSON.parse(raw)
        setLocalUser({
          name: parsed.nickname || parsed.name || parsed.username || parsed.email || parsed.phone || "我的账户",
          avatar: parsed.avatar || parsed.avatar_url || parsed.photo || parsed.picture || parsed.user_metadata?.avatar_url,
        })
      } catch {
        setLocalUser(null)
      }
    }

    readStoredUser()
    window.addEventListener("storage", readStoredUser)
    window.addEventListener("focus", readStoredUser)
    return () => {
      window.removeEventListener("storage", readStoredUser)
      window.removeEventListener("focus", readStoredUser)
    }
  }, [user])

  React.useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      data-slot="v2-marketing-header"
      className={cn(
        "sticky top-0 z-40 w-full",
        "bg-[var(--paper-50)]/85 backdrop-blur-md",
        "border-b border-[var(--paper-200)]",
        "transition-shadow duration-300",
        scrolled && "shadow-[0_1px_0_var(--paper-200),_0_4px_16px_-8px_rgba(14,27,17,0.08)]",
        className
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 md:px-6">
        {/* 品牌 */}
        <Link
          href="/"
          prefetch={false}
          className="flex items-center gap-2 outline-none focus-visible:[box-shadow:var(--shadow-focus-ink)] rounded-[var(--radius-sharp)]"
        >
          <Image
            src="/images/design-mode/home-logo-transparent.png"
            alt="沈翔智学"
            width={140}
            height={32}
            priority
            className="h-8 w-auto object-contain"
          />
        </Link>

        {/* 桌面端导航 */}
        <nav className="hidden md:flex items-center gap-1 ml-2">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href) ?? false
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={cn(
                  "px-3 py-2 text-[14px] rounded-[var(--radius-pill)] font-[var(--font-sans-v2)] transition-colors duration-200",
                  active
                    ? "text-[var(--ink-800)] font-semibold"
                    : "text-[var(--ink-500)] hover:text-[var(--ink-700)] hover:bg-[var(--ink-50)]"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* 右侧 CTA */}
        <div className="ml-auto flex items-center gap-2">
          {activeUser ? (
            <Link href="/settings" prefetch={false} className="hidden md:flex items-center gap-2">
              <span className="font-[var(--font-sans-v2)] text-[14px] text-[var(--ink-700)]">
                {activeUser.name ?? "我的账户"}
              </span>
            </Link>
          ) : (
            <>
              <ButtonV2 asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login" prefetch={false}>
                  登录
                </Link>
              </ButtonV2>
              <ButtonV2 asChild variant="primary" size="sm" className="hidden sm:inline-flex">
                <Link href="/chat/standard" prefetch={false}>
                  开始使用
                </Link>
              </ButtonV2>
            </>
          )}

          {/* 移动端菜单 */}
          <SheetV2 open={open} onOpenChange={setOpen}>
            <SheetV2Trigger asChild>
              <ButtonV2 variant="ghost" size="icon-sm" className="md:hidden" aria-label="菜单">
                <Menu className="size-5" />
              </ButtonV2>
            </SheetV2Trigger>
            <SheetV2Content side="right" className="w-[88vw] max-w-sm">
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between px-6 pt-6 pb-3">
                  <Image
                    src="/images/design-mode/home-logo-transparent.png"
                    alt="沈翔智学"
                    width={120}
                    height={28}
                    className="h-7 w-auto object-contain"
                  />
                  <ButtonV2
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setOpen(false)}
                    aria-label="关闭"
                  >
                    <X className="size-5" />
                  </ButtonV2>
                </div>

                <nav className="flex flex-col gap-1 px-3 py-4">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={() => setOpen(false)}
                      className="px-4 py-3 rounded-[var(--radius-soft)] font-[var(--font-sans-v2)] text-[15px] text-[var(--ink-700)] hover:bg-[var(--ink-50)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="mt-auto px-6 pb-6 flex flex-col gap-3">
                  <ButtonV2 asChild variant="primary" size="lg" className="w-full">
                    <Link href={activeUser ? "/chat/standard" : "/login"} prefetch={false} onClick={() => setOpen(false)}>
                      开始使用
                    </Link>
                  </ButtonV2>
                  <ButtonV2 asChild variant="outline" size="lg" className="w-full">
                    <Link href={activeUser ? "/settings" : "/login"} prefetch={false} onClick={() => setOpen(false)}>
                      {activeUser ? "我的账户" : "登录"}
                    </Link>
                  </ButtonV2>
                </div>
              </div>
            </SheetV2Content>
          </SheetV2>
        </div>
      </div>
    </header>
  )
}
