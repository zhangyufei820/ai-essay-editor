export type ChatSessionRouteSource = {
  id: string
  ai_model?: string | null
  ai_provider?: string | null
  processing_mode?: string | null
  title?: string | null
  preview?: string | null
}

export function buildChatSessionRoute(sessionId: string, model?: string | null, source?: Omit<ChatSessionRouteSource, "id" | "ai_model">) {
  const safeSessionId = encodeURIComponent(sessionId)
  const safeModel = resolveChatSessionRouteModel({ id: sessionId, ai_model: model, ...source })

  if (safeModel === "gpt-image-2") {
    return `/chat/gpt-image-2?sessionId=${safeSessionId}`
  }

  if (safeModel === "banana-2-pro") {
    return `/chat/banana-2-pro?sessionId=${safeSessionId}`
  }

  return `/chat?sessionId=${safeSessionId}&agent=${encodeURIComponent(safeModel)}`
}

export function normalizeChatSessionModel(model?: string | null) {
  const normalized = (model || "standard").trim().replaceAll("_", "-")
  const lower = normalized.toLowerCase()

  if (
    lower === "gpt-image-2" ||
    lower === "gpt-image-1.5" ||
    lower === "gpt-image-1" ||
    lower === "gpt-image-1-mini" ||
    lower === "gpt-image-v11" ||
    lower === "creative-image-gpt2" ||
    lower === "creative-image-gpt-2" ||
    lower === "gpt-image2" ||
    lower === "image2" ||
    lower === "image-2"
  ) {
    return "gpt-image-2"
  }

  if (
    lower === "banana-2-pro" ||
    lower === "banana2-pro" ||
    lower === "creative-image-banana" ||
    lower === "banana"
  ) {
    return "banana-2-pro"
  }

  return lower || "standard"
}

export function resolveChatSessionRouteModel(session: ChatSessionRouteSource) {
  const normalized = normalizeChatSessionModel(session.ai_model)
  if (normalized === "gpt-image-2" || normalized === "banana-2-pro") return normalized

  const fields = [
    session.ai_model,
    session.ai_provider,
    session.processing_mode,
    session.title,
    session.preview,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (
    fields.includes("gpt image") ||
    fields.includes("gpt-image") ||
    fields.includes("image 2") ||
    fields.includes("image2") ||
    fields.includes("图像生成") ||
    fields.includes("图像编辑")
  ) {
    return "gpt-image-2"
  }

  if (
    fields.includes("banana") ||
    fields.includes("香蕉") ||
    fields.includes("banana2") ||
    fields.includes("banana 2") ||
    fields.includes("图片生成")
  ) {
    return "banana-2-pro"
  }

  if (session.ai_model?.trim()) return normalized

  return normalized
}

export function buildChatSessionRouteFromSession(session: ChatSessionRouteSource) {
  return buildChatSessionRoute(session.id, session.ai_model, {
    ai_provider: session.ai_provider,
    processing_mode: session.processing_mode,
    title: session.title,
    preview: session.preview,
  })
}

export function isDedicatedChatSessionModel(model?: string | null) {
  const normalized = normalizeChatSessionModel(model)
  return normalized === "gpt-image-2" || normalized === "banana-2-pro"
}
