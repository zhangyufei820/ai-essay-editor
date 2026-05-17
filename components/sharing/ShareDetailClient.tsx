"use client"

import { ButtonV2 as Button } from "@/components/ui/v2"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Copy, Heart, Loader2, MessageCircle, Share2 } from "lucide-react"
import { ShareContentRenderer } from "@/components/sharing/ShareContentRenderer"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

type ShareDetail = {
  id: string
  share_code: string
  title: string
  content_type: string
  content_data: Record<string, unknown>
  preview_text?: string | null
  thumbnail_url?: string | null
  type_label?: string
  subject_label?: string | null
  like_count: number
  comment_count: number
  view_count: number
  is_liked?: boolean
  created_at?: string | null
}

type Comment = {
  id: string
  user_id: string
  comment_text: string
  created_at: string
}

function ctaForType(type: string) {
  if (type === "essay_review") return { text: "想让 AI 帮你批改作文？", href: "/essay" }
  if (type === "image") return { text: "想用 AI 生成精美图片？", href: "/chat/creative-image-gemini" }
  if (type === "flashcard_deck") return { text: "想用 AI 自动生成复习闪卡？", href: "/flashcards" }
  if (type === "manim_video") return { text: "想用 AI 制作数学动画？", href: "/chat?agent=open-claw" }
  return { text: "想体验 AI 学习助手？", href: "/chat" }
}

export function ShareDetailClient({ initialShare }: { initialShare: ShareDetail }) {
  const [share, setShare] = useState(initialShare)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const cta = ctaForType(share.content_type)

  const loadComments = useCallback(async () => {
    const response = await fetch(`/api/share/${share.share_code}/comments`, { cache: "no-store" })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) setComments(payload.comments || [])
  }, [share.share_code])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  async function handleLike() {
    const previous = share
    const nextLiked = !share.is_liked
    setShare((value) => ({
      ...value,
      is_liked: nextLiked,
      like_count: Math.max(0, value.like_count + (nextLiked ? 1 : -1)),
    }))
    const response = await fetch(`/api/share/${share.share_code}/like`, {
      method: "POST",
      headers: await getVerifiedAuthHeaders(),
    })
    const payload = await response.json().catch(() => ({}))
    if (response.ok) {
      setShare((value) => ({ ...value, is_liked: payload.liked, like_count: payload.like_count }))
    } else {
      setShare(previous)
      setMessage(payload?.error || "点赞失败，请先登录")
    }
  }

  async function handleComment() {
    if (commentText.trim().length < 2) {
      setMessage("评论至少 2 个字")
      return
    }
    setSubmitting(true)
    const response = await fetch(`/api/share/${share.share_code}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getVerifiedAuthHeaders()),
      },
      body: JSON.stringify({ comment_text: commentText.trim() }),
    })
    const payload = await response.json().catch(() => ({}))
    setSubmitting(false)
    if (response.ok) {
      setComments((value) => [...value, payload.comment])
      setShare((value) => ({ ...value, comment_count: payload.comment_count }))
      setCommentText("")
      setMessage("评论已发布")
    } else {
      setMessage(payload?.error || "评论失败，请先登录")
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    await fetch(`/api/share/${share.share_code}/external-share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getVerifiedAuthHeaders()),
      },
      body: JSON.stringify({ channel: "copy_link" }),
    }).catch(() => null)
    setMessage("链接已复制")
  }

  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/explore" className="inline-flex items-center gap-2 text-sm text-[var(--ink-600)] hover:text-[var(--ink-900)]">
            <ArrowLeft className="size-4" />
            返回创作广场
          </Link>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyLink}>
              <Copy className="mr-2 size-4" />
              复制链接
            </Button>
            <Button variant="outline" onClick={copyLink}>
              <Share2 className="mr-2 size-4" />
              分享
            </Button>
          </div>
        </header>

        <section className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 sm:p-7">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[var(--ink-50)] px-2 py-1 font-medium text-[var(--ink-700)]">{share.type_label}</span>
            {share.subject_label ? <span className="rounded-full bg-[var(--paper-100)] px-2 py-1 text-[var(--ink-600)]">{share.subject_label}</span> : null}
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-normal sm:text-3xl">{share.title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--ink-600)]">{share.preview_text}</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--ink-500)]">
            <span>{share.view_count} 次查看</span>
            <span>{share.like_count} 赞</span>
            <span>{share.comment_count} 评论</span>
          </div>
        </section>

        <section className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 sm:p-7">
          <ShareContentRenderer share={share} />
          <div className="mt-6 border-t border-[var(--paper-100)] pt-5">
            <Button onClick={handleLike} variant={share.is_liked ? "primary" : "outline"}>
              <Heart className={`mr-2 size-4 ${share.is_liked ? "fill-current" : ""}`} />
              {share.is_liked ? "已点赞" : "点赞"} · {share.like_count}
            </Button>
          </div>
        </section>

        <section className="rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><MessageCircle className="size-5" />评论</h2>
          <div className="mt-4 space-y-3">
            {comments.length ? comments.map((comment) => (
              <div key={comment.id} className="rounded-[var(--radius-sharp)] bg-[var(--paper-50)] p-4">
                <p className="text-sm leading-6 text-[var(--ink-700)]">{comment.comment_text}</p>
                <p className="mt-2 text-xs text-[var(--ink-400)]">{new Date(comment.created_at).toLocaleString("zh-CN")}</p>
              </div>
            )) : <p className="text-sm text-[var(--ink-500)]">还没有评论，来写第一条。</p>}
          </div>
          <div className="mt-5 space-y-3">
            <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} rows={3} maxLength={500} placeholder="写下你的想法..." className="w-full resize-none rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-4 py-3 text-sm outline-none focus:border-[var(--ink-500)]" />
            <Button onClick={handleComment} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              发表评论
            </Button>
          </div>
          {message ? <p className="mt-3 text-sm text-[var(--ink-500)]">{message}</p> : null}
        </section>

        <section className="rounded-[var(--radius-sharp)] bg-[var(--ink-900)] p-6 text-white sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-xl font-semibold">{cta.text}</p>
            <p className="mt-2 text-sm text-emerald-100">注册后即可体验沈翔智学的 AI 学习工具。</p>
          </div>
          <Button asChild className="mt-4 bg-[var(--paper-50)] text-[var(--ink-900)] hover:bg-[var(--ink-50)] sm:mt-0">
            <Link href={cta.href}>立即体验</Link>
          </Button>
        </section>
      </div>
    </main>
  )
}
