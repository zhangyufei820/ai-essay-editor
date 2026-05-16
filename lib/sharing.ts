import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { addCredits } from "@/lib/credits"

export const SHARE_CONTENT_TYPES = [
  "essay_review",
  "image",
  "flashcard_deck",
  "manim_video",
  "ppt_summary",
  "agent_conversation",
  "quiz_result",
  "conversation",
  "general",
] as const

export type ShareContentType = typeof SHARE_CONTENT_TYPES[number]

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  essay_review: "作文批改",
  image: "AI 绘画",
  flashcard_deck: "闪卡集",
  manim_video: "数学动画",
  ppt_summary: "PPT 摘要",
  agent_conversation: "智能体对话",
  quiz_result: "练习结果",
  conversation: "AI 对话",
  general: "学习作品",
}

export const SUBJECT_LABELS: Record<string, string> = {
  math: "数学",
  english: "英语",
  physics: "物理",
  chemistry: "化学",
  biology: "生物",
  history: "历史",
  geography: "地理",
  politics: "政治",
  other: "其他",
}

const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
const SOCIAL_REWARD_DAILY_LIMIT = 30

export type SharedContentRow = {
  id: string
  user_id: string
  content_type: string
  title: string
  description?: string | null
  content_data: Record<string, unknown>
  thumbnail_url?: string | null
  preview_text?: string | null
  subject?: string | null
  tags?: string[] | null
  ai_model_used?: string | null
  like_count: number | null
  comment_count: number | null
  view_count: number | null
  share_out_count: number | null
  visibility: string | null
  share_code: string
  is_featured: boolean | null
  is_pinned: boolean | null
  status: string | null
  credits_earned: number | null
  created_at: string | null
  updated_at: string | null
}

type ShareFile = {
  name?: string
  type?: string
  data?: string
  preview?: string
  difyFileId?: string
  gatewayUrl?: string
  modelUrl?: string
  url?: string
}

