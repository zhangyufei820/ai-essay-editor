import { NextResponse } from "next/server"

export type AIProvider = {
  id: string
  name: string
  description: string
  models: {
    id: string
    name: string
    description: string
    contextWindow: number
    pricing?: {
      input: number
      output: number
    }
  }[]
  features: string[]
  status: "available" | "requires_key"
}

const AI_PROVIDERS: AIProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "业界领先的AI模型，擅长理解和生成自然语言",
    models: [
      {
        id: "gpt-5",
        name: "GPT-5",
        description: "最新旗舰模型，卓越的推理和创作能力",
        contextWindow: 128000,
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        description: "快速高效的轻量级模型",
        contextWindow: 128000,
      },
    ],
    features: ["文本生成", "代码理解", "多语言支持", "长文本处理"],
    status: "available",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "注重安全性和准确性的AI助手",
    models: [
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        description: "平衡性能和速度的最佳选择",
        contextWindow: 200000,
      },
      {
        id: "claude-opus-4",
        name: "Claude Opus 4",
        description: "最强大的推理和分析能力",
        contextWindow: 200000,
      },
    ],
    features: ["深度分析", "长文档处理", "精确引用", "安全可靠"],
    status: "available",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    description: "实时信息和幽默风格的AI模型",
    models: [
      {
        id: "grok-4",
        name: "Grok 4",
        description: "最新的Grok模型，实时信息访问",
        contextWindow: 131072,
      },
      {
        id: "grok-4-fast",
        name: "Grok 4 Fast",
        description: "快速响应版本",
        contextWindow: 131072,
      },
    ],
    features: ["实时信息", "幽默风格", "快速响应", "多模态理解"],
    status: "available",
  },
  {
    id: "google",
    name: "Google Gemini",
    description: "Google的多模态AI模型",
    models: [
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "快速多模态处理",
        contextWindow: 1000000,
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        description: "专业级多模态能力",
        contextWindow: 2000000,
      },
    ],
    features: ["超长上下文", "多模态", "代码生成", "数据分析"],
    status: "available",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    description: "高性能开源模型托管平台",
    models: [
      {
        id: "llama-v4-70b",
        name: "Llama 4 70B",
        description: "Meta最新开源模型",
        contextWindow: 128000,
      },
      {
        id: "mixtral-8x22b",
        name: "Mixtral 8x22B",
        description: "高性能混合专家模型",
        contextWindow: 65536,
      },
    ],
    features: ["开源模型", "高性价比", "快速推理", "灵活部署"],
    status: "available",
  },
]

export async function GET() {
  return NextResponse.json({
    providers: AI_PROVIDERS,
    total: AI_PROVIDERS.length,
  })
}
