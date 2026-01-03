/**
 * Suno 音乐生成服务层
 * 
 * 🎵 功能：
 * 1. generateMusic - 提交音乐生成任务
 * 2. checkMusicStatus - 查询任务状态
 * 
 * ⚠️ 安全协议：此文件完全独立，不影响任何现有功能
 * 
 * 🔥 重要更新：现在通过后端代理 API 调用，解决 CORS 和 Mixed Content 问题
 */

import {
  TASK_ID_REGEX,
  type MusicGenerationStatus,
  type MusicGenerationResult,
} from "./suno-config"

// 代理 API 地址
const SUNO_PROXY_API = "/api/suno"

// ============================================
// 类型定义
// ============================================

/** 生成 API 响应类型 */
interface GenerateResponse {
  answer: string
  conversation_id?: string
  message_id?: string
  error?: string
}

/** 查询 API 响应类型 */
interface QueryResponse {
  data: {
    outputs?: {
      status?: string
      audio_url?: string
      cover_url?: string
      title?: string
      duration?: number
      error_message?: string
    }
  }
  error?: string
}

// ============================================
// 1. 生成音乐 - 通过代理 API
// ============================================

/**
 * 提交音乐生成任务
 * 
 * @param query - 用户输入的提示词（如："一首欢快的新年歌"）
 * @param userId - 用户 ID
 * @returns 包含 AI 回复文本和提取的 Task ID
 */
export async function generateMusic(
  query: string,
  userId: string
): Promise<{
  success: boolean
  answer: string
  taskId: string | null
  conversationId?: string
  error?: string
}> {
  console.log("🎵 [Suno] 开始生成音乐:", { query: query.slice(0, 50), userId })

  try {
    const response = await fetch(SUNO_PROXY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "generate",
        query: query,
        userId: userId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("❌ [Suno] 生成 API 错误:", response.status, errorData)
      return {
        success: false,
        answer: "",
        taskId: null,
        error: errorData.error || `API 错误: ${response.status}`,
      }
    }

    const data: GenerateResponse = await response.json()
    
    if (data.error) {
      return {
        success: false,
        answer: "",
        taskId: null,
        error: data.error,
      }
    }
    
    console.log("✅ [Suno] 生成 API 响应:", data.answer?.slice(0, 100))

    // 使用正则提取 Task ID
    const taskIdMatch = data.answer?.match(TASK_ID_REGEX)
    const taskId = taskIdMatch ? taskIdMatch[1].trim() : null

    console.log("🔑 [Suno] 提取的 Task ID:", taskId)

    return {
      success: true,
      answer: data.answer || "",
      taskId,
      conversationId: data.conversation_id,
    }
  } catch (error: any) {
    console.error("❌ [Suno] 生成音乐异常:", error)
    return {
      success: false,
      answer: "",
      taskId: null,
      error: error.message || "网络错误",
    }
  }
}

// ============================================
// 2. 查询音乐状态 - 通过代理 API
// ============================================

/**
 * 查询音乐生成任务状态
 * 
 * @param taskId - 从生成 API 返回的任务 ID
 * @param userId - 用户 ID
 * @returns 音乐生成结果
 */
export async function checkMusicStatus(
  taskId: string,
  userId: string
): Promise<MusicGenerationResult> {
  console.log("🔍 [Suno] 查询任务状态:", { taskId, userId })

  try {
    const response = await fetch(SUNO_PROXY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "query",
        taskId: taskId,
        userId: userId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("❌ [Suno] 查询 API 错误:", response.status, errorData)
      return {
        status: "ERROR",
        taskId,
        errorMessage: errorData.error || `查询失败: ${response.status}`,
      }
    }

    const data: QueryResponse = await response.json()
    
    if (data.error) {
      return {
        status: "ERROR",
        taskId,
        errorMessage: data.error,
      }
    }
    
    const outputs = data.data?.outputs || {}
    
    console.log("📊 [Suno] 查询结果:", {
      status: outputs.status,
      hasAudio: !!outputs.audio_url,
      hasCover: !!outputs.cover_url,
    })

    // 映射状态
    let status: MusicGenerationStatus = "PENDING"
    if (outputs.status === "SUCCESS" || outputs.status === "success") {
      status = "SUCCESS"
    } else if (outputs.status === "ERROR" || outputs.status === "error" || outputs.status === "FAILED") {
      status = "ERROR"
    } else if (outputs.status === "PROCESSING" || outputs.status === "processing" || outputs.status === "running") {
      status = "PROCESSING"
    }

    return {
      status,
      taskId,
      audioUrl: outputs.audio_url,
      coverUrl: outputs.cover_url,
      title: outputs.title,
      duration: outputs.duration,
      errorMessage: outputs.error_message,
    }
  } catch (error: any) {
    console.error("❌ [Suno] 查询状态异常:", error)
    return {
      status: "ERROR",
      taskId,
      errorMessage: error.message || "网络错误",
    }
  }
}

// ============================================
// 3. 辅助函数：从文本中提取 Task ID
// ============================================

/**
 * 从 AI 回复文本中提取 Task ID
 * 
 * @param text - AI 回复的完整文本
 * @returns Task ID 或 null
 */
export function extractTaskId(text: string): string | null {
  const match = text.match(TASK_ID_REGEX)
  return match ? match[1].trim() : null
}

/**
 * 从文本中移除 Task ID 标记，返回干净的显示文本
 * 
 * @param text - 包含 [TASK_ID:xxx] 的文本
 * @returns 移除标记后的文本
 */
export function removeTaskIdFromText(text: string): string {
  return text.replace(TASK_ID_REGEX, "").trim()
}

// ============================================
// 4. 流式生成音乐（简化版，使用阻塞模式模拟）
// ============================================

/**
 * 流式提交音乐生成任务
 * 用于在 UI 上实时显示 AI 的文字回复
 * 
 * 注意：由于使用代理 API，这里改为阻塞模式，但仍保持相同的接口
 * 
 * @param query - 用户输入的提示词
 * @param userId - 用户 ID
 * @param onChunk - 每收到一个文本块时的回调
 * @param onComplete - 完成时的回调，包含完整回复和 Task ID
 */
export async function generateMusicStreaming(
  query: string,
  userId: string,
  onChunk: (text: string) => void,
  onComplete: (result: { answer: string; taskId: string | null }) => void
): Promise<void> {
  console.log("🎵 [Suno] 开始生成音乐 (通过代理):", { query: query.slice(0, 50), userId })

  try {
    // 先显示一个加载提示
    onChunk("正在为您创作音乐，请稍候...")
    
    const result = await generateMusic(query, userId)
    
    if (result.success) {
      // 清除加载提示，显示实际回复
      onComplete({ answer: result.answer, taskId: result.taskId })
    } else {
      onComplete({ answer: `错误: ${result.error}`, taskId: null })
    }
  } catch (error: any) {
    console.error("❌ [Suno] 生成异常:", error)
    onComplete({ answer: `错误: ${error.message}`, taskId: null })
  }
}
