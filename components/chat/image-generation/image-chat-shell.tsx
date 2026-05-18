'use client'

import type React from 'react'
import { ChevronLeft } from 'lucide-react'
import { IconHistory } from "@/components/icons/v2"
import { useRouter } from 'next/navigation'
import { navigateHomeWithSidebar } from '@/lib/workspace-events'

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
  children,
}: ImageChatShellProps) {
  const router = useRouter()

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden relative bg-[var(--paper-50)] text-[var(--ink-900)]">
      <div className="flex flex-1 flex-col h-full relative min-w-0">
        {/* 顶部导航栏 */}
        <div className="flex items-center h-11 md:h-14 px-2 md:px-4 border-b border-[var(--paper-200)] bg-[var(--paper-50)]/85 backdrop-blur-md shrink-0">
          <button
            onClick={() => navigateHomeWithSidebar(router)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-pill)] text-[var(--ink-600)] hover:bg-[var(--ink-50)] hover:text-[var(--ink-800)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
            <span className="text-sm font-medium hidden sm:inline">返回</span>
          </button>

          <div className="flex-1 min-w-0 text-center md:text-left md:ml-4">
            <div className="flex items-center justify-center md:justify-start gap-2">
              {title}
            </div>
          </div>

          <div>
            {userId ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ink-700)] font-medium">
                  {userCredits?.toLocaleString()}
                </span>
                <button
                  onClick={onShowHistory}
                  className="inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--paper-100)] hover:bg-[var(--ink-50)] transition-colors"
                >
                  <IconHistory className="h-4 w-4 text-[var(--ink-600)]" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/login')}
                  className="h-9 rounded-[var(--radius-pill)] px-3 text-xs font-medium text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  登录
                </button>
                <button
                  onClick={onShowHistory}
                  className="inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--radius-pill)] bg-[var(--paper-100)] hover:bg-[var(--ink-50)] transition-colors"
                >
                  <IconHistory className="h-4 w-4 text-[var(--ink-600)]" />
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
