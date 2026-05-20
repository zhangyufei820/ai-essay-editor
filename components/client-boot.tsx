"use client"

import dynamic from "next/dynamic"
import { useEffect } from "react"

const WxGuard = dynamic(() => import("@/components/WxGuard"), { ssr: false })
const InstallPrompt = dynamic(
  () => import("@/components/pwa/InstallPrompt").then((mod) => ({ default: mod.InstallPrompt })),
  { ssr: false }
)
const DailySurveyAutoPrompt = dynamic(
  () => import("@/components/trial/DailySurveyAutoPrompt").then((mod) => ({ default: mod.DailySurveyAutoPrompt })),
  { ssr: false }
)

const freeTrialCampaignEnabled = process.env.NEXT_PUBLIC_FREE_TRIAL_CAMPAIGN_ENABLED !== "false"

function DialogPointerEventsRecovery() {
  useEffect(() => {
    if (typeof document === "undefined") return

    const unlockIfNoDialogIsOpen = () => {
      const openDialog = document.querySelector(
        '[data-slot="dialog-v2-content"][data-state="open"], [role="dialog"][data-state="open"]'
      )
      if (!openDialog && document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }
    }

    unlockIfNoDialogIsOpen()
    const interval = window.setInterval(unlockIfNoDialogIsOpen, 1000)
    document.addEventListener("pointerdown", unlockIfNoDialogIsOpen, true)
    document.addEventListener("keydown", unlockIfNoDialogIsOpen, true)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("pointerdown", unlockIfNoDialogIsOpen, true)
      document.removeEventListener("keydown", unlockIfNoDialogIsOpen, true)
    }
  }, [])

  return null
}

export function ClientBoot() {
  return (
    <>
      <DialogPointerEventsRecovery />
      <WxGuard />
      <InstallPrompt />
      {freeTrialCampaignEnabled ? <DailySurveyAutoPrompt /> : null}
    </>
  )
}
