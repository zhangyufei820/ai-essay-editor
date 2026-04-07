/**
 * SSE 事件类型定义
 * 减少 any 的使用，提供基础类型安全
 */

// Dify SSE 事件类型
export type DifySSEEventType =
  | 'node_started'
  | 'node_finished'
  | 'text_chunk'
  | 'agent_message'
  | 'workflow_finished'
  | 'message'

// Dify SSE 数据载荷
export interface DifySSENodeData {
  node_id?: string
  title?: string
  status?: string
  workflow_run_id?: string
  text?: string
  outputs?: {
    text?: string
    result?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

// Dify SSE 事件
export interface DifySSEEvent {
  event: DifySSEEventType | string
  data?: DifySSENodeData
  conversation_id?: string
  message_id?: string
  answer?: string
  // Chat API 字段
  text?: string
  node_id?: string
  title?: string
  status?: string
  workflow_run_id?: string
}

// 简化的消息更新事件（用于 handleSSEEvent）
export interface SSEEventPayload {
  event: string
  data?: {
    node_id?: string
    title?: string
    status?: string
    workflow_run_id?: string
    [key: string]: unknown
  }
}
