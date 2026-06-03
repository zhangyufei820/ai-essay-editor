const TECHNICAL_UPSTREAM_ERROR_PATTERNS = [
  /PluginInvokeError/i,
  /APITimeoutError/i,
  /LiteLLM[^,\n]*Error/i,
  /request_timeout/i,
  /Request timed out/i,
  /API request failed with status code/i,
  /No fallback model group found/i,
  /original_model_group/i,
  /Deployment Info/i,
  /Fallbacks\s*=/i,
  /\bmodels\]\s*Error/i,
  /\bstatus code:\s*408\b/i,
  /\bError code:\s*408\b/i,
] as const

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

function serviceNounFromFallback(fallback: string) {
  if (/图片|图像/.test(fallback)) return "图片服务"
  if (/语音|音频/.test(fallback)) return "语音服务"
  return "模型服务"
}

export function hasTechnicalUpstreamErrorText(value: unknown): boolean {
  if (typeof value !== "string") return false
  return TECHNICAL_UPSTREAM_ERROR_PATTERNS.some((pattern) => pattern.test(value))
}

export function hasTimeoutUpstreamErrorText(value: unknown): boolean {
  if (typeof value !== "string") return false
  return TIMEOUT_ERROR_PATTERNS.some((pattern) => pattern.test(value))
}

export function getSafeUpstreamErrorMessage(
  value: unknown,
  fallback = "服务暂时不可用，请稍后重试。",
): string | null {
  if (typeof value !== "string" || !value.trim()) return fallback
  if (!hasTechnicalUpstreamErrorText(value)) return null

  const noun = serviceNounFromFallback(fallback)
  if (hasTimeoutUpstreamErrorText(value)) {
    return `${noun}响应超时或备用线路不可用。请先刷新当前会话或历史记录查看是否已有结果；若仍无结果，再重新提交。`
  }
  return `${noun}暂时不可用，系统没有把本次内部错误展示给学生。请稍后重试或切换其他模型。`
}

export function stripUpstreamBranding(value: string) {
  return value
    .replace(/Dify\s*API/gi, "服务")
    .replace(/Dify/gi, "服务")
    .replace(/LiteLLM/gi, "模型服务")
    .replace(/PluginInvokeError/gi, "服务调用错误")
    .replace(/网关/g, "服务")
}
