/**
 * Dify API 类型定义
 * 覆盖 Chat API 和 Workflow API 的请求/响应结构
 */

// ============================================================
// 公共类型
// ============================================================

/** Dify 文件对象（用于 Chat API attachments） */
export interface DifyFileObject {
  type: "image"
  transfer_method: "local_file"
  upload_file_id: string
}

/** Dify 图片输入对象（用于 Workflow API inputs） */
export interface DifyImageObject {
  type: "image"
  transfer_method: "local_file"
  upload_file_id: string
}

/** 图片尺寸参数 */
export interface DifyImageSize {
  ratio?: string    // e.g. "9:16"
  width?: number    // e.g. 1080
  height?: number   // e.g. 1920
}

/** Dify Workflow inputs（动态键值对，允许任意 JSON 值） */
export type DifyWorkflowInputs = Record<string, string | DifyImageObject | unknown | undefined>

// ============================================================
// Chat API 请求（标准对话模型）
// ============================================================

export interface DifyChatRequest {
  inputs: Record<string, unknown>
  query: string
  response_mode: "streaming"
  user: string
  conversation_id?: string | null
  files?: DifyFileObject[]
}

// ============================================================
// Workflow API 请求（Banana 2 Pro 等）
// ============================================================

export interface DifyWorkflowRequest {
  inputs: DifyWorkflowInputs
  response_mode: "streaming" | "blocking"
  user: string
}

// ============================================================
// SSE 流式事件类型
// ============================================================

/** SSE 事件类型枚举 */
export type DifySSEEventType =
  | "node_started"
  | "node_finished"
  | "text_chunk"
  | "agent_message"
  | "workflow_finished"
  | "message"
  | "message_file"
  | "message_end"

/** node_started / node_finished 事件数据 */
export interface DifyNodeData {
  node_id?: string
  title?: string
  status?: string
  index?: number
  inputs?: Record<string, unknown>
  process_data?: Record<string, unknown>
  outputs?: Record<string, unknown>
  error?: string
  elapsed_time?: number
  execution_metadata?: {
    currency?: string
    total_price?: number
    unit_price?: number
  }
  [key: string]: unknown
}

/** message / text_chunk / agent_message 事件数据 */
export interface DifyMessageData {
  message_id: string
  conversation_id: string
  answer?: string
  created_at?: number
}

/** workflow_finished 事件数据 */
export interface DifyWorkflowFinishedData {
  workflow_id: string
  workflow_run_id: string
  status: string
  outputs?: {
    text?: string
    result?: string
    files?: DifyFileObject[]
    [key: string]: unknown
  }
  error?: string
  elapsed_time?: number
  total_tokens?: number
  steps?: number
  [key: string]: unknown
}

/** message_file 事件数据 */
export interface DifyMessageFileData {
  message_id: string
  conversation_id: string
  type: "image" | "audio" | "file"
  url?: string
  belongs_to?: string
  [key: string]: unknown
}

/** message_end 事件数据（包含 usage） */
export interface DifyMessageEndData {
  message_id: string
  conversation_id: string
  metadata?: {
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** SSE 原始事件（解析前） */
export interface DifySSERawEvent {
  event: DifySSEEventType | string
  task_id?: string
  id?: string
  message_id?: string
  conversation_id?: string
  created_at?: number
  // node events
  data?: DifyNodeData
  // message events
  answer?: string
  // text_chunk / agent_message
  text?: string
  // workflow_finished
  workflow_id?: string
  workflow_run_id?: string
  status?: string
  outputs?: Record<string, unknown>
  error?: string
  elapsed_time?: number
  total_tokens?: number
  steps?: number
  // message_file
  type?: string
  url?: string
  belongs_to?: string
  // message_end
  metadata?: Record<string, unknown>
  // 允许其他字段
  [key: string]: unknown
}
