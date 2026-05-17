"use client"

import { ButtonV2 as Button } from "@/components/ui/v2"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Copy, Loader2, Trash2 } from "lucide-react"
import { ContentCard, type ContentCardShare } from "@/components/sharing/ContentCard"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"

export default function MySharesPage() {
  const [shares, setShares] = useState<ContentCardShare[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    try {
      setLoading(true)
      setMessage(null)
      const response = await fetch("/api/share", {
        headers: await getVerifiedAuthHeaders(),
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "获取我的分享失败")
      setShares(payload.shares || [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "获取我的分享失败")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function copyLink(code: string) {
    const url = `${window.location.origin}/share/${code}`
    await navigator.clipboard.writeText(url)
    setMessage("分享链接已复制")
  }

  async function remove(code: string) {
    const response = await fetch(`/api/share/${code}`, {
      method: "DELETE",
      headers: await getVerifiedAuthHeaders(),
    })
    if (response.ok) {
      setShares((value) => value.filter((item) => item.share_code !== code))
      setMessage("分享已删除")
    } else {
      const payload = await response.json().catch(() => ({}))
      setMessage(payload?.error || "删除失败")
    }
  }

  return (
    <main className="min-h-screen bg-[#f7faf7] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">我的分享</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">管理已发布作品</h1>
            <p className="mt-2 text-sm text-slate-600">查看、复制或下线你分享到创作广场的内容。</p>
          </div>
          <Button asChild>
            <Link href="/explore">进入创作广场</Link>
          </Button>
        </header>

        {message ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{message}</div> : null}
        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500"><Loader2 className="mx-auto mb-2 size-5 animate-spin" />加载中</div> : null}
        {!loading && shares.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="font-medium">还没有分享作品</p>
            <p className="mt-2 text-sm text-slate-600">从聊天、闪卡或图片生成结果中点击“分享到创作广场”。</p>
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shares.map((share) => (
            <div key={share.share_code} className="space-y-2">
              <ContentCard share={share} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => copyLink(share.share_code)} className="flex-1">
                  <Copy className="mr-2 size-4" />
                  复制
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(share.share_code)} className="flex-1 text-rose-600 hover:text-rose-700">
                  <Trash2 className="mr-2 size-4" />
                  删除
                </Button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
