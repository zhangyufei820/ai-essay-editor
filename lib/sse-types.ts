/**
 * SSE 事件类型定义
 * 重导出 lib/dify-types.ts 中的 Dify SSE 类型以保持向后兼容
 */

export type {
  DifySSEEventType,
  DifySSERawEvent,
  DifyNodeData,
  DifyMessageData,
  DifyWorkflowFinishedData,
  DifyMessageFileData,
  DifyMessageEndData,
} from "./dify-types"

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
