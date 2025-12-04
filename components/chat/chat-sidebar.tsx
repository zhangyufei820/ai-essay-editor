"use client"

import { Button } from "@/components/ui/button"
import { Plus, MessageSquare, Trash2, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

// ✅ 保持类型定义导出，确保父组件不报错
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

export function ChatSidebar({ 
  currentSessionId, 
  onSelectSession, 
  onNewChat, 
  sessions,
  onDeleteSession
}: ChatSidebarProps) {
  
  // --- 核心逻辑：原生 JS 实现时间分组 (无需安装额外插件) ---
  const getGroupLabel = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    
    // 清除时分秒，只比较日期
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (target.getTime() === today.getTime()) return "今天";
    if (target.getTime() === yesterday.getTime()) return "昨天";
    
    // 7天内
    const diffTime = Math.abs(today.getTime() - target.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays <= 7) return "过去 7 天";

    return "更早";
  };

  // 对会话进行分组
  const groupedSessions = sessions.reduce((groups, session) => {
    const label = getGroupLabel(session.date);
    if (!groups[label]) groups[label] = [];
    groups[label].push(session);
    return groups;
  }, {} as Record<string, ChatSession[]>);

  // 定义分组显示的顺序
  const groupOrder = ["今天", "昨天", "过去 7 天", "更早"];

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
            groupOrder.map((groupLabel) => {
              const groupItems = groupedSessions[groupLabel];
              if (!groupItems || groupItems.length === 0) return null;

              return (
                <div key={groupLabel}>
                  {/* 分组标题 */}
                  <h4 className="mb-2 px-3 text-xs font-bold text-slate-400/80 uppercase tracking-wider">
                    {groupLabel}
                  </h4>
                  
                  <div className="space-y-1">
                    {groupItems.map((session) => (
                      <div key={session.id} className="group relative">
                        <button
                          onClick={() => onSelectSession(session.id)}
                          className={cn(
                            "relative flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-all duration-200",
                            currentSessionId === session.id
                              ? "bg-white text-[#0F766E] shadow-sm ring-1 ring-[#E5E0D6]" // 选中状态
                              : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900" // 悬停状态
                          )}
                        >
                          <MessageSquare className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            currentSessionId === session.id ? "text-[#0F766E]" : "text-slate-400 group-hover:text-slate-500"
                          )} />
                          
                          <div className="flex flex-1 flex-col overflow-hidden">
                            <span className="truncate text-sm font-medium">
                              {session.title || "新对话"}
                            </span>
                            <span className="truncate text-[10px] text-slate-400 font-normal mt-0.5">
                              {session.preview || "无预览内容"}
                            </span>
                          </div>
                        </button>
                        
                        {/* 删除按钮 - 悬浮显示 */}
                        <div className={cn(
                          "absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100",
                          // 如果是移动端或者触摸屏，可能需要一直显示，这里暂时只做悬浮
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
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}