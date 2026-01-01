/**
 * 🎵 useSunoMusic Hook - Suno 音乐生成状态管理
 * 
 * 功能：
 * 1. 管理多个音乐生成任务
 * 2. 自动轮询任务状态
 * 3. 非阻塞 UI（用户可自由滚动）
 * 
 * ⚠️ 安全协议：此 Hook 完全独立，不影响任何现有功能
 */

import { useState, useEffect, useRef, useCallback } from "react"
import { 
  generateMusicStreaming, 
  checkMusicStatus, 
  extractTaskId,
  removeTaskIdFromText 
} from "@/lib/suno-service"
import { SUNO_POLLING_CONFIG, type MusicGenerationResult } from "@/lib/suno-config"

// ============================================
// 类型定义
// ============================================

/** 单个音乐任务状态 */
export interface MusicTask {
  taskId: string
  messageId: string  // 关联的消息 ID
  status: MusicGenerationResult["status"]
  audioUrl?: string
  coverUrl?: string
  title?: string
  duration?: number
  errorMessage?: string
  createdAt: number
  pollCount: number
}

/** Hook 返回值 */
export interface UseSunoMusicReturn {
  /** 所有音乐任务 */
  musicTasks: Map<string, MusicTask>
  /** 根据消息 ID 获取任务 */
  getTaskByMessageId: (messageId: string) => MusicTask | undefined
  /** 开始生成音乐 */
  startMusicGeneration: (
    query: string,
    userId: string,
    messageId: string,
    onTextChunk: (text: string) => void,
    onComplete: (fullText: string) => void
  ) => Promise<void>
  /** 手动重试任务 */
  retryTask: (taskId: string, userId: string) => void
  /** 清除已完成的任务 */
  clearCompletedTasks: () => void
  /** 是否有正在进行的任务 */
  hasActiveTasks: boolean
}

// ============================================
// Hook 实现
// ============================================

