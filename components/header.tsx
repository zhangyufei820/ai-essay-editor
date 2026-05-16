"use client"

import { Button } from "@/components/ui/button"
import { Menu, X, Coins, User } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { Logo } from "@/components/brand/Logo"
import { createClient } from "@/lib/supabase/client"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { cn } from "@/lib/utils"

type StoredHeaderUser = {
  email?: string
}

type HeaderUser = SupabaseUser | StoredHeaderUser

const navItems = [
  { name: "作文批改", href: "/chat/standard" },
  { name: "数学答疑", href: "/chat/quanquan-math" },
  { name: "AI 助手", href: "/chat/open-claw" },
  { name: "定价", href: "/pricing" },
  { name: "帮助", href: "/help" },
] as const

function parseStoredUser(value: string | null): HeaderUser | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === "object") {
      return parsed as StoredHeaderUser
    }
  } catch {
    window.localStorage.removeItem("currentUser")
  }

  return null
}

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [user, setUser] = useState<HeaderUser | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()

    const fetchCredits = async (activeUser?: unknown) => {
      try {
        const response = await fetch("/api/user/credits", {
          headers: await getVerifiedAuthHeaders(activeUser),
        })
        if (!response.ok) return
        const data = await response.json()
        setCredits(data.credits || 0)
      } catch (error) {
        console.error("[Header] 获取积分失败:", error)
      }
    }

    const storedUser = parseStoredUser(window.localStorage.getItem("currentUser"))
    if (storedUser) {
      setUser(storedUser)
      fetchCredits(storedUser)
    }

    if (!supabase) {
      return
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUser(user)
      if (user) {
        fetchCredits(user)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchCredits(session.user)
      } else {
        const storedUser = parseStoredUser(window.localStorage.getItem("currentUser"))
        if (storedUser) {
          setUser(storedUser)
          fetchCredits(storedUser)
          return
        }
        setUser(null)
        setCredits(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <nav className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="沈翔智学首页" className="flex shrink-0 items-center">
          <Logo size="sm" variant="full" className="h-[42px] w-[104px] sm:w-[118px]" />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  isActive && "text-primary"
                )}
              >
                {item.name}
              </Link>
            )
          })}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="gap-2 rounded-full">
                <Link href="/credits">
                  <Coins className="h-4 w-4" />
                  {credits !== null ? credits : "..."} 积分
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-2 rounded-full bg-transparent">
                <Link href="/credits">
                  <User className="h-4 w-4" />
                  我的账户
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="rounded-full">
                <Link href="/auth/login">
                  登录
                </Link>
              </Button>
              <Button asChild size="sm" className="rounded-full px-4">
                <Link href="/auth/sign-up">立即注册</Link>
              </Button>
            </>
          )}
        </div>

        <button
          className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "关闭导航菜单" : "打开导航菜单"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="border-t border-border bg-background/98 shadow-lg md:hidden">
          <div className="mx-auto max-w-7xl px-4 py-5">
            <div className="grid gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {item.name}
                  </Link>
                )
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t pt-4">
              {user ? (
                <>
                  <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2">
                    <Link href="/credits" onClick={() => setMobileMenuOpen(false)}>
                      <Coins className="h-4 w-4" />
                      {credits !== null ? credits : "..."} 积分
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="w-full gap-2 bg-transparent">
                    <Link href="/credits" onClick={() => setMobileMenuOpen(false)}>
                      <User className="h-4 w-4" />
                      我的账户
                    </Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                      登录
                    </Link>
                  </Button>
                  <Button asChild size="sm" className="w-full">
                    <Link href="/auth/sign-up" onClick={() => setMobileMenuOpen(false)}>
                      立即注册
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
