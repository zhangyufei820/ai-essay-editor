import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { publicShareSelect, type SharedContentRow, toPublicShare } from "@/lib/sharing"
import { ShareDetailClient } from "@/components/sharing/ShareDetailClient"
import { ShareContentRenderer } from "@/components/sharing/ShareContentRenderer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PageProps = { params: Promise<{ id: string }> }

async function loadNewShare(code: string) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("shared_contents")
      .select(publicShareSelect())
      .eq("share_code", code)
      .in("visibility", ["public", "unlisted"])
      .eq("status", "published")
      .maybeSingle()
    if (error) {
      if (error.code === "42P01") return null
      throw error
    }
    if (!data) return null
    const row = data as unknown as SharedContentRow
    await getSupabaseAdmin()
      .from("shared_contents")
      .update({ view_count: Number(row.view_count || 0) + 1 })
      .eq("id", row.id)
    return toPublicShare({ ...row, view_count: Number(row.view_count || 0) + 1 })
  } catch (error) {
    console.error("[SharePage] load new share failed:", error)
    return null
  }
}

async function loadLegacyShare(code: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  const supabase = createClient(url, key)
  const { data, error } = await supabase
    .from("shared_content")
    .select("content,title,view_count,created_at")
    .eq("share_id", code)
    .maybeSingle()
  if (error || !data) return null
  await supabase.from("shared_content").update({ view_count: Number(data.view_count || 0) + 1 }).eq("share_id", code)
  return data
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const share = await loadNewShare(id)
  if (!share) {
    return {
      title: "分享内容 | 沈翔智学",
      description: "查看沈翔智学用户分享的 AI 学习作品。",
    }
  }
  const title = `${share.title} | 沈翔智学创作广场`
  const description = share.preview_text || "查看沈翔智学用户分享的 AI 学习作品。"
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `https://shenxiang.school/share/${id}`,
      images: [`https://shenxiang.school/api/share/${id}/og-image`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`https://shenxiang.school/api/share/${id}/og-image`],
    },
  }
}

type LegacyShare = {
  content?: string | null
  title?: string | null
  view_count?: number | null
  created_at?: string | null
}

function isLegacyMessage(value: unknown): value is { role?: string; content?: string } {
  return Boolean(value && typeof value === "object" && "content" in value)
}

function LegacyShareView({ share }: { share: LegacyShare }) {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(share.content || "{}") as Record<string, unknown>
  } catch {
    parsed = { type: "single", content: share.content }
  }
  const messages = Array.isArray(parsed.messages) ? parsed.messages.filter(isLegacyMessage) : []
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")
  const firstUser = messages.find((message) => message.role === "user")
  const syntheticShare = {
    content_type: "general",
    title: share.title || "AI 学习作品分享",
    preview_text: lastAssistant?.content || String(parsed.content || share.content || ""),
    thumbnail_url: null,
    subject_label: null,
    content_data: {
      type: "learning_work",
      user_prompt: firstUser?.content || "",
      ai_result: lastAssistant?.content || String(parsed.content || share.content || ""),
      source_message_count: messages.length,
    },
  }

  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/explore" className="text-sm text-slate-600 hover:text-slate-950">返回创作广场</Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-emerald-700"><GraduationCap className="size-5" />旧版分享</div>
          <h1 className="mt-3 text-2xl font-semibold">{share.title || "AI 对话分享"}</h1>
          <p className="mt-2 text-sm text-slate-500">{Number(share.view_count || 0) + 1} 次查看</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <ShareContentRenderer share={syntheticShare} />
        </section>
        <section className="rounded-2xl bg-emerald-900 p-6 text-white sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-xl font-semibold">想体验 AI 学习助手？</p>
            <p className="mt-2 text-sm text-emerald-100">注册后即可体验沈翔智学。</p>
          </div>
          <Button asChild className="mt-4 bg-white text-emerald-900 hover:bg-emerald-50 sm:mt-0">
            <Link href="/chat">立即体验</Link>
          </Button>
        </section>
      </div>
    </main>
  )
}

export default async function SharePage({ params }: PageProps) {
  const { id } = await params
  const share = await loadNewShare(id)
  if (share) {
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: share.title,
      description: share.preview_text,
      url: `https://shenxiang.school/share/${id}`,
    }
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ShareDetailClient initialShare={share} />
      </>
    )
  }

  const legacy = await loadLegacyShare(id)
  if (legacy) return <LegacyShareView share={legacy} />
  notFound()
}
