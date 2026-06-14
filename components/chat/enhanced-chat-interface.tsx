"use client"

import {
  ButtonV2 as Button,
  DropdownMenuV2 as DropdownMenu,
  DropdownMenuV2Content as DropdownMenuContent,
  DropdownMenuV2Item as DropdownMenuItem,
  DropdownMenuV2Label as DropdownMenuLabel,
  DropdownMenuV2Trigger as DropdownMenuTrigger,
  ScrollAreaV2 as ScrollArea,
  TextareaV2 as Textarea
} from "@/components/ui/v2"
import { LoadingStateV2, SkeletonV2 as Skeleton } from "@/components/ui/v2"
/* eslint-disable @next/next/no-img-element -- Dynamic/user-generated/external image surfaces: keep native img to preserve sizing, blob/data/proxy URLs, payment QR codes, and chat preview behavior. */

import type React from "react"
import { useState, useRef, useEffect, Suspense, useCallback } from "react"
import { flushSync } from "react-dom"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  X, Loader2,
  ChevronDown, ChevronLeft, ArrowDown,
  ExternalLink,
} from "lucide-react"
import { IconDiagnosis, IconEssay, IconExportPdf, IconHistory, IconInkDot, IconSealCheck, IconUser } from "@/components/icons/v2"
import { cn } from "@/lib/utils"
import { buildChatSessionRoute, buildChatSessionRouteFromSession, isDedicatedChatSessionModel, resolveChatSessionRouteModel } from "@/lib/chat-session-routes"
import { toast } from "sonner"
import { MessageBubble } from "./MessageBubble"
import { ChatInput } from "./ChatInput"
import { CodexSkillPicker } from "./CodexSkillPicker"
import { OpenClawSkillPicker } from "./OpenClawSkillPicker"
import { DailySurveyGate, type TrialSurveyStatus } from "@/components/trial/DailySurveyGate"
import { trackCampaignEvent } from "@/lib/campaign-events-client"
import { openTrialSurveyGate } from "@/lib/trial-survey-client"
import { EmptyState } from "./EmptyState"
import { AIStatusIndicator } from "@/components/ai/AIStatusIndicator"
import { ModelSelector, type Model } from "./ModelSelector"
import { MathInline, MathBlock } from "./UltimateRenderer"
import { useWorkflowVisualizer } from "@/hooks/useWorkflowVisualizer"
import type { ChatSession } from "./chat-sidebar"
import { motion, AnimatePresence } from "framer-motion"
import { EnhancedMarkdown } from "./EnhancedMarkdown"
import { AssistantEyeAvatar } from "./AssistantEyeAvatar"
import { OpenClawHtmlPreview } from "./OpenClawHtmlPreview"
import { UserMessageBubble } from "./UserMessageBubble"
import { VocabCardTemplate } from "@/components/chat/v2/templates"
import type { VocabCardArtifact } from "@/components/chat/v2/types"
import { VocabCardDifyForm, type VocabCardDifyInputs } from "./VocabCardDifyForm"
import { brandColors, slateColors } from "@/lib/design-tokens"
import { cleanLLMText } from "@/lib/text-sanitizer"
import { sanitizeDifyAnswerForModel } from "@/lib/dify-answer-cleanup"
import { getSafeUpstreamErrorMessage, hasInternalAiDetailText, hasTechnicalUpstreamErrorText, sanitizeAssistantMessageForPublicDisplay, sanitizePublicAiError, sanitizePublicAiStatus } from "@/lib/chat-error-sanitizer"
import { parseEssayReview } from "@/lib/parse-essay-review"
import { extractDifyTextOutput } from "@/lib/dify-output-text"
import { isAssistantFailureContent } from "@/lib/chat-message-guards"
import { containsRawDifyWordCardPayload, normalizeDifyWordCardResponse, type FrontendWordCard } from "@/lib/word-card-normalizer"
import { buildVocabCardWorkflowInputs, cleanVocabAnswer, resolveVocabCardResult } from "@/lib/vocab-card-workflow"
import { resolveChatAgentParam } from "@/lib/teacher-agent-route"
import { isWorkflowSkillAgent, type WorkflowSkillId } from "@/lib/workflow-skill-agents"
import { createClient } from "@supabase/supabase-js"
import { collapseSidebar, navigateHomeWithSidebar, refreshCredits, refreshSessionList, SESSION_LIST_REFRESH_EVENT } from "@/lib/workspace-events"
import { useSelectedModelStore } from "@/hooks/useSelectedModelStore"
import { getRequiredAuthHeaders, getStoredClientIdentity, getVerifiedAuthHeaders, hasStoredVerifiedAuthToken } from "@/lib/client-auth"
import { validateFileForUpload, MAX_FILE_SIZE } from "@/lib/upload-service"
import { VoiceRecorder, getDifyTTS, transcribeAudio } from "@/lib/voice-service"
import { getApiUrl } from "@/lib/api-config"
import { logger } from "@/lib/logger"
import { ModelLogo } from "@/components/ModelLogo"
import { navigationModelConfig, getNavigationModelItem } from "@/lib/navigation-models"
import { getPublicAiLabel, sanitizePublicAiLabel } from "@/lib/public-ai-labels"
import { PLAZA_AGENTS } from "@/components/agents/agent-plaza-data"
import { getOpenClawAttachmentKind, isLikelyHtmlDocumentUrl, resolveOpenClawPresentationPreviewUrl, toPublicOpenClawMediaSignUrl, toPublicOpenClawWorkspaceUrl } from "@/lib/openclaw-media"
import type { CodexSkill } from "@/lib/codex-skills"
import type { OpenClawSkill } from "@/lib/openclaw-skills"
import {
  calculatePreviewCost,
  ModelType,
  GenMode,
  MODEL_COSTS,
  getModelDisplayName
} from "@/lib/pricing"
import type { WorkflowState, WorkflowNodeStatus } from "@/lib/workflow-visual-config"

// 🔥 品牌深绿色（参考主页标题）
const BRAND_GREEN = "var(--ink-700)"

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "general-chat": getPublicAiLabel("general-chat"),
  "standard": getPublicAiLabel("standard"),
  "teaching-pro": getPublicAiLabel("teaching-pro"),
  "gpt-5": getPublicAiLabel("gpt-5"),
  "claude-opus": getPublicAiLabel("claude-opus"),
  "gemini-pro": getPublicAiLabel("gemini-pro"),
  "gemini-image": getPublicAiLabel("gemini-image"),
  "grok-4.2": getPublicAiLabel("grok-4.2"),
  "open-claw": getPublicAiLabel("open-claw"),
  "quanquan-math": getPublicAiLabel("quanquan-math"),
  "quanquan-english": getPublicAiLabel("quanquan-english"),
  "vocab-card": "词境记忆卡",
  "problem": "题目解析",
  "beike-pro": "备课助手",
  "banzhuren": "班主任助手",
  "all-in-one-agent": "数学图片与动画生成器",
  "super-all-in-one-agent": "超级全能智能体",
  "banana-2-pro": getPublicAiLabel("banana-2-pro"),
  "gpt-image-2": getPublicAiLabel("gpt-image-2"),
  "ai-writing-paper": "论文写作",
  "zhongying-essay": "中英文作文",
  "experiment-report": "实验报告",
  "teacher-agent": "教师智能体",
}

const WORKFLOW_SKILL_DISPLAY: Record<WorkflowSkillId, { name: string; description: string; tags: string[] }> = {
  "khazix-writer": {
    name: "公众号长文写作助手",
    description: "按素材写公众号长文、扩写成稿、续写可发布内容。",
    tags: ["公众号", "长文", "素材成稿"],
  },
  Chinese: {
    name: "中文自然润色助手",
    description: "把机械感强的中文改得更顺、更自然。",
    tags: ["中文润色", "自然表达", "校对"],
  },
  Grammar: {
    name: "通用语法纠错助手",
    description: "修正语法、病句、拼写、标点和通用文本问题。",
    tags: ["语法", "病句", "标点"],
  },
  "thesis-helper": {
    name: "论文结构与大纲助手",
    description: "辅助论文大纲、综述框架、摘要和引用格式。",
    tags: ["论文", "大纲", "综述"],
  },
  "mba-thesis-advisor": {
    name: "MBA 论文提升助手",
    description: "面向 MBA 论文优化结构、论证、案例和质量标准。",
    tags: ["MBA", "论文提升", "案例"],
  },
  "academic-thesis-review": {
    name: "管理类硕士论文评审助手",
    description: "审阅 MBA、MEM、MPA 等管理类硕士论文。",
    tags: ["硕士论文", "评审", "修改建议"],
  },
  "shenxiang-lunwen-shenping": {
    name: "论文审稿诊断助手",
    description: "提供审稿式论文诊断、学术自查和修改方向。",
    tags: ["审稿", "诊断", "学术自查"],
  },
  "shenxiang-paper-review-v5": {
    name: "投稿前终检助手",
    description: "投稿前排雷、降重整改、AIGC 风险检查和终稿把关。",
    tags: ["投稿前", "终检", "AIGC"],
  },
  "shenxiang-chuzhong-xiuxi-piyue": {
    name: "初中作文批阅助手",
    description: "初中作文批改、润色、点评和升格建议。",
    tags: ["初中作文", "批阅", "升格"],
  },
  "shenxiang-yi-lunwen-piyue": {
    name: "议论文批改助手",
    description: "强化议论文论证、结构和观点表达。",
    tags: ["议论文", "论证", "结构"],
  },
  "shenxiang-lunshuowen": {
    name: "高中论述文生成助手",
    description: "根据题目生成高中论述文或议论文。",
    tags: ["高中", "论述文", "成文"],
  },
  "shenxiang-gaozhong-lunshuowen": {
    name: "高中论述文升格助手",
    description: "提升高中论述文逻辑、论证深度和表达质量。",
    tags: ["高中", "升格", "逻辑"],
  },
  "shenxiang-zuowen-shengge": {
    name: "散文哲思风升格助手",
    description: "适合散文升格、哲思风润色和表达优化。",
    tags: ["散文", "哲思", "润色"],
  },
  "shenxiang-zuowen-zhangxiaofeng": {
    name: "张晓风风格润色助手",
    description: "面向张晓风风格仿写和散文语言润色。",
    tags: ["张晓风", "仿写", "散文"],
  },
  "shenxiang-xiaoxuezuowen": {
    name: "小学生作文全程升级助手",
    description: "面向 1-6 年级小学生作文的多阶段升级。",
    tags: ["小学作文", "升级", "展示"],
  },
  "shenxiang-xueweipigai-revise": {
    name: "小学作文精批细改助手",
    description: "逐句精批小学作文，适合家长辅导场景。",
    tags: ["小学作文", "精批", "家长辅导"],
  },
  "shenxiang-xiaoxue-zuowen-piyue": {
    name: "小学低段记叙文助手",
    description: "适合 1-3 年级低段记叙文点评和表达提升。",
    tags: ["低段", "记叙文", "点评"],
  },
  "shenxiang-xiaoxue-xiangxiang-zuowen": {
    name: "小学想象作文助手",
    description: "童话、幻想、拟人等想象作文批改与创意提升。",
    tags: ["想象作文", "童话", "创意"],
  },
  "shenxiang-xiaoxue-5grade-zhengwen": {
    name: "五年级征文润色助手",
    description: "提升五年级征文的文学性、结构和感染力。",
    tags: ["五年级", "征文", "润色"],
  },
  "shenxiang-gaozhong-yingyu-zuowen": {
    name: "高中英语作文批改助手",
    description: "高中英语作文批改、120 词优化和错误纠正。",
    tags: ["高中英语", "作文批改", "语法"],
  },
  "xueersi-english-grammar-check": {
    name: "英语语法讲解助手",
    description: "英语语法纠错和中文讲解，帮助理解错误原因。",
    tags: ["英语语法", "中文讲解", "纠错"],
  },
}

function getWorkflowSkillDisplay(skillId?: string | null) {
  return isWorkflowSkillAgent(skillId) ? WORKFLOW_SKILL_DISPLAY[skillId] : null
}

type ModelUiConfig = {
  name: string
  modelKey: string
  color: string
  description: string
  badge?: string
  group: string
}

const ALL_IN_ONE_AGENT_PROMPTS = [
  "生成一个二次函数 y=x² 开口方向变化的动画，要求有坐标轴、关键标注和中文讲解。",
  "帮我把这张图片改成适合课堂展示的教学插图，风格清晰、干净、适合投影。",
  "根据我上传的文件，提炼重点并生成一份课堂讲解提纲和练习题。",
  "我想做一个数学概念可视化，请先帮我完善提示词，再生成可执行方案。",
]

const SUPER_ALL_IN_ONE_AGENT_PROMPTS = [
  "我想制定一个学习计划，请根据我的考试时间、当前基础和每天可用时长，帮我拆成 7 天 / 30 天 / 学期计划。",
  "帮我梳理这门课的知识框架，提炼重点、难点和易错点，并生成复习提纲、背诵清单和题型清单。",
  "我需要每日 / 每周任务清单，请把我的目标拆成可执行任务，安排番茄钟节奏，并给出检查清单。",
  "请根据我的情况定制学习方案：目标是【考试 / 课程 / 论文 / 作业】，截止时间是【日期】，基础是【简单描述】，每天能学【时长】。",
]

// 获取模型徽章颜色 — 强制归一：所有模型统一为翡翠绿 var(--ink-600)
function getModelBadgeColor(_modelKey: string): string {
  return "var(--ink-600)"
}

// 🔥 移动端用户信息显示组件
const MobileUserInfo = ({
  userName,
  credits,
  onMenuClick
}: {
  userName: string
  credits: number
  onMenuClick: () => void
}) => (
  <button
    onClick={onMenuClick}
    className="inline-flex h-10 min-w-[40px] items-center justify-center rounded-[var(--radius-pill)] border border-[var(--paper-200)]/80 bg-[var(--paper-50)]/90 px-2 shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--paper-50)]"
  >
    <div
      className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-pill)] text-white text-[11px] font-semibold shrink-0"
      style={{ backgroundColor: BRAND_GREEN }}
    >
      {userName?.[0]?.toUpperCase() || "U"}
    </div>
    <div className="hidden sm:flex flex-col items-start min-w-0 pl-1">
      <span className="text-xs font-medium text-[var(--ink-700)] max-w-[72px] truncate leading-none">
        {userName || "用户"}
      </span>
      <span className="text-[10px] text-[var(--ink-600)] font-medium leading-none">
        {credits.toLocaleString()} 积分
      </span>
    </div>
  </button>
)

// --- Supabase 初始化 ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-3 py-6 sm:px-4 md:px-6 lg:px-10">
      {[false, true, false, false].map((isUser, index) => (
        <div key={index} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
          <Skeleton className="size-12 shrink-0 rounded-[var(--radius-soft)] bg-[var(--paper-200)]" />
          <div className="flex max-w-[75%] flex-1 flex-col gap-2">
            <Skeleton className={cn("h-4 w-24 rounded-[var(--radius-pill)] bg-[var(--paper-200)]", isUser && "ml-auto")} />
            <div className={cn("space-y-2 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-100)] p-3", isUser && "ml-auto w-full")}>
              <Skeleton className="h-3 rounded-[var(--radius-pill)] bg-[var(--paper-200)]" />
              <Skeleton className="h-3 w-5/6 rounded-[var(--radius-pill)] bg-[var(--paper-200)]" />
              <Skeleton className="h-3 w-4/6 rounded-[var(--radius-pill)] bg-[var(--paper-200)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// --- 类型定义 ---
type UploadedFile = {
  name: string
  type: string
  size: number
  data: string
  preview?: string
  difyFileId?: string
  gatewayUrl?: string
  modelUrl?: string
  storageUrl?: string
}
// 🔥 消息类型 - 支持 metadata 存储音乐等附加数据，支持 files 显示上传的文件
type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp?: string | Date
  files?: UploadedFile[]  // 🔥 新增：用户消息携带的文件
  metadata?: {
    type?: "music" | "word_card"
    taskId?: string
    songs?: Array<{
      id: number
      status: "loading" | "ready" | "error"
      audioUrl?: string
      coverUrl?: string
      title?: string
      duration?: number
      errorMessage?: string
    }>
    wordCard?: FrontendWordCard
  } | null
  wordCard?: FrontendWordCard | null
}

function getPreviousUserMessage(messages: Message[], assistantIndex: number) {
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index]
  }
  return null
}

function inferMistakeSubject(model: ModelType, question: string, answer: string) {
  const source = `${question}\n${answer}`
  if (/数学|方程|函数|几何|计算|证明|x\s*[+=\-*/]|÷|×/.test(source)) return "math"
  if (/英语|单词|语法|阅读理解|translate|grammar/i.test(source)) return "english"
  if (/语文|阅读|文言文|诗歌|作文|修辞/.test(source)) return "chinese"
  return model === "problem" ? "problem" : "other"
}

function toShareSafeFile(file: UploadedFile) {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    difyFileId: file.difyFileId,
    gatewayUrl: file.gatewayUrl,
    modelUrl: file.modelUrl,
    storageUrl: file.storageUrl,
    url: file.modelUrl || file.gatewayUrl,
  }
}

function toShareSafeMessage(message: Message) {
  return {
    role: message.role,
    content: message.content,
    files: message.files?.map(toShareSafeFile),
  }
}

function textValue(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string" || typeof value === "number") return String(value)
  return ""
}

