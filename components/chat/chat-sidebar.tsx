"use client"

import { Button } from "@/components/ui/button"
import { Plus, MessageSquare, Trash2, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { format } from "date-fns"

// 模型 key 到显示名称的映射
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "standard": "标准",
  "teaching-pro": "教学 Pro",
  "gpt-5": "GPT-5",
  "claude-opus": "Claude",
  "gemini-pro": "Gemini",
  "banana-2-pro": "Banana",
  "grok-4.2": "Grok",
  "open-claw": "OpenClaw",
  "quanquan-math": "全科数学",
  "quanquan-english": "全科英语",
  "beike-pro": "备课助手",
}

// 获取模型徽章颜色 — 硬编码翡翠绿 #10A37F
function getModelBadgeColor(_modelKey: string): string {
  return "#10A37F"
}

// ✅ 保持类型定义导出，确保父组件不报错
export type ChatSession = {
  id: string
  title: string
  date: number
  preview: string
  ai_model?: string
  ai_provider?: string
  processing_mode?: string
}

interface ChatSidebarProps {
  currentSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
  sessions: ChatSession[]
  onDeleteSession: (sessionId: string) => void
}

export function ChatSidebar({ 
  currentSessionId, 
  onSelectSession, 
  onNewChat, 
  sessions,
  onDeleteSession
}: ChatSidebarProps) {
  
  // --- 核心逻辑：直接按时间倒序排列，无分组 ---
  // 统一使用 MM-DD HH:mm 格式，禁止"今天/昨天"等相对时间

  // 格式化时间戳 — date-fns MM-dd HH:mm
  const formatTime = (timestamp: number) => {
    return format(new Date(timestamp), "MM-dd HH:mm")
  };

  return (
    // 移除 w-72，让父容器控制宽度，避免双重滚动条
    <div className="flex h-full w-full flex-col bg-[#FDFBF7]">
      
      {/* 1. 顶部固定区域：醒目的大按钮 */}
      <div className="p-4 pb-2">
        <Button 
          onClick={onNewChat}
          className="w-full justify-start gap-3 rounded-xl bg-[#0F766E] py-7 text-white shadow-md hover:bg-[#0d655d] hover:shadow-lg transition-all"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
            <Plus className="h-6 w-6" />
          </div>
          <div className="flex flex-col items-start text-left">
            <span className="text-[15px] font-bold tracking-wide">开始新批改</span>
            <span className="text-[11px] opacity-80 font-normal">创建新的作文辅导</span>
          </div>
        </Button>
      </div>

      {/* 2. 滚动列表区域 */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-6 py-4">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center opacity-60 px-4">
              <div className="mb-3 rounded-full bg-slate-100 p-3">
                <MessageSquare className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">暂无历史记录</p>
              <p className="text-xs text-slate-400 mt-1">点击上方按钮开始第一次批改吧！</p>
            </div>
          ) : (
            // 直接按时间倒序排列，无分组
            [...sessions].sort((a, b) => b.date - a.date).map((session) => (
              <div key={session.id} className="group relative">
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectSession(session.id)}
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-lg px-3 py-4 text-left transition-all duration-200",
                        currentSessionId === session.id
                          ? "bg-white text-[#0F766E] shadow-sm ring-1 ring-[#E5E0D6]"
                          : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                      )}
                    >
                      <MessageSquare className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        currentSessionId === session.id ? "text-[#0F766E]" : "text-slate-400 group-hover:text-slate-500"
                      )} />

                      <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-sm font-medium">
                              {session.title || "新对话"}
                            </span>
                            {session.ai_model && session.ai_model !== "standard" && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 bg-emerald-500/10 text-emerald-600"
                              >
                                {MODEL_DISPLAY_NAMES[session.ai_model] || session.ai_model}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal shrink-0">
                            {formatTime(session.date)}
                          </span>
                        </div>
                        <span className="truncate text-[10px] text-slate-400 font-normal mt-0.5">
                          {session.preview || "无预览内容"}
                        </span>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs p-3">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{session.title || "新对话"}</p>
                      <p className="text-xs text-slate-500">{formatTime(session.date)}</p>
                      <p className="text-xs text-slate-600 mt-2 border-t pt-2">
                        {session.preview || "无预览内容"}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>

                {/* 删除按钮 - 悬浮显示 */}
                <div className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100",
                  currentSessionId === session.id && "opacity-100"
                )}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if(confirm("确定删除这条记录吗？")) {
                        onDeleteSession(session.id);
                      }
                    }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors bg-white/80 backdrop-blur-sm shadow-sm"
                    title="删除记录"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
