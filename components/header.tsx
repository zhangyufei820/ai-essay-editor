"use client"

import { Button } from "@/components/ui/button"
import { Menu, X, Coins, User } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { cn } from "@/lib/utils"

const directNavItems = [
  { name: "作文批改", href: "/chat/standard" },
  { name: "数学答疑", href: "/chat/quanquan-math" },
  { name: "AI 助手", href: "/chat/open-claw" },
  { name: "定价", href: "/pricing" },
  { name: "帮助", href: "/help" },
] as const

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [user, setUser] = useState<unknown | null>(null)
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const fetchCredits = async (activeUser?: unknown) => {
      try {
        const response = await fetch("/api/user/credits", {
          headers: await getVerifiedAuthHeaders(activeUser),
        })
        if (!response.ok) return
        const data = (await response.json()) as { credits?: number }
        setCredits(data.credits || 0)
      } catch (error) {
        console.error("[Header] 获取积分失败:", error)
      }
    }

    const localUser = window.localStorage.getItem("currentUser")
    if (localUser) {
      try {
        const parsedUser = JSON.parse(localUser)
        setUser(parsedUser)
        fetchCredits(parsedUser)
      } catch {
        window.localStorage.removeItem("currentUser")
      }
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
        const storedUser = window.localStorage.getItem("currentUser")
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser)
            setUser(parsedUser)
            fetchCredits(parsedUser)
            return
          } catch {
            window.localStorage.removeItem("currentUser")
          }
        }
        setUser(null)
        setCredits(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <nav className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-end gap-4 px-4 sm:px-6">
        <div className="hidden items-center gap-6 md:flex">
          {directNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              {item.name}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <>
              <Link href="/credits">
                <Button variant="ghost" size="sm" className="gap-2 rounded-full">
                  <Coins className="h-4 w-4" />
                  {credits !== null ? credits : "..."} 积分
                </Button>
              </Link>
              <Link href="/credits">
                <Button variant="outline" size="sm" className="gap-2 rounded-full bg-transparent">
                  <User className="h-4 w-4" />
                  我的账户
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost" size="sm" className="rounded-full">
                  登录
                </Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button size="sm" className="rounded-full px-4">立即注册</Button>
              </Link>
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
          <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
            <div className="space-y-2">
              <div className="font-semibold text-sm text-muted-foreground">快速入口</div>
              {directNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t pt-4">
              {user ? (
                <>
                  <Link href="/credits">
                    <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                      <Coins className="h-4 w-4" />
                      {credits !== null ? credits : "..."} 积分
                    </Button>
                  </Link>
                  <Link href="/credits">
                    <Button variant="outline" size="sm" className="w-full gap-2 bg-transparent">
                      <User className="h-4 w-4" />
                      我的账户
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/auth/login">
                    <Button variant="ghost" size="sm" className="w-full">
                      登录
                    </Button>
                  </Link>
                  <Link href="/auth/sign-up">
                    <Button size="sm" className="w-full">
                      立即注册
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