function listValues(value: unknown): unknown[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function toVocabCardArtifact(data: FrontendWordCard): VocabCardArtifact {
  const hero = data.hero || {}
  const sections = data.sections || {}
  const pronunciation = sections.pronunciation || {}
  const ipa = hero.ipa || pronunciation.ipa || {}
  const examples = listValues(sections.examples?.items || sections.examples?.examples || sections.examples)
    .map((example) => {
      if (typeof example === "string") return example
      if (!example || typeof example !== "object") return ""
      const record = example as Record<string, unknown>
      return [textValue(record.en || record.english || record.sentence), textValue(record.cn || record.zh || record.translation)]
        .filter(Boolean)
        .join(" - ")
    })
    .filter(Boolean)
    .slice(0, 5)

  return {
    type: "vocab-card",
    word: textValue(data.word),
    pronunciation: textValue(ipa.us || ipa.uk || pronunciation.ipa),
    meaning: textValue(hero.primary_cn || data.card?.meaning?.primary_cn || data.card?.translation),
    examples,
    story: textValue(sections.memory_story?.story_cn || sections.memoryStory?.story_cn || data.card?.story?.story_cn),
    raw: JSON.stringify(data),
  }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function isDifferentDay(current?: string | Date, previous?: string | Date) {
  if (!current) return false
  if (!previous) return true
  const currentDate = new Date(current)
  const previousDate = new Date(previous)
  if (Number.isNaN(currentDate.getTime()) || Number.isNaN(previousDate.getTime())) return false
  return startOfDay(currentDate) !== startOfDay(previousDate)
}

function formatDateLabel(date: string | Date | undefined) {
  if (!date) return ""
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ""
  const now = new Date()
  const diffDays = Math.floor((startOfDay(now) - startOfDay(d)) / 86400000)
  if (diffDays === 0) return "今天"
  if (diffDays === 1) return "昨天"
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
type FileProcessingState = { status: "idle" | "uploading" | "processing" | "recognizing" | "complete" | "error"; progress: number; message: string }
type ProcessingContext = {
  model: string
  fileCount: number
  promptLength: number
  startedAt: number
  lastActivityAt?: number
  heartbeatCount?: number
  requestId?: string
  stage?: string
}

// 🔥 上传状态动态消息数组
const UPLOAD_STATUS_MESSAGES = {
  uploading: [
    "正在上传文件...",
    "文件传输中...",
    "上传进度: {progress}%",
    "正在发送请求..."
  ],
  processing: [
    "正在深度解析题目...",
    "AI 正在思考中...",
    "正在识别内容...",
    "正在分析文件..."
  ],
  recognizing: [
    "正在理解题意...",
    "深度分析中...",
    "正在构建解题思路...",
    "正在提取关键信息..."
  ]
}

// 获取状态对应的随机消息
function getRandomStatusMessage(status: FileProcessingState['status'], progress?: number): string {
  const messages = UPLOAD_STATUS_MESSAGES[status as keyof typeof UPLOAD_STATUS_MESSAGES]
  if (!messages) return ""
  const message = messages[Math.floor(Math.random() * messages.length)]
  return message.replace('{progress}', String(progress || 0))
}

function isUploadedImageFile(file: Pick<UploadedFile, "name" | "type">) {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
  return file.type?.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"].includes(extension)
}

function extractWorkflowOutputText(outputs: unknown) {
  return extractDifyTextOutput(outputs)
}

function getModelEmptyResponseMessage(model: string) {
  if (model === "standard") {
    return "我没有收到可展示的作文批改结果，请重新提交一次。若仍然为空，请换一张更清晰的作文图片。"
  }
  if (model === "open-claw") {
    return "任务已结束，但没有返回可展示内容。请换一个更明确的要求，或稍后重新提交。"
  }
  if (model === "all-in-one-agent" || model === "super-all-in-one-agent") {
    return "任务已结束，但没有返回可展示内容。请把要生成的图片、动画或文档要求再描述得更具体一些。"
  }
  if (model === "gemini-image" || model === "banana-2-pro" || model === "gpt-image-2") {
    return "图片任务已结束，但没有返回图片或可展示说明。请降低尺寸 / 质量后重试。"
  }
  return "我没有收到可展示的回复，请再试一次。"
}

function getChatModelDisplayLabel(model?: string) {
  if (!model) return "当前任务"
  const navigationName = getNavigationModelItem(model as ModelType)?.name
  return sanitizePublicAiLabel(navigationName || MODEL_DISPLAY_NAMES[model] || model, "当前任务")
}

function isNetworkStreamError(raw: string, lower: string) {
  return (
    /network error|failed to fetch|fetch failed|load failed|networkerror|err_incomplete_chunked_encoding|err_network_changed|err_connection|socket|connection/i.test(raw) ||
    /网络|连接.*中断|连接.*失败/.test(raw) ||
    lower.includes("network")
  )
}

function getChatErrorMessage(error: unknown, status?: number, model?: string): string {
  const raw = error instanceof Error ? error.message : String(error || "")
  const text = raw.toLowerCase()

  if (status === 401 || /401|unauthorized|未授权|请先登录/.test(raw)) {
    return "请先登录后再提交。"
  }
  if (status === 402 || /402|积分不足|余额不足|credit|balance/.test(raw)) {
    return "积分不足，当前任务没有扣费。请充值或升级会员后继续使用。"
  }
  if (raw.includes("当前共创体验期内登录用户可用")) {
    return "当前图像能力需要登录后使用，请先登录后再提交。"
  }
  if (raw.includes("当前仅订阅用户可用") || raw.includes("仅订阅用户可用")) {
    return "当前账号暂时无法使用该图像能力，请刷新页面或重新登录后再试。"
  }
  if (/无权访问图片生成接口|permission|forbidden|403/.test(raw)) {
    return "当前账号暂无图片生成权限，请切换模型，或联系客服开通后再试。"
  }
  if (/timeout|timed out|abort|aborted|超时/.test(text) || /超时|中断/.test(raw)) {
    if (model === "open-claw") {
      return "当前任务响应超时或被中断。复杂图片/大文件任务可能排队较久，请稍后刷新历史记录或重新提交。"
    }
    return `${getChatModelDisplayLabel(model)} 响应超时或连接被中断。页面会保留已生成内容；若没有看到结果，请刷新历史记录后再决定是否重新提交。`
  }
  const safeUpstreamMessage = getSafeUpstreamErrorMessage(raw)
  if (safeUpstreamMessage) {
    return safeUpstreamMessage
  }
  if (isNetworkStreamError(raw, text)) {
    if (model === "open-claw") {
      return "当前长任务连接中断，可能是服务响应超时或浏览器网络断开。当前页面没有收到完整结果，请稍后刷新历史记录或重新提交。"
    }
    return `${getChatModelDisplayLabel(model)} 连接中断：后端已接收请求，但浏览器在读取流式结果时断开。请先刷新当前会话或历史记录查看是否已有结果；若仍没有结果，再重新提交一次。`
  }
  if (/file|upload|附件|上传/.test(text) || /文件|上传|附件/.test(raw)) {
    return "文件未上传成功或附件无法被模型读取，请删除附件后重新上传再提交。"
  }
  if (model === "gemini-image") {
    return "图片生成服务暂时不可用，可能是余额、尺寸或参数不兼容导致。请稍后重试或调整提示词。"
  }

  return sanitizePublicAiError(raw, "对话出错，请稍后重试。")
}

function buildChatErrorContent(message: string): string {
  const safeMessage = getSafeAssistantErrorContent(message)
  return [
    "### 当前回复未完整送达",
    "",
    safeMessage,
    "",
    "建议：先刷新当前会话或历史记录查看是否已有结果；如果仍无结果，再重新提交。若连续出现，请保留截图和发生时间。"
  ].join("\n")
}

function getSafeAssistantErrorContent(message: string) {
  const fallback = "服务暂时不可用，请稍后重试。"
  if (!hasTechnicalUpstreamErrorText(message) && !hasInternalAiDetailText(message)) {
    return sanitizePublicAiError(message, fallback)
  }
  const safeMessage = getSafeUpstreamErrorMessage(message)
  return sanitizePublicAiError(safeMessage || message, fallback)
}

function normalizeChatTaskFailureMessage(message: string, model?: string) {
  const fallback = `${getChatModelDisplayLabel(model)}暂时不可用，请稍后重试。`
  if (!hasTechnicalUpstreamErrorText(message) && !hasInternalAiDetailText(message)) {
    return sanitizePublicAiError(message, fallback)
  }
  return sanitizePublicAiError(getSafeUpstreamErrorMessage(message, fallback) || message, fallback)
}

async function getTaskFailureMessage(requestId: string, model: string): Promise<{ message: string; status?: string } | null> {
  if (!requestId) return null
  try {
    const res = await fetch(`/api/task-status?requestId=${encodeURIComponent(requestId)}&limit=1`, {
      headers: await getVerifiedAuthHeaders(),
    })
    if (!res.ok) return null
    const payload = await res.json()
    const task = Array.isArray(payload.tasks) ? payload.tasks[0] : null
    if (!task) return null

    const stage = typeof task.stage === "string" ? sanitizePublicAiStatus(task.stage, "任务仍在处理中") : ""
    const detail = typeof task.error_message === "string" ? sanitizePublicAiError(task.error_message, "") : ""
    const status = typeof task.status === "string" ? task.status : undefined
    const modelLabel = getChatModelDisplayLabel(model)
    if (["failed", "timeout", "cancelled"].includes(task.status)) {
      if (detail) return { message: detail, status }
      if (stage) return { message: `${modelLabel} 任务未完成：${stage}`, status }
      return { message: `${modelLabel} 任务没有正常完成。`, status }
    }
    if (["queued", "running"].includes(task.status)) {
      return {
        message: stage ? `${modelLabel} 任务仍在处理中：${stage}` : `${modelLabel} 任务仍在处理中，请稍后刷新会话查看结果。`,
        status,
      }
    }
    if (task.status === "succeeded") {
      return {
        message: `${modelLabel} 任务已完成，但当前浏览器没有收到完整响应。请刷新当前会话或历史记录查看；若仍无内容，再重新提交。`,
        status,
      }
    }
  } catch (error) {
    console.warn("⚠️ [任务状态] 查询失败:", error)
  }
  return null
}

function createClientRequestId(prefix = "chat") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const PENDING_TASK_STORAGE_KEY = "shenxiang.pendingAiTasks"
const savedMessageKeys = new Set<string>()

async function saveMessageOnce(key: string, save: () => Promise<unknown>) {
  if (savedMessageKeys.has(key)) return
  savedMessageKeys.add(key)
  try {
    await save()
  } catch (error) {
    savedMessageKeys.delete(key)
    throw error
  }
}

function createLocalSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function ensureChatSessionViaApi(params: {
  sessionId: string
  title: string
  preview: string
  model: string
  difyConversationId?: string | null
}) {
  const res = await fetch("/api/chat-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getVerifiedAuthHeaders()),
    },
    body: JSON.stringify({
      id: params.sessionId,
      title: params.title,
      preview: params.preview,
      ai_model: params.model,
      dify_conversation_id: params.difyConversationId || undefined,
    }),
  })
  if (!res.ok) throw new Error(`chat_session_save_failed_${res.status}`)
  return res.json()
}

async function saveChatMessageViaApi(params: {
  sessionId: string
  role: "user" | "assistant"
  content: string
  metadata?: Record<string, unknown>
  files?: UploadedFile[]
}) {
  const res = await fetch("/api/save-message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getVerifiedAuthHeaders()),
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      role: params.role,
      content: params.content,
      files: params.files,
      metadata: params.metadata,
    }),
  })
  if (!res.ok) throw new Error(`chat_message_save_failed_${res.status}`)
  return res.json()
}

function scheduleChatPerfRenderMark(requestId: string, stage: string, startedAt: number) {
  if (typeof window === "undefined") return
  window.requestAnimationFrame(() => {
    recordChatPerf(requestId, stage, Date.now() - startedAt)
  })
}

function recordChatPerf(requestId: string, stage: string, elapsedMs: number, extra: Record<string, unknown> = {}) {
  const payload = {
    requestId,
    stage,
    elapsedMs,
    ...extra,
  }
  if (typeof window !== "undefined") {
    const perfWindow = window as Window & { __SHENXIANG_CHAT_PERF__?: Array<Record<string, unknown>> }
    perfWindow.__SHENXIANG_CHAT_PERF__ = [...(perfWindow.__SHENXIANG_CHAT_PERF__ || []), payload].slice(-80)
  }
  console.debug("[ChatPerf]", payload)
}

function rememberPendingTask(task: { requestId: string; sessionId?: string; model: string; createdAt: number }) {
  if (typeof window === "undefined") return
  try {
    const existing = JSON.parse(localStorage.getItem(PENDING_TASK_STORAGE_KEY) || "[]")
    const tasks = Array.isArray(existing) ? existing : []
    localStorage.setItem(PENDING_TASK_STORAGE_KEY, JSON.stringify([
      task,
      ...tasks.filter((item: any) => item?.requestId !== task.requestId),
    ].slice(0, 10)))
  } catch {
    localStorage.setItem(PENDING_TASK_STORAGE_KEY, JSON.stringify([task]))
  }
}

function forgetPendingTask(requestId: string) {
  if (typeof window === "undefined") return
  try {
    const existing = JSON.parse(localStorage.getItem(PENDING_TASK_STORAGE_KEY) || "[]")
    const tasks = Array.isArray(existing) ? existing : []
    localStorage.setItem(PENDING_TASK_STORAGE_KEY, JSON.stringify(tasks.filter((item: any) => item?.requestId !== requestId)))
  } catch {
    localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
  }
}