type ShareMessage = {
  role?: string
  content?: string
  files?: ShareFile[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function normalizeShareFile(file: unknown): ShareFile | null {
  if (!isRecord(file)) return null
  const normalized = {
    name: readString(file, ["name", "filename", "fileName"]),
    type: readString(file, ["type", "mimeType", "contentType"]),
    data: readString(file, ["data"]),
    preview: readString(file, ["preview"]),
    difyFileId: readString(file, ["difyFileId", "dify_file_id"]),
    gatewayUrl: readString(file, ["gatewayUrl", "gateway_url"]),
    modelUrl: readString(file, ["modelUrl", "model_url"]),
    url: readString(file, ["url"]),
  }
  if (!normalized.name && !normalized.type && !normalized.data && !normalized.gatewayUrl && !normalized.modelUrl && !normalized.url) {
    return null
  }
  return normalized
}

function getFilePublicUrl(file: ShareFile) {
  return file.modelUrl || file.gatewayUrl || file.url || file.data || ""
}

function isShareImageFile(file: ShareFile) {
  const url = getFilePublicUrl(file).toLowerCase()
  const type = (file.type || "").toLowerCase()
  return type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url)
}

export function findShareImageUrl(contentData: Record<string, unknown>, explicitThumbnail?: string | null) {
  const explicit = cleanText(explicitThumbnail, 1000)
  if (explicit) return explicit

  const direct = readString(contentData, [
    "main_image_url",
    "mainImageUrl",
    "thumbnail_url",
    "thumbnailUrl",
    "image_url",
    "imageUrl",
    "result_image_url",
    "resultImageUrl",
    "original_image_url",
    "originalImageUrl",
  ])
  if (direct) return direct

  const imageCollections = [
    contentData.user_uploaded_images,
    contentData.uploaded_images,
    contentData.images,
    contentData.result_images,
    contentData.files,
  ]
  for (const collection of imageCollections) {
    if (!Array.isArray(collection)) continue
    for (const item of collection) {
      if (typeof item === "string" && item.trim()) return item.trim()
      const file = normalizeShareFile(item)
      if (file && isShareImageFile(file)) return getFilePublicUrl(file)
    }
  }

  return ""
}

function stripThinking(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
}

function cleanAiResultForPreview(value: unknown) {
  return stripThinking(typeof value === "string" ? value : "")
    .replace(/^正在取图片信息[\s\S]*?(?=#{1,4}\s)/, "")
    .replace(/^以下为.*?完整文字信息[：:][\s\S]*?(?=#{1,4}\s)/, "")
    .replace(/[#*_`>|:-]+/g, " ")
    .trim()
}

function extractOriginalTextFromAssistant(text: string) {
  const match = text.match(/(?:完整文字信息|提取的完整文字信息|识别文本)[：:]\s*([\s\S]*?)(?:<think>|#{1,4}\s|$)/)
  return cleanText(match?.[1], 2000)
}

function inferShareContentType(modelName: string, assistantText: string): ShareContentType {
  const signal = `${modelName}\n${assistantText}`
  if (/作文|批改|点评|修改|阅卷|精修|润色/.test(signal)) return "essay_review"
  if (/图像|绘画|图片|image/i.test(signal)) return "image"
  return "general"
}

function normalizeShareMessages(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter(isRecord)
    .map((message) => ({
      role: cleanText(message.role, 20),
      content: typeof message.content === "string" ? message.content : "",
      files: Array.isArray(message.files) ? message.files.map(normalizeShareFile).filter((file): file is ShareFile => Boolean(file)) : [],
    } satisfies ShareMessage))
    .filter((message) => message.content || (message.files?.length || 0) > 0)
}

function buildLearningWorkFromMessages(messages: ShareMessage[], modelName: string) {
  const userMessages = messages.filter((message) => message.role === "user")
  const assistantMessages = messages.filter((message) => message.role === "assistant")
  const lastAssistant = assistantMessages.at(-1)?.content || ""
  const uploadedImages = userMessages
    .flatMap((message) => message.files || [])
    .filter(isShareImageFile)
    .map((file) => ({
      name: file.name || "用户上传图片",
      type: file.type || "image",
      url: getFilePublicUrl(file),
    }))
    .filter((file) => file.url)

  return {
    contentType: inferShareContentType(modelName, lastAssistant),
    contentData: {
      type: "learning_work",
      modelName,
      user_prompt: userMessages.at(-1)?.content || "",
      original_text: extractOriginalTextFromAssistant(lastAssistant),
      ai_result: stripThinking(lastAssistant),
      user_uploaded_images: uploadedImages,
      source_message_count: messages.length,
    },
  }
}

export function generateShareCode(length = 10) {
  let result = ""
  for (let index = 0; index < length; index += 1) {
    result += SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)]
  }
  return result
}

export async function generateUniqueShareCode(supabase: SupabaseClient) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shareCode = generateShareCode()
    const { data, error } = await supabase
      .from("shared_contents")
      .select("share_code")
      .eq("share_code", shareCode)
      .maybeSingle()

    if (error && error.code !== "PGRST116") throw error
    if (!data) return shareCode
  }
  return randomUUID().replace(/-/g, "").slice(0, 12)
}

export function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength)
}

export function normalizeContentType(value: unknown): ShareContentType {
  const contentType = cleanText(value, 50)
  return SHARE_CONTENT_TYPES.includes(contentType as ShareContentType)
    ? contentType as ShareContentType
    : "general"
}

export function normalizeVisibility(value: unknown) {
  const visibility = cleanText(value, 20)
  return visibility === "unlisted" || visibility === "private" ? visibility : "public"
}

export function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => cleanText(item, 24))
    .filter(Boolean)
    .slice(0, 8)
}

export function generatePreviewText(contentType: string, contentData: Record<string, unknown>, description?: string | null) {
  const explicitDescription = cleanText(description, 180)
  if (explicitDescription) return explicitDescription

  if (contentType === "essay_review") {
    return cleanText(contentData.overall_comment || cleanAiResultForPreview(contentData.ai_result) || contentData.original_text, 180)
  }
  if (contentType === "image") {
    return cleanText(contentData.prompt_used || contentData.prompt, 180)
  }
  if (contentType === "flashcard_deck") {
    const total = Number(contentData.total_cards || (Array.isArray(contentData.cards) ? contentData.cards.length : 0))
    return total ? `包含 ${total} 张复习闪卡，适合课后自测。` : cleanText(contentData.source_notes_preview, 180)
  }
  if (contentType === "agent_conversation" || contentType === "conversation") {
    const messages = Array.isArray(contentData.messages) ? contentData.messages : contentData.highlights
    if (Array.isArray(messages)) {
      const first = messages.find((item) => item && typeof item === "object" && "content" in item) as { content?: string } | undefined
      return cleanText(first?.content, 180)
    }
  }
  if (contentType === "ppt_summary") {
    return cleanText(contentData.summary || (Array.isArray(contentData.key_points) ? contentData.key_points.join("；") : ""), 180)
  }
  if (contentType === "quiz_result") {
    return `练习得分 ${Number(contentData.score || 0)}，共 ${Number(contentData.total_questions || 0)} 题。`
  }

  return cleanText(JSON.stringify(contentData).replace(/[{}"]/g, " "), 180)
}

export function generateAutoTitle(contentType: string, contentData: Record<string, unknown>, fallback?: string) {
  const explicit = cleanText(fallback, 80)
  if (explicit) return explicit

  if (contentType === "image") return cleanText(contentData.prompt_used || contentData.prompt, 42) || "AI 图像作品"
  if (contentType === "flashcard_deck") return cleanText(contentData.deck_name, 60) || "AI 生成闪卡集"
  if (contentType === "essay_review") return "作文批改分享"
  if (contentType === "agent_conversation") return cleanText(contentData.agent_name, 50) || "教师智能体对话"
  if (contentType === "conversation") {
    const messages = Array.isArray(contentData.messages) ? contentData.messages : []
    const firstUser = messages.find((item) => item?.role === "user")
    return cleanText(firstUser?.content, 42) || "AI 对话分享"
  }
  return CONTENT_TYPE_LABELS[contentType] || "学习作品分享"
}

export function normalizeSharePayload(body: Record<string, unknown>) {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const modelName = cleanText(body.modelName, 50) || "沈翔智学"
    const { contentType, contentData } = buildLearningWorkFromMessages(normalizeShareMessages(body.messages), modelName)
    const thumbnailUrl = findShareImageUrl(contentData)
    return {
      contentType,
      title: generateAutoTitle(contentType, contentData, body.title as string | undefined),
      description: cleanText(body.description, 500) || null,
      contentData,
      thumbnailUrl: thumbnailUrl || null,
      previewText: generatePreviewText(contentType, contentData, body.description as string | undefined),
      subject: cleanText(body.subject, 50) || null,
      tags: normalizeTags(body.tags),
      aiModelUsed: modelName,
      visibility: normalizeVisibility(body.visibility),
    }
  }

  const contentType = normalizeContentType(body.content_type || body.contentType)
  const rawContentData = body.content_data || body.contentData || (
    typeof body.content === "string" ? { content: body.content } : {}
  )
  const contentData = rawContentData && typeof rawContentData === "object" && !Array.isArray(rawContentData)
    ? rawContentData as Record<string, unknown>
    : { value: rawContentData }
  const description = cleanText(body.description, 500) || null

  const explicitThumbnail = cleanText(body.thumbnail_url || body.thumbnailUrl, 1000) || null
  const derivedThumbnail = findShareImageUrl(contentData, explicitThumbnail)

  return {
    contentType,
    title: generateAutoTitle(contentType, contentData, body.title as string | undefined),
    description,
    contentData,
    thumbnailUrl: derivedThumbnail || null,
    previewText: cleanText(body.preview_text || body.previewText, 240) || generatePreviewText(contentType, contentData, description),
    subject: cleanText(body.subject, 50) || null,
    tags: normalizeTags(body.tags),
    aiModelUsed: cleanText(body.ai_model_used || body.aiModelUsed, 50) || null,
    visibility: normalizeVisibility(body.visibility),
  }
}

export async function awardShareCredits(
  supabase: SupabaseClient,
  userId: string,
  contentId: string,
  rewardType: string,
  amount: number,
  description: string,
) {
  const { data: existing } = await supabase
    .from("share_rewards")
    .select("id")
    .eq("user_id", userId)
    .eq("content_id", contentId)
    .eq("reward_type", rewardType)
    .maybeSingle()

  if (existing) return { awarded: false, credits: 0, reason: "already_awarded" }

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const { data: todayRewards } = await supabase
    .from("share_rewards")
    .select("credits_awarded")
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())

  const todayTotal = (todayRewards || []).reduce((sum, item) => sum + Number(item.credits_awarded || 0), 0)
  const available = Math.max(0, SOCIAL_REWARD_DAILY_LIMIT - todayTotal)
  const credits = Math.min(amount, available)
  if (credits <= 0) return { awarded: false, credits: 0, reason: "daily_limit" }

  const { error } = await supabase.from("share_rewards").insert({
    user_id: userId,
    content_id: contentId,
    reward_type: rewardType,
    credits_awarded: credits,
  })
  if (error) {
    if (error.code === "23505") return { awarded: false, credits: 0, reason: "already_awarded" }
    throw error
  }

  const ok = await addCredits(userId, credits, "bonus", description, contentId)
  if (!ok) return { awarded: false, credits: 0, reason: "credit_failed" }

  const { data: currentContent } = await supabase
    .from("shared_contents")
    .select("credits_earned")
    .eq("id", contentId)
    .maybeSingle()

  await supabase
    .from("shared_contents")
    .update({ credits_earned: Number(currentContent?.credits_earned || 0) + credits })
    .eq("id", contentId)

  return { awarded: true, credits, reason: "awarded" }
}

export function publicShareSelect() {
  return "id,user_id,content_type,title,description,content_data,thumbnail_url,preview_text,subject,tags,ai_model_used,like_count,comment_count,view_count,share_out_count,visibility,share_code,is_featured,is_pinned,status,credits_earned,created_at,updated_at"
}

export function toPublicShare(row: SharedContentRow, liked = false) {
  const messages = normalizeShareMessages(row.content_data?.messages)
  const transformed = messages.length
    ? buildLearningWorkFromMessages(messages, cleanText(row.content_data?.modelName, 50) || cleanText(row.ai_model_used, 50) || "沈翔智学")
    : null
  const contentType = transformed?.contentType || row.content_type
  const contentData = transformed?.contentData || row.content_data || {}
  const titleIsGeneric = /^(进行点评和修改|AI 对话分享|对话|学习作品分享)$/.test(row.title || "")
  const displayTitle = titleIsGeneric && contentType === "essay_review"
    ? "作文点评和修改"
    : row.title
  const previewText = generatePreviewText(contentType, contentData, transformed ? row.description : row.description || row.preview_text)

  return {
    ...row,
    content_type: contentType,
    title: displayTitle,
    content_data: contentData,
    like_count: row.like_count || 0,
    comment_count: row.comment_count || 0,
    view_count: row.view_count || 0,
    share_out_count: row.share_out_count || 0,
    thumbnail_url: findShareImageUrl(contentData, row.thumbnail_url),
    preview_text: previewText,
    tags: row.tags || [],
    is_liked: liked,
    type_label: CONTENT_TYPE_LABELS[contentType] || "学习作品",
    subject_label: row.subject ? SUBJECT_LABELS[row.subject] || row.subject : null,
  }
}
