'use client'

import type React from 'react'
import { ChevronLeft, History } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ImageChatShellProps {
  title: React.ReactNode
  brandColor: string
  userId?: string | null
  userCredits?: number
  onShowHistory: () => void
  children: React.ReactNode
}

export function ImageChatShell({
  title,
  brandColor,
  userId,
  userCredits,
  onShowHistory,
}: ImageChatShellProps) {
  const router = useRouter()

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden relative">
      <div className="flex flex-1 flex-col h-full relative min-w-0">
        {/* 顶部导航栏 */}
        <div className="flex items-center h-14 px-4 border-b border-slate-100 bg-white shrink-0">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium hidden sm:inline">返回</span>
          </button>

          <div className="flex-1 text-center md:text-left md:ml-4">
            <div className="flex items-center justify-center md:justify-start gap-2">
              {title}
            </div>
          </div>

          <div>
            {userId ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-700 font-medium">
                  {userCredits?.toLocaleString()}
                </span>
                <button
                  onClick={onShowHistory}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <History className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/login')}
                  className="px-3 py-1.5 text-xs font-medium text-white rounded-lg"
                  style={{ backgroundColor: brandColor }}
                >
                  登录
                </button>
                <button
                  onClick={onShowHistory}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <History className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 h-0 relative overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
