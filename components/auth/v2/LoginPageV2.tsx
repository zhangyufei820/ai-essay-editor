/**
 * 🖌 v2 登录页面骨架
 *
 * 视觉：居中卡片（elevated） + 宋体标题 + 朱印"登录"按钮
 * 实际登录逻辑仍由 Authing Guard 接管，本组件只是外壳包装
 */

"use client"

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { CardV2, CardV2Content } from "@/components/ui/v2/card"
import { InkReveal } from "@/components/motion/InkMotion"

export interface LoginPageV2Props {
  /** Authing Guard 挂载的容器 slot */
  children?: React.ReactNode
  className?: string
}

export function LoginPageV2({ children, className }: LoginPageV2Props) {
  return (
    <div
      data-slot="v2-login-page"
      className={cn(
        "flex min-h-screen items-center justify-center",
        "bg-[var(--paper-50)] px-4 py-10 font-[var(--font-sans-v2)]",
        className
      )}
    >
      <InkReveal as="div" className="w-full max-w-md">
        <CardV2 variant="elevated" className="overflow-hidden">
          {/* 顶部 logo 横幅 */}
          <div className="flex items-center justify-center border-b border-[var(--paper-200)] bg-[var(--paper-100)] py-6">
            <Image
              src="/images/design-mode/home-logo-transparent.png"
              alt="沈翔智学"
              width={160}
              height={40}
              priority
              className="h-10 w-auto object-contain"
            />
          </div>

          <CardV2Content className="py-8">
            <h1 className="text-center font-[var(--font-display)] text-[24px] font-bold text-[var(--ink-800)] mb-2">
              欢迎回来
            </h1>
            <p className="text-center text-[14px] text-[var(--ink-500)] mb-6">
              登录以继续使用沈翔智学
            </p>

            {/* Authing Guard 挂载点 */}
            <div id="authing-guard-container">
              {children}
            </div>
          </CardV2Content>
        </CardV2>

        <p className="mt-4 text-center text-[12px] text-[var(--ink-400)]">
          继续即表示同意{" "}
          <a href="/terms" className="underline underline-offset-2 hover:text-[var(--ink-600)]">
            服务条款
          </a>{" "}
          和{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-[var(--ink-600)]">
            隐私政策
          </a>
        </p>
      </InkReveal>
    </div>
  )
}
