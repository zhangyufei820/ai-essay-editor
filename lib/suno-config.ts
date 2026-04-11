/**
 * Suno 音乐生成 API 配置
 *
 * ⚠️ 安全提示：此文件仅包含配置常量
 * 实际 API Key 应存储在环境变量中（服务端使用，非 NEXT_PUBLIC_）
 */

// ============================================
// A. 生成 API (Chatflow) - 用于提交提示词
// ============================================
export const SUNO_GENERATE_CONFIG = {
  baseUrl: process.env.SUNO_API_BASE_URL || "http://43.154.111.156/v1",
  endpoint: "/chat-messages",
  method: "POST" as const,
}

// ============================================
// B. 查询 API (Workflow) - 用于轮询进度
// ============================================
export const SUNO_QUERY_CONFIG = {
  baseUrl: process.env.SUNO_API_BASE_URL || "http://43.154.111.156/v1",
  endpoint: "/workflows/run",
  method: "POST" as const,
}

// ============================================
// 轮询配置
// ============================================
export const SUNO_POLLING_CONFIG = {
  /** 轮询间隔（毫秒）- 每 5 秒查询一次 */
  interval: 5000,
  /** 最大轮询次数（5分钟 / 5秒 = 60次） */
  maxAttempts: 60,
  /** 超时时间（毫秒）- 5分钟 */
  timeout: 5 * 60 * 1000,
}

// ============================================
// Task ID 提取正则
// ============================================

/** 
 * 原格式：[TASK_ID:xxx] 
 * 用于从标记格式中提取 Task ID
 */
export const TASK_ID_REGEX = /\[TASK_ID:\s*(.*?)\]/

/**
 * 🔥 新增：纯 UUID 格式正则
 * 用于直接从文本中提取 UUID（Agent A 可能直接返回 UUID）
 * 格式：866059ef-6422-4cda-xxxx-xxxxxxxxxxxx
 */
export const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// ============================================
// 音乐生成状态枚举
// ============================================
export type MusicGenerationStatus = 
  | "PENDING"    // 等待处理
  | "PROCESSING" // 正在生成
  | "SUCCESS"    // 生成成功
  | "ERROR"      // 生成失败

// ============================================
// 单首歌曲状态（用于增量渲染）
// ============================================
export type SongSlotStatus = "loading" | "ready" | "error"

export interface SongSlot {
  id: 1 | 2
  status: SongSlotStatus
  audioUrl?: string
  coverUrl?: string
  title?: string
  lyrics?: string  // 🔥 新增：歌词文本
  duration?: number
  errorMessage?: string
}

// ============================================
// 音乐生成结果类型
// 🔥 更新：支持双曲目独立状态（增量渲染）
// ============================================
export interface MusicGenerationResult {
  /** 全局状态（用于判断是否继续轮询） */
  status: MusicGenerationStatus
  taskId: string
  
  // 🔥 新增：独立状态字段（Agent B 返回）
  status1?: string  // 第一首歌状态
  status2?: string  // 第二首歌状态
  
  // 第一首歌
  audioUrl?: string
  coverUrl?: string
  // 第二首歌
  audioUrl2?: string
  coverUrl2?: string
  // 通用字段
  title?: string
  title2?: string
  duration?: number
  duration2?: number
  errorMessage?: string
}
