/**
 * 🎵 useSunoMusic Hook - Suno 音乐生成状态管理
 * 
 * 功能：
 * 1. 管理多个音乐生成任务
 * 2. 自动轮询任务状态（5秒间隔）
 * 3. 🔥 增量渲染 - 两首歌独立显示，不等待批量完成
 * 4. 非阻塞 UI（用户可自由滚动）
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
import { 
  SUNO_POLLING_CONFIG, 
  type MusicGenerationResult,
  type SongSlotStatus,
  type SongSlot
} from "@/lib/suno-config"

// ============================================
// 类型定义
// ============================================

/** 单个音乐任务状态 - 🔥 支持双槽位独立状态 */
export interface MusicTask {
  taskId: string
  messageId: string  // 关联的消息 ID
  /** 全局状态（用于判断是否继续轮询） */
  globalStatus: MusicGenerationResult["status"]
  /** 🔥 双槽位独立状态 */
  songs: [SongSlot, SongSlot]
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
  /** 🔥 当前会话 ID（用于多轮对话） */
  conversationId: string | null
  /** 开始生成音乐 */
  startMusicGeneration: (
    query: string,
    userId: string,
    messageId: string,
    taskMode: string,  // 🔥 Suno 模式参数
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
// 辅助函数：创建初始双槽位
// ============================================
function createInitialSongs(): [SongSlot, SongSlot] {
  return [
    { id: 1, status: "loading" },
    { id: 2, status: "loading" }
  ]
}

// ============================================
// Hook 实现
// ============================================

export function useSunoMusic(): UseSunoMusicReturn {
  // 音乐任务状态（使用 Map 支持多任务）
  const [musicTasks, setMusicTasks] = useState<Map<string, MusicTask>>(new Map())
  
  // 🔥 会话 ID 状态（用于保持多轮对话连续性）
  const [conversationId, setConversationId] = useState<string | null>(null)
  
  // 🔥 使用 ref 存储最新的 musicTasks，解决轮询闭包问题
  const musicTasksRef = useRef<Map<string, MusicTask>>(new Map())
  
  // 同步 state 到 ref
  useEffect(() => {
    musicTasksRef.current = musicTasks
  }, [musicTasks])
  
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
  // 🔥 轮询任务状态 - 增量渲染逻辑
  // ============================================
  const pollTaskStatus = useCallback(async (taskId: string, userId: string) => {
    // 从 ref 获取最新状态，避免闭包问题
    const task = musicTasksRef.current.get(taskId)
    
    if (!task) {
      console.log(`⚠️ [Suno] 任务不存在，停止轮询: ${taskId}`)
      stopPolling(taskId)
      return
    }

    // 检查是否超过最大轮询次数（5分钟超时）
    if (task.pollCount >= SUNO_POLLING_CONFIG.maxAttempts) {
      console.log(`⏰ [Suno] 轮询超时: ${taskId}，已轮询 ${task.pollCount} 次`)
      updateTask(taskId, {
        globalStatus: "ERROR",
        errorMessage: "生成超时（5分钟），请重试"
      })
      stopPolling(taskId)
      return
    }

    console.log(`🔄 [Suno] 轮询中: ${taskId}，第 ${task.pollCount + 1} 次`)

    try {
      // 调用 Agent B 查询状态
      const result = await checkMusicStatus(taskId, userId)
      
      // 🔥 增量渲染：独立更新每个槽位
      const currentSongs = [...task.songs] as [SongSlot, SongSlot]
      
      // 🔥 槽位 1：如果有 URL 且当前还在 loading，更新为 ready
      if (result.audioUrl && currentSongs[0].status === "loading") {
        console.log(`✅ [Suno] 歌曲 1 已就绪: ${taskId}`)
        currentSongs[0] = {
          id: 1,
          status: "ready",
          audioUrl: result.audioUrl,
          coverUrl: result.coverUrl,
          title: result.title,
          duration: result.duration
        }
      }
      
      // 🔥 槽位 2：如果有 URL 且当前还在 loading，更新为 ready
      if (result.audioUrl2 && currentSongs[1].status === "loading") {
        console.log(`✅ [Suno] 歌曲 2 已就绪: ${taskId}`)
        currentSongs[1] = {
          id: 2,
          status: "ready",
          audioUrl: result.audioUrl2,
          coverUrl: result.coverUrl2,
          title: result.title2,
          duration: result.duration2
        }
      }
      
      // 检查独立状态字段（如果 Agent B 返回了）
      if (result.status1 === "error" && currentSongs[0].status === "loading") {
        currentSongs[0] = { ...currentSongs[0], status: "error", errorMessage: "生成失败" }
      }
      if (result.status2 === "error" && currentSongs[1].status === "loading") {
        currentSongs[1] = { ...currentSongs[1], status: "error", errorMessage: "生成失败" }
      }
      
      console.log(`📊 [Suno] 槽位状态: Song1=${currentSongs[0].status}, Song2=${currentSongs[1].status}`)
      
      // 更新任务状态
      updateTask(taskId, {
        globalStatus: result.status,
        songs: currentSongs,
        errorMessage: result.errorMessage,
        pollCount: task.pollCount + 1
      })

      // 🔥 终止条件：
      // 1. 两首歌都 ready
      // 2. 全局状态为 ERROR
      // 3. 超时（已在上面处理）
      const bothReady = currentSongs[0].status === "ready" && currentSongs[1].status === "ready"
      const hasError = result.status === "ERROR"
      
      if (bothReady) {
        console.log(`🎉 [Suno] 两首歌都已就绪，停止轮询: ${taskId}`)
        updateTask(taskId, { globalStatus: "SUCCESS" })
        stopPolling(taskId)
      } else if (hasError) {
        console.log(`❌ [Suno] 全局错误，停止轮询: ${taskId}`, result.errorMessage)
        stopPolling(taskId)
      }
      // 否则继续轮询
      
    } catch (error: any) {
      console.error(`❌ [Suno] 轮询异常: ${taskId}`, error)
      // 网络错误不停止轮询，继续重试
      updateTask(taskId, {
        pollCount: task.pollCount + 1
      })
    }
  }, [updateTask, stopPolling])

  // ============================================
  // 开始轮询任务状态
  // ============================================
  const startPolling = useCallback((taskId: string, userId: string) => {
    // 防止重复轮询
    if (pollingTimersRef.current.has(taskId)) {
      console.log(`⚠️ [Suno] 任务 ${taskId} 已在轮询中`)
      return
    }

    console.log(`🔄 [Suno] 开始轮询: ${taskId}，间隔 ${SUNO_POLLING_CONFIG.interval}ms`)
    
    // 立即执行一次
    pollTaskStatus(taskId, userId)

    // 设置定时轮询（每 5 秒）
    const timer = setInterval(() => {
      pollTaskStatus(taskId, userId)
    }, SUNO_POLLING_CONFIG.interval)
    
    pollingTimersRef.current.set(taskId, timer)
  }, [pollTaskStatus])

  // ============================================
  // 开始生成音乐
  // ============================================
  const startMusicGeneration = useCallback(async (
    query: string,
    userId: string,
    messageId: string,
    taskMode: string,  // 🔥 新增：Suno 模式参数
    onTextChunk: (text: string) => void,
    onComplete: (fullText: string) => void
  ) => {
    console.log(`🎵 [Suno] 开始生成音乐: ${query.slice(0, 30)}..., 模式: ${taskMode}`)
    userIdRef.current = userId

    // 调用 Agent A 生成音乐
    await generateMusicStreaming(
      query,
      userId,
      taskMode,  // 🔥 传递模式参数
      conversationId,  // 🔥 传递会话 ID 保持多轮对话连续性
      onTextChunk,
      (result) => {
        onComplete(result.answer)
        
        // 🔥 保存新的 conversationId
        if (result.conversationId) {
          setConversationId(result.conversationId)
          console.log(`🔑 [Suno] 更新 conversationId: ${result.conversationId}`)
        }

        // 🔥 从回复中提取 Task ID（支持 [TASK_ID:xxx] 和纯 UUID 格式）
        const taskId = result.taskId || extractTaskId(result.answer)
        
        if (taskId) {
          console.log(`🔑 [Suno] 检测到 Task ID: ${taskId}，开始轮询`)
          
          // 🔥 创建新任务（双槽位初始化为 loading）
          const newTask: MusicTask = {
            taskId,
            messageId,
            globalStatus: "PENDING",
            songs: createInitialSongs(),
            createdAt: Date.now(),
            pollCount: 0
          }

          // 添加到任务列表
          setMusicTasks(prev => {
            const newMap = new Map(prev)
            newMap.set(taskId, newTask)
            return newMap
          })

          // 🔥 延迟 100ms 开始轮询，确保状态已更新到 ref
          setTimeout(() => {
            startPolling(taskId, userId)
          }, 100)
        } else {
          console.log(`⚠️ [Suno] 未检测到 Task ID，无法轮询`)
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
      globalStatus: "PENDING",
      songs: createInitialSongs(),
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
        if (task.globalStatus === "SUCCESS" || task.globalStatus === "ERROR") {
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
    task => task.globalStatus === "PENDING" || task.globalStatus === "PROCESSING"
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
    conversationId,  // 🔥 返回会话 ID
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
