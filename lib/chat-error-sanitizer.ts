const TECHNICAL_UPSTREAM_ERROR_PATTERNS = [
  /PluginInvokeError/i,
  /APITimeoutError/i,
  /LiteLLM[^,\n]*Error/i,
  /provider[_\s-]?error/i,
  /upstream[_\s-]?(?:error|request|response|provider)/i,
  /gateway[_\s-]?(?:error|timeout|failed|request)/i,
  /No available channel/i,
  /channel[_\s-]?(?:id|name|error|unavailable)/i,
  /distributor/i,
  /request_timeout/i,
  /Request timed out/i,
  /API request failed with status code/i,
  /No fallback model group found/i,
  /original_model_group/i,
  /Deployment Info/i,
  /Fallbacks\s*=/i,
  /\bmodels\]\s*Error/i,
  /\brequest[_\s-]?id\b/i,
  /\bx-request-id\b/i,
  /\bcf-ray\b/i,
  /\bstatus code:\s*408\b/i,
  /\bError code:\s*408\b/i,
] as const

const INTERNAL_AI_DETAIL_PATTERNS = [
  /https?:\/\/[^\s)"'<>`]+/i,
  /\b[A-Za-z0-9.-]+\.(?:ai|top|dev|com|cn|io|net|org|cloud|app|xyz)\b/i,
  /Dify/i,
  /Workflow/i,
  /workflow/i,
  /LiteLLM/i,
  /Plugin/i,
  /PluginInvokeError/i,
  /OpenClaw/i,
  /Codex/i,
  /node[_\s-]?(?:id|started|finished|execution)?/i,
  /model[_\s-]?(?:id|provider|group)?/i,
  /provider/i,
  /gateway/i,
  /OpenAI/i,
  /Anthropic/i,
  /ChatGPT/i,
  /\bgpt[-_\w.]*\b/i,
  /Gemini/i,
  /Claude/i,
  /Grok/i,
  /Suno/i,
  /Banana\s*2?\s*Pro/i,
  /Image\s*2/i,
  /DeepSeek/i,
  /Qwen/i,
  /New\s*API/i,
  /RelayDance/i,
  /OmniVoice/i,
  /Moonapix/i,
  /VivaAPI/i,
  /TokenFlux/i,
  /Yunwu/i,
  /云雾/i,
  /Fable/i,
  /GJX/i,
  /硅基|火山|豆包|智谱|月之暗面|Kimi/i,
  /skill_(?:id|name|selected)|tool_calls?|function_call/i,
  /插件|节点|工作流|供应商|渠道|通道|网关|上游|备用线路|会话已提交|底层模型|模型供应商|模型路由|模型组|后台工具|内部工具/,
] as const

const INTERNAL_STATUS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\p{Script=Han}A-Za-z0-9\s-]{0,24}\s*任务仍在处理中\s*[：:]\s*Dify\s*会话已提交/giu, "任务已提交，仍在处理中"],
  [/Dify\s*blocking\s*响应超时/gi, "服务响应超时"],
  [/Dify\s*首字节超时/gi, "服务响应超时"],
  [/Dify\s*返回错误/gi, "服务返回错误"],
  [/无法获取\s*Dify\s*响应/gi, "服务暂时没有响应"],
  [/轮询\s*Dify\s*工作流详情/gi, "正在检查任务结果"],
  [/Dify\s*会话已提交/gi, "任务已提交"],
  [/OpenClaw\s*任务已结束，但没有返回可展示内容/gi, "任务已结束，但没有返回可展示内容"],
  [/工作流已提交/g, "任务已提交"],
  [/工作流已完成/g, "任务已完成"],
  [/已收到最终节点回复/g, "已收到结果，正在整理"],
  [/OpenClaw\s*上游节点执行失败/gi, "任务处理失败"],
  [/OpenClaw\s*上游返回空内容/gi, "任务没有返回可展示内容"],
  [/已收到\s*OpenClaw\s*最终回复/gi, "已收到结果，正在整理"],
  [/blocking\s*响应处理失败/gi, "响应处理失败"],
  [/客户端连接中断/g, "连接中断"],
  [/服务端致命错误/g, "服务暂时不可用"],
  [/([^\n\r，。；;:：]{1,40})\s*执行失败/g, "任务处理失败"],
]

const TIMEOUT_ERROR_PATTERNS = [
  /APITimeoutError/i,
  /LiteLLM\.Timeout/i,
  /request_timeout/i,
  /Request timed out/i,
  /\btimed?\s*out\b/i,
  /status code:\s*408/i,
  /Error code:\s*408/i,
  /超时/,
] as const

const SAFETY_REJECTION_ERROR_PATTERNS = [
  /moderation[_\s-]?blocked/i,
  /safety[_\s-]?violations?/i,
  /safety system/i,
  /content[_\s-]?(?:filter|policy)/i,
  /image_generation_user_error/i,
  /request was rejected/i,
] as const