function ProcessingStatusCard({
  context,
  showLongWaitHint,
  workflowState,
  currentRunningText,
}: {
  context: ProcessingContext | null
  showLongWaitHint: boolean
  workflowState: WorkflowState
  currentRunningText: string
}) {
  const modelName = sanitizePublicAiLabel(context?.model ? (MODEL_DISPLAY_NAMES[context.model] || context.model) : "", "当前任务")
  const isOpenClaw = context?.model === "open-claw"
  const hasFiles = Boolean(context?.fileCount)
  const promptLength = context?.promptLength || 0
  const startedAt = context?.startedAt || Date.now()
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
  const lastActivityAt = context?.lastActivityAt || startedAt
  const quietSeconds = Math.max(0, Math.round((Date.now() - lastActivityAt) / 1000))
  const realNodes = workflowState.nodes.map((node) => ({
    id: node.id,
    label: node.config.label,
    detail: node.status === "running"
      ? currentRunningText || node.config.runningTexts?.[node.currentTextIndex] || "正在处理..."
      : node.status === "completed"
        ? "已完成"
        : node.status === "error"
          ? "需要重新尝试"
          : "等待执行",
    status: node.status,
    icon: node.config.icon,
  }))
  const fallbackSteps = buildDefaultProcessingSteps({
    hasFiles,
    fileCount: context?.fileCount || 0,
    promptLength,
    stage: context?.stage || "",
    isOpenClaw,
  })
  const steps = realNodes.length > 0 ? realNodes : fallbackSteps
  const completedCount = steps.filter((step) => step.status === "completed").length
  const progress = Math.max(
    12,
    Math.min(92, Math.round(((completedCount + (steps.some((step) => step.status === "running") ? 0.45 : 0.15)) / Math.max(steps.length, 1)) * 100)),
  )
  const statusText = isOpenClaw
    ? "正在调度工具与资料"
    : hasFiles
      ? "正在读取资料并规划回答"
      : "正在组织高质量回复"
  const heartbeatHint = context?.heartbeatCount
    ? `连接正常，已等待 ${elapsedSeconds}s`
    : ""
  const stageText = sanitizePublicAiStatus(
    context?.stage || currentRunningText || heartbeatHint || (showLongWaitHint ? "处理时间稍长，请保持页面打开" : "正在建立回答结构"),
    showLongWaitHint ? "处理时间稍长，请保持页面打开" : "正在建立回答结构",
  )
  const runningStep = steps.find((step) => step.status === "running" || step.status === "preparing") || steps[0]
  const completedStep = [...steps].reverse().find((step) => step.status === "completed")
  const nextStep = steps.find((step) => step.status === "pending")
  const traceLines = [
    completedStep ? { marker: "ok", text: completedStep.label, detail: completedStep.detail } : null,
    runningStep ? { marker: "run", text: sanitizePublicAiStatus(runningStep.label, "正在处理"), detail: sanitizePublicAiStatus(runningStep.detail || stageText, stageText) } : null,
    nextStep ? { marker: "wait", text: sanitizePublicAiStatus(nextStep.label, "等待处理"), detail: sanitizePublicAiStatus(nextStep.detail, "等待处理") } : null,
  ].filter(Boolean).slice(0, 3) as Array<{ marker: "ok" | "run" | "wait"; text: string; detail: string }>

  return (
    <section
      aria-live="polite"
      className="w-fit max-w-full rounded-[var(--radius-soft)] border border-[var(--paper-200)]/80 bg-[var(--paper-50)]/80 px-3 py-2 font-mono text-[11px] leading-5 text-[var(--ink-600)] shadow-none"
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-[var(--paper-200)]/70 pb-1.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-[var(--radius-pill)] bg-[var(--seal-500)] opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-[var(--radius-pill)] bg-[var(--ink-600)]" />
        </span>
        <span className="shrink-0 font-semibold text-[var(--ink-700)]">思考进度</span>
        <span className="min-w-0 truncate text-[var(--ink-500)]">{stageText || statusText}</span>
        <span className="ml-auto shrink-0 text-[var(--ink-400)]">{elapsedSeconds}s</span>
      </div>
      <div className="mt-1.5 space-y-0.5">
        {traceLines.map((line, index) => (
          <div key={`${line.marker}-${line.text}-${index}`} className="flex min-w-0 items-start gap-1.5">
            <span
              className={cn(
                "mt-px w-4 shrink-0 text-right",
                line.marker === "ok" && "text-[var(--ink-700)]",
                line.marker === "run" && "text-[var(--ink-700)]",
                line.marker === "wait" && "text-[var(--ink-400)]",
              )}
            >
              {line.marker === "ok" ? "✓" : line.marker === "run" ? "›" : "·"}
            </span>
            <span className="min-w-0 truncate">
              <span className="text-[var(--ink-700)]">{line.text}</span>
              {line.detail && <span className="text-[var(--ink-400)]"> {" — "}{line.detail}</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 h-px overflow-hidden rounded-[var(--radius-pill)] bg-[var(--paper-200)]">
        <motion.div
          className="h-full rounded-[var(--radius-pill)] bg-[var(--ink-600)]"
          initial={{ width: "8%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <p className="mt-1 truncate text-[10px] leading-4 text-[var(--ink-400)]">
        {modelName} · {hasFiles ? `已接收 ${context?.fileCount || 0} 个附件` : "正在处理文字内容"} · {quietSeconds > 20 ? `已等待 ${quietSeconds}s` : "连接正常"}
      </p>
    </section>
  )
}

type ProcessingStep = {
  id: string
  label: string
  detail: string
  status: WorkflowNodeStatus
  icon: React.ComponentType<{ className?: string }>
}

function buildDefaultProcessingSteps({
  hasFiles,
  fileCount,
  promptLength,
  stage,
  isOpenClaw,
}: {
  hasFiles: boolean
  fileCount: number
  promptLength: number
  stage: string
  isOpenClaw: boolean
}): ProcessingStep[] {
  const activeDetail = stage || (hasFiles ? "正在读取图片与文字线索" : "正在理解你的问题")
  return [
    {
      id: "receive",
      label: hasFiles ? "接收学习资料" : "理解任务意图",
      detail: hasFiles ? `已接收 ${fileCount} 个附件，建立资料上下文` : "提取问题目标与约束",
      status: "completed",
      icon: IconDiagnosis,
    },
    {
      id: "inspect",
      label: hasFiles ? "识别图文信息" : "拆解回答目标",
      detail: activeDetail,
      status: "running",
      icon: IconDiagnosis,
    },
    {
      id: "plan",
      label: "制定回答结构",
      detail: promptLength > 120 ? "材料较长，优先整理层次和关键点" : "规划开头、依据与结论顺序",
      status: "preparing",
      icon: IconSealCheck,
    },
    {
      id: "verify",
      label: isOpenClaw ? "工具结果核验" : "一致性检查",
      detail: "检查是否贴合题目、避免空泛回答",
      status: "pending",
      icon: IconSealCheck,
    },
  ]
}

// --- 辅助组件：文本渲染器 ---
// LaTeX 渲染辅助函数 (已移至 lib/latex-constants.ts)

const InlineText = ({ text }: { text: string }) => {
  if (!text) return null;

  // 首先按 ** 分块
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const inner = part.slice(2, -2);
          // 检查是否包含 LaTeX 公式 $...$
          const latexParts = inner.split(/(\$[^$]+\$)/g);
          if (latexParts.length > 1) {
            return (
              <strong key={index} className={`font-semibold text-[${BRAND_GREEN}]`}>
                {latexParts.map((lp, lpIdx) => {
                  if (lp.startsWith("$") && lp.endsWith("$")) {
                    return <MathInline key={lpIdx} formula={lp.slice(1, -1)} />;
                  }
                  return <span key={lpIdx}>{lp}</span>;
                })}
              </strong>
            );
          }
          return <strong key={index} className={`font-semibold text-[${BRAND_GREEN}]`}>{inner}</strong>;
        }
        // 检查是否包含 LaTeX 公式
        const latexParts = part.split(/(\$[^$]+\$)/g);
        if (latexParts.length > 1) {
          return (
            <span key={index}>
              {latexParts.map((lp, lpIdx) => {
                if (lp.startsWith("$") && lp.endsWith("$")) {
                  return <MathInline key={lpIdx} formula={lp.slice(1, -1)} />;
                }
                return <span key={lpIdx}>{lp}</span>;
              })}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

// MediaBlock 必须在 UltimateRenderer 之前定义
// 🔥 支持图片、文件、PPT 渲染
interface MediaItem {
  type: "image" | "file" | "ppt"
  url: string
  name?: string
  localPath?: string // OpenClaw 本地路径
}

// 🔥 转换 OpenClaw 本地路径为 HTTP URL
function convertOpenClawUrl(url: string): string {
  // 如果已经是完整 URL，直接返回
  if (url.startsWith("/api/openclaw-media") || url.startsWith("/api/openclaw-media-sign")) {
    return url
  }

  const localMediaPrefix = "/home/node/.openclaw/media/"
  const localWorkspacePrefix = "/home/node/.openclaw/workspace/"
  const gatewayMediaPrefix = "/__openclaw__/media/"
  const gatewayWorkspacePrefix = "/__openclaw__/workspace/"

  if (url.startsWith(localMediaPrefix)) {
    return toPublicOpenClawMediaSignUrl(url.slice(localMediaPrefix.length))
  }

  if (url.startsWith(localWorkspacePrefix)) {
    return toPublicOpenClawWorkspaceUrl(url.slice(localWorkspacePrefix.length))
  }

  if (url.startsWith(gatewayMediaPrefix)) {
    return toPublicOpenClawMediaSignUrl(url.slice(gatewayMediaPrefix.length))
  }

  if (url.startsWith(gatewayWorkspacePrefix)) {
    return toPublicOpenClawWorkspaceUrl(url.slice(gatewayWorkspacePrefix.length))
  }

  try {
    const parsed = new URL(url)
    const mediaMatch = parsed.pathname.match(/^\/__openclaw__\/media\/(.+)$/)
    if (mediaMatch?.[1]) {
      return toPublicOpenClawMediaSignUrl(mediaMatch[1])
    }

    const workspaceMatch = parsed.pathname.match(/^\/__openclaw__\/workspace\/(.+)$/)
    if (workspaceMatch?.[1]) {
      return toPublicOpenClawWorkspaceUrl(workspaceMatch[1])
    }
  } catch {
    // Keep the original string if it is not a valid absolute URL.
  }

  return url
}

function withDownloadParam(url: string): string {
  const hashIndex = url.indexOf("#")
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ""
  const separator = base.includes("?") ? "&" : "?"
  return `${base}${separator}download=1${hash}`
}

const MediaBlock = ({ items }: { items: MediaItem[] }) => {
  if (!items || items.length === 0) return null

  return (
    <div className="space-y-4 my-4">
      {items.map((item, index) => {
        const publicUrl = convertOpenClawUrl(item.url)
        const effectiveType = item.type === "image" ? getOpenClawAttachmentKind(publicUrl) : item.type

        if (effectiveType === "image") {
          // 🔥 使用图像卡片样式渲染图片
          const imageUrl = publicUrl
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="relative rounded-[var(--radius-sharp)] overflow-hidden shadow-xl border border-[var(--ink-100)]"
            >
              <img
                src={imageUrl}
                alt={item.name || "Generated Image"}
                className="w-full h-auto max-h-[500px] object-contain bg-[var(--paper-50)]"
                loading="lazy"
              />
              {/* 下载按钮 */}
              <a
                href={imageUrl}
                download={item.name}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 p-2 bg-[var(--paper-50)]/90 backdrop-blur-sm rounded-[var(--radius-soft)] shadow-lg hover:bg-[var(--paper-50)] transition-all"
              >
                <IconExportPdf className="w-4 h-4 text-[var(--ink-600)]" />
              </a>
            </motion.div>
          )
        } else if (effectiveType === "file") {
          // 文件下载链接
          const isPDF = publicUrl.toLowerCase().includes('.pdf')
          const isHtml = publicUrl.toLowerCase().includes('.html')
          const fileUrl = publicUrl
          const downloadUrl = withDownloadParam(fileUrl)

          if (isHtml || isLikelyHtmlDocumentUrl(fileUrl)) {
            return (
              <OpenClawHtmlPreview
                key={index}
                src={fileUrl}
                title={item.name || "HTML 页面"}
              />
            )
          }

          return (
            <div
              key={index}
              className="flex items-center gap-3 rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4 transition-colors hover:bg-[var(--paper-100)]"
            >
              <div className="w-10 h-10 rounded-[var(--radius-soft)] bg-blue-100 flex items-center justify-center shrink-0">
                <IconEssay className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ink-700)] truncate">{item.name || "文件"}</p>
                <p className="truncate text-xs text-[var(--ink-400)]">{isHtml ? "HTML 页面" : isPDF ? "PDF 文档" : "文件"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isPDF && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-soft)] bg-[var(--paper-50)] px-3 py-1.5 text-xs font-medium text-[var(--ink-600)] shadow-sm transition-colors hover:bg-[var(--paper-100)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    打开
                  </a>
                )}
                <a
                  href={downloadUrl}
                  download={item.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-soft)] bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600"
	                >
	                  <IconExportPdf className="h-3.5 w-3.5" />
	                  下载
	                </a>
	              </div>
	            </div>
	          )
        } else if (effectiveType === "ppt") {
          return (
            <OpenClawHtmlPreview
              key={index}
              src={resolveOpenClawPresentationPreviewUrl(publicUrl)}
              title={item.name || "演示文稿"}
            />
          )
        }
        return null
      })}
    </div>
  )
}

// TableBlock 必须在 UltimateRenderer 之前定义
// 🔥 增大表格字体：表头 text-base，表格内容 text-lg
const TableBlock = ({ lines }: { lines: string[] }) => {
  if (lines.length < 2) return null;
  try {
    const headerLine = lines.find(l => l.includes("|") && !l.includes("---"));
    const bodyLines = lines.filter(l => l.includes("|") && !l.includes("---") && l !== headerLine);
    if (!headerLine) return null;
    const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim());
    return (
      <div className="my-6 overflow-hidden rounded-[var(--radius-sharp)] border border-[var(--paper-200)] bg-[var(--paper-50)] shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-[var(--paper-50)]"><tr>{headers.map((h, i) => (<th key={i} className="px-5 py-4 text-left text-base font-semibold text-[var(--ink-700)] tracking-wide">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-slate-100">{bodyLines.map((line, i) => { const cells = line.split("|").filter(c => c.trim()).map(c => c.trim()); return (<tr key={i} className="hover:bg-[var(--paper-50)]/50 transition-colors">{cells.map((cell, j) => (<td key={j} className="px-3 sm:px-5 py-3 sm:py-4 text-sm sm:text-base text-[var(--ink-700)] leading-relaxed"><InlineText text={cell} /></td>))}</tr>); })}</tbody>
          </table>
        </div>
      </div>
    );
  } catch (e) { return null; }
};

// 🎯 GenSpark 风格终端光标
const StreamingCursor = () => (
  <span className="streaming-cursor inline-block ml-1 text-[var(--ink-500)] animate-cursor-blink">▍</span>
)

// 🧠 可折叠的思考块组件 - 简化版，只有加载中时显示简单转圈
const ThinkingBlock = ({ content, isStreaming }: { content: string; isStreaming?: boolean }) => {
  // 加载中时只显示简单转圈，不显示文字和方块
  if (isStreaming) {
    return (
      <div className="my-2 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-[var(--ink-600)]" strokeWidth={2} />
      </div>
    )
  }

  // 非加载状态时不显示思考块
  return null
}

function UltimateRenderer({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  if (!content) return <span className="text-[var(--ink-500)] animate-cursor-blink">▍</span>;

  // 🧠 处理 <think> 标签：提取思考内容并折叠显示
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i)
  const thinkContent = thinkMatch ? thinkMatch[1].trim() : null

  // 如果只有 <think> 标签还没闭合（流式输出中）
  const hasOpenThink = content.includes('<think>') && !content.includes('</think>')
  const openThinkContent = hasOpenThink ? content.split('<think>')[1] : null

  // 🔥 提取媒体内容（图片、文件、PPT）
  const mediaItems: MediaItem[] = []

  // 匹配 ![alt](url) 图片格式
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let match
  while ((match = imageRegex.exec(content)) !== null) {
    mediaItems.push({
      type: "image",
      url: match[2],
      name: match[1] || "图片"
    })
  }

  // 匹配 [file](url) 文件格式
  const fileRegex = /\[file\]\(([^)]+)\)/g
  while ((match = fileRegex.exec(content)) !== null) {
    const url = match[1]
    const name = url.split('/').pop() || "文件"
    mediaItems.push({
      type: "file",
      url,
      name
    })
  }

  // 匹配 [ppt](url) PPT格式
  const pptRegex = /\[ppt\]\(([^)]+)\)/g
  while ((match = pptRegex.exec(content)) !== null) {
    const url = match[1]
    const name = url.split('/').pop() || "PPT文档"
    mediaItems.push({
      type: "ppt",
      url,
      name
    })
  }

  // 匹配 MEDIA: 前缀格式 (MEDIA:image:url, MEDIA:file:url, MEDIA:ppt:url)
  const mediaPrefixRegex = /^MEDIA:(image|file|ppt):(.+)$/gm
  while ((match = mediaPrefixRegex.exec(content)) !== null) {
    const type = match[1] as "image" | "file" | "ppt"
    const url = match[2]
    const name = url.split('/').pop() || type
    mediaItems.push({ type, url, name })
  }

  // 从主内容中移除媒体标记
  let cleanContent = content
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[file\]\([^)]+\)/g, '')
    .replace(/\[ppt\]\([^)]+\)/g, '')
    .replace(/^MEDIA:(image|file|ppt):.+$/gm, '')
    .trim()

  // 如果内容为空或只有思考内容
  if (!cleanContent && !thinkContent && !openThinkContent && mediaItems.length === 0) {
    return <span className="text-[var(--ink-500)] animate-cursor-blink">▍</span>;
  }

  // 🔥 从 cleanContent 中移除思考标签
  const mainContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  const lines = mainContent.split("\n");
  const renderedElements = [];
  let tableBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.trim().startsWith("|") && line.includes("|");
    const isLastLine = i === lines.length - 1;

    if (isTableLine) {
      tableBuffer.push(line);
      if (isLastLine || !lines[i + 1].trim().startsWith("|")) {
        renderedElements.push(<TableBlock key={`tbl-${i}`} lines={tableBuffer} />);
        tableBuffer = [];
      }
      continue;
    }


    // 🔥 再次增大字体：h1=3xl, h2=2xl, h3=xl, 正文=lg(18px)
    if (line.trim().startsWith("# ")) {
      renderedElements.push(
        <h1 key={i} className="mt-6 sm:mt-10 mb-3 sm:mb-5 text-xl sm:text-2xl font-bold text-[var(--ink-800)]">
          {line.replace(/^#\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h1>
      );
    } else if (line.trim().startsWith("## ")) {
      renderedElements.push(
        <h2 key={i} className={`mt-6 sm:mt-8 mb-2 sm:mb-4 text-lg sm:text-xl font-semibold text-[var(--ink-700)] flex items-center gap-2`}>
          <span className={`w-1.5 h-7 bg-[${BRAND_GREEN}] rounded-[var(--radius-pill)]`}></span>
          {line.replace(/^##\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h2>
      );
    } else if (line.trim().startsWith("### ")) {
      renderedElements.push(
        <h3 key={i} className={`mt-4 sm:mt-6 mb-2 sm:mb-3 text-base sm:text-lg font-semibold text-[${BRAND_GREEN}]`}>
          {line.replace(/^###\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h3>
      );
    } else if (line.trim().startsWith("#### ")) {
      // 🔥 支持 #### 四级标题
      renderedElements.push(
        <h4 key={i} className="mt-4 sm:mt-5 mb-1 sm:mb-2 text-base sm:text-lg font-semibold text-[var(--ink-700)]">
          {line.replace(/^####\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h4>
      );
    } else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      // 🔥 支持 - 和 * 两种无序列表格式
      const listContent = line.trim().replace(/^[-*]\s+/, "")
      renderedElements.push(
        <div key={i} className="flex gap-2 sm:gap-3 ml-1 my-2 sm:my-3 text-sm sm:text-base text-[var(--ink-700)] leading-relaxed">
          <div className={`mt-3 w-2 h-2 rounded-[var(--radius-pill)] bg-[${BRAND_GREEN}]/60 shrink-0`}></div>
          <span>
            <InlineText text={listContent} />
            {isLastLine && isStreaming && <StreamingCursor />}
          </span>
        </div>
      );
    } else if (line.trim().match(/^\d+\.\s+/)) {
      // 🔥 支持数字编号列表（1. 2. 3. 等）
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/)
      if (numMatch) {
        const num = numMatch[1]
        const listContent = numMatch[2]
        renderedElements.push(
          <div key={i} className="flex gap-2 sm:gap-3 ml-1 my-2 sm:my-3 text-sm sm:text-base text-[var(--ink-700)] leading-relaxed">
            <span className={`text-[${BRAND_GREEN}] font-semibold shrink-0`}>{num}.</span>
            <span>
              <InlineText text={listContent} />
              {isLastLine && isStreaming && <StreamingCursor />}
            </span>
          </div>
        );
      }
    } else if (line.trim().startsWith("> ")) {
      renderedElements.push(
        <blockquote key={i} className={`my-3 sm:my-5 border-l-3 border-[${BRAND_GREEN}] bg-[${BRAND_GREEN}]/5 px-3 sm:px-5 py-2 sm:py-4 rounded-r-xl`}>
          <div className="text-sm sm:text-base text-[var(--ink-700)] leading-relaxed">
            <InlineText text={line.replace(/^> /, "")} />
            {isLastLine && isStreaming && <StreamingCursor />}
          </div>
        </blockquote>
      );
    } else if (line.trim() === "---") {
      renderedElements.push(<div key={i} className="py-5"><div className="h-px bg-[var(--paper-200)]"></div></div>);
    } else if (line.trim() === "") {
      renderedElements.push(<div key={i} className="h-5"></div>);
    } else if (line.trim().startsWith("$$") && line.trim().endsWith("$$")) {
      // 🔥 支持块级 LaTeX 公式 $$...$$
      const formula = line.trim().slice(2, -2).trim()
      if (formula) {
        renderedElements.push(
          <div key={i} className="my-4 flex justify-center">
            <MathBlock formula={formula} />
          </div>
        )
      }
    } else {
      renderedElements.push(
        <p key={i} className="text-sm sm:text-base leading-relaxed sm:leading-[1.9] text-[var(--ink-700)] my-2 sm:my-3">
          <InlineText text={line} />
          {isLastLine && isStreaming && <StreamingCursor />}
        </p>
      );
    }
  }
  return (
    <div className="w-full overflow-hidden break-words">
      {/* 🧠 显示折叠的思考块（已完成的思考） */}
      {thinkContent && <ThinkingBlock content={thinkContent} isStreaming={false} />}

      {/* 🧠 显示正在进行的思考（流式输出中） */}
      {openThinkContent && <ThinkingBlock content={openThinkContent} isStreaming={true} />}

      {/* 🔥 媒体内容（图片、文件、PPT） */}
      {mediaItems.length > 0 && <MediaBlock items={mediaItems} />}

      {/* 主要内容 */}
      {renderedElements}
    </div>
  );
}

// --- 内部聊天核心组件 ---
interface ChatInterfaceInnerProps {
  initialModel?: ModelType
}

function ChatInterfaceInner({ initialModel }: ChatInterfaceInnerProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlSessionId = searchParams.get("sessionId")
  const urlAgent = searchParams.get("agent")
  const resolvedUrlAgent = resolveChatAgentParam(urlAgent)
  const teacherAgentShareCode = resolvedUrlAgent.teacherAgentShareCode
  const workflowSkillId = !urlSessionId ? resolvedUrlAgent.workflowSkillId : null
  const workflowSkillDisplay = getWorkflowSkillDisplay(workflowSkillId)
  // 🔥 优先使用 initialModel prop（来自动态路由），其次使用 URL 参数
  const effectiveAgent = initialModel || resolvedUrlAgent.model || urlAgent

  // 🔥 检测手机端
  const isMobile = useIsMobile()

  const [userId, setUserId] = useState<string>("")
  const [authResolved, setAuthResolved] = useState(false)
  const [userAvatar, setUserAvatar] = useState<string>("")
  const [userCredits, setUserCredits] = useState<number>(0)
  const [isPaidUser, setIsPaidUser] = useState(false)
  const [trialStatus, setTrialStatus] = useState<TrialSurveyStatus | null>(null)

  const getAvailableTrialCreditsForSubmit = useCallback((status: TrialSurveyStatus | null) => {
    if (!status?.active_grant_id) return 0
    const remaining = Number(status.today_trial_remaining || 0)
    return Number.isFinite(remaining) && remaining > 0 ? Math.floor(remaining) : 0
  }, [])
  const [surveyGateOpen, setSurveyGateOpen] = useState(false)
  // 🔥 新增：用户显示名称（手机号/邮箱）
  const [userDisplayName, setUserDisplayName] = useState<string>("")
  const sessionIdRef = useRef<string | null>(null)
  const difyConversationIdRef = useRef<string | null>(null)
  const sessionModelRef = useRef<ModelType | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string>("")
  const [savingMistakeMessageId, setSavingMistakeMessageId] = useState<string | null>(null)

  // 🔥 修复：跟踪主动会话切换（侧边栏点击 vs URL 导航）
  // 🔥 now in Zustand store: useSelectedModelStore
  // 🔥 修复：记录用户上次使用的模型（用于新建对话时恢复）
  const lastUsedModelRef = useRef<ModelType>((effectiveAgent as ModelType) || "general-chat")

  // ✅ 全局状态：所有组件共享单一 selectedModel 真源
  const selectedModel = useSelectedModelStore((s) => s.selectedModel)
  const setSelectedModel = useSelectedModelStore((s) => s.setSelectedModel)
  const isManualSessionSwitchRef = useRef(false) // 仅用于 useEffect 闭包比较
  const [genMode, setGenMode] = useState<GenMode>("text")

  const clearConversationState = () => {
    sessionIdRef.current = null
    difyConversationIdRef.current = null
    sessionModelRef.current = null
    setCurrentSessionId("")
    setCurrentWord("")
  }

  const adoptConversationState = (conversationId: string | null, model: ModelType) => {
    if (!conversationId) return
    difyConversationIdRef.current = conversationId
    sessionModelRef.current = model
  }

  const clearDifyConversationState = () => {
    difyConversationIdRef.current = null
    sessionModelRef.current = null
  }

  const isLuxury = userCredits > 1000

  // 🔥 历史会话侧边栏状态
  const [showHistorySidebar, setShowHistorySidebar] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])

  // 🔥 获取历史会话列表（必须在 useEffect 之前定义，否则闭包调用时函数未定义）
  // 🔥 修复: 使用 API 路由代替直接 Supabase 查询，支持 Authing 用户
  const fetchChatSessions = async (uid: string) => {
    console.log("📋 [历史会话] 开始查询")
    try {
      const res = await fetch(`/api/chat-session`, {
        headers: await getVerifiedAuthHeaders(),
      })

      console.log("📋 [历史会话] API 响应状态:", res.status)

      if (!res.ok) {
        if (res.status === 401) {
          console.warn("⚠️ [历史会话] 用户未登录")
          setChatSessions([])
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }

      const { sessions } = await res.json()
      console.log("📋 [历史会话] API 返回数据:", sessions?.length || 0, "条")

      // 防御性检查
      const safeSessionData = Array.isArray(sessions) ? sessions : []

      if (safeSessionData.length > 0) {
        console.log("📋 [历史会话] 找到会话:", safeSessionData.length)
        const mapped = safeSessionData.map((s: any) => ({
          id: s.id,
          title: s.title || "新对话",
          date: new Date(s.created_at).getTime(), // 使用 created_at，因为表只有这个时间列
          preview: s.preview || "",
          ai_model: s.ai_model || "standard",
          ai_provider: s.ai_provider || "",
          processing_mode: s.processing_mode || "",
        }))
        console.log("📋 [历史会话] 映射后数据:", mapped.length, "条")
        setChatSessions(mapped)
        console.log("📋 [历史会话] setChatSessions 已调用")
      } else {
        console.log("📋 [历史会话] 无数据")
        setChatSessions([])
      }
    } catch (err) {
      console.error("❌ [历史会话] 查询异常:", err)
      setChatSessions([])
    }
  }

  // 🔥 当打开历史会话侧边栏时，重新获取会话列表
  useEffect(() => {
    console.log("📋 [侧边栏] useEffect触发: showHistorySidebar=", showHistorySidebar, "userId=", userId || "空")
    if (showHistorySidebar && userId) {
      console.log("📋 [侧边栏] 打开历史会话，刷新列表")
      fetchChatSessions(userId)
    } else if (showHistorySidebar && !userId) {
      console.warn("⚠️ [侧边栏] userId为空，无法获取会话列表")
    }
  }, [showHistorySidebar, userId])

  // 🔥 监听全局会话刷新事件（由 refreshSessionList 触发）
  // 与 AppSidebar 保持同步，确保新建会话后侧边栏列表能实时更新
  useEffect(() => {
    const handleRefresh = () => {
      console.log("📋 [侧边栏] 收到 SESSION_LIST_REFRESH_EVENT，重新获取会话列表")
      if (userId) {
        fetchChatSessions(userId)
      }
    }
    window.addEventListener(SESSION_LIST_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(SESSION_LIST_REFRESH_EVENT, handleRefresh)
  }, [userId])

  // 🎯 工作流可视化 Hook (GenSpark 1:1 复刻版)
  const {
    workflowState,
    isFastTrack,
    showCursor,
    currentRunningText,
    handleSSEEvent,
    resetWorkflow,
    triggerHandover
  } = useWorkflowVisualizer()

	  useEffect(() => {
	    if (typeof window !== 'undefined') {
      const initUser = async () => {
        const { data: { user: verifiedUser } } = await supabase.auth.getUser()
        if (verifiedUser?.id) {
          setUserId(verifiedUser.id)
          setAuthResolved(true)
          if (verifiedUser.user_metadata?.avatar_url) setUserAvatar(verifiedUser.user_metadata.avatar_url)
          const displayName = verifiedUser.phone || verifiedUser.email || verifiedUser.user_metadata?.name || "用户"
          setUserDisplayName(displayName)
          fetchCredits(verifiedUser.id)
          fetchChatSessions(verifiedUser.id)
          recoverPendingTasks(verifiedUser.id)
          return
        }

        const { user, userId: storedUserId, hasVerifiedToken } = getStoredClientIdentity()
        if (user && typeof user === "object") {
          const record = user as Record<string, any>
          console.log("🔑 [用户初始化] 解析用户:", {
            hasId: Boolean(storedUserId),
            hasPhone: Boolean(record.phone || record.phone_number),
            hasEmail: Boolean(record.email),
          })
          if (record.user_metadata?.avatar_url) setUserAvatar(record.user_metadata.avatar_url)

          const displayName =
            record.phone ||
            record.phone_number ||
            record.email ||
            record.nickname ||
            record.username ||
            record.user_metadata?.name ||
            "用户"
          setUserDisplayName(displayName)
          console.log("👤 [用户初始化] 显示名称:", displayName)
        } else {
          console.warn("⚠️ [用户初始化] localStorage 中无 currentUser")
        }

        const hydrated = await hydrateVerifiedUserFromApi()
        if (hydrated) {
          setAuthResolved(true)
          return
        }

        if (hasVerifiedToken && storedUserId) {
          setUserId(storedUserId)
          setAuthResolved(true)
          fetchCredits(storedUserId)
          fetchChatSessions(storedUserId)
          recoverPendingTasks(storedUserId)
          return
        }

        if (user) {
          console.warn("⚠️ [用户初始化] 检测到本地用户，但后端暂未确认身份，保留展示信息并等待后续重试")
        }
        setAuthResolved(true)
      }
      initUser().catch((error) => {
        console.warn("⚠️ [用户初始化] verified session 查询失败:", error)
        setAuthResolved(true)
      })
    }
	  }, [])

	  const recoverPendingTasks = async (uid: string) => {
	    if (typeof window === "undefined") return
	    try {
	      const pending = JSON.parse(localStorage.getItem(PENDING_TASK_STORAGE_KEY) || "[]")
	      const pendingTasks = Array.isArray(pending) ? pending : []
	      if (pendingTasks.length === 0) return

	      const recentPending = pendingTasks.filter((task: any) => {
	        const ageMs = Date.now() - Number(task?.createdAt || 0)
	        return task?.requestId && ageMs > 0 && ageMs < 24 * 60 * 60 * 1000
	      })
	      if (recentPending.length === 0) {
	        localStorage.removeItem(PENDING_TASK_STORAGE_KEY)
	        return
	      }

	      const res = await fetch(`/api/task-status?limit=10`, {
	        headers: await getVerifiedAuthHeaders(),
	      })
	      if (!res.ok) return
	      const payload = await res.json()
	      const tasks = Array.isArray(payload.tasks) ? payload.tasks : []
	      const activeTasks = tasks.filter((task: any) => ["queued", "running"].includes(task.status))
	      const finishedRequestIds = new Set(tasks
	        .filter((task: any) => ["succeeded", "failed", "timeout", "cancelled"].includes(task.status))
	        .map((task: any) => task.request_id))

	      for (const requestId of finishedRequestIds) {
	        forgetPendingTask(String(requestId))
	      }

	      if (activeTasks.length > 0) {
	        const task = activeTasks[0]
	        toast.info("检测到未完成的长任务，已恢复状态", {
	          description: sanitizePublicAiStatus(task.stage, "任务仍在处理中"),
	          duration: 5000,
	        })
	      }
	    } catch (error) {
	      console.warn("⚠️ [任务恢复] 查询失败:", error)
	    }
	  }

  const fetchCredits = async (uid: string) => {
    console.log("💰 [积分查询] 通过 API 查询")
    try {
      // 🔥 使用 API 查询积分（绕过 RLS 限制）
	      const res = await fetch(`/api/user/credits`, {
          headers: await getVerifiedAuthHeaders(),
        })
      if (res.ok) {
        const data = await res.json()
        console.log("✅ [积分查询] API 成功:", data.credits)
        if (typeof data.userId === "string" && data.userId && data.userId !== userId) {
          setUserId(data.userId)
          if (!uid) {
            fetchChatSessions(data.userId)
            recoverPendingTasks(data.userId)
          }
        }
        setUserCredits(data.credits || 0)
        setIsPaidUser(Boolean(data.is_pro))
      } else {
        console.error("❌ [积分查询] API 失败:", res.status)
      }
    } catch (err) {
      console.error("❌ [积分查询] 异常:", err)
    }
  }

  const hydrateVerifiedUserFromApi = async () => {
    try {
      const headers = await getVerifiedAuthHeaders()
      if (!headers.Authorization) return false
      const res = await fetch("/api/user/credits", { cache: "no-store", headers })
      if (!res.ok) return false
      const data = await res.json().catch(() => null)
      const verifiedUserId = typeof data?.userId === "string" ? data.userId : ""
      if (!verifiedUserId) return false
      setUserId(verifiedUserId)
      setUserCredits(typeof data.credits === "number" ? data.credits : 0)
      setIsPaidUser(Boolean(data.is_pro))
      fetchChatSessions(verifiedUserId)
      recoverPendingTasks(verifiedUserId)
      return true
    } catch (error) {
      console.warn("⚠️ [用户初始化] 后端身份校验失败:", error)
      return false
    }
  }

  const shouldRequireEssaySurvey = useCallback((status: TrialSurveyStatus | null) => {
    return Boolean(
      status?.active_grant_id &&
      status.requires_daily_survey !== false &&
      !status.today_survey_completed &&
      !isPaidUser
    )
  }, [isPaidUser])

  const refreshTrialSurveyState = useCallback(async () => {
    if (!userId) {
      return { status: null as TrialSurveyStatus | null, trialEligible: false, gateRequired: false }
    }

    try {
      const headers = await getVerifiedAuthHeaders()
      const [surveyResponse, creditsResponse] = await Promise.all([
        fetch("/api/surveys/today", { cache: "no-store", headers }),
        fetch("/api/user/credits", { cache: "no-store", headers }),
      ])

      const creditsData = await creditsResponse.json().catch(() => null)
      const nextIsPaidUser = Boolean(creditsData?.is_pro || isPaidUser)
      setIsPaidUser(nextIsPaidUser)
      if (typeof creditsData?.credits === "number") {
        setUserCredits(creditsData.credits)
      }

      const data = await surveyResponse.json().catch(() => null)
      if (!surveyResponse.ok || !data?.ok) {
        console.warn("[TrialSurveyGate] today survey precheck failed", surveyResponse.status, data?.error)
        return { status: null as TrialSurveyStatus | null, trialEligible: false, gateRequired: false }
      }

      const status = (data.trialStatus || null) as TrialSurveyStatus | null
      setTrialStatus(status)
      return {
        status,
        trialEligible: Boolean(status?.active_grant_id),
        gateRequired: Boolean(
          status?.active_grant_id &&
          status.requires_daily_survey !== false &&
          !status.today_survey_completed &&
          !nextIsPaidUser
        ),
      }
    } catch (error) {
      console.warn("[TrialSurveyGate] today survey precheck error", error)
      return { status: null as TrialSurveyStatus | null, trialEligible: false, gateRequired: false }
    }
  }, [isPaidUser, userId])

  const isAuthenticated = Boolean(userId)
  const isAuthPending = !authResolved

  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      // URL 导航（非手动点击），由 loadHistorySession 中的 initialModel 决定模型
      isManualSessionSwitchRef.current = false
      loadHistorySession(urlSessionId)
    }
  }, [urlSessionId])

  const prevUrlAgentRef = useRef<string | null>(null)

  useEffect(() => {
    const targetModel = urlAgent ? (resolvedUrlAgent.model || "general-chat") : (initialModel || "general-chat")

    console.log(`🔗 [URL Sync] urlAgent=${urlAgent}, prevUrlAgent=${prevUrlAgentRef.current}, targetModel=${targetModel}, teacherAgent=${teacherAgentShareCode || ""}, workflowSkill=${workflowSkillId || ""}`)

    if (urlAgent !== prevUrlAgentRef.current) {
      prevUrlAgentRef.current = urlAgent

      console.log(`🔄 [强制模型同步] → ${targetModel}`)
      lastUsedModelRef.current = targetModel
      setSelectedModel(targetModel)
      setGenMode("text")

      if (!urlSessionId) {
        setMessages([])
        clearConversationState()
      }
    }
  }, [initialModel, resolvedUrlAgent.model, setSelectedModel, teacherAgentShareCode, urlAgent, urlSessionId, workflowSkillId])

  // 🔥 当路由参数 initialModel 变化时，同步更新 selectedModel
  // 但如果是加载历史会话（urlSessionId 存在），则跳过，由 loadHistorySession 处理模型同步
  useEffect(() => {
    if (initialModel && initialModel !== selectedModel && !urlSessionId) {
      console.log(`🔄 [模型同步] initialModel=${initialModel} → selectedModel=${initialModel}`)
      lastUsedModelRef.current = initialModel
      setSelectedModel(initialModel)
    }
  }, [initialModel, urlSessionId])

  // 🔥 当 urlSessionId 为空时（新建对话），恢复用户上次使用的模型或默认模型
  useEffect(() => {
    if (initialModel || urlAgent) return
    if (!urlSessionId && selectedModel !== lastUsedModelRef.current) {
      logger.debug(`🔄 [新建对话模型恢复] ${selectedModel} → ${lastUsedModelRef.current}`)
      setSelectedModel(lastUsedModelRef.current)
    }
  }, [initialModel, urlAgent, urlSessionId])

  const loadHistorySession = async (sid: string) => {
    logger.debug(`📂 [loadHistorySession] 开始加载会话: ${sid}`)
    setIsLoading(true)
    setMessages([])
    try {
      const res = await fetch(`/api/chat-session?sessionId=${encodeURIComponent(sid)}`, {
        headers: await getVerifiedAuthHeaders(),
      })
      if (!res.ok) throw new Error(`history_session_load_failed_${res.status}`)
      const { session: sessionData, messages: data } = await res.json()

      logger.debug(`📂 [loadHistorySession] ai_model=${sessionData?.ai_model}`)

      // 🔥 同步模型状态 - 当用户主动切换会话时，优先使用会话真实模型
      // store.isManualSessionSwitch 为 true 时表示侧边栏点击，此时用 sessionData.ai_model
      // store.isManualSessionSwitch 为 false 时表示 URL 导航，此时用 initialModel（保持分享链接兼容性）
      const isManual = useSelectedModelStore.getState().isManualSessionSwitch
      const targetModel = isManual
        ? (sessionData?.ai_model || "general-chat")
        : (initialModel || sessionData?.ai_model || "general-chat")
      console.log(`🔄 [历史会话模型同步] isManual=${isManual}, initialModel=${initialModel}, ai_model=${sessionData?.ai_model} → selectedModel=${targetModel}`)
      setSelectedModel(targetModel as ModelType)
      console.log(`✅ [历史会话模型同步] setSelectedModel 已调用: ${targetModel}`)
      setCurrentSessionId(sid)

      if (data && data.length > 0) {
        // 🔥 加载消息时包含 metadata（用于恢复音乐数据）
        const historyMessages = data.map((m: any) => ({
           id: m.id,
           role: m.role,
           content: m.role === "assistant" ? sanitizeAssistantMessageForPublicDisplay(m.content) : m.content,
           metadata: m.metadata || null,  // 🔥 包含音乐等附加数据
           wordCard: m.metadata?.wordCard || normalizeDifyWordCardResponse(m.content)
        }))
        setMessages(historyMessages)
        if (typeof sessionData?.dify_conversation_id === "string" && sessionData.dify_conversation_id) {
          adoptConversationState(sessionData.dify_conversation_id, targetModel as ModelType)
        } else {
          clearDifyConversationState()
        }
        const restoredCurrentWord = [...historyMessages].reverse().find((message) => message.wordCard?.word)?.wordCard?.word
        setCurrentWord(restoredCurrentWord || "")
      } else {
        clearDifyConversationState()
      }
    } catch (e) {
      console.error("加载历史会话失败:", e)
      toast.error("加载历史会话失败")
    } finally {
      setIsLoading(false)
      // 🔥 重置主动切换标记（store + ref）
      isManualSessionSwitchRef.current = false
      useSelectedModelStore.getState().markUrlNavigation()
    }
  }

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [vocabCardInputs, setVocabCardInputs] = useState<VocabCardDifyInputs>({
    word: "",
    level: "high",
    style: "colorful",
    language: "zh-CN",
  })
  const [codexSkillPickerOpen, setCodexSkillPickerOpen] = useState(false)
  const [selectedCodexSkill, setSelectedCodexSkill] = useState<CodexSkill | null>(null)
  const [openClawSkillPickerOpen, setOpenClawSkillPickerOpen] = useState(false)
  const [selectedOpenClawSkill, setSelectedOpenClawSkill] = useState<OpenClawSkill | null>(null)
  const [currentWord, setCurrentWord] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  // 🔥 深度思考提示状态（15秒后显示）
  const [showDeepThinkingHint, setShowDeepThinkingHint] = useState(false)
  const deepThinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [fileProcessing, setFileProcessing] = useState<FileProcessingState>({ status: "idle", progress: 0, message: "" })
  // 🔥 动态状态消息（用于轮播显示）
  const [dynamicStatusMessage, setDynamicStatusMessage] = useState("")
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isComplexMode, setIsComplexMode] = useState(false)
  const [analysisStage, setAnalysisStage] = useState(0)
  const [processingContext, setProcessingContext] = useState<ProcessingContext | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // 🎤 语音输入状态
  const [isListening, setIsListening] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  // 🔥 记录当前正在处理的 AI 消息 ID
  const currentBotIdRef = useRef<string | null>(null)

  // 🔥 智能滚动状态
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  // 检测是否在底部附近
  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current
      const isNear = scrollHeight - scrollTop - clientHeight < 100
      setIsNearBottom(isNear)
      if (isNear) setHasNewMessage(false)
    }
  }

  // 滚动到底部的函数
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    setHasNewMessage(false)
  }

  // 新消息时的智能滚动处理
  useEffect(() => {
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    } else if (messages.length > 0) {
      setHasNewMessage(true)
    }
  }, [messages, isNearBottom])
  useEffect(() => { if (isLoading && isComplexMode && analysisStage < 4) setTimeout(() => setAnalysisStage(p => Math.min(p + 1, 4)), 2000) }, [isLoading, analysisStage, isComplexMode])

  // 🔥 深度思考提示：isLoading 启动后 15 秒显示提示，收到首字节后清除
  useEffect(() => {
    if (!isLoading) {
      setShowDeepThinkingHint(false)
      if (deepThinkingTimerRef.current) {
        clearTimeout(deepThinkingTimerRef.current)
        deepThinkingTimerRef.current = null
      }
      return
    }

    deepThinkingTimerRef.current = setTimeout(() => {
      setShowDeepThinkingHint(true)
      setProcessingContext((context) => context
        ? {
            ...context,
            lastActivityAt: Date.now(),
            stage: context.fileCount > 0
              ? "文件任务处理较久，连接仍在等待返回"
              : "任务处理较久，连接仍在等待返回",
          }
        : context)
    }, 15_000)

    return () => {
      if (deepThinkingTimerRef.current) {
        clearTimeout(deepThinkingTimerRef.current)
        deepThinkingTimerRef.current = null
      }
    }
  }, [isLoading])

  // 🔥 Smart Textarea: auto-expand 2-10 rows
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      const lineHeight = 22
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, lineHeight * 2),
        lineHeight * 10
      )
      textarea.style.height = `${newHeight}px`
    }
  }, [input])

  // 🔥 首字节探测：一旦当前 AI 消息开始收到内容，立即清除深度思考提示
  useEffect(() => {
    if (isLoading && currentBotIdRef.current) {
      const currentBotMessage = messages.find(m => m.id === currentBotIdRef.current)
      if (currentBotMessage && currentBotMessage.content && currentBotMessage.content.length > 0) {
        setShowDeepThinkingHint(false)
        if (deepThinkingTimerRef.current) {
          clearTimeout(deepThinkingTimerRef.current)
          deepThinkingTimerRef.current = null
        }
      }
    }
  }, [messages, isLoading])

  // --- 模型配置（增强版：添加描述和标签） ---
  const fallbackModelConfig: Partial<Record<ModelType, ModelUiConfig>> = {
    "general-chat": {
      name: getPublicAiLabel("general-chat"),
      modelKey: "general-chat",
      color: BRAND_GREEN,
      description: "轻量快速问答",
      badge: "默认",
      group: "智能能力"
    },
    "standard": {
      name: "作文批改",
      modelKey: "standard",
      color: BRAND_GREEN,
      description: "专业作文分析与点评",
      badge: "推荐",
      group: "教育专用"
    },
    "teaching-pro": {
      name: "教学评助手",
      modelKey: "teaching-pro",
      color: BRAND_GREEN,
      description: "教学评估与反馈",
      group: "教育专用"
    },
    "quanquan-math": {
      name: "全学段数学",
      modelKey: "quanquan-math",
      color: BRAND_GREEN,
      description: "问题解答，步骤清晰",
      group: "教育专用"
    },
    "quanquan-english": {
      name: "全学段英语",
      modelKey: "quanquan-english",
      color: BRAND_GREEN,
      description: "听说读写，全面覆盖",
      group: "教育专用"
    },
    "vocab-card": {
      name: "词境记忆卡",
      modelKey: "vocab-card",
      color: BRAND_GREEN,
      description: "词根联想，卡片复习",
      badge: "新",
      group: "教育专用"
    },
    "beike-pro": {
      name: "备课助手Pro",
      modelKey: "beike-pro",
      color: BRAND_GREEN,
      description: "智能备课，高效便捷",
      group: "教育专用"
    },
    "banzhuren": {
      name: "班主任助手",
      modelKey: "banzhuren",
      color: BRAND_GREEN,
      description: "班级管理，家校沟通",
      group: "教育专用"
    },
    "all-in-one-agent": {
      name: "数学图片与动画生成器",
      modelKey: "all-in-one-agent",
      color: BRAND_GREEN,
      description: "动画、图片、文件全能创作",
      badge: "新",
      group: "教育专用"
    },
    "super-all-in-one-agent": {
      name: "超级全能智能体",
      modelKey: "super-all-in-one-agent",
      color: BRAND_GREEN,
      description: "复杂问题拆解、PPT、图像、视频、论文与联网资料整理",
      badge: "新",
      group: "智能能力"
    },
    "gpt-5": {
      name: getPublicAiLabel("gpt-5"),
      modelKey: "gpt-5",
      color: BRAND_GREEN,
      description: "通用推理、写作和复杂问题拆解",
      badge: "新",
      group: "智能能力"
    },
    "claude-opus": {
      name: getPublicAiLabel("claude-opus"),
      modelKey: "claude-opus",
      color: BRAND_GREEN,
      description: "深度推理与分析",
      group: "智能能力"
    },
    "gemini-pro": {
      name: getPublicAiLabel("gemini-pro"),
      modelKey: "gemini-pro",
      color: BRAND_GREEN,
      description: "图文资料理解与整理",
      group: "智能能力"
    },
    "gemini-image": {
      name: getPublicAiLabel("gemini-image"),
      modelKey: "gemini-image",
      color: BRAND_GREEN,
      description: "文生图与图像编辑",
      badge: "新",
      group: "创意生成"
    },
    "gpt-image-2": {
      name: getPublicAiLabel("gpt-image-2"),
      modelKey: "gpt-image-2",
      color: BRAND_GREEN,
      description: "高质量图像生成与编辑",
      badge: "推荐",
      group: "创意生成",
    },
    "grok-4.2": {
      name: getPublicAiLabel("grok-4.2"),
      modelKey: "grok-4.2",
      color: BRAND_GREEN,
      description: "开放式探索与灵感发散",
      group: "智能能力"
    },
    "open-claw": {
      name: getPublicAiLabel("open-claw"),
      modelKey: "open-claw",
      color: BRAND_GREEN,
      description: "复杂创作、演示和多步骤内容生成",
      badge: "推荐",
      group: "智能能力"
    },
    "ai-writing-paper": {
      name: "论文写作",
      modelKey: "ai-writing-paper",
      color: BRAND_GREEN,
      description: "学术论文写作辅助",
      badge: "新",
      group: "AI写作"
    },
    "zhongying-essay": {
      name: "中英文作文",
      modelKey: "zhongying-essay",
      color: BRAND_GREEN,
      description: "K12与四六级作文思路启发与语法润色",
      group: "AI写作"
    },
    "experiment-report": {
      name: "实验报告助理",
      modelKey: "experiment-report",
      color: BRAND_GREEN,
      description: "规范理工科实验报告格式与结论分析",
      group: "AI写作"
    },
  }

  const modelConfig: Partial<Record<ModelType, ModelUiConfig>> = {
    ...fallbackModelConfig,
    ...navigationModelConfig,
  }

  const getModelUiConfig = (model: ModelType): ModelUiConfig => {
    return modelConfig[model] || {
      name: sanitizePublicAiLabel(MODEL_DISPLAY_NAMES[model] || getModelDisplayName(model), "当前功能"),
      modelKey: model,
      color: BRAND_GREEN,
      description: "AI 助手",
      group: "智能能力",
    }
  }

  const plazaChatAgents = PLAZA_AGENTS.map((agent) => {
    const builtinConfig = modelConfig[agent.id as ModelType]
    return {
      key: agent.id,
      name: agent.name,
      icon: agent.icon,
      modelKey: (agent.modelKey ?? builtinConfig?.modelKey) as any,
      color: builtinConfig?.color || BRAND_GREEN,
      description: agent.description,
      badge: agent.badge,
      group: agent.category,
      href: agent.href,
      routeId: agent.routeId,
      workflowSkill: agent.workflowSkill,
      external: agent.external,
      priceLabel: agent.priceLabel,
      memberOnly: agent.memberOnly,
    }
  })

  // 🔥 转换为 ModelSelector 需要的格式，并以智能体广场为完整来源
  const modelList = plazaChatAgents

  const selectedAgentKey = workflowSkillId || selectedModel
  const selectedAgentName = workflowSkillDisplay?.name || getModelUiConfig(selectedModel).name

  const handleModelChange = (model: string, item?: Model) => {
    if (item?.external) {
      window.open(item.href || item.routeId || "/agents", "_blank", "noopener,noreferrer")
      return
    }

    if (item?.href && !item.href.startsWith("/chat")) {
      router.push(item.href)
      return
    }

    if (item?.workflowSkill) {
      const nextRoute = item.href || `/chat?agent=${encodeURIComponent(model)}`
      const targetModel = "general-chat" as ModelType
      if (selectedModel !== targetModel) {
        clearConversationState()
        setMessages([])
        setSelectedCodexSkill(null)
        setSelectedOpenClawSkill(null)
      }
      setGenMode("text")
      lastUsedModelRef.current = targetModel
      setSelectedModel(targetModel)
      router.push(nextRoute)
      toast.success(`已切换至 ${item.name}`)
      return
    }

    if (!(model in MODEL_COSTS)) return
    const nextModel = model as ModelType

    if (nextModel !== selectedModel) {
      clearConversationState()
      setMessages([])
      setSelectedCodexSkill(null)
      setSelectedOpenClawSkill(null)
      console.log(`🔄 [模型切换] ${selectedModel} → ${nextModel}，已清除会话命名空间`)
    }

    if (nextModel !== "standard") {
      toast.success(`已切换至 ${getModelUiConfig(nextModel).name}`)
    }

    // 🚀 图像模型使用独立工作台，避免落回通用 AI 对话画面
    if (nextModel === "gemini-image" || nextModel === "gpt-image-2") {
      console.log('✅ [模型切换] 检测到图像模型，跳转到专用页面')
      router.push(`/chat/${nextModel}`)
      return
    }

    setGenMode("text")

    // 🔥 记录用户上次使用的模型
    lastUsedModelRef.current = nextModel
    setSelectedModel(nextModel)
    router.push(`/chat/${nextModel}`)

    console.log(`🔄 [模型切换] 已切换至 ${model}`)

    if (input === "" || input.startsWith("生成")) {
       setInput("")
    }
  }

  const calculateCost = () => {
    if (!userId) return 0
    return calculatePreviewCost(selectedModel, {
      estimatedInputTokens: input.length > 0 ? Math.ceil(input.length / 4) * 2 : undefined
    })
  }

  // ============================================
  // 🔥 大文件上传：使用通用上传服务
  // ============================================

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("📎 [handleFileUpload] 触发文件上传事件")
    const files = event.target.files;
    console.log("📎 [handleFileUpload] 选择的文件:", files?.length, files)

    if (!files || !files.length) {
      console.log("📎 [handleFileUpload] 没有选择文件，退出")
      return;
    }

    // 🔥 检查用户是否已登录
    if (!userId) {
      console.log("📎 [handleFileUpload] 用户未登录")
      toast.error("请先登录后再上传文件")
      return
    }

    console.log("📎 [handleFileUpload] 开始上传")
    setIsUploading(true)
    setUploadProgress(0)
    setFileProcessing({ status: "uploading", progress: 0, message: "正在处理..." })
    setDynamicStatusMessage(getRandomStatusMessage("uploading", 0))

    try {
        const totalFiles = files.length
        const uploadPromises = Array.from(files).map(async (file, index) => {
            const fileToUpload = file;

            // ============================================
            // 🔥 前端安全校验
            // ============================================
            const validation = validateFileForUpload(fileToUpload)
            if (!validation.valid) {
              throw new Error(validation.error)
            }

            // ============================================
            // ✅ 上传：统一走 /api/dify-upload → Dify → 腾讯云 COS
            // ============================================
            console.log("📤 [Upload] 上传文件:", fileToUpload.name, (fileToUpload.size / 1024 / 1024).toFixed(2) + "MB")

            const formData = new FormData();
            formData.append("file", fileToUpload);
            formData.append("user", userId)

            const res = await fetch("/api/dify-upload", {
              method: "POST",
              headers: {
                ...(await getRequiredAuthHeaders()),
                "X-Model": selectedModel || ""
              },
              body: formData
            })

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}))
              if (res.status === 413) {
                throw new Error(`文件超过 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB 限制`)
              }
              throw new Error(errData.error || `上传失败: ${res.status}`)
            }

            const data = await res.json()
            const gatewayUrl = data.gatewayUrl || data.data?.gateway_url
            const modelUrl = data.modelUrl || data.data?.model_url || data.data?.url || gatewayUrl

            // 🔥 更新进度
            setUploadProgress(Math.round(((index + 1) / totalFiles) * 100))

            return new Promise<UploadedFile>((resolve) => {
                if (isUploadedImageFile({ name: fileToUpload.name, type: fileToUpload.type })) {
                    resolve({
                        name: fileToUpload.name,
                        type: fileToUpload.type,
                        size: fileToUpload.size,
                        data: modelUrl || "",
                        difyFileId: data.id,
                        gatewayUrl,
                        modelUrl,
                        storageUrl: modelUrl || gatewayUrl || (data.id ? `dify-file://${data.id}` : ""),
                        preview: URL.createObjectURL(fileToUpload)
                    });
                } else {
                    resolve({
                        name: fileToUpload.name,
                        type: fileToUpload.type,
                        size: fileToUpload.size,
                        data: data.id ? `dify-file://${data.id}` : "",
                        difyFileId: data.id,
                        gatewayUrl,
                        modelUrl,
                        storageUrl: data.id ? `dify-file://${data.id}` : "",
                        preview: undefined
                    })
                }
            })
        });

        const results = await Promise.all(uploadPromises);
        setUploadedFiles(p => [...p, ...results]);
        toast.success("文件上传成功")
        setFileProcessing({ status: "idle", progress: 100, message: "完成" })
        setDynamicStatusMessage("")
        setTimeout(() => setFileProcessing({ status: "idle", progress: 0, message: "" }), 1000)
    } catch(e: any) {
        console.error("上传错误:", e);
        toast.error(e.message || "上传失败")
        setFileProcessing({ status: "error", progress: 0, message: e.message || "上传失败" })
    } finally {
        setIsUploading(false)
        setUploadProgress(0)
    }
    if(fileInputRef.current) fileInputRef.current.value=""
  }

  // ============================================
  // 🎤 语音输入功能
  // ============================================
  const toggleVoiceInput = async () => {
    if (isListening) {
      // 停止录音
      try {
        const audioBlob = await voiceRecorderRef.current?.stop()
        setIsListening(false)

        if (audioBlob && audioBlob.size > 0) {
          toast.info("正在识别语音...")
          const transcript = await transcribeAudio(audioBlob, input)
          if (transcript.trim()) {
            setInput((prev) => [prev, transcript.trim()].filter(Boolean).join(prev.trim() ? " " : ""))
            toast.success("语音已转为文字")
          } else {
            toast.warning("没有识别到清晰语音")
          }
        }
      } catch (error) {
        console.error("🎤 停止录音失败:", error)
        toast.error("录音处理失败")
        setIsListening(false)
      }
    } else {
      // 开始录音
      if (!userId) {
        toast.error("请先登录")
        return
      }

      if (!VoiceRecorder.isSupported()) {
        toast.error("当前浏览器不支持语音输入")
        return
      }

      try {
        voiceRecorderRef.current = new VoiceRecorder()
        await voiceRecorderRef.current.start()
        setIsListening(true)
        toast.info("录音中，再次点击停止", { duration: 2000 })
      } catch (error) {
        console.error("🎤 开始录音失败:", error)
        toast.error("无法访问麦克风，请检查权限设置")
      }
    }
  }

  // ============================================
  // 🔊 TTS 语音播放功能
  // ============================================
  const playAssistantMessage = useCallback(async (content: string) => {
    if (isPlaying) {
      // 停止播放
      const currentAudio = audioRef.current
      currentAudio?.pause()
      if (currentAudio?.src.startsWith("blob:")) URL.revokeObjectURL(currentAudio.src)
      audioRef.current = null
      setIsPlaying(false)
      return
    }

    try {
      toast.info("正在生成语音...")
      const audioUrl = await getDifyTTS(content, selectedModel)

      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.onended = () => {
        setIsPlaying(false)
        if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl)
      }
      audio.onerror = () => {
        setIsPlaying(false)
        toast.error("音频播放失败")
        if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl)
      }
      await audio.play()
      setIsPlaying(true)
      toast.success("播放中...")
    } catch (error) {
      console.error("🔊 TTS 播放失败:", error)
      toast.error(error instanceof Error ? error.message : "语音合成失败")
    }
  }, [isPlaying, selectedModel])

  useEffect(() => {
    const handlePlayMessageAudio = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text?.trim()
      if (!text) return
      void playAssistantMessage(text)
    }

    window.addEventListener("play-chat-message-audio", handlePlayMessageAudio)
    return () => {
      window.removeEventListener("play-chat-message-audio", handlePlayMessageAudio)
    }
  }, [playAssistantMessage])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      audio?.pause()
      if (audio?.src.startsWith("blob:")) URL.revokeObjectURL(audio.src)
      audioRef.current = null
    }
  }, [])

  const onSubmit = async (
    e: React.FormEvent,
    overrides?: { content?: string; files?: UploadedFile[] }
  ) => {
    const clickStartedAt = Date.now()
    e.preventDefault(); if (!userId) { toast.error("请登录"); return }
    const authHeadersPromise = getVerifiedAuthHeaders()
    const activeFiles = overrides?.files ?? uploadedFiles
    const txt = ((overrides?.content ?? input) || "").trim()
    const isWordCardSubmit = selectedModel === "vocab-card"
    const vocabUserMessage = isWordCardSubmit ? txt : ""
    const vocabWord = isWordCardSubmit ? vocabCardInputs.word.trim() : ""
    const vocabCurrentWord = isWordCardSubmit ? currentWord.trim() : ""

    if (isWordCardSubmit && !vocabUserMessage && !vocabWord) {
      toast.error("请输入想说的话，或填写一个英文单词")
      return
    }
    if (!isWordCardSubmit && !txt && !activeFiles.length) return

    const vocabWorkflowInputs = isWordCardSubmit
      ? buildVocabCardWorkflowInputs({
          query: vocabUserMessage,
          inputs: {
            user_message: vocabUserMessage,
            word: vocabWord,
            current_word: vocabCurrentWord,
            level: vocabCardInputs.level,
            style: vocabCardInputs.style,
            language: vocabCardInputs.language,
          },
        })
      : undefined

    console.log("📤 [onSubmit] 发送消息:", {
      model: selectedModel,
      teacherAgentShareCode,
      mode: genMode,
      promptLength: txt.length,
      urlAgent,
      sessionId: currentSessionId,
      hasDifyConversation: Boolean(difyConversationIdRef.current)
    })

    let trialEligibleForSubmit = Boolean(trialStatus?.active_grant_id)
    let availableTrialCreditsForSubmit = getAvailableTrialCreditsForSubmit(trialStatus)
    if (!isPaidUser) {
      const surveyState = await refreshTrialSurveyState()
      trialEligibleForSubmit = surveyState.trialEligible
      availableTrialCreditsForSubmit = getAvailableTrialCreditsForSubmit(surveyState.status)
      const cost = calculateCost()
      if (surveyState.gateRequired && userCredits < cost) {
        const openedSurveyGate = await openTrialSurveyGate({
          featureName: getModelUiConfig(selectedModel).name || "当前功能",
          message: "请先完成今日问卷，解锁体验额度后继续使用当前功能。",
        })
        setSurveyGateOpen(openedSurveyGate)
        if (!openedSurveyGate) {
          trialEligibleForSubmit = false
        } else {
          return
        }
      }
    }

    const cost = calculateCost()
    const availableCreditsForSubmit = userCredits + (trialEligibleForSubmit ? availableTrialCreditsForSubmit : 0)
    if (availableCreditsForSubmit < cost) {
      toast.error("积分不足", {
        description: availableTrialCreditsForSubmit > 0
          ? `需要 ${cost} 积分，当前真实积分 ${userCredits}，体验额度 ${availableTrialCreditsForSubmit}`
          : `需要 ${cost} 积分，当前 ${userCredits}`,
        duration: 2000
      })
      return
    }

    const isTeacherAgentSubmit = Boolean(teacherAgentShareCode)
	    const requestId = createClientRequestId(isTeacherAgentSubmit ? "teacher-agent" : selectedModel === "gpt-image-2" ? "img" : selectedModel === "open-claw" ? "openclaw" : "chat")

	    setFileProcessing({ status: "idle", progress: 0, message: "" })
	    setDynamicStatusMessage("")
	    setIsLoading(true); setAnalysisStage(0);
	    setIsComplexMode(activeFiles.length > 0 || txt.length > 150)
	      setProcessingContext({
	      model: selectedModel,
	      fileCount: activeFiles.length,
	      promptLength: txt.length,
	      startedAt: Date.now(),
	      lastActivityAt: Date.now(),
	      heartbeatCount: 0,
	      requestId,
	      stage: "请求已提交"
	    })

    // 🎯 重置工作流可视化状态
    resetWorkflow()

    // 🔥 自动折叠侧边栏，进入专注模式
    collapseSidebar()

    let sid = currentSessionId;
    const hadUrlSessionId = Boolean(urlSessionId)
    // 🔥 修复：当模型切换时（currentSessionId 为空），即使 urlSessionId 存在也忽略
    // 否则会导致用旧模型的 session 去请求新模型
    const isModelSwitch = !currentSessionId && Boolean(urlSessionId);
    if (!sid && !urlSessionId) {
        sid = createLocalSessionId();
        setCurrentSessionId(sid);
        clearDifyConversationState();
    } else if (urlSessionId && !isModelSwitch) {
        sid = urlSessionId;
        setCurrentSessionId(urlSessionId);
        clearDifyConversationState();
    } else {
        // 模型切换或无 session 的情况，生成新的
        sid = createLocalSessionId();
        setCurrentSessionId(sid);
        clearDifyConversationState();
    }
    if (selectedModel === "vocab-card" && sid && !hadUrlSessionId && typeof window !== "undefined") {
      window.history.replaceState(null, "", buildChatSessionRoute(sid, selectedModel))
    }

    // 🔥 根据模型类型设置不同的默认提示词
    const defaultPrompts: Record<string, string> = {
      "general-chat": "你好",
      "standard": "批改作文",
      "teaching-pro": "分析教学材料",
    }
    const defaultPrompt = defaultPrompts[selectedModel] || "请分析"
    // 🔥 将上传的文件附加到用户消息中
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: isWordCardSubmit ? (vocabUserMessage || `学习单词：${vocabWord}`) : (txt || defaultPrompt),
      files: activeFiles.length > 0 ? [...activeFiles] : undefined  // 🔥 携带文件信息
    }
    setMessages(p => [...p, userMsg]); setInput(""); setUploadedFiles([])
    if (isWordCardSubmit) {
      setVocabCardInputs((previous) => ({ ...previous, word: "" }))
    }
    // 🔥 发送后自动滚动到消息底部，确保 AI 回复时能自动跟进
    setTimeout(() => scrollToBottom(), 50)

    const botId = (Date.now()+1).toString();
    // 🔥 记录当前正在处理的消息 ID
    currentBotIdRef.current = botId
    setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])
    rememberPendingTask({ requestId, sessionId: sid, model: selectedModel, createdAt: Date.now() })
    const persistUserMessagePromise = (async () => {
      try {
        await saveMessageOnce(`${requestId}:user`, async () => {
          const preview = userMsg.content.slice(0, 30)
          await ensureChatSessionViaApi({
            sessionId: sid,
            title: userMsg.content.slice(0, 10) || "对话",
            preview,
            model: selectedModel,
          })
          await saveChatMessageViaApi({
            sessionId: sid,
            role: "user",
            content: userMsg.content,
            files: activeFiles,
            metadata: {
              requestId,
              clientMessageId: userMsg.id,
              workflowSkillId,
              codexSkillId: selectedCodexSkill?.id,
              openClawSkillId: selectedOpenClawSkill?.id,
            },
          })
        })
      } catch (error) {
        console.warn("⚠️ [消息保存] 用户消息后台保存失败:", error)
        toast.warning("消息已发送，但历史记录保存可能延迟")
      }
    })()

    let fullText = ""; let hasRec = false
    let wordCard: FrontendWordCard | null = null
    const isWordCardRequest = selectedModel === "vocab-card"
    const codexSkillInputs = selectedModel === "super-all-in-one-agent" && selectedCodexSkill
      ? {
          codex_skill_id: selectedCodexSkill.id,
          skill_id: selectedCodexSkill.id,
          skill: selectedCodexSkill.id,
          selected_skill: selectedCodexSkill.id,
          skill_name: selectedCodexSkill.id,
        }
      : undefined
    const openClawSkillInputs = selectedModel === "open-claw" && selectedOpenClawSkill
      ? {
          openclaw_skill_id: selectedOpenClawSkill.id,
          skill_id: selectedOpenClawSkill.id,
          skill: selectedOpenClawSkill.id,
          selected_skill: selectedOpenClawSkill.id,
          skill_name: selectedOpenClawSkill.id,
        }
      : undefined
    const applyWordCard = (card: FrontendWordCard) => {
      wordCard = card
      hasRec = true
      if (card.word) setCurrentWord(card.word)
      setAnalysisStage(4)
      triggerHandover()
      setMessages(p => p.map(m => m.id === botId ? {
        ...m,
        content: card.word || "词境记忆卡",
        metadata: { type: "word_card", wordCard: card },
        wordCard: card
      } : m))
    }
    const applyVocabResult = (result: any) => {
      const resolved = resolveVocabCardResult(result, currentWord)
      if (resolved.currentWord) {
        setCurrentWord(resolved.currentWord)
      }
      if (resolved.frontendCard) {
        applyWordCard(resolved.frontendCard)
        return true
      }
      if (resolved.answer) {
        fullText = resolved.answer
        hasRec = true
        setAnalysisStage(4)
        triggerHandover()
        setMessages(p => p.map(m => m.id === botId ? { ...m, content: resolved.answer } : m))
        return true
      }
      return false
    }
    const hasVocabRenderablePayload = (json: any) => {
      return Boolean(
        json?.answer ||
        json?.outputs ||
        json?.frontend_card_json ||
        json?.data?.outputs
      )
    }
    try {
        const fileIds = activeFiles.map(f => f.difyFileId).filter(Boolean)
        const fileUrls = activeFiles
          .filter(isUploadedImageFile)
          .map((file) => file.modelUrl || (/^https?:\/\//.test(file.data) ? file.data : "") || file.gatewayUrl || "")
          .filter(Boolean)

        console.log("🚀 [API 请求] 发送到聊天 API:", {
          requestId,
          promptLength: userMsg.content.length,
          model: selectedModel,
          teacherAgent: isTeacherAgentSubmit,
          mode: genMode,
          sessionId: sid,
          hasDifyConversation: Boolean(difyConversationIdRef.current),
          fileCount: fileIds.length,
          fileUrlCount: fileUrls.length
        })

          const authHeaders = await authHeadersPromise
          const requestStartedAt = Date.now()
          const hasAuthorization = Boolean(authHeaders.Authorization)
          recordChatPerf(requestId, "click_to_request_start", requestStartedAt - clickStartedAt, { model: selectedModel })

	        const res = await fetch(getApiUrl(isTeacherAgentSubmit ? "/api/agent-chat" : "/api/dify-chat"), {
	            method: "POST",
	            headers: {
	              "Content-Type": "application/json",
                ...authHeaders,
	              "X-Request-Id": requestId
	            },
	            body: JSON.stringify(isTeacherAgentSubmit ? {
                message: userMsg.content,
                agent_share_code: teacherAgentShareCode,
                conversation_id: difyConversationIdRef.current,
                requestId,
                sessionId: sid,
                messageId: botId,
              } : {
	              query: isWordCardRequest ? vocabUserMessage : userMsg.content,
              fileIds,
              fileUrls,
              conversation_id: difyConversationIdRef.current,
	              model: selectedModel,
	              mode: genMode,
	              inputs: isWordCardRequest
                  ? vocabWorkflowInputs
                  : codexSkillInputs
                    ? codexSkillInputs
                  : openClawSkillInputs
                    ? openClawSkillInputs
                  : workflowSkillId
                    ? {
                        workflow_skill_id: workflowSkillId,
                        skill_id: workflowSkillId,
                        skill: workflowSkillId,
                        agent: workflowSkillId,
                        route: workflowSkillId,
                      }
                    : undefined,
                workflowSkillId,
	              requestId,
	              sessionId: sid,
	              messageId: botId,
	            })
	        })
          recordChatPerf(requestId, "request_headers", Date.now() - requestStartedAt, {
            hasAuthorization,
            hasCookie: false,
            model: selectedModel,
          })
        console.log("📥 [API 响应] 状态码:", res.status)
        console.log("📥 [API 响应] Header 摘要:", {
          contentType: res.headers.get("content-type") || undefined,
          hasRequestId: Boolean(res.headers.get("X-Request-Id")),
        })

        if (res.status === 401) {
          toast.error("请先登录")
          throw new Error(getChatErrorMessage("未授权", res.status, selectedModel))
        }
        if (res.status === 402 || res.status === 403) {
          const contentType = res.headers.get("content-type") || ""
          const errorPayload = contentType.includes("application/json")
            ? await res.json().catch(() => null)
            : null

          if (errorPayload?.surveyRequired) {
            void trackCampaignEvent("survey_required_block", {
              featureName: "chat_essay_review",
              status: res.status,
              model: selectedModel,
            })
            void openTrialSurveyGate({
              featureName: getModelUiConfig(selectedModel).name || "当前功能",
              message: "请先完成今日问卷，解锁体验额度后继续使用当前功能。",
            })
            setTrialStatus((previous) => ({
              ...(previous || {}),
              ...(errorPayload.trialStatus || {}),
              requires_daily_survey: true,
              today_survey_completed: false,
            }))
            throw new Error("请先完成今日共创反馈问卷，解锁免费体验额度")
          }

          if (res.status === 402) throw new Error(getChatErrorMessage("积分不足", res.status, selectedModel))
          throw new Error(getChatErrorMessage(errorPayload?.error || "没有权限使用该功能", res.status, selectedModel))
        }
        if (!res.ok) {
          const errorText = await res.text()
          console.error("❌ [API 错误] 状态码:", res.status)
          console.error("❌ [API 错误] 响应内容:", errorText)

          // 🔥 尝试解析 JSON 错误信息
          let parsedError: any = null
          try {
            parsedError = JSON.parse(errorText)
            console.error("❌ [API 错误] 解析后:", parsedError)
          } catch {
            parsedError = null
          }
          throw new Error(getChatErrorMessage(
            parsedError?.error || parsedError?.details || errorText || `请求失败: ${res.status}`,
            res.status,
            selectedModel
          ))
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("服务没有返回可读取的响应流")
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let firstChunkAt: number | null = null
        let firstAnswerAt: number | null = null
        let firstRenderMarked = false
        const markFirstAnswer = (stage: "first_answer" | "first_word_card" | "first_text_chunk" | "first_workflow_output") => {
          if (firstAnswerAt) return
          firstAnswerAt = Date.now()
          recordChatPerf(requestId, stage, firstAnswerAt - requestStartedAt)
        }
        const updateAssistantMessageContent = (content: string, stage = "first_render") => {
          if (!firstAnswerAt) markFirstAnswer("first_answer")
          if (!firstRenderMarked) {
            firstRenderMarked = true
            flushSync(() => {
              setMessages(p => p.map(m => m.id === botId ? { ...m, content } : m))
            })
            scheduleChatPerfRenderMark(requestId, stage, requestStartedAt)
            return
          }
          setMessages(p => p.map(m => m.id === botId ? { ...m, content } : m))
        }

        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            if (!firstChunkAt) {
              firstChunkAt = Date.now()
              recordChatPerf(requestId, "first_chunk", firstChunkAt - requestStartedAt)
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith(":")) {
                  const label = line.slice(1).trim()
                  const isKeepalive = /keepalive|heartbeat/i.test(label)
                  if (isKeepalive) {
                    setProcessingContext((context) => context?.requestId === requestId
                      ? {
                          ...context,
                          lastActivityAt: Date.now(),
                          heartbeatCount: (context.heartbeatCount || 0) + 1,
                          stage: context.stage || "连接正常，任务仍在处理中",
                        }
                      : context)
                  }
                  continue
                }
                if (!line.startsWith("data: ")) continue
                const data = line.slice(6).trim(); if (!data || data === "[DONE]") continue
                try {
                    const json = JSON.parse(data)
                    if (json.event === "status") {
	                      setProcessingContext((context) => context?.requestId === requestId
	                        ? {
	                            ...context,
	                            lastActivityAt: Date.now(),
	                            heartbeatCount: (context.heartbeatCount || 0) + 1,
	                            stage: sanitizePublicAiStatus(String(json.stage || json.message || context.stage || "任务仍在处理中"), "任务仍在处理中"),
	                          }
	                        : context)
                      continue
                    }
                    if (json.event === "error") {
                      throw new Error(String(json.message || json.error || "服务返回错误"))
                    }

                    // 🎯 只处理后端明确允许的公共流程事件，避免原始节点或工作流标识进入用户端。
                    if (json.event === "workflow_started" || json.event === "workflow_finished") {
                      handleSSEEvent({ event: json.event })
                    }

                    if (json.conversation_id && difyConversationIdRef.current !== json.conversation_id) {
                        const normalizedConversationId = json.conversation_id.startsWith(`${selectedModel}:`)
                          ? json.conversation_id.slice((selectedModel + ":").length)
                          : json.conversation_id
                        adoptConversationState(normalizedConversationId, selectedModel)
                    }

                    if (isWordCardRequest && hasVocabRenderablePayload(json)) {
                      if (applyVocabResult(json)) {
                        markFirstAnswer("first_word_card")
                        scheduleChatPerfRenderMark(requestId, "first_render", requestStartedAt)
                        continue
                      }
                    }

                    // 🔥 处理 Chat API 的 answer 字段
                    if (json.answer) {
                        if (isWordCardRequest) {
                          const cleanedAnswer = cleanVocabAnswer(json.answer)
                          if (cleanedAnswer) {
                            fullText = cleanedAnswer
                            hasRec = true
                            setAnalysisStage(4)
                            triggerHandover()
                            setMessages(p => p.map(m => m.id === botId ? { ...m, content: cleanedAnswer } : m))
                          }
                          continue
                        }
                        // 🔥 【关键】收到第一个 answer 时，强制触发 handover
                        // 确保光标在文字开始输出时立即显示
                        if (!hasRec) {
                          setAnalysisStage(4)
                          triggerHandover() // 强制结束思考，激活光标
                          console.log("✍️ [Answer] 收到第一个 answer，触发 handover")
                        }
                        markFirstAnswer("first_answer")
                        hasRec = true
                        fullText += json.answer
                        updateAssistantMessageContent(fullText)
                    }

                    // 🔥 处理 Workflow API 的 text_chunk/agent_message 事件
                    // 某些 Dify 工作流使用这些事件类型而不是 message+answer
                    if ((json.event === 'text_chunk' || json.event === 'agent_message') && !json.answer) {
                        const text = json.data?.text || json.text || ''
                        if (text) {
                            if (isWordCardRequest) {
                              const cleanedAnswer = cleanVocabAnswer(text)
                              if (cleanedAnswer) {
                                fullText = cleanedAnswer
                                hasRec = true
                                setAnalysisStage(4)
                                triggerHandover()
                                setMessages(p => p.map(m => m.id === botId ? { ...m, content: cleanedAnswer } : m))
                              }
                              continue
                            }
                            if (!hasRec) {
                              setAnalysisStage(4)
                              triggerHandover()
                              console.log("✍️ [TextChunk] 收到第一个文本块，触发 handover")
                            }
                            markFirstAnswer("first_text_chunk")
                            hasRec = true
                            fullText += text
                            updateAssistantMessageContent(fullText)
                        }
                    }

                    // 🔥 处理 workflow_finished 事件的输出文本（备用方案）
                    if (json.event === 'workflow_finished' && json.data?.outputs) {
                        const outputs = json.data.outputs
                        if (isWordCardRequest) {
                          applyVocabResult({ outputs })
                          continue
                        }
                        const outputText = extractWorkflowOutputText(outputs)
                        if (outputText && !hasRec) {
                            markFirstAnswer("first_workflow_output")
                            fullText = outputText
                            hasRec = true
                            setAnalysisStage(4)
                            triggerHandover()
                            updateAssistantMessageContent(fullText)
                        }
                    }
                } catch (e) {
                    if (e instanceof Error && !(e instanceof SyntaxError)) {
                      throw e
                    }
                    console.error("❌ [流式解析] 解析事件失败:", e, "原始数据:", data)
                }
            }
	        }
	        if (isWordCardRequest && !wordCard) {
	          const handledFallback = applyVocabResult(fullText)
	          if (!handledFallback && !hasRec) {
	            const friendlyError = "我没有收到可展示的回复，请再试一次。"
	            setMessages(p => p.map(m => m.id === botId ? { ...m, content: friendlyError } : m))
	            fullText = friendlyError
	            hasRec = true
	          }
	        }
          if (!isWordCardRequest && !hasRec) {
            const friendlyError = getModelEmptyResponseMessage(selectedModel)
            setMessages(p => p.map(m => m.id === botId ? { ...m, content: friendlyError } : m))
            fullText = friendlyError
            hasRec = true
          }
          recordChatPerf(requestId, "stream_end", Date.now() - requestStartedAt)
          if (hasRec) {
            await persistUserMessagePromise
            const cardToSave = wordCard as FrontendWordCard | null
            try {
              const assistantContent = cardToSave
                ? JSON.stringify({ frontend_card_json: cardToSave })
                : sanitizeDifyAnswerForModel(fullText, selectedModel)
              await saveMessageOnce(`${requestId}:assistant`, async () => {
                await saveChatMessageViaApi({
                  sessionId: sid,
                  role: "assistant",
                  content: assistantContent,
                  metadata: { requestId, clientMessageId: botId }
                })
                if (difyConversationIdRef.current) {
                  await ensureChatSessionViaApi({
                    sessionId: sid,
                    title: userMsg.content.slice(0, 10) || "对话",
                    preview: userMsg.content.slice(0, 30),
                    model: selectedModel,
                    difyConversationId: difyConversationIdRef.current,
                  })
                }
              })
            } catch (error) {
              console.warn("⚠️ [消息保存] 助手消息后台保存失败:", error)
              toast.warning("AI 已回复，但历史记录保存可能延迟")
            }
          }
          if (selectedModel === "vocab-card" && sid && !hadUrlSessionId) {
            router.replace(buildChatSessionRoute(sid, selectedModel))
          }
          forgetPendingTask(requestId)

    } catch (e: any) {
        console.error("❌ [对话异常] 详细错误:", e)
        console.error("❌ [对话异常] 错误堆栈:", e.stack)
        console.error("❌ [对话异常] 模型:", selectedModel, "模式:", genMode)

        const taskFailure = await getTaskFailureMessage(requestId, selectedModel)
        const errorMsg = normalizeChatTaskFailureMessage(
          taskFailure?.message || getChatErrorMessage(e, undefined, selectedModel),
          selectedModel,
        )
        const rawError = e instanceof Error ? e.message : String(e || "")
        const mayRecoverFromHistory = !taskFailure && isNetworkStreamError(rawError, rawError.toLowerCase())
        toast.error(errorMsg, {
          description: selectedModel === "gemini-image" ? "图片生成失败，请检查提示词" : undefined,
          duration: 5000
        })

        // 🔥 保留已生成的内容（如果 fullText 有内容，说明 AI 已经输出了部分内容）
        if (fullText.trim()) {
          // 保留消息并在末尾添加中断提示
          setMessages(p => p.map(m => m.id === botId ? { ...m, content: `${fullText}\n\n---\n*内容生成已中断：${getSafeAssistantErrorContent(errorMsg)}*` } : m))
          toast.error("内容生成中断，已保留已生成的部分", { duration: 4000 })
		        } else {
		          // 没有任何内容时也保留错误消息，避免用户看到消息突然消失。
		          setMessages(p => p.map(m => m.id === botId ? { ...m, content: buildChatErrorContent(getSafeAssistantErrorContent(errorMsg)) } : m))
		        }
		        if (!mayRecoverFromHistory && !["queued", "running"].includes(taskFailure?.status || "")) {
		          forgetPendingTask(requestId)
		        }
		    } finally {
	      setIsLoading(false)
	      setProcessingContext(null)
	      // 🔥 重置工作流状态（而非 markWorkflowComplete，否则会显示误导性的"已完成"节点）
      resetWorkflow()

      if (userId) {
        fetchCredits(userId)
      }
      recordChatPerf(requestId, "post_stream_refresh", 0, { count: 1 })

      // 🔥 移除自动切换回 standard 的逻辑，保持当前模型
      // if (genMode !== "text") {
      //   setGenMode("text")
      //   setSelectedModel("standard")
      // }
    }
  }

  const saveProblemAsMistake = async (question: string, answer: string, assistantMessageId: string) => {
    const cleanQuestion = question.trim()
    const cleanAnswer = answer.trim()
    if (!cleanQuestion || !cleanAnswer) {
      toast.error("没有可保存的题目解析")
      return
    }

    setSavingMistakeMessageId(assistantMessageId)
    try {
      const res = await fetch("/api/mistakes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          subject: inferMistakeSubject(selectedModel, cleanQuestion, cleanAnswer),
          question: cleanQuestion,
          correct_answer: cleanAnswer.slice(0, 6000),
          explanation: cleanAnswer.slice(0, 6000),
          source: "problem-chat",
          topic: "题目解析",
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error || `mistake_save_failed_${res.status}`)
      }
      toast.success(payload?.existing ? "这道题已在错题本中" : "已加入错题本")
    } catch (error) {
      console.warn("[MistakeBook] save failed:", error)
      toast.error("保存错题失败，请稍后重试")
    } finally {
      setSavingMistakeMessageId(null)
    }
  }

  const generateSimilarProblems = (question: string, answer: string) => {
    const prompt = [
      "请基于下面这道题生成 5 道举一反三练习。",
      "要求：难度从基础到提高递进；每题先给题目，再给提示，最后集中给答案与解析。",
      "",
      "原题：",
      question.trim(),
      "",
      "原解析：",
      answer.trim().slice(0, 1800),
    ].join("\n")
    setInput(prompt)
    window.dispatchEvent(new Event("focus-chat-input"))
  }

  useEffect(() => {
    const handleRegenerate = () => {
      if (isLoading) {
        toast.info("当前回复还在生成中")
        return
      }

      const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")
      if (!lastUserMessage) {
        toast.info("还没有可重新生成的消息")
        return
      }

      const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent
      onSubmit(fakeEvent, {
        content: lastUserMessage.content,
        files: lastUserMessage.files,
      })
    }

    window.addEventListener("regenerate-last-message", handleRegenerate)
    return () => window.removeEventListener("regenerate-last-message", handleRegenerate)
  }, [isLoading, messages, onSubmit])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e as unknown as React.FormEvent) }
  }

  // 🔥 返回按钮
  const handleBack = () => {
    navigateHomeWithSidebar(router)
  }

  // 🔗 分享功能 - 生成分享链接
  const [isSharing, setIsSharing] = useState(false)

  // 🔥 分享整个对话
  const handleShare = async () => {
    console.log("🔗 [分享] 点击分享按钮, isSharing:", isSharing, "messages:", messages.length)

    if (isSharing) {
      console.log("🔗 [分享] 正在分享中，跳过")
      return
    }
    if (!userId) {
      toast.error("请先登录后再分享到广场")
      return
    }
    if (messages.length === 0) {
      console.log("🔗 [分享] 没有消息，显示错误")
      toast.error("没有可分享的内容")
      return
    }
    if (messages.some((message) => message.role === "assistant" && isAssistantFailureContent(message.content))) {
      toast.error("当前对话包含未完成或失败的回复，不能分享到创作广场")
      return
    }

    setIsSharing(true)
    toast.info("正在生成分享链接...")

    try {
      console.log("🔗 [分享] 发送 API 请求...")
      // 🔥 发送整个对话到 API
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getVerifiedAuthHeaders()),
        },
        body: JSON.stringify({
          messages: messages.map(toShareSafeMessage),
          userId,
          modelName: getModelUiConfig(selectedModel).name
        })
      })

      console.log("🔗 [分享] API 响应状态:", res.status)

      if (!res.ok) {
        const errText = await res.text()
        let errorMessage = errText || "创建分享失败"
        try {
          const parsed = JSON.parse(errText)
          errorMessage = parsed?.error || parsed?.message || errorMessage
        } catch {
          // Keep the raw server response for diagnostics.
        }
        console.error("🔗 [分享] API 错误:", errText)
        throw new Error(errorMessage)
      }

      const data = await res.json()
      console.log("🔗 [分享] API 返回数据:", data)
      const shareUrl = data.shareUrl
      const rewardMessage = data.reward?.message || "分享成功"

      // 复制链接到剪贴板
      await navigator.clipboard.writeText(shareUrl)

      toast.success(rewardMessage, {
        description: `分享链接已复制：${shareUrl}`,
        duration: 5000
      })

      // 移动端尝试使用原生分享
      if (navigator.share) {
        try {
          await navigator.share({
            title: '沈翔智学 - AI 分析报告',
            text: '查看我的 AI 对话',
            url: shareUrl
          })
        } catch (err) {
          // 用户取消分享，忽略
        }
      }

    } catch (err) {
      console.error("🔗 [分享] 失败:", err)
      toast.error(err instanceof Error ? err.message : "分享失败，请稍后重试")
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <div className="flex h-[100dvh] w-full bg-[var(--paper-50)] overflow-hidden relative">
      {/* 🔥 历史会话侧边栏 - 左侧滑出 */}
      <AnimatePresence>
        {showHistorySidebar && (
          <>
            {/* 遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowHistorySidebar(false)}
            />
            {/* 侧边栏 - 顶部对齐，无间隙 */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed left-0 top-0 h-screen w-72 z-50 flex flex-col"
              style={{
                background: "#FDFBF7",
                boxShadow: "4px 0 24px rgba(0,0,0,0.12)",
              }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--paper-100)]">
                <span className="text-sm font-semibold text-[var(--ink-700)]">历史会话</span>
                <button
                  onClick={() => setShowHistorySidebar(false)}
                  className="p-1.5 rounded-[var(--radius-soft)] hover:bg-[var(--paper-100)] transition-colors"
                >
                  <X className="h-4 w-4 text-[var(--ink-500)]" />
                </button>
              </div>

              {/* 会话列表 */}
              <ScrollArea className="flex-1 min-h-0 px-1 scrollbar-thin">
                <div className="p-2 space-y-1 h-full">
                  {chatSessions.length === 0 ? (
                    <div className="text-center py-8 text-[var(--ink-400)] text-sm">
                      暂无历史会话
                    </div>
                  ) : (
                    chatSessions.map(session => {
                      const safeModel = resolveChatSessionRouteModel(session)
                      return (
                        <button
                          key={session.id}
                          onClick={() => {
                            const nextRoute = buildChatSessionRouteFromSession(session)
                            if (isDedicatedChatSessionModel(safeModel)) {
                              router.push(nextRoute)
                              setShowHistorySidebar(false)
                              return
                            }
                            // 1. 标记为手动切换（store）
                            useSelectedModelStore.getState().markManualSessionSwitch()
                            // 2. 乐观更新：立即切换模型 Badge（store → 全局广播）
                            setSelectedModel(safeModel as ModelType)
                            // 3. 同步更新 URL（单向数据流起点）
                            router.push(nextRoute)
                            // 4. 关闭侧边栏
                            setShowHistorySidebar(false)
                            // loadHistorySession 由 URL 变化触发的 useEffect 统一调用
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2.5 rounded-[var(--radius-soft)] transition-all",
                            currentSessionId === session.id
                              ? "bg-[var(--ink-600)]/10 text-[var(--ink-600)]"
                              : "hover:bg-[var(--paper-100)] text-[var(--ink-600)]"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{session.title}</div>
                              {/* 模型徽章 */}
                              {safeModel !== "standard" && (
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded-[var(--radius-pill)] font-medium shrink-0"
                                  style={{
                                    backgroundColor: `${getModelBadgeColor(safeModel)}18`,
                                    color: getModelBadgeColor(safeModel)
                                  }}
                                >
                                  {MODEL_DISPLAY_NAMES[safeModel] || safeModel}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--ink-400)] shrink-0">
                              {new Date(session.date).toLocaleString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <div className="text-xs text-[var(--ink-400)] truncate mt-0.5">{session.preview}</div>
                        </button>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col h-full relative min-w-0">

        {/* 🔥 顶部导航栏 - 移动端极简收紧 */}
        <div className="flex items-center h-11 md:h-14 px-2 md:px-4 border-b border-[var(--paper-100)]/70 bg-[var(--paper-50)]/90 backdrop-blur-sm shrink-0 pt-safe">
          <button
            onClick={() => {
              console.log("📋 [历史按钮] 点击! showHistorySidebar当前值:", showHistorySidebar)
              setShowHistorySidebar(!showHistorySidebar)
            }}
            className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-[var(--radius-pill)] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-50)] hover:text-[var(--ink-800)]"
          >
            <IconHistory className="h-4 w-4" />
          </button>
          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-[var(--radius-pill)] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-50)] hover:text-[var(--ink-800)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0 px-1 text-center md:text-left md:ml-2">
            <ModelSelector
              selectedModel={selectedAgentKey}
              models={modelList}
              onModelChange={handleModelChange}
              disabled={isLoading}
              isMember={isLuxury}
              triggerPrefix=""
              triggerLabel="智能体广场"
              className="hidden h-8 align-middle md:inline-flex"
            />
            <span className="ml-2 hidden max-w-[180px] truncate align-middle text-[12px] text-[var(--ink-400)] md:inline-block">
              当前：{selectedAgentName}
            </span>
          </div>
          {/* 🔥 移动端用户信息显示 - 仅在移动端显示 */}
          <div className="md:hidden">
            {userId ? (
              <MobileUserInfo
                userName={userDisplayName}
                credits={userCredits}
                onMenuClick={() => router.push("/settings")}
              />
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="inline-flex h-10 min-w-[40px] items-center justify-center rounded-[var(--radius-pill)] px-3 text-xs font-medium text-white"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                登录
              </button>
            )}
          </div>
          {/* 桌面端占位 */}
          <div className="hidden md:block w-16" />
        </div>

        {/* 🔥 滚动区域优化 */}
        <div className="flex-1 h-0 relative overflow-hidden">
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto custom-scrollbar pb-[180px] sm:pb-[196px] md:pb-[224px]"
          >
              <div className="mx-auto max-w-6xl px-2.5 sm:px-4 md:px-6 lg:px-10 py-2.5 sm:py-6 md:py-8">
              {messages.length === 0 ? (
                // 🔥 骨架屏：会话切换时显示对话块轮廓
                isLoading && !currentBotIdRef.current ? (
                  <ChatSkeleton />
                ) : selectedModel === "vocab-card" ? (
                  <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-start py-3 sm:py-5 md:py-6">
                    <div className="mb-4 flex flex-col items-center text-center sm:mb-6">
                      <div className="mb-3 sm:mb-4">
                        <ModelLogo modelKey={selectedModel as any} size="xl" />
                      </div>
                      <h1 className="text-lg font-semibold text-[var(--ink-800)] sm:text-xl">词境记忆卡</h1>
                      <p className="mt-1 max-w-md text-xs leading-5 text-[var(--ink-500)] sm:text-sm">
                        先选学习阶段、卡片风格和输出语言，再输入单词生成记忆卡。
                      </p>
                    </div>
                    <VocabCardDifyForm
                      value={vocabCardInputs}
                      onChange={setVocabCardInputs}
                      disabled={isLoading}
                      currentWord={currentWord}
                      onClearCurrentWord={() => setCurrentWord("")}
                    />
                  </div>
                ) : (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 md:py-16 text-center animate-in fade-in duration-500">
                  <div className="mb-4 sm:mb-6">
                    <ModelLogo modelKey={selectedModel as any} size="xl" />
                  </div>
                  <h1 className="text-lg sm:text-xl font-semibold text-[var(--ink-800)] px-4">
                    {selectedModel === "all-in-one-agent"
                      ? "数学图片与动画生成器"
                      : selectedModel === "super-all-in-one-agent"
                        ? "超级全能智能体"
                        : "欢迎使用沈翔智学"}
                  </h1>
                  {(selectedModel === "all-in-one-agent" || selectedModel === "super-all-in-one-agent") && (
                    <div className="mt-5 grid w-full max-w-2xl grid-cols-1 gap-2 px-4 text-left sm:grid-cols-2">
                      {(selectedModel === "super-all-in-one-agent" ? SUPER_ALL_IN_ONE_AGENT_PROMPTS : ALL_IN_ONE_AGENT_PROMPTS).map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setInput(prompt)}
                          className="rounded-[var(--radius-soft)] border border-[var(--ink-100)] bg-[var(--paper-50)] px-3 py-2.5 text-left text-xs leading-5 text-[var(--ink-600)] shadow-sm transition hover:border-[var(--ink-200)] hover:bg-[var(--ink-50)] focus:outline-none focus:ring-2 focus:ring-[var(--ink-500)] focus:ring-offset-2"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                )
                ) : (
                <div className="space-y-3 pb-8 pt-1 sm:space-y-5 sm:pt-3">
                  {messages.map((message, index) => {
                    const previousUserMessage = message.role === "assistant"
                      ? getPreviousUserMessage(messages, index)
                      : null
                    const cleanAssistantContent = message.role === "assistant"
                      ? sanitizeAssistantMessageForPublicDisplay(sanitizeDifyAnswerForModel(message.content, selectedModel))
                      : message.content
                    const showProblemActions = message.role === "assistant" &&
                      selectedModel === "problem" &&
                      Boolean(previousUserMessage?.content) &&
                      Boolean(cleanAssistantContent.trim()) &&
                      !isAssistantFailureContent(cleanAssistantContent)

                    return (
                      <div key={message.id}>
                        {isDifferentDay(message.timestamp, messages[index - 1]?.timestamp) ? (
                          <div className="flex items-center gap-3 py-4">
                            <div className="h-px flex-1 bg-[var(--paper-200)]" />
                            <span className="font-[var(--font-mono-v2)] text-[11px] text-[var(--ink-400)]">
                              {formatDateLabel(message.timestamp)}
                            </span>
                            <div className="h-px flex-1 bg-[var(--paper-200)]" />
                          </div>
                        ) : null}

                        <div className={cn("flex gap-1 sm:gap-2 group/message", message.role === "user" ? "justify-end" : "justify-start")}>
                          {message.role === "assistant" ? (
                            <div
                              className={cn(
                                "mt-0.5 flex shrink-0 items-center justify-center",
                                selectedModel === "open-claw" ? "h-16 w-16 sm:h-[72px] sm:w-[72px]" : "h-11 w-11 sm:h-12 sm:w-12",
                              )}
                            >
                              <AssistantEyeAvatar
                                size={selectedModel === "open-claw" ? "xl" : "md"}
                                isActive={message.id === currentBotIdRef.current && isLoading}
                              />
                            </div>
                          ) : null}

                          <div className={cn(
                            "flex flex-col",
                            message.role === "user"
                              ? "max-w-[94%] items-end sm:max-w-[82%]"
                              : "w-full max-w-[calc(100%_-_3rem)] items-start sm:max-w-[min(1040px,calc(100%_-_4rem))]",
                          )}>
                            {message.role === "user" ? (
                              <UserMessageBubble
                                content={message.content}
                                files={message.files}
                                onEdit={(content, files) => {
                                  setInput(content)
                                  setUploadedFiles((files as UploadedFile[]) ?? [])
                                }}
                                onSend={(content, files) => {
                                  setInput(content)
                                  const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent
                                  onSubmit(fakeEvent, { content, files: (files as UploadedFile[]) ?? [] })
                                }}
                              />
                            ) : (
                              <div className="w-full space-y-3">
                                {message.id === currentBotIdRef.current && isLoading && !isFastTrack && !message.content ? (
                                  <ProcessingStatusCard
                                    context={processingContext}
                                    showLongWaitHint={showDeepThinkingHint}
                                    workflowState={workflowState}
                                    currentRunningText={currentRunningText}
                                  />
                                ) : null}
                                {(message.content || !(message.id === currentBotIdRef.current && isLoading && !isFastTrack)) ? (
                                  <div>
                                    {(() => {
                                      const wordCard = message.wordCard || message.metadata?.wordCard || normalizeDifyWordCardResponse(cleanAssistantContent)
                                      if (wordCard) {
                                        return <VocabCardTemplate artifact={toVocabCardArtifact(wordCard)} />
                                      }

                                      const vocabFallback = selectedModel === "vocab-card"
                                        ? resolveVocabCardResult(cleanAssistantContent, currentWord)
                                        : null
                                      if (vocabFallback?.frontendCard) {
                                        return <VocabCardTemplate artifact={toVocabCardArtifact(vocabFallback.frontendCard)} />
                                      }
                                      if (vocabFallback?.answer) {
                                        return <EnhancedMarkdown content={cleanLLMText(vocabFallback.answer)} />
                                      }
                                      if (
                                        selectedModel === "vocab-card" &&
                                        containsRawDifyWordCardPayload(cleanAssistantContent) &&
                                        !(message.id === currentBotIdRef.current && isLoading)
                                      ) {
                                        return (
                                          <div className="rounded-[var(--radius-sharp)] border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                                            我没有收到可展示的回复，请再试一次。
                                          </div>
                                        )
                                      }

                                      const cleanContent = cleanLLMText(cleanAssistantContent)
                                      return (
                                        <MessageBubble
                                          role="assistant"
                                          content={cleanContent}
                                          isStreaming={message.id === currentBotIdRef.current && showCursor && isLoading}
                                          model={selectedModel}
                                          onCopy={() => navigator.clipboard.writeText(cleanContent)}
                                          onShare={handleShare}
                                          showMistakeActions={showProblemActions}
                                          isSavingMistake={savingMistakeMessageId === message.id}
                                          onSaveMistake={() => {
                                            if (previousUserMessage) {
                                              void saveProblemAsMistake(previousUserMessage.content, cleanContent, message.id)
                                            }
                                          }}
                                          onGenerateSimilar={() => {
                                            if (previousUserMessage) {
                                              generateSimilarProblems(previousUserMessage.content, cleanContent)
                                            }
                                          }}
                                          timestamp={message.timestamp ? new Date(message.timestamp) : undefined}
                                          showAvatar={false}
                                          className="w-full"
                                        />
                                      )
                                    })()}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>

                          {message.role === "user" ? (
                            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-pill)] bg-[var(--paper-200)] sm:h-7 sm:w-7">
                              {userAvatar ? (
                                <img src={userAvatar} alt="Me" className="h-full w-full object-cover" />
                              ) : (
                                <IconUser className="h-3.5 w-3.5 text-[var(--ink-500)]" />
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* 🔥 新消息提示按钮 */}
          <AnimatePresence>
            {hasNewMessage && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={scrollToBottom}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 text-white text-sm rounded-[var(--radius-pill)] shadow-lg flex items-center gap-2 hover:opacity-90 transition-all"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                <ArrowDown className="w-4 h-4" />
                新消息
              </motion.button>
            )}
          </AnimatePresence>
        </div>

            {/* 🔥 输入框区域 - 固定在视口底部，避免对话滚动时遮挡输入 */}
        <div className="fixed inset-x-0 bottom-0 z-40 shrink-0 border-t border-[var(--paper-100)]/80 bg-[var(--paper-50)]/96 p-1.5 pb-[max(env(safe-area-inset-bottom),4px)] shadow-[0_-8px_24px_rgba(15,23,42,0.05)] backdrop-blur-md md:left-72 md:p-6">
          <div className="mx-auto max-w-5xl">
            {/* 🔥 上传进度条 - 移动端优化 */}
            {isUploading && (
              <div className="mb-2 sm:mb-3 rounded-[var(--radius-soft)] sm:rounded-[var(--radius-sharp)] bg-[var(--paper-50)] p-2 sm:p-3 border border-[var(--paper-200)] animate-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <span className="text-[10px] sm:text-xs font-medium text-[var(--ink-600)]">上传中...</span>
                  <span className="text-[10px] sm:text-xs font-medium" style={{ color: BRAND_GREEN }}>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 sm:h-2 bg-[var(--paper-200)] rounded-[var(--radius-pill)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-[var(--radius-pill)]"
                    style={{ backgroundColor: BRAND_GREEN }}
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}
            {fileProcessing.status !== "idle" && !isUploading && (
              <div className="mb-2 sm:mb-3 rounded-[var(--radius-soft)] sm:rounded-[var(--radius-sharp)] bg-[var(--paper-50)] p-2 sm:p-3 animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {fileProcessing.status === "error" ? <IconInkDot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--seal-500)]" /> : <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" style={{ color: BRAND_GREEN }} />}
                  {dynamicStatusMessage ? (
                    <p className="text-xs sm:text-sm text-[var(--ink-600)] animate-pulse font-medium">
                      {dynamicStatusMessage}
                    </p>
                  ) : (
                    <p className="text-xs sm:text-sm text-[var(--ink-600)]">{fileProcessing.message}</p>
                  )}
                </div>
              </div>
            )}
	            {/* 🔥 输入框 - 使用 ChatInput 组件 - 移动端固定在底部 */}
            <div className="relative z-20 mx-auto w-full max-w-3xl px-0">
              <DailySurveyGate
                featureName={getModelUiConfig(selectedModel).name || "当前功能"}
                enabled
                open={surveyGateOpen}
                onOpenChange={setSurveyGateOpen}
                onCompleted={(nextTrialStatus) => {
                  setTrialStatus((nextTrialStatus || null) as TrialSurveyStatus | null)
                  toast.success("今日体验额度已解锁")
                }}
              />
              <ChatInput
                showModelSelector={true}
                selectedModel={selectedAgentKey}
                models={modelList}
                onModelChange={handleModelChange}
                modelColor={getModelUiConfig(selectedModel).color}
                modelName={selectedAgentName}
                value={input}
                onChange={setInput}
                onSubmit={onSubmit}
                uploadedFiles={uploadedFiles}
                onRemoveFile={(i) => setUploadedFiles((p) => p.filter((_, idx) => idx !== i))}
                isLoading={isLoading}
                disabled={isLoading || isAuthPending || !isAuthenticated}
                disabledReason={
                  isLoading
                    ? "loading"
                    : isAuthPending
                      ? "auth-pending"
                      : !isAuthenticated
                        ? "auth"
                        : undefined
                }
                showOpenClawSkillButton={selectedModel === "open-claw"}
                selectedOpenClawSkillName={selectedOpenClawSkill?.name}
                onOpenClawSkillClick={() => setOpenClawSkillPickerOpen(true)}
                showCodexSkillButton={selectedModel === "super-all-in-one-agent"}
                selectedCodexSkillName={selectedCodexSkill?.name}
                onCodexSkillClick={() => setCodexSkillPickerOpen(true)}
                placeholder={selectedModel === "vocab-card"
                  ? "例如：你好啊 / 我要学习 apple / 考我一下"
                  : selectedModel === "all-in-one-agent"
                    ? "描述你想生成的动画、图片或要处理的文件..."
                    : "输入内容开始对话..."}
                className="overflow-visible border-[var(--paper-200)]/70 bg-[var(--paper-50)]/95 shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur-md sm:shadow-[0_8px_24px_rgba(0,0,0,0.10)]"
                onFileUpload={(files) => {
                  const target = { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>
                  handleFileUpload(target)
                }}
              />
              <CodexSkillPicker
                open={codexSkillPickerOpen}
                selectedSkillId={selectedCodexSkill?.id}
                onSelect={(skill) => {
                  setSelectedCodexSkill(skill)
                  toast.success(`已加载能力：${skill.name}`)
                }}
                onClose={() => setCodexSkillPickerOpen(false)}
              />
              <OpenClawSkillPicker
                open={openClawSkillPickerOpen}
                selectedSkillId={selectedOpenClawSkill?.id}
                onSelect={(skill) => {
                  setSelectedOpenClawSkill(skill)
                  toast.success(`已加载能力：${skill.name}`)
                }}
                onClose={() => setOpenClawSkillPickerOpen(false)}
              />
            </div>

            {!isAuthenticated && !isAuthPending && (
              <div className="mt-2 hidden items-center justify-center gap-1 text-[10px] sm:mt-3 sm:flex sm:text-xs">
                <span className="text-[var(--ink-400)]">未登录，</span>
                <Link
                  href="/auth/sign-up"
                  className="text-[var(--ink-700)] hover:text-[var(--ink-600)] font-medium underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ink-500)] focus:ring-offset-1 rounded px-1"
                >
                  立即注册
                </Link>
                <span className="text-[var(--ink-400)]">开始对话</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 🔥 导出 Props 类型供外部使用
export interface EnhancedChatInterfaceProps {
  initialModel?: ModelType
}

export function EnhancedChatInterface(props: EnhancedChatInterfaceProps) {
  const { initialModel } = props
  return (
    <Suspense fallback={<div className="flex h-[100dvh] w-full items-center justify-center bg-[var(--paper-50)]"><LoadingStateV2 label="AI 正在思考..." size="md" /></div>}>
      <ChatInterfaceInner initialModel={initialModel} />
    </Suspense>
  )
}