export function useSunoMusic(): UseSunoMusicReturn {
  // 音乐任务状态（使用 Map 支持多任务）
  const [musicTasks, setMusicTasks] = useState<Map<string, MusicTask>>(new Map())
  
  // 轮询定时器引用
  const pollingTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // 用户 ID 缓存（用于轮询）
  const userIdRef = useRef<string>("")

  // ============================================
  // 根据消息 ID 获取任务
  // ============================================
  const getTaskByMessageId = useCallback((messageId: string): MusicTask | undefined => {
    for (const task of musicTasks.values()) {
      if (task.messageId === messageId) {
        return task
      }
    }
    return undefined
  }, [musicTasks])

  // ============================================
  // 更新任务状态
  // ============================================
  const updateTask = useCallback((taskId: string, updates: Partial<MusicTask>) => {
    setMusicTasks(prev => {
      const newMap = new Map(prev)
      const existing = newMap.get(taskId)
      if (existing) {
        newMap.set(taskId, { ...existing, ...updates })
      }
      return newMap
    })
  }, [])

  // ============================================
  // 停止轮询
  // ============================================
  const stopPolling = useCallback((taskId: string) => {
    const timer = pollingTimersRef.current.get(taskId)
    if (timer) {
      clearInterval(timer)
      pollingTimersRef.current.delete(taskId)
      console.log(`🛑 [Suno] 停止轮询: ${taskId}`)
    }
  }, [])

  // ============================================
  // 开始轮询任务状态
  // ============================================
  const startPolling = useCallback((taskId: string, userId: string) => {
    // 防止重复轮询
    if (pollingTimersRef.current.has(taskId)) {
      console.log(`⚠️ [Suno] 任务 ${taskId} 已在轮询中`)
      return
    }

    console.log(`🔄 [Suno] 开始轮询: ${taskId}`)
    
    const poll = async () => {
      const task = musicTasks.get(taskId)
      if (!task) {
        stopPolling(taskId)
        return
      }

      // 检查是否超过最大轮询次数
      if (task.pollCount >= SUNO_POLLING_CONFIG.maxAttempts) {
        console.log(`⏰ [Suno] 轮询超时: ${taskId}`)
        updateTask(taskId, {
          status: "ERROR",
          errorMessage: "生成超时，请重试"
        })
        stopPolling(taskId)
        return
      }

      // 查询状态
      const result = await checkMusicStatus(taskId, userId)
      
      // 更新任务状态
      updateTask(taskId, {
        status: result.status,
        audioUrl: result.audioUrl,
        coverUrl: result.coverUrl,
        title: result.title,
        duration: result.duration,
        errorMessage: result.errorMessage,
        pollCount: task.pollCount + 1
      })

      // 如果完成或出错，停止轮询
      if (result.status === "SUCCESS" || result.status === "ERROR") {
        console.log(`✅ [Suno] 任务完成: ${taskId}, 状态: ${result.status}`)
        stopPolling(taskId)
      }
    }

    // 立即执行一次
    poll()

    // 设置定时轮询
    const timer = setInterval(poll, SUNO_POLLING_CONFIG.interval)
    pollingTimersRef.current.set(taskId, timer)
  }, [musicTasks, updateTask, stopPolling])

  // ============================================
  // 开始生成音乐
  // ============================================
  const startMusicGeneration = useCallback(async (
    query: string,
    userId: string,
    messageId: string,
    onTextChunk: (text: string) => void,
    onComplete: (fullText: string) => void
  ) => {
    console.log(`🎵 [Suno] 开始生成音乐: ${query.slice(0, 30)}...`)
    userIdRef.current = userId

    // 调用流式生成 API
    await generateMusicStreaming(
      query,
      userId,
      onTextChunk,
      (result) => {
        onComplete(result.answer)

        // 如果提取到 Task ID，创建任务并开始轮询
        if (result.taskId) {
          const newTask: MusicTask = {
            taskId: result.taskId,
            messageId,
            status: "PENDING",
            createdAt: Date.now(),
            pollCount: 0
          }

          setMusicTasks(prev => {
            const newMap = new Map(prev)
            newMap.set(result.taskId!, newTask)
            return newMap
          })

          // 延迟一点开始轮询，确保状态已更新
          setTimeout(() => {
            startPolling(result.taskId!, userId)
          }, 100)
        }
      }
    )
  }, [startPolling])

  // ============================================
  // 重试任务
  // ============================================
  const retryTask = useCallback((taskId: string, userId: string) => {
    const task = musicTasks.get(taskId)
    if (!task) return

    console.log(`🔄 [Suno] 重试任务: ${taskId}`)
    
    // 重置任务状态
    updateTask(taskId, {
      status: "PENDING",
      pollCount: 0,
      errorMessage: undefined
    })

    // 重新开始轮询
    startPolling(taskId, userId)
  }, [musicTasks, updateTask, startPolling])

  // ============================================
  // 清除已完成的任务
  // ============================================
  const clearCompletedTasks = useCallback(() => {
    setMusicTasks(prev => {
      const newMap = new Map(prev)
      for (const [taskId, task] of newMap) {
        if (task.status === "SUCCESS" || task.status === "ERROR") {
          newMap.delete(taskId)
        }
      }
      return newMap
    })
  }, [])

  // ============================================
  // 计算是否有活跃任务
  // ============================================
  const hasActiveTasks = Array.from(musicTasks.values()).some(
    task => task.status === "PENDING" || task.status === "PROCESSING"
  )

  // ============================================
  // 清理：组件卸载时停止所有轮询
  // ============================================
  useEffect(() => {
    return () => {
      pollingTimersRef.current.forEach((timer, taskId) => {
        clearInterval(timer)
        console.log(`🧹 [Suno] 清理轮询: ${taskId}`)
      })
      pollingTimersRef.current.clear()
    }
  }, [])

  return {
    musicTasks,
    getTaskByMessageId,
    startMusicGeneration,
    retryTask,
    clearCompletedTasks,
    hasActiveTasks
  }
}

// ============================================
// 导出辅助函数
// ============================================

export { extractTaskId, removeTaskIdFromText }
