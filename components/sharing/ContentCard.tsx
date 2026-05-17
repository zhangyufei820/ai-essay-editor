import Link from "next/link"
import Image from "next/image"
import { Eye, FileText, Heart, MessageCircle, Sparkles } from "lucide-react"

export type ContentCardShare = {
  share_code: string
  title: string
  content_type?: string
  preview_text?: string | null
  thumbnail_url?: string | null
  type_label?: string
  subject_label?: string | null
  like_count?: number
  comment_count?: number
  view_count?: number
  is_featured?: boolean
  created_at?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
}

function GeneratedCover({ share }: { share: ContentCardShare }) {
  return (
    <div className="flex h-full flex-col justify-between bg-[linear-gradient(135deg,#f8fbf8_0%,#eef8f0_52%,#fff7ed_100%)] p-5">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[var(--paper-50)]/80 px-3 py-1 text-xs font-medium text-[var(--ink-700)] shadow-sm">
          {share.type_label || "学习作品"}
        </span>
        <Sparkles className="size-5 text-[var(--ink-700)]" />
      </div>
      <div className="rounded-[var(--radius-sharp)] border border-white/80 bg-[var(--paper-50)]/80 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-center gap-2 text-[var(--ink-800)]">
          <FileText className="size-4" />
          <span className="text-xs font-semibold">AI 完整修改稿</span>
        </div>
        <p className="line-clamp-3 text-lg font-semibold leading-snug text-[var(--ink-900)]">{share.title}</p>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--ink-600)]">
          {share.preview_text || "打开查看用户作品与 AI 修改后的完整排版。"}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px] text-[var(--ink-900)]/65">
        <span className="h-1.5 rounded-full bg-emerald-200" />
        <span className="h-1.5 rounded-full bg-amber-200" />
        <span className="h-1.5 rounded-full bg-[var(--paper-200)]" />
      </div>
    </div>
  )
}

export function ContentCard({ share }: { share: ContentCardShare }) {
  return (
    <Link href={`/share/${share.share_code}`} className="group block overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] transition hover:-translate-y-0.5 hover:border-[var(--ink-200)] hover:shadow-lg">
      <div className="relative aspect-[4/3] bg-[var(--paper-50)]">
        {share.thumbnail_url ? (
          <Image src={share.thumbnail_url} alt={share.title} fill className="object-cover" unoptimized />
        ) : (
          <GeneratedCover share={share} />
        )}
        {share.is_featured ? <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2 py-1 text-xs font-semibold text-amber-950">精选</span> : null}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--ink-50)] px-2 py-1 text-xs font-medium text-[var(--ink-700)]">{share.type_label || "学习作品"}</span>
          {share.subject_label ? <span className="rounded-full bg-[var(--paper-100)] px-2 py-1 text-xs text-[var(--ink-600)]">{share.subject_label}</span> : null}
        </div>
        <div>
          <h3 className="line-clamp-2 font-semibold text-[var(--ink-900)] group-hover:text-[var(--ink-800)]">{share.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--ink-600)]">{share.preview_text || "打开查看完整内容"}</p>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--ink-500)]">
          <span>{formatDate(share.created_at)}</span>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Heart className="size-3.5" />{share.like_count || 0}</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{share.comment_count || 0}</span>
            <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />{share.view_count || 0}</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
