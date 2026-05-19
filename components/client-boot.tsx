"use client"

import dynamic from "next/dynamic"

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

export function ClientBoot() {
  return (
    <>
      <WxGuard />
      <InstallPrompt />
      {freeTrialCampaignEnabled ? <DailySurveyAutoPrompt /> : null}
    </>
  )
}
