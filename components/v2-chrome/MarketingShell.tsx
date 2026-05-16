/**
 * 🖌 沈翔智学 v2「墨砚」营销页面骨架
 *
 * 用法（包裹整个营销页面）：
 *   <MarketingShell>
 *     <HeroSection />
 *     <CapabilitiesSection />
 *     ...
 *   </MarketingShell>
 *
 * 包含：MarketingHeader（顶栏）+ children（内容）+ MarketingFooter（页脚）
 *
 * 关于侧栏：
 *   - 营销页 (/, /about, /pricing, /parent, /teacher 等) **不**走 AppSidebar
 *   - 通过 lib/app-chrome-routes.ts 决定哪些路径走 sidebar，哪些走 MarketingShell
 *   - 本组件本身不耦合鉴权
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { MarketingHeader } from "./MarketingHeader"
import { MarketingFooter } from "./MarketingFooter"

export interface MarketingShellProps {
  children: React.ReactNode
  className?: string
  /** 是否隐藏页脚（极少数全屏体验场景） */
  hideFooter?: boolean
  /** 是否隐藏顶栏（错误页 / 单纯 dialog 路径） */
  hideHeader?: boolean
}

export function MarketingShell({
  children,
  className,
  hideFooter,
  hideHeader,
}: MarketingShellProps) {
  return (
    <div
      data-slot="v2-marketing-shell"
      className={cn(
        "flex min-h-screen flex-col bg-[var(--paper-50)] text-[var(--ink-900)]",
        className
      )}
    >
      {!hideHeader ? <MarketingHeader /> : null}
      <main id="main-content" className="flex-1">
        {children}
      </main>
      {!hideFooter ? <MarketingFooter /> : null}
    </div>
  )
}
