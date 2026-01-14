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
  UUID_REGEX,
  type MusicGenerationStatus,
  type MusicGenerationResult,
} from "./suno-config"

// 代理 API 地址
const SUNO_PROXY_API = "/api/suno"

// ============================================
// 🔥 专业模式表单数据类型
// ============================================

/** 专业模式表单数据结构（与 SunoProForm.tsx 保持一致） */
export interface SunoProFormData {
  task_mode: 'Normal' | 'Extend' | 'Cover'
  MV: 'chirp-v5' | 'chirp-v4' | 'chirp-v3-5' | 'chirp-v3-0'
  target_id: string
  continue_at: number | null
  title: string
  prompt: string
  style_tags: string
  negative_tags: string
  instrumental: boolean
  vocal_gender: 'm' | 'f'
  end_at: number | null
}

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

/** 查询 API 响应类型 - 🔥 更新：支持双曲目独立状态 */
interface QueryResponse {
  data: {
    outputs?: {
      status?: string
      // 🔥 新增：独立状态字段
      status_1?: string  // 第一首歌状态
      status_2?: string  // 第二首歌状态
      // 第一首歌
      audio_url?: string
      audio_url_1?: string  // 兼容新字段名
      cover_url?: string
      cover_url_1?: string
      title_1?: string
      duration_1?: number
      // 第二首歌
      audio_url_2?: string
      cover_url_2?: string
      title_2?: string
      duration_2?: number
      // 通用字段
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
    
    // 🔥 兼容新旧字段名
    const audioUrl1 = outputs.audio_url_1 || outputs.audio_url
    const coverUrl1 = outputs.cover_url_1 || outputs.cover_url
    const audioUrl2 = outputs.audio_url_2
    const coverUrl2 = outputs.cover_url_2
    
    // 🔥 更新：记录双曲目独立状态
    console.log("📊 [Suno] 查询结果:", {
      globalStatus: outputs.status,
      status1: outputs.status_1,
      status2: outputs.status_2,
      hasAudio1: !!audioUrl1,
      hasAudio2: !!audioUrl2,
    })

    // 映射全局状态
    let status: MusicGenerationStatus = "PENDING"
    if (outputs.status === "SUCCESS" || outputs.status === "success") {
      status = "SUCCESS"
    } else if (outputs.status === "ERROR" || outputs.status === "error" || outputs.status === "FAILED") {
      status = "ERROR"
    } else if (outputs.status === "PROCESSING" || outputs.status === "processing" || outputs.status === "running") {
      status = "PROCESSING"
    }

    // 🔥 返回双曲目数据（包含独立状态）
    return {
      status,
      taskId,
      // 🔥 独立状态
      status1: outputs.status_1,
      status2: outputs.status_2,
      // 第一首歌
      audioUrl: audioUrl1,
      coverUrl: coverUrl1,
      title: outputs.title_1 || outputs.title,
      duration: outputs.duration_1 || outputs.duration,
      // 第二首歌
      audioUrl2: audioUrl2,
      coverUrl2: coverUrl2,
      title2: outputs.title_2,
      duration2: outputs.duration_2,
      // 错误信息
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
 * 🔥 支持两种格式：
 * 1. [TASK_ID:xxx] - 标记格式
 * 2. 纯 UUID - 866059ef-6422-4cda-xxxx-xxxxxxxxxxxx
 * 
 * @param text - AI 回复的完整文本
 * @returns Task ID 或 null
 */
export function extractTaskId(text: string): string | null {
  // 优先尝试 [TASK_ID:xxx] 格式
  const tagMatch = text.match(TASK_ID_REGEX)
  if (tagMatch) {
    console.log("🔑 [Suno] 从 [TASK_ID:xxx] 格式提取:", tagMatch[1].trim())
    return tagMatch[1].trim()
  }
  
  // 🔥 其次尝试纯 UUID 格式
  const uuidMatch = text.match(UUID_REGEX)
  if (uuidMatch) {
    console.log("🔑 [Suno] 从纯 UUID 格式提取:", uuidMatch[0])
    return uuidMatch[0]
  }
  
  console.log("⚠️ [Suno] 未找到 Task ID，文本:", text.slice(0, 100))
  return null
}

/**
 * 从文本中移除 Task ID 标记，返回干净的显示文本
 * 
 * 🔥 支持两种格式：
 * 1. [TASK_ID:xxx] - 标记格式
 * 2. 纯 UUID - 866059ef-6422-4cda-xxxx-xxxxxxxxxxxx
 * 
 * @param text - 包含 Task ID 的文本
 * @returns 移除标记后的文本
 */
export function removeTaskIdFromText(text: string): string {
  // 移除 [TASK_ID:xxx] 格式
  let cleaned = text.replace(TASK_ID_REGEX, "")
  // 移除纯 UUID 格式（可选，如果 UUID 单独成行或被空格包围）
  cleaned = cleaned.replace(new RegExp(`\\s*${UUID_REGEX.source}\\s*`, 'gi'), " ")
  return cleaned.trim()
}

// ============================================
// 4. 🔥 流式生成音乐（真正的流式输出）
// ============================================

/**
 * 流式提交音乐生成任务
 * 用于在 UI 上实时显示 AI 的文字回复（歌词逐字显示）
 * 
 * @param query - 用户输入的提示词
 * @param userId - 用户 ID
 * @param taskMode - Suno 模式（inspiration/custom/extend）
 * @param conversationId - 🔥 会话 ID（可选，用于保持多轮对话连续性）
 * @param onChunk - 每收到一个文本块时的回调
 * @param onComplete - 完成时的回调，包含完整回复、Task ID 和新的 conversationId
 */
export async function generateMusicStreaming(
  query: string,
  userId: string,
  taskMode: string,  // 🔥 Suno 模式参数
  conversationId: string | null,  // 🔥 新增：会话 ID
  onChunk: (text: string) => void,
  onComplete: (result: { answer: string; taskId: string | null; conversationId?: string }) => void
): Promise<void> {
  console.log("🎵 [Suno] 开始流式生成音乐:", { query: query.slice(0, 50), userId, taskMode, conversationId })

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
        taskMode: taskMode,  // 🔥 传递模式参数
        conversationId: conversationId || '',  // 🔥 传递会话 ID
        streaming: true,  // 🔥 启用流式模式
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("❌ [Suno] 流式 API 错误:", response.status, errorData)
      onComplete({ answer: `错误: ${errorData.error || response.status}`, taskId: null })
      return
    }

    // 🔥 处理 SSE 流式响应
    const reader = response.body?.getReader()
    if (!reader) {
      onComplete({ answer: "错误: 无法读取流式响应", taskId: null })
      return
    }

    const decoder = new TextDecoder()
    let fullText = ""
    let taskId: string | null = null
    let newConversationId: string | undefined = undefined  // 🔥 保存返回的 conversationId

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split("\n")

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            
            // 🔥 提取 conversation_id（Dify 在每个事件中都会返回）
            if (parsed.conversation_id && !newConversationId) {
              newConversationId = parsed.conversation_id
              console.log("🔑 [Suno] 获取 conversationId:", newConversationId)
            }
            
            // 🔥 Dify SSE 格式：event 类型
            if (parsed.event === "message" || parsed.event === "agent_message") {
              const text = parsed.answer || ""
              if (text) {
                fullText += text
                onChunk(fullText)  // 🔥 每次发送累积的完整文本
              }
            } else if (parsed.event === "message_end") {
              // 消息结束
              console.log("✅ [Suno] 流式消息结束")
            }
            
            // 兼容其他格式
            if (parsed.answer && !parsed.event) {
              fullText = parsed.answer
              onChunk(fullText)
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 🔥 提取 Task ID
    taskId = extractTaskId(fullText)
    console.log("✅ [Suno] 流式完成，Task ID:", taskId, "conversationId:", newConversationId)
    
    onComplete({ answer: fullText, taskId, conversationId: newConversationId })

  } catch (error: any) {
    console.error("❌ [Suno] 流式生成异常:", error)
    onComplete({ answer: `错误: ${error.message}`, taskId: null })
  }
}

// ============================================
// 5. 🔥 专业模式：流式生成音乐
// ============================================

/**
 * 专业模式 - 流式提交音乐生成任务
 * 使用完整的表单参数提交至 Dify 工作流 API
 * 
 * @param formData - 专业模式表单数据
 * @param userId - 用户 ID
 * @param conversationId - 会话 ID（可选）
 * @param onChunk - 每收到一个文本块时的回调
 * @param onComplete - 完成时的回调
 */
export async function generateMusicStreamingPro(
  formData: SunoProFormData,
  userId: string,
  conversationId: string | null,
  onChunk: (text: string) => void,
  onComplete: (result: { answer: string; taskId: string | null; conversationId?: string }) => void
): Promise<void> {
  console.log("🎵 [Suno Pro] 开始专业模式流式生成:", { 
    formData: JSON.stringify(formData).slice(0, 100), 
    userId, 
    conversationId 
  })

  try {
    const response = await fetch(SUNO_PROXY_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "generate",
        userId: userId,
        conversationId: conversationId || '',
        streaming: true,
        // 🔥 专业模式：传递完整表单数据
        proFormData: formData,
      }),
    })

    if (!response.ok) {
      // 🔥 尝试获取错误详情（可能是 JSON 或纯文本）
      let errorMsg = `状态码: ${response.status}`
      try {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const errorData = await response.json()
          errorMsg = errorData.details || errorData.error || JSON.stringify(errorData)
        } else {
          errorMsg = await response.text()
        }
      } catch (e) {
        errorMsg = `状态码: ${response.status}`
      }
      console.error("❌ [Suno Pro] 流式 API 错误:", response.status, errorMsg)
      onComplete({ answer: `❌ API 错误:\n\n${errorMsg}`, taskId: null })
      return
    }

