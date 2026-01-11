/**
 * 🎵 Suno 专业模式表单使用示例
 * 
 * 这是一个独立的演示组件，展示如何在界面中使用 SunoProForm
 * 可以直接复制相关代码到您的页面中使用
 */

"use client"

import React, { useState } from "react"
import { SunoProForm, type SunoFormData } from "@/components/chat/SunoProForm"
import { useSunoMusic } from "@/hooks/useSunoMusic"
import { Button } from "@/components/ui/button"
import { Settings2, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

interface SunoProFormDemoProps {
  userId: string
  className?: string
}

/**
 * Suno 专业模式面板
 * 
 * 使用方法：
 * 1. 在您的页面中导入此组件
 * 2. 传入用户 ID
 * 3. 组件会自动处理表单提交和任务轮询
 */
export function SunoProFormDemo({ userId, className }: SunoProFormDemoProps) {
  // 切换简单模式/专业模式
  const [isProMode, setIsProMode] = useState(false)
  
  // 使用 Suno Hook
  const {
    startMusicGenerationPro,
    hasActiveTasks,
    musicTasks,
    getTaskByMessageId
  } = useSunoMusic()
  
  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentResponse, setCurrentResponse] = useState<string>("")
  const [currentMessageId, setCurrentMessageId] = useState<string>("")

  // 处理专业模式表单提交
  const handleProFormSubmit = async (formData: SunoFormData) => {
    console.log("🎵 [Demo] 专业模式提交:", formData)
    
    // 生成消息 ID
    const messageId = `suno-pro-${Date.now()}`
    setCurrentMessageId(messageId)
    setIsGenerating(true)
    setCurrentResponse("")
    
    // 调用专业模式生成
    await startMusicGenerationPro(
      formData,
      userId,
      messageId,
      // 流式文本回调
      (text) => {
        setCurrentResponse(text)
      },
      // 完成回调
      (fullText) => {
        setIsGenerating(false)
        console.log("🎵 [Demo] 生成完成:", fullText.slice(0, 100))
      }
    )
  }

  // 获取当前任务状态
  const currentTask = currentMessageId ? getTaskByMessageId(currentMessageId) : undefined

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* 模式切换按钮 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
        <h2 className="text-lg font-semibold text-slate-800">🎵 AI 音乐创作</h2>
        <div className="flex items-center gap-2">
          <Button
            variant={!isProMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsProMode(false)}
            className="text-xs"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1" />
            简单模式
          </Button>
          <Button
            variant={isProMode ? "default" : "outline"}
            size="sm"
            onClick={() => setIsProMode(true)}
            className="text-xs"
          >
            <Settings2 className="h-3.5 w-3.5 mr-1" />
            专业模式
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4 bg-slate-50">
        {isProMode ? (
          // 专业模式表单
          <div className="max-w-2xl mx-auto">
            <SunoProForm
              onSubmit={handleProFormSubmit}
              isLoading={isGenerating}
              disabled={hasActiveTasks}
            />
            
            {/* AI 响应区域 */}
            {currentResponse && (
              <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-medium text-slate-600 mb-2">AI 响应</h3>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">
                  {currentResponse}
                </div>
              </div>
            )}
            
            {/* 任务状态 */}
            {currentTask && (
              <div className="mt-4 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <h3 className="text-sm font-medium text-emerald-700 mb-2">任务状态</h3>
                <div className="text-sm text-emerald-600">
                  <p>Task ID: {currentTask.taskId}</p>
                  <p>状态: {currentTask.globalStatus}</p>
                  <p>歌曲 1: {currentTask.songs[0].status}</p>
                  <p>歌曲 2: {currentTask.songs[1].status}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          // 简单模式提示
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-slate-400">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">简单模式</p>
              <p className="text-sm mt-2">直接在聊天框中输入您的音乐创意</p>
              <p className="text-xs mt-4 text-slate-300">
                点击右上角"专业模式"获取更多控制选项
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SunoProFormDemo
