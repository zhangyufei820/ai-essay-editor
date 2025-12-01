"use client"

import { Button } from "@/components/ui/button"
import { Plus, MessageSquare, Trash2, History } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

// 定义会话类型
export type ChatSession = {
  id: string
  title: string
  date: number
  preview: string
}

interface ChatSidebarProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
  sessions: ChatSession[]
  onDeleteSession: (sessionId: string) => void
}

// ✅ 必须导出 ChatSidebar
export function ChatSidebar({ 
  currentSessionId, 
  onSelectSession, 
  onNewChat, 
  sessions,
  onDeleteSession
}: ChatSidebarProps) {
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-[#E5E0D6] bg-[#FDFBF7]">
      {/* 顶部：新建对话按钮 */}
      <div className="p-4 pb-2">
        <Button 
          onClick={onNewChat}
          className="w-full justify-start gap-2 bg-[#0F766E] text-white shadow-sm hover:bg-[#0d655d] transition-all"
        >
          <Plus className="h-5 w-5" />
          <span className="font-medium">开始新批改</span>
        </Button>
      </div>

      {/* 中间：历史记录列表 */}
      <div className="flex-1 overflow-hidden px-3 py-2">
        <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground/60">
          <History className="h-3 w-3" />
          <span>历史记录</span>
        </div>
        
        <ScrollArea className="h-full">
          <div className="space-y-1.5 pb-4">
            {sessions.length === 0 ? (
              <div className="mt-8 text-center text-sm text-muted-foreground/50">
                <p>暂无历史记录</p>
                <p className="text-xs mt-1">上传作文开始第一次批改吧！</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="group relative flex items-center gap-2">
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className={cn(
                      "flex flex-1 items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-all duration-200",
                      currentSessionId === session.id
                        ? "bg-white text-[#0F766E] shadow-sm ring-1 ring-[#E5E0D6]"
                        : "text-slate-600 hover:bg-[#F3EFE5] hover:text-slate-900"
                    )}
                  >
                    <MessageSquare className={cn(
                      "h-4 w-4 shrink-0",
                      currentSessionId === session.id ? "text-[#0F766E]" : "text-slate-400"
                    )} />
                    <div className="flex flex-1 flex-col overflow-hidden">
                      <span className="truncate font-medium">{session.title || "新对话"}</span>
                      <span className="truncate text-xs text-muted-foreground/60 font-normal">
                        {formatDate(session.date)} · {session.preview}
                      </span>
                    </div>
                  </button>
                  
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id) }}
                    className={cn(
                      "absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-600 group-hover:opacity-100",
                      currentSessionId === session.id && "opacity-0"
                    )}
                    title="删除记录"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}