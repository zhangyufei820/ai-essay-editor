import type { ModelKey } from "@/components/ModelLogo"
import type { ModelType } from "@/lib/pricing"

export type NavigationModelGroup = {
  key: string
  label: string
  items: NavigationModelItem[]
}

export type NavigationModelItem = {
  key: ModelType
  name: string
  description: string
  href: string
  group: string
  color: string
  modelKey: ModelKey
  badge?: string
}

const BRAND_GREEN = "#14532d"

export const navigationModelGroups: NavigationModelGroup[] = [
  {
    key: "education",
    label: "教育专区",
    items: [
      {
        key: "all-in-one-agent",
        name: "全能超级智能体",
        description: "动画、图片、文件全能创作",
        href: "/chat/all-in-one-agent",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "all-in-one-agent",
        badge: "推荐",
      },
      {
        key: "standard",
        name: "作文批改",
        description: "专业作文分析与点评",
        href: "/chat/standard",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "standard",
        badge: "推荐",
      },
      {
        key: "teaching-pro",
        name: "教学评助手",
        description: "教学评估与反馈",
        href: "/chat/teaching-pro",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "teaching-pro",
      },
      {
        key: "quanquan-math",
        name: "全学段数学",
        description: "问题解答，步骤清晰",
        href: "/chat/quanquan-math",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "quanquan-math",
      },
      {
        key: "quanquan-english",
        name: "全学段英语",
        description: "听说读写，全面覆盖",
        href: "/chat/quanquan-english",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "quanquan-english",
      },
      {
        key: "vocab-card",
        name: "词境记忆卡",
        description: "词根联想，卡片复习",
        href: "/chat/vocab-card",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "vocab-card",
        badge: "新",
      },
      {
        key: "beike-pro",
        name: "备课助手Pro",
        description: "智能备课，高效便捷",
        href: "/chat/beike-pro",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "beike-pro",
      },
      {
        key: "banzhuren",
        name: "班主任助手",
        description: "班级管理，家校沟通",
        href: "/chat/banzhuren",
        group: "教育专用",
        color: BRAND_GREEN,
        modelKey: "banzhuren",
      },
    ],
  },
  {
    key: "models",
    label: "顶级模型专区",
    items: [
      {
        key: "general-chat",
        name: "通用对话",
        description: "轻量快速问答",
        href: "/chat/general-chat",
        group: "AI模型",
        color: BRAND_GREEN,
        modelKey: "general-chat",
        badge: "默认",
      },
      {
        key: "gpt-5",
        name: "ChatGPT 5.4",
        description: "通用智能对话",
        href: "/chat/gpt-5",
        group: "AI模型",
        color: BRAND_GREEN,
        modelKey: "gpt-5",
        badge: "新",
      },
      {
        key: "claude-opus",
        name: "Claude opus4.6thinking",
        description: "深度推理与分析",
        href: "/chat/claude-opus",
        group: "AI模型",
        color: BRAND_GREEN,
        modelKey: "claude-opus",
      },
      {
        key: "gemini-pro",
        name: "Gemini 3.1 pro",
        description: "多模态理解",
        href: "/chat/gemini-pro",
        group: "AI模型",
        color: BRAND_GREEN,
        modelKey: "gemini-pro",
      },
      {
        key: "grok-4.2",
        name: "Grok-4.2",
        description: "xAI 智能助手",
        href: "/chat/grok-4.2",
        group: "AI模型",
        color: BRAND_GREEN,
        modelKey: "grok-4.2",
      },
      {
        key: "open-claw",
        name: "Open Claw",
        description: "OpenClaw 智能助手",
        href: "/chat/open-claw",
        group: "AI模型",
        color: BRAND_GREEN,
        modelKey: "open-claw",
        badge: "推荐",
      },
    ],
  },
  {
    key: "writing",
    label: "AI写作专区",
    items: [
      {
        key: "ai-writing-paper",
        name: "论文写作",
        description: "学术论文写作辅助",
        href: "/chat/ai-writing-paper",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "ai-writing-paper",
        badge: "新",
      },
      {
        key: "zhongying-essay",
        name: "中英文作文",
        description: "K12与四六级作文思路启发与语法润色",
        href: "/chat/zhongying-essay",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "zhongying-essay",
      },
      {
        key: "reading-report",
        name: "读书报告 / 观后感",
        description: "提炼书籍核心观点，深化阅读思考",
        href: "/chat/reading-report",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "reading-report",
      },
      {
        key: "experiment-report",
        name: "实验报告助理",
        description: "规范理工科实验报告格式与结论分析",
        href: "/chat/experiment-report",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "experiment-report",
      },
      {
        key: "study-abroad",
        name: "留学与升学文书",
        description: "挖掘个人闪光点，打磨专属申请故事",
        href: "/chat/study-abroad",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "study-abroad",
      },
      {
        key: "resume-optimize",
        name: "实习简历优化",
        description: "提炼校园经历，生成专业职场简历",
        href: "/chat/resume-optimize",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "resume-optimize",
      },
      {
        key: "speech-defense",
        name: "演讲与答辩稿",
        description: "竞选、比赛与论文答辩的逐字稿定制",
        href: "/chat/speech-defense",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "speech-defense",
      },
      {
        key: "school-wechat",
        name: "学校公众号写作",
        description: "校园宣传与活动稿件撰写",
        href: "/chat/school-wechat",
        group: "AI写作",
        color: BRAND_GREEN,
        modelKey: "school-wechat",
      },
    ],
  },
  {
    key: "creative",
    label: "多媒体专区",
    items: [
      {
        key: "banana-2-pro",
        name: "Banana2 Pro 4K",
        description: "AI 图像生成",
        href: "/chat/banana-2-pro",
        group: "创意生成",
        color: BRAND_GREEN,
        modelKey: "banana-2-pro",
        badge: "热门",
      },
      {
        key: "gpt-image-2",
        name: "GPT Image 2",
        description: "高质量图像生成与编辑",
        href: "/chat/gpt-image-2",
        group: "创意生成",
        color: BRAND_GREEN,
        modelKey: "gpt-image-2",
        badge: "推荐",
      },
      {
        key: "suno-v5",
        name: "Suno V5",
        description: "AI 音乐创作，约 100 积分起",
        href: "/chat/suno-v5",
        group: "创意生成",
        color: BRAND_GREEN,
        modelKey: "suno-v5",
      },
    ],
  },
]

export const navigationModelItems = navigationModelGroups.flatMap((group) => group.items)

export const navigationModelConfig: Partial<Record<ModelType, NavigationModelItem>> = Object.fromEntries(
  navigationModelItems.map((item) => [item.key, item]),
) as Partial<Record<ModelType, NavigationModelItem>>

export function getNavigationModelItem(model: ModelType) {
  return navigationModelConfig[model]
}
