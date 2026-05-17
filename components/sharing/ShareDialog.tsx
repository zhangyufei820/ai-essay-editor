"use client"

import {
  ButtonV2 as Button,
  DialogV2 as Dialog,
  DialogV2Content as DialogContent,
  DialogV2Description as DialogDescription,
  DialogV2Header as DialogHeader,
  DialogV2Title as DialogTitle,
  DialogV2Trigger as DialogTrigger,
  InputV2 as Input,
  TextareaV2 as Textarea
} from "@/components/ui/v2"
import { useState } from "react"
import { Copy, Loader2, Share2 } from "lucide-react"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

type ShareDialogProps = {
  trigger?: React.ReactNode
  title: string
  contentType: string
  contentData: Record<string, unknown>
  description?: string
  subject?: string
  tags?: string[]
  thumbnailUrl?: string
  aiModelUsed?: string
  onShared?: (shareUrl: string) => void
}

export function ShareDialog({
  trigger,
  title,
  contentType,
  contentData,
  description = "",
  subject,
  tags = [],
  thumbnailUrl,
  aiModelUsed,
  onShared,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false)
  const [shareTitle, setShareTitle] = useState(title)
  const [shareDescription, setShareDescription] = useState(description)
  const [visibility, setVisibility] = useState("public")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  async function handleShare() {
    try {
      setSubmitting(true)
      setMessage(null)
      const response = await fetch("/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          content_type: contentType,
          title: shareTitle,
          description: shareDescription,
          content_data: contentData,
          subject,
          tags,
          thumbnail_url: thumbnailUrl,
          ai_model_used: aiModelUsed,
          visibility,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "分享失败")
      setShareUrl(payload.shareUrl)
      setMessage(payload.reward?.message || "分享成功")
      onShared?.(payload.shareUrl)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分享失败")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setMessage("链接已复制")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">
            <Share2 className="mr-2 size-4" />
            分享到创作广场
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>分享到创作广场</DialogTitle>
          <DialogDescription>公开展示优质 AI 学习成果，分享成功可获得积分奖励。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">标题</label>
            <Input value={shareTitle} onChange={(event) => setShareTitle(event.target.value)} maxLength={80} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">分享语</label>
            <Textarea value={shareDescription} onChange={(event) => setShareDescription(event.target.value)} rows={3} maxLength={300} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">可见性</label>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="public">公开</option>
              <option value="unlisted">仅链接可见</option>
            </select>
          </div>
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">分享后可获得 +5 积分，社交奖励每日上限 30 积分。</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {shareUrl ? (
              <Button type="button" variant="outline" onClick={copyLink}>
                <Copy className="mr-2 size-4" />
                复制链接
              </Button>
            ) : null}
            <Button type="button" onClick={handleShare} disabled={submitting || !shareTitle.trim()}>
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Share2 className="mr-2 size-4" />}
              {shareUrl ? "再次分享" : "分享"}
            </Button>
          </div>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
