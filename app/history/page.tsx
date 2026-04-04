"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { LoadingStateCard } from "@/components/ui/LoadingStateCard"
import { MessageSquare, FileText, Clock } from "lucide-react"
import Link from "next/link"

type ChatSession = {
  id: string
  title: string
  processing_mode: string
  ai_provider: string
  created_at: string
  created_at: string
}

type EssayReview = {
  id: string
  original_text: string
  writer_style: string
  score: number
  created_at: string
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [reviews, setReviews] = useState<EssayReview[]>([])
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    // Check if user is logged in
    const userStr = localStorage.getItem('currentUser')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        const uid = user.id || user.sub || user.userId || user.user_id
        if (uid) {
          setIsLoggedIn(true)
        }
      } catch (e) {
        console.error("[v0] Parse user error:", e)
      }
    }
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      // Get user ID from localStorage
      const userStr = localStorage.getItem('currentUser')
      let userId = ''
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          userId = user.id || user.sub || user.userId || user.user_id || ''
        } catch (e) {
          console.error("[v0] Parse user error:", e)
        }
      }

      const headers: Record<string, string> = {}
      if (userId) {
        headers['X-User-Id'] = userId
      }

      const [sessionsRes, reviewsRes] = await Promise.all([
        fetch("/api/chat-session", { headers }),
        fetch("/api/save-essay-review", { headers })
      ])

      // Handle sessions response
      if (sessionsRes.status === 401) {
        // User not logged in
        setIsLoggedIn(false)
        setSessions([])
      } else if (sessionsRes.ok) {
        const { sessions } = await sessionsRes.json()
        setSessions(sessions || [])
        if (sessions && sessions.length > 0) {
          setIsLoggedIn(true)
        }
      }

      // Handle reviews response
      if (reviewsRes.status === 401) {
        // User not logged in - reviews also require auth
        setReviews([])
      } else if (reviewsRes.ok) {
        const { reviews } = await reviewsRes.json()
        setReviews(reviews || [])
      }
    } catch (error) {
      console.error("[v0] Load history error:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto flex min-h-screen items-center justify-center">
        <LoadingStateCard modelKey="standard" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 ml-14 sm:ml-0">
      <h1 className="mb-8 text-3xl font-bold">历史记录</h1>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 聊天会话历史 */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <h2 className="text-xl font-semibold">聊天会话</h2>
            <Badge variant="secondary">{sessions.length}</Badge>
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {!isLoggedIn ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground mb-4">请先登录后查看历史记录</p>
                  <Button asChild>
                    <Link href="/login">去登录</Link>
                  </Button>
                </Card>
              ) : sessions.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">暂无聊天记录</p>
                </Card>
              ) : (
                sessions.map((session) => (
                  <Card key={session.id} className="p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <h3 className="font-medium">{session.title}</h3>
                      <Badge variant="outline">{session.processing_mode}</Badge>
                    </div>
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(session.created_at).toLocaleString("zh-CN")}
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/chat?session=${session.id}`}>继续对话</Link>
                    </Button>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 作文批改历史 */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <h2 className="text-xl font-semibold">作文批改</h2>
            <Badge variant="secondary">{reviews.length}</Badge>
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {reviews.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">暂无批改记录</p>
                </Card>
              ) : (
                reviews.map((review) => (
                  <Card key={review.id} className="p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <p className="line-clamp-2 text-sm">{review.original_text}</p>
                      {review.score && (
                        <Badge variant="default" className="ml-2">
                          {review.score}分
                        </Badge>
                      )}
                    </div>
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="outline">{review.writer_style}</Badge>
                      <Clock className="h-3 w-3" />
                      {new Date(review.created_at).toLocaleString("zh-CN")}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
