export type AIProviderConfig = {
  id: string
  name: string
  models: string[]
}

export const AI_PROVIDERS: AIProviderConfig[] = [
  { id: "openai", name: "OpenAI", models: ["gpt-5", "gpt-5-mini"] },
  { id: "anthropic", name: "Anthropic", models: ["claude-sonnet-4.5", "claude-opus-4"] },
  { id: "xai", name: "xAI (Grok)", models: ["grok-4", "grok-4-fast"] },
  { id: "google", name: "Google", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  { id: "fireworks", name: "Fireworks AI", models: ["llama-v4-70b", "mixtral-8x22b"] },
]

export function getModelString(provider: string, model: string, useCustomKey = false): string {
  // 如果使用自定义密钥，返回不带前缀的模型名
  if (useCustomKey) {
    return model
  }

  const modelMap: Record<string, string> = {
    openai: `openai/${model}`,
    anthropic: `anthropic/${model}`,
    xai: `xai/${model}`,
    google: `google/${model}`,
    fireworks: `fireworks/${model}`,
  }

  return modelMap[provider] || `openai/${model}`
}

export function parseModelString(modelString: string): { provider: string; model: string } {
  const [provider, model] = modelString.split("/")
  return { provider: provider || "openai", model: model || "gpt-5" }
}

export type CustomAPIConfig = {
  provider: string
  apiKey: string
  baseURL?: string
}

export function getAPIConfig(provider: string): CustomAPIConfig | null {
  const DEFAULT_API_KEY = "sk-diaycftqfopXhIAf5gm7G35xSndFo0VzMi0PyRpHQGz4voxG"
  const DEFAULT_BASE_URL = "https://www.vivaapi.cn/v1"

  // All providers use the same vivaapi endpoint
  const apiKey = process.env.CUSTOM_API_KEY || DEFAULT_API_KEY
  const baseURL = process.env.CUSTOM_BASE_URL || DEFAULT_BASE_URL

  console.log(`[v0] Using vivaapi for all models`)
  console.log(`[v0] Base URL: ${baseURL}`)

  return {
    provider: "vivaapi",
    apiKey,
    baseURL,
  }
}