const PUBLIC_OPENCLAW_ARTIFACT_URL_PATTERN =
  /(?:https?:\/\/(?:www\.)?(?:shenxiang\.school|school\.shenxiang\.school|api\.shenxiang\.school|cloudflare\.shenxiang\.school))?\/(?:slides\/|api\/openclaw-media(?:-sign)?\/)[^\s)"'<>`]+/gi

function protectPublicOpenClawArtifactUrls(value: string) {
  const urls: string[] = []
  const text = value.replace(PUBLIC_OPENCLAW_ARTIFACT_URL_PATTERN, (match) => {
    const token = `__PUBLIC_ARTIFACT_URL_${urls.length}__`
    urls.push(match)
    return token
  })

  return {
    text,
    restore(output: string) {
      return urls.reduce(
        (restored, url, index) => restored.split(`__PUBLIC_ARTIFACT_URL_${index}__`).join(url),
        output,
      )
    },
  }
}

function serviceNounFromFallback(fallback: string) {
  if (/图片|图像/.test(fallback)) return "图片服务"
  if (/语音|音频/.test(fallback)) return "语音服务"
  return "智能服务"
}

export function hasTechnicalUpstreamErrorText(value: unknown): boolean {
  if (typeof value !== "string") return false
  return TECHNICAL_UPSTREAM_ERROR_PATTERNS.some((pattern) => pattern.test(value))
}

export function hasTimeoutUpstreamErrorText(value: unknown): boolean {
  if (typeof value !== "string") return false
  return TIMEOUT_ERROR_PATTERNS.some((pattern) => pattern.test(value))
}

function hasSafetyRejectionErrorText(value: unknown): boolean {
  if (typeof value !== "string") return false
  return SAFETY_REJECTION_ERROR_PATTERNS.some((pattern) => pattern.test(value))
}

function getSafetyRejectionMessage(fallback: string) {
  if (/图片|图像/.test(fallback)) return "图片内容触发安全审核，请调整描述或素材后重试。"
  return "请求内容触发安全审核，请调整后重试。"
}

export function getSafeUpstreamErrorMessage(
  value: unknown,
  fallback = "服务暂时不可用，请稍后重试。",
): string | null {
  if (typeof value !== "string" || !value.trim()) return fallback
  if (hasSafetyRejectionErrorText(value)) return getSafetyRejectionMessage(fallback)
  if (!hasTechnicalUpstreamErrorText(value)) return null

  const noun = serviceNounFromFallback(fallback)
  if (hasTimeoutUpstreamErrorText(value)) {
    return `${noun}响应超时或连接中断。请先刷新当前会话或历史记录查看是否已有结果；若仍无结果，再重新提交。`
  }
  return `${noun}暂时不可用。请稍后重试或切换其他功能。`
}

