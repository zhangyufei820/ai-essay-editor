"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { trackCampaignEvent } from "@/lib/campaign-events-client"
import {
  ButtonV2 as Button,
  DialogV2 as Dialog,
  DialogV2Content as DialogContent,
  DialogV2Description as DialogDescription,
  DialogV2Footer as DialogFooter,
  DialogV2Header as DialogHeader,
  DialogV2Title as DialogTitle,
} from "@/components/ui/v2"

export type FreeTrialAnnouncementModalProps = {
  open: boolean
  loggedIn: boolean
  hasTrial: boolean
  paidUser: boolean
  onOpenChange: (open: boolean) => void
  onDismiss: () => void
}

export function FreeTrialAnnouncementModal({
  open,
  loggedIn,
  hasTrial,
  paidUser,
  onOpenChange,
  onDismiss,
}: FreeTrialAnnouncementModalProps) {
  const [claiming, setClaiming] = useState(false)
  const trackedOpenRef = useRef(false)
  const ctaHref = loggedIn && !hasTrial ? "/campaign/free-trial" : "/campaign/free-trial"
  const ctaLabel = loggedIn && !hasTrial ? "立即领取" : "查看计划"

  useEffect(() => {
    if (open && !trackedOpenRef.current) {
      trackedOpenRef.current = true
      void trackCampaignEvent("free_trial_announcement_shown", { loggedIn, hasTrial, paidUser })
    }
    if (!open) {
      trackedOpenRef.current = false
    }
  }, [hasTrial, loggedIn, open, paidUser])

  const handleClaim = async () => {
    void trackCampaignEvent("free_trial_claim_clicked", { loggedIn, hasTrial, paidUser })

    if (!loggedIn || hasTrial) {
      onOpenChange(false)
      return
    }

    setClaiming(true)
    try {
      const response = await fetch("/api/free-trial/claim", {
        method: "POST",
        headers: await getVerifiedAuthHeaders(),
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.ok) {
        void trackCampaignEvent("free_trial_claim_success", { source: "announcement_modal" })
        toast.success("60 天共创体验已领取")
      } else {
        toast.info(data?.message || "请在活动页完成领取")
      }
    } catch (error) {
      console.warn("[FreeTrialAnnouncementModal] claim failed", error)
      toast.info("请在活动页完成领取")
    } finally {
      setClaiming(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>沈翔智学 60 天共创体验计划</DialogTitle>
          <DialogDescription className="space-y-3 leading-7">
            <span className="block">沈翔智学 60 天共创体验计划已开启。</span>
            <span className="block">
              所有注册用户已获得 60 天共创体验资格。每天填写约 90 秒反馈，即可解锁当天 2000 trial
              积分，用于体验 AI 作文批改、闪卡复习等功能。
            </span>
            <span className="block">已付费会员的权益不会受到影响，会员到期时间已顺延 60 天。</span>
          </DialogDescription>
        </DialogHeader>

        {paidUser ? (
          <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-3 text-sm leading-6 text-[var(--ink-600)]">
            已付费用户不会被强制填写问卷。填写反馈可帮助我们优化产品，后续可获得积分奖励。
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void trackCampaignEvent("free_trial_announcement_dismissed", { loggedIn, hasTrial, paidUser })
              onDismiss()
              onOpenChange(false)
            }}
          >
            稍后再说
          </Button>
          {loggedIn && !hasTrial ? (
            <Button type="button" onClick={handleClaim} disabled={claiming}>
              {claiming ? "领取中..." : ctaLabel}
            </Button>
          ) : (
            <Button asChild>
              <Link
                href={ctaHref}
                onClick={() => {
                  void trackCampaignEvent("free_trial_claim_clicked", { loggedIn, hasTrial, paidUser })
                  onOpenChange(false)
                }}
              >
                {ctaLabel}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
