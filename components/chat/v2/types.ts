/**
 * 🖌 v2 chat 模板类型定义
 */

import type React from "react"

/** 一条聊天消息 */
export interface ChatMessageV2 {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  /** 生成时长（毫秒） */
  durationMs?: number
  /** 流式是否完成 */
  streaming?: boolean
  /** 智能体类型，决定渲染模板 */
  model?: string
  /** 附件（图片/文件） */
  attachments?: Array<{
    type: "image" | "file" | "audio"
    url: string
    name?: string
    size?: number
  }>
  /** 创建时间 */
  createdAt?: string
  /** AI 输出的结构化产物（用于批改稿/海报/卡片渲染） */
  artifact?: ChatArtifact
}

/** 智能体输出的结构化产物 */
export type ChatArtifact =
  | EssayReviewArtifact
  | WorksheetDiagnosisArtifact
  | FlashcardArtifact
  | VocabCardArtifact
  | RawMarkdownArtifact

export interface EssayReviewArtifact {
  type: "essay-review"
  title: string
  grade?: string
  wordCount?: number
  score?: { value: number; total: number }
  summary?: string
  diagnosis?: Array<{ title: string; detail: string }>
  suggestions?: string[]
  trainingTasks?: string[]
  originalText?: string
  finalDraft?: string
  rawMarkdown?: string
}

export interface WorksheetDiagnosisArtifact {
  type: "worksheet-diagnosis"
  subject?: string
  grade?: string
  totalQuestions?: number
  wrongCount?: number
  weakPoints?: Array<{ topic: string; wrongOf: string; reason?: string }>
  trainingPlan?: Array<{ topic: string; tasks: string[] }>
  posterUrl?: string
  rawMarkdown?: string
}

export interface FlashcardArtifact {
  type: "flashcard"
  cards: Array<{
    front: string
    back: string
    hint?: string
  }>
}

export interface VocabCardArtifact {
  type: "vocab-card"
  word: string
  pronunciation?: string
  meaning?: string
  examples?: string[]
  story?: string
  raw?: string
}

export interface RawMarkdownArtifact {
  type: "markdown"
  rawMarkdown: string
}

/** 智能体定义 */
export interface AgentDefinition {
  /** 与现有 model key 一致 */
  model: string
  name: string
  /** 短描述，用于 ModelSelector */
  description: string
  /** 大类：写作 / 教学 / 创作 / 学科 */
  group: "writing" | "teaching" | "creative" | "subject" | "general"
  /** 默认输出模板 */
  artifactType: ChatArtifact["type"]
  /** 价格说明 */
  priceLabel?: string
  /** 是否会员限定 */
  memberOnly?: boolean
  /** 颜色调（取自墨砚色板） */
  toneClass?: string
  /** 头像图标 */
  icon?: React.ComponentType<{ className?: string }>
}
