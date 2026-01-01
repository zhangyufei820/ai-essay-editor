/**
 * Suno 音乐生成 API 配置
 * 
 * ⚠️ 安全提示：此文件仅包含配置常量
 * 实际 API Key 应存储在环境变量中
 */

// ============================================
// A. 生成 API (Chatflow) - 用于提交提示词
// ============================================
export const SUNO_GENERATE_CONFIG = {
  baseUrl: "https://api.dify.ai/v1",
  endpoint: "/chat-messages",
  // API Key 从环境变量读取，此处仅作为备用默认值
  apiKey: process.env.NEXT_PUBLIC_SUNO_GENERATE_API_KEY || "app-Tyc34BR5WMyrRUqg1dcuO42m",
  method: "POST" as const,
}

// ============================================
// B. 查询 API (Workflow) - 用于轮询进度
// ============================================
export const SUNO_QUERY_CONFIG = {
  baseUrl: "https://api.dify.ai/v1",
  endpoint: "/workflows/run",
  // API Key 从环境变量读取，此处仅作为备用默认值
  apiKey: process.env.NEXT_PUBLIC_SUNO_QUERY_API_KEY || "app-5qpzXBthRSYKSnTRIfW55aZ3",
  method: "POST" as const,
}

// ============================================
// 轮询配置
// ============================================
export const SUNO_POLLING_CONFIG = {
  /** 轮询间隔（毫秒） */
  interval: 3000,
  /** 最大轮询次数（防止无限轮询） */
  maxAttempts: 100,
  /** 超时时间（毫秒）- 5分钟 */
  timeout: 5 * 60 * 1000,
}

// ============================================
// Task ID 提取正则
// ============================================
export const TASK_ID_REGEX = /\[TASK_ID:\s*(.*?)\]/

// ============================================
// 音乐生成状态枚举
// ============================================
export type MusicGenerationStatus = 
  | "PENDING"    // 等待处理
  | "PROCESSING" // 正在生成
  | "SUCCESS"    // 生成成功
  | "ERROR"      // 生成失败

// ============================================
// 音乐生成结果类型
// ============================================
export interface MusicGenerationResult {
  status: MusicGenerationStatus
  taskId: string
  audioUrl?: string
  coverUrl?: string
  title?: string
  duration?: number
  errorMessage?: string
}
