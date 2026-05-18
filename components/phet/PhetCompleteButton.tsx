"use client"

import { ButtonV2 as Button } from "@/components/ui/v2"
import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { IconSealCheck } from "@/components/icons/v2"

export function PhetCompleteButton({ simId }: { simId: string }) {
  const [startedAt] = useState(() => Date.now())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const storageKey = useMemo(() => `phet-completed:${simId}`, [simId])

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(storageKey)) {
      setMessage("已完成学习")
    }
  }, [storageKey])

  async function complete() {
    setIsSubmitting(true)
    setMessage("")
    try {
      const headers = await getVerifiedAuthHeaders()
      const response = await fetch("/api/lab/record", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          sim_id: simId,
          duration_seconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
          completed: true,
        }),
      })
      const data = await response.json().catch(() => ({}))

      if (response.status === 401) {
        setMessage("登录后可记录学习并领取积分")
        toast.info("登录后可记录学习进度并领取积分。")
        return
      }
      if (!response.ok) {
        throw new Error(data?.error || "记录失败")
      }

      localStorage.setItem(storageKey, "1")
      const earned = Number(data?.xp_earned || 0)
      setMessage(earned > 0 ? `完成学习，获得 ${earned} 积分` : "已完成学习")
      toast.success(earned > 0 ? `完成学习，获得 ${earned} 积分` : "学习记录已更新")
    } catch (error) {
      const text = error instanceof Error ? error.message : "记录失败"
      setMessage(text)
      toast.error(text)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" className="w-full" onClick={complete} disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <IconSealCheck className="h-4 w-4" />}
        完成学习
      </Button>
      {message ? <p className="text-center text-xs text-[var(--ink-700)] dark:text-[var(--ink-300)]">{message}</p> : null}
    </div>
  )
}
