import { NextResponse } from "next/server"

export type AIProvider = {
  id: string
  name: string
  description: string
  capabilities: {
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

const AI_CAPABILITY_GROUPS: AIProvider[] = [
  {
    id: "deep-chat",
    name: "深度对话",
    description: "适合通用推理、写作和复杂问题拆解",
    capabilities: [
      {
        id: "gpt-5",
        name: "深度对话",
        description: "通用推理、写作和复杂问题拆解",
        contextWindow: 128000,
      },
      {
        id: "general-chat",
        name: "网站助手",
        description: "快速问答、功能入口和套餐权益说明",
        contextWindow: 128000,
      },
    ],
    features: ["文本生成", "多语言支持", "复杂问题拆解", "快速响应"],
    status: "available",
  },
  {
    id: "long-form-analysis",
    name: "长文分析",
    description: "适合长文理解、结构分析和严谨润色",
    capabilities: [
      {
        id: "claude-opus",
        name: "长文分析",
        description: "长文理解、结构分析和严谨润色",
        contextWindow: 200000,
      },
      {
        id: "ai-writing-paper",
        name: "论文写作",
        description: "结构化论文初稿与引用整理",
        contextWindow: 128000,
      },
    ],
    features: ["深度分析", "长文档处理", "结构化写作", "严谨润色"],
    status: "available",
  },
  {
    id: "vision-and-creative",
    name: "图文创作",
    description: "适合图文理解、资料整理、图像生成和图像编辑",
    capabilities: [
      {
        id: "gemini-pro",
        name: "图文理解",
        description: "图文资料理解与整理",
        contextWindow: 1000000,
      },
      {
        id: "gpt-image-2",
        name: "高质量图像",
        description: "高质量图像生成与编辑",
        contextWindow: 128000,
      },
    ],
    features: ["图文理解", "图像生成", "图像编辑", "资料整理"],
    status: "available",
  },
  {
    id: "creative-agent",
    name: "高级创作",
    description: "适合复杂创作、演示和多步骤内容生成",
    capabilities: [
      {
        id: "open-claw",
        name: "高级创作",
        description: "复杂创作、演示和多步骤内容生成",
        contextWindow: 128000,
      },
      {
        id: "super-all-in-one-agent",
        name: "超级全能智能体",
        description: "PPT、图像、视频、论文、联网和多步骤任务",
        contextWindow: 128000,
      },
    ],
    features: ["PPT", "网页", "多步骤任务", "综合创作"],
    status: "available",
  },
]

export async function GET() {
  return NextResponse.json({
    providers: AI_CAPABILITY_GROUPS,
    total: AI_CAPABILITY_GROUPS.length,
  })
}
