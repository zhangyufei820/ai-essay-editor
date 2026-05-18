import type { Metadata } from "next"
import DOMPurify from "isomorphic-dompurify"
import { notFound } from "next/navigation"
import { ShareDetailClient } from "@/components/sharing/ShareDetailClient"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { publicShareSelect, toPublicShare, type SharedContentRow } from "@/lib/sharing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SharePageProps = {
  params: Promise<{ id: string }>
}

async function getShareByCode(shareCode: string, incrementView = false) {
  const safeShareCode = DOMPurify.sanitize(shareCode).trim()
  if (!safeShareCode) return null

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("shared_contents")
    .select(publicShareSelect())
    .eq("share_code", safeShareCode)
    .in("visibility", ["public", "unlisted"])
    .eq("status", "published")
    .maybeSingle()

  if (error) {
    console.error("[SharePage] load failed:", error)
    return null
  }

  if (!data) return null

  const row = data as unknown as SharedContentRow

  if (incrementView) {
    await supabase
      .from("shared_contents")
      .update({ view_count: Number(row.view_count || 0) + 1 })
      .eq("id", row.id)
  }

  return toPublicShare({
    ...row,
    view_count: Number(row.view_count || 0) + (incrementView ? 1 : 0),
  })
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { id } = await params
  const share = await getShareByCode(id)
  if (!share) {
    return {
      title: "分享内容不存在 | 沈翔智学",
    }
  }

  return {
    title: `${share.title} | 创作广场`,
    description: share.preview_text || "查看沈翔智学用户公开分享的 AI 学习作品。",
  }
}

export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params
  const share = await getShareByCode(id, true)
  if (!share) notFound()

  return <ShareDetailClient initialShare={share} />
}
