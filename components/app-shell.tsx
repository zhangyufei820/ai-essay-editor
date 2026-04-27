"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import type React from "react"

const AppChrome = dynamic(
  () => import("@/components/app-chrome").then((mod) => ({ default: mod.AppChrome })),
  { ssr: false }
)

const APP_ROUTE_PREFIXES = [
  "/admin",
  "/chat",
  "/credits",
  "/history",
  "/settings",
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const usesAppChrome = APP_ROUTE_PREFIXES.some((prefix) => pathname?.startsWith(prefix))

  if (usesAppChrome) {
    return <AppChrome>{children}</AppChrome>
  }

  return (
    <div id="main-content" className="min-h-screen w-full">
      {children}
    </div>
  )
}
