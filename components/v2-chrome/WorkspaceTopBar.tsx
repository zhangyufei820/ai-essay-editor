/**
 * 🖌 沈翔智学 v2「墨砚」工作台顶栏
 *
 * 56px sticky 顶栏：
 *   - 左：汉堡菜单（移动端） + 品牌 logo / 当前页面标题
 *   - 中：（可选）面包屑或子标签
 *   - 右：积分余额 + 用户头像下拉
 */

"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { LogOut, Menu, UserRound, WalletCards } from "lucide-react"
import { useRouter } from "next/navigation"
import { IconCredits } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
import { ButtonV2 } from "@/components/ui/v2/button"
import { AvatarV2, AvatarV2Image, AvatarV2Fallback } from "@/components/ui/v2/avatar"
import {
  DropdownMenuV2,
  DropdownMenuV2Content,
  DropdownMenuV2Item,
  DropdownMenuV2Label,
  DropdownMenuV2Separator,
  DropdownMenuV2Trigger,
} from "@/components/ui/v2/dropdown-menu"
import { createClient } from "@/lib/supabase/client"

export interface WorkspaceTopBarProps {
  pageTitle?: React.ReactNode
  user?: { name?: string; avatar?: string; credits?: number } | null
  onMenuClick?: () => void
  sidebarOpen?: boolean
  className?: string
}

export function WorkspaceTopBar({
  pageTitle,
  user,
  onMenuClick,
  className,
}: WorkspaceTopBarProps) {
  const router = useRouter()

  const handleLogout = React.useCallback(async () => {
    await createClient()?.auth.signOut().catch(() => null)
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("currentUser")
      window.localStorage.removeItem("idToken")
      window.localStorage.removeItem("authingToken")
      window.localStorage.removeItem("accessToken")
      window.dispatchEvent(new Event("credits-refresh"))
    }
    router.push("/login")
  }, [router])

  return (
    <header
      data-slot="v2-workspace-topbar"
      className={cn(
        "sticky top-0 z-30 flex h-14 w-full items-center gap-3 border-b border-[var(--paper-200)] bg-[var(--paper-50)]/85 px-3 backdrop-blur-md md:px-4",
        className
      )}
    >
      {/* 移动端菜单按钮 */}
      <ButtonV2
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="打开侧栏菜单"
      >
        <Menu className="size-5" />
      </ButtonV2>

      {/* 品牌 + 页面标题 */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Link href="/" prefetch={false} className="hidden md:flex shrink-0">
          <Image
            src="/images/design-mode/home-logo-transparent.png"
            alt="沈翔智学"
            width={120}
            height={28}
            priority
            className="h-7 w-auto object-contain"
          />
        </Link>

        {pageTitle ? (
          <>
            <span
              className="hidden md:block h-5 w-px bg-[var(--paper-300)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 truncate font-[var(--font-display)] text-[16px] font-bold text-[var(--ink-800)]">
              {pageTitle}
            </div>
          </>
        ) : null}
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-2">
        {typeof user?.credits === "number" ? (
          <Link
            href="/credits"
            prefetch={false}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 h-8 rounded-[var(--radius-pill)] border border-[var(--paper-300)] bg-[var(--paper-100)] hover:bg-[var(--ink-50)] transition-colors duration-200"
            aria-label={`积分余额 ${user.credits}`}
          >
            <IconCredits className="size-3.5 text-[var(--ink-600)]" />
            <span className="font-[var(--font-mono-v2)] text-[13px] font-bold text-[var(--ink-800)] tabular-nums">
              {user.credits.toLocaleString()}
            </span>
          </Link>
        ) : null}

        {user ? (
          <DropdownMenuV2>
            <DropdownMenuV2Trigger asChild>
              <button
                type="button"
                className="rounded-full outline-none transition focus-visible:[box-shadow:var(--shadow-focus-ink)]"
                aria-label="打开账户菜单"
              >
                <AvatarV2 className="size-8 transition hover:border-[var(--ink-300)] hover:bg-[var(--ink-50)]">
                  {user.avatar ? <AvatarV2Image src={user.avatar} alt={user.name ?? "用户"} /> : null}
                  <AvatarV2Fallback>
                    {(user.name ?? "U").slice(0, 1).toUpperCase()}
                  </AvatarV2Fallback>
                </AvatarV2>
              </button>
            </DropdownMenuV2Trigger>
            <DropdownMenuV2Content align="end" className="w-52">
              <DropdownMenuV2Label className="normal-case tracking-normal">
                <span className="block truncate text-[13px] text-[var(--ink-800)]">
                  {user.name || "用户"}
                </span>
                {typeof user.credits === "number" ? (
                  <span className="mt-1 block font-[var(--font-mono-v2)] text-[11px] text-[var(--ink-500)]">
                    {user.credits.toLocaleString()} 积分
                  </span>
                ) : null}
              </DropdownMenuV2Label>
              <DropdownMenuV2Separator />
              <DropdownMenuV2Item asChild>
                <Link href="/settings" prefetch={false}>
                  <UserRound className="size-4" />
                  个人中心
                </Link>
              </DropdownMenuV2Item>
              <DropdownMenuV2Item asChild>
                <Link href="/credits" prefetch={false}>
                  <WalletCards className="size-4" />
                  积分中心
                </Link>
              </DropdownMenuV2Item>
              <DropdownMenuV2Separator />
              <DropdownMenuV2Item variant="destructive" onSelect={handleLogout}>
                <LogOut className="size-4" />
                退出登录
              </DropdownMenuV2Item>
            </DropdownMenuV2Content>
          </DropdownMenuV2>
        ) : (
          <ButtonV2 asChild variant="primary" size="sm">
            <Link href="/login" prefetch={false}>
              登录
            </Link>
          </ButtonV2>
        )}
      </div>
    </header>
  )
}
