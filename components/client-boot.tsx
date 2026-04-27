"use client"

import dynamic from "next/dynamic"

const WxGuard = dynamic(() => import("@/components/WxGuard"), { ssr: false })
const InstallPrompt = dynamic(
  () => import("@/components/pwa/InstallPrompt").then((mod) => ({ default: mod.InstallPrompt })),
  { ssr: false }
)

export function ClientBoot() {
  return (
    <>
      <WxGuard />
      <InstallPrompt />
    </>
  )
}