export function stripUpstreamBranding(value: string) {
  const protectedValue = protectPublicOpenClawArtifactUrls(value)

  return protectedValue.restore(protectedValue.text
    .replace(/https?:\/\/[^\s)"'<>`]+/gi, "服务地址")
    .replace(/\b[A-Za-z0-9.-]+\.(?:ai|top|dev|com|cn|io|net|org|cloud|app|xyz)(?:\/[^\s)"'<>`]*)?/gi, "服务地址")
    .replace(/Dify\s*API/gi, "服务")
    .replace(/Dify/gi, "服务")
    .replace(/LiteLLM/gi, "智能服务")
    .replace(/PluginInvokeError/gi, "服务调用错误")
    .replace(/OpenClaw/gi, "智能服务")
    .replace(/Codex/gi, "智能服务")
    .replace(/ChatGPT|OpenAI|Anthropic|Claude|Gemini|Grok|Suno|Banana\s*2?\s*Pro|Image\s*2|DeepSeek|Qwen/gi, "智能服务")
    .replace(/New\s*API|RelayDance|OmniVoice|Moonapix|VivaAPI|TokenFlux|Yunwu|Fable|GJX|云雾|硅基|火山|豆包|智谱|月之暗面|Kimi/gi, "智能服务")
    .replace(/\b(?:sx|gpt|gemini|claude|openai|anthropic|grok|suno|deepseek|qwen|banana|tokenflux|moonapix|vivaapi|yunwu|fable|gjx|relaydance|omnivoice)[\w.-]*/gi, "智能服务")
    .replace(/\b(?:req_id|request_id|x-request-id|cf-ray|trace_id|channel_id|channel|provider|gateway|workflow_run_id|conversation_id|task_id)\s*[:=]\s*[\w.-]+/gi, "")
    .replace(/No available channel(?: for model)?[^，。；;\n]*/gi, "服务暂时不可用")
    .replace(/insufficient[_\s-]?user[_\s-]?quota/gi, "当前额度不足")
    .replace(/provider[_\s-]?error/gi, "服务错误")
    .replace(/上游/g, "服务")
    .replace(/网关/g, "服务")
    .replace(/供应商/g, "服务")
    .replace(/渠道|通道/g, "连接")
    .replace(/备用线路/g, "连接"))
}

export function hasInternalAiDetailText(value: unknown): boolean {
  if (typeof value !== "string") return false
  const protectedValue = protectPublicOpenClawArtifactUrls(value)
  return INTERNAL_AI_DETAIL_PATTERNS.some((pattern) => pattern.test(protectedValue.text))
}

export function sanitizePublicAiStatus(value: unknown, fallback = "任务仍在处理中"): string {
  if (typeof value !== "string" || !value.trim()) return fallback

  const safeUpstreamMessage = getSafeUpstreamErrorMessage(value)
  if (safeUpstreamMessage) return safeUpstreamMessage

  let output = value.trim()
  for (const [pattern, replacement] of INTERNAL_STATUS_REPLACEMENTS) {
    output = output.replace(pattern, replacement)
  }
  output = stripUpstreamBranding(output)
    .replace(/\b(?:node|model|provider|workflow|plugin|gateway)[-_a-z0-9:. ]*/gi, "服务")
    .replace(/\b(?:req_id|request_id|x-request-id|cf-ray|workflow_run_id|conversation_id|task_id|trace_id|channel_id)\s*[:=]\s*[\w.-]+/gi, "")
    .replace(/\b(?:sx|gpt|gemini|claude|openai|anthropic|grok|suno|deepseek|qwen|banana|tokenflux|moonapix|vivaapi|yunwu|fable|gjx|relaydance|omnivoice)[\w.-]*/gi, "智能服务")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s*([，。；：,.!?])\s*/g, "$1")
    .trim()

  if (!output || hasInternalAiDetailText(output)) return fallback
  return output
}

export function sanitizePublicAiError(value: unknown, fallback = "服务暂时不可用，请稍后重试。"): string {
  if (typeof value !== "string" || !value.trim()) return fallback
  const safeUpstreamMessage = getSafeUpstreamErrorMessage(value, fallback)
  if (safeUpstreamMessage) return safeUpstreamMessage

  const output = sanitizePublicAiStatus(value, fallback)
  if (!output || hasInternalAiDetailText(output)) return fallback
  return output
}

export function sanitizeAssistantMessageForPublicDisplay(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return ""
  if (!hasTechnicalUpstreamErrorText(value) && !hasInternalAiDetailText(value)) return value

  const withoutOldTitle = value
    .replace(/^#{1,6}\s*响应没有完整送达\s*$/gim, "### 当前回复未完整送达")
    .replace(/响应没有完整送达/g, "当前回复未完整送达")

  const lines = withoutOldTitle.split(/\r?\n/)
  const sanitizedLines = lines.map((line) => {
    if (!line.trim()) return line
    if (/^#{1,6}\s*当前回复未完整送达\s*$/.test(line.trim())) return line
    return sanitizePublicAiError(line, "服务暂时不可用，请稍后重试。")
  })

  const output = sanitizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  return output || "服务暂时不可用，请稍后重试。"
}

export function sanitizePublicAiErrorCode(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  const code = value.trim()
  if (/CREDENTIAL|CONFIG|KEY|SECRET|TOKEN|APP_MODE|NOT_CONFIGURED|MISSING/i.test(code)) {
    return "SERVICE_CONFIG_UNAVAILABLE"
  }
  if (/TIMEOUT|TIMED_OUT|408|504|524/i.test(code)) {
    return "SERVICE_RESPONSE_TIMEOUT"
  }
  if (/FORBIDDEN|UNAUTHORIZED|ACCESS_DENIED|OWNER|SESSION/i.test(code)) {
    return "SERVICE_ACCESS_DENIED"
  }
  if (/MODERATION|SAFETY|CONTENT_FILTER|POLICY|BLOCKED|REJECTED/i.test(code)) {
    return "SERVICE_INPUT_REJECTED"
  }
  if (/EMPTY|NO_RESPONSE|BLANK|NO_CONTENT/i.test(code)) {
    return "SERVICE_EMPTY_RESPONSE"
  }
  if (/CREDIT|BALANCE|QUOTA|BILLING/i.test(code)) {
    return "SERVICE_USAGE_LIMIT"
  }
  if (/DIFY|WORKFLOW|PLUGIN|LITELLM|OPENCLAW|GATEWAY|PROVIDER|MODEL|NODE|VIVA|MOONAPIX|TOKENFLUX|YUNWU|FABLE|GJX|GEMINI|OPENAI|ANTHROPIC|CHANNEL|UPSTREAM|RELAYDANCE|OMNIVOICE/i.test(code)) {
    return "SERVICE_TEMPORARILY_UNAVAILABLE"
  }
  return code.replace(/[^A-Z0-9_]/gi, "_").toUpperCase().slice(0, 80)
}
