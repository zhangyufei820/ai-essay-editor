"use client"

import dynamic from "next/dynamic"
import type React from "react"

import { SidebarProvider } from "@/components/ui/sidebar"

const AppSidebar = dynamic(
  () => import("@/components/app-sidebar").then((mod) => ({ default: mod.AppSidebar })),
  { ssr: false }
)

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div id="main-content" className="flex min-h-screen w-full flex-1 flex-col">
        {children}
      </div>
    </SidebarProvider>
  )
}
