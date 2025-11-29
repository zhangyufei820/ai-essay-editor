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
    <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav className="container flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/images/logo.png"
            alt="沈翔智学"
            width={220}
            height={75}
            className="h-14 w-auto object-contain"
            priority
          />
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
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
            <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
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
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            教师专区
          </Link>

          <Link
            href="/parent"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            家长专区
          </Link>

          <Link
            href="/chat"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            作文批改
          </Link>

          <Link
            href="/#features"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => handleAnchorClick(e, "/#features")}
          >
            核心功能
          </Link>

          <Link
            href="/#pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => handleAnchorClick(e, "/#pricing")}
          >
            价格方案
          </Link>
        </div>

        <div className="hidden items-center gap-4 md:flex">
          {user ? (
            <>
              <Link href="/credits">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Coins className="h-4 w-4" />
                  {credits !== null ? credits : "..."} 积分
                </Button>
              </Link>
              <Link href="/credits">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  <User className="h-4 w-4" />
                  我的账户
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login">
                <Button variant="ghost" size="sm">
                  登录
                </Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button size="sm">立即注册</Button>
              </Link>
            </>
          )}
        </div>

        <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileMenuOpen && (
        <div className="border-t border-border bg-background md:hidden">
          <div className="container space-y-4 px-4 py-6">
            <div className="space-y-2">
              <div className="font-semibold text-sm text-muted-foreground">学段选择</div>
              <Link href="/primary" className="block pl-4 text-sm" onClick={() => setMobileMenuOpen(false)}>
                小学教育
              </Link>
              <Link href="/middle" className="block pl-4 text-sm" onClick={() => setMobileMenuOpen(false)}>
                初中教育
              </Link>
              <Link href="/high" className="block pl-4 text-sm" onClick={() => setMobileMenuOpen(false)}>
                高中教育
              </Link>
              <Link href="/university" className="block pl-4 text-sm" onClick={() => setMobileMenuOpen(false)}>
                大学教育
              </Link>
            </div>

            <div className="space-y-2 pt-2">
              <div className="font-semibold text-sm text-muted-foreground">学科中心</div>
              <Link href="/subjects/chinese" className="block pl-4 text-sm" onClick={() => setMobileMenuOpen(false)}>
                语文
              </Link>
              <Link href="/subjects/math" className="block pl-4 text-sm" onClick={() => setMobileMenuOpen(false)}>
                数学
              </Link>
              <Link href="/subjects/english" className="block pl-4 text-sm" onClick={() => setMobileMenuOpen(false)}>
                英语
              </Link>
            </div>

            <Link href="/teacher" className="block text-sm font-medium pt-2" onClick={() => setMobileMenuOpen(false)}>
              教师专区
            </Link>
            <Link href="/parent" className="block text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
              家长专区
            </Link>
            <Link href="/chat" className="block text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
              作文批改
            </Link>

            <Link
              href="/#features"
              className="block text-sm font-medium"
              onClick={(e) => {
                handleAnchorClick(e, "/#features")
                setMobileMenuOpen(false)
              }}
            >
              核心功能
            </Link>
            <Link
              href="/#pricing"
              className="block text-sm font-medium"
              onClick={(e) => {
                handleAnchorClick(e, "/#pricing")
                setMobileMenuOpen(false)
              }}
            >
              价格方案
            </Link>

            <div className="flex flex-col gap-2 pt-4 border-t">
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
