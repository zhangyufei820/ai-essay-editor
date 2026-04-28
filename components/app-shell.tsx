"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import type React from "react"
import { usesAppChrome } from "@/lib/app-chrome-routes"

const AppChrome = dynamic(
  () => import("@/components/app-chrome").then((mod) => ({ default: mod.AppChrome })),
  { ssr: false }
)

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (usesAppChrome(pathname)) {
    return <AppChrome>{children}</AppChrome>
  }

  return (
    <div id="main-content" className="min-h-screen w-full">
      {children}
    </div>
  )
}