    // 处理 SSE 流式响应
    const reader = response.body?.getReader()
    if (!reader) {
      onComplete({ answer: "错误: 无法读取流式响应", taskId: null })
      return
    }

    const decoder = new TextDecoder()
    let fullText = ""
    let taskId: string | null = null
    let newConversationId: string | undefined = undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split("\n")

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6)
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            
            // 提取 conversation_id
            if (parsed.conversation_id && !newConversationId) {
              newConversationId = parsed.conversation_id
              console.log("🔑 [Suno Pro] 获取 conversationId:", newConversationId)
            }
            
            // Dify SSE 格式
            if (parsed.event === "message" || parsed.event === "agent_message") {
              const text = parsed.answer || ""
              if (text) {
                fullText += text
                onChunk(fullText)
              }
            } else if (parsed.event === "message_end") {
              console.log("✅ [Suno Pro] 流式消息结束")
            }
            
            // 兼容其他格式
            if (parsed.answer && !parsed.event) {
              fullText = parsed.answer
              onChunk(fullText)
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    // 提取 Task ID
    taskId = extractTaskId(fullText)
    console.log("✅ [Suno Pro] 流式完成，Task ID:", taskId, "conversationId:", newConversationId)
    
    onComplete({ answer: fullText, taskId, conversationId: newConversationId })

  } catch (error: any) {
    console.error("❌ [Suno Pro] 流式生成异常:", error)
    onComplete({ answer: `错误: ${error.message}`, taskId: null })
  }
}
