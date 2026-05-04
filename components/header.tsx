"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Menu, X, Coins, User, ChevronDown } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Image from "next/image"

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()

    if (!supabase) {
      return
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      if (user) {
        supabase
          .from("user_credits")
          .select("credits")
          .eq("user_id", user.id)
          .single()
          .then(({ data }) => {
            if (data) setCredits(data.credits)
          })
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        supabase
          .from("user_credits")
          .select("credits")
          .eq("user_id", session.user.id)
          .single()
          .then(({ data }) => {
            if (data) setCredits(data.credits)
          })
      } else {
        setCredits(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith("/#")) {
      e.preventDefault()
      const sectionId = href.substring(2)
      const element = document.getElementById(sectionId)

      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" })
      } else {
        window.location.href = href
      }
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
      <nav className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <Image
            src="/images/design-mode/主页logo.jpg"
            alt="沈翔智学"
            width={220}
            height={75}
            className="h-12 w-auto object-contain md:h-14"
            priority
          />
        </Link>

        <div className="hidden items-center gap-1 rounded-full border border-border/70 bg-card/80 p-1 shadow-sm md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              学段选择
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link href="/primary">小学教育</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/middle">初中教育</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/high">高中教育</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/university">大学教育</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              学科中心
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <Link href="/subjects/chinese">语文</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/subjects/math">数学</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/subjects/english">英语</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/subjects/science">科学</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/subjects/more">更多学科</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            href="/teacher"
            className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            教师专区
          </Link>

          <Link
            href="/parent"
            className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            家长专区
          </Link>

          <Link
            href="/chat"
            className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            作文批改
          </Link>

          <Link
            href="/#features"
            className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => handleAnchorClick(e, "/#features")}
          >
            核心功能
          </Link>

          <Link
            href="/#pricing"
            className="flex h-9 items-center rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => handleAnchorClick(e, "/#pricing")}
          >
            价格方案
          </Link>
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
              <div className="font-semibold text-sm text-muted-foreground">学段选择</div>
              <Link href="/primary" className="block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
                小学教育
              </Link>
              <Link href="/middle" className="block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
                初中教育
              </Link>
              <Link href="/high" className="block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
                高中教育
              </Link>
              <Link href="/university" className="block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
                大学教育
              </Link>
            </div>

            <div className="space-y-2 pt-2">
              <div className="font-semibold text-sm text-muted-foreground">学科中心</div>
              <Link href="/subjects/chinese" className="block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
                语文
              </Link>
              <Link href="/subjects/math" className="block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
                数学
              </Link>
              <Link href="/subjects/english" className="block rounded-lg px-3 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
                英语
              </Link>
            </div>

            <Link href="/teacher" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
              教师专区
            </Link>
            <Link href="/parent" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
              家长专区
            </Link>
            <Link href="/chat" className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}>
              作文批改
            </Link>

            <Link
              href="/#features"
              className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => {
                handleAnchorClick(e, "/#features")
                setMobileMenuOpen(false)
              }}
            >
              核心功能
            </Link>
            <Link
              href="/#pricing"
              className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => {
                handleAnchorClick(e, "/#pricing")
                setMobileMenuOpen(false)
              }}
            >
              价格方案
            </Link>

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
