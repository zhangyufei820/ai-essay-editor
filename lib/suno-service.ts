/**
 * Suno 音乐生成服务层
 * 
 * 🎵 功能：
 * 1. generateMusic - 提交音乐生成任务
 * 2. checkMusicStatus - 查询任务状态
 * 
 * ⚠️ 安全协议：此文件完全独立，不影响任何现有功能
 */

import {
  SUNO_GENERATE_CONFIG,
  SUNO_QUERY_CONFIG,
  TASK_ID_REGEX,
  type MusicGenerationStatus,
  type MusicGenerationResult,
} from "./suno-config"

// ============================================
// 类型定义
// ============================================

/** 生成 API 响应类型 */
interface GenerateResponse {
  answer: string
  conversation_id?: string
  message_id?: string
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
}

// ============================================
// 1. 生成音乐 - 调用 Chatflow API
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
    const url = `${SUNO_GENERATE_CONFIG.baseUrl}${SUNO_GENERATE_CONFIG.endpoint}`
    
    const response = await fetch(url, {
      method: SUNO_GENERATE_CONFIG.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUNO_GENERATE_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: "blocking", // 使用阻塞模式获取完整回复
        user: userId,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ [Suno] 生成 API 错误:", response.status, errorText)
      return {
        success: false,
        answer: "",
        taskId: null,
        error: `API 错误: ${response.status}`,
      }
    }

    const data: GenerateResponse = await response.json()
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
// 2. 查询音乐状态 - 调用 Workflow API
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
    const url = `${SUNO_QUERY_CONFIG.baseUrl}${SUNO_QUERY_CONFIG.endpoint}`
    
    const response = await fetch(url, {
      method: SUNO_QUERY_CONFIG.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUNO_QUERY_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        inputs: {
          task_id: taskId,
        },
        response_mode: "blocking",
        user: userId,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ [Suno] 查询 API 错误:", response.status, errorText)
      return {
        status: "ERROR",
        taskId,
        errorMessage: `查询失败: ${response.status}`,
      }
    }

    const data: QueryResponse = await response.json()
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
// 4. 流式生成音乐（可选，用于显示实时回复）
// ============================================

/**
 * 流式提交音乐生成任务
 * 用于在 UI 上实时显示 AI 的文字回复
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
  console.log("🎵 [Suno] 开始流式生成音乐:", { query: query.slice(0, 50), userId })

  try {
    const url = `${SUNO_GENERATE_CONFIG.baseUrl}${SUNO_GENERATE_CONFIG.endpoint}`
    
    const response = await fetch(url, {
      method: SUNO_GENERATE_CONFIG.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUNO_GENERATE_CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: "streaming", // 流式模式
        user: userId,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ [Suno] 流式生成 API 错误:", response.status, errorText)
      onComplete({ answer: `错误: ${response.status}`, taskId: null })
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let fullText = ""
    let buffer = ""

    while (reader) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (data === "[DONE]") continue

        try {
          const json = JSON.parse(data)
          if (json.answer) {
            fullText += json.answer
            onChunk(json.answer)
          }
        } catch {}
      }
    }

    // 提取 Task ID
    const taskId = extractTaskId(fullText)
    console.log("✅ [Suno] 流式生成完成, Task ID:", taskId)
    
    onComplete({ answer: fullText, taskId })
  } catch (error: any) {
    console.error("❌ [Suno] 流式生成异常:", error)
    onComplete({ answer: `错误: ${error.message}`, taskId: null })
  }
}
