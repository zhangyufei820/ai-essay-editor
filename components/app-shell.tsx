"use client"

import { usePathname } from "next/navigation"
import type React from "react"
import { AppChrome } from "@/components/app-chrome"
import { usesAppChrome } from "@/lib/app-chrome-routes"

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
