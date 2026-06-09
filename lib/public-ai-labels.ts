const PUBLIC_AI_LABELS: Record<string, string> = {
  "general-chat": "网站助手",
  standard: "作文批改",
  "teaching-pro": "教学评助手",
  "quanquan-math": "全学段数学",
  "quanquan-english": "全学段英语",
  "vocab-card": "词境记忆卡",
  problem: "题目解析",
  "beike-pro": "备课助手",
  banzhuren: "班主任助手",
  "all-in-one-agent": "数学图片与动画生成器",
  "super-all-in-one-agent": "超级全能智能体",
  "ai-writing-paper": "论文写作",
  "zhongying-essay": "中英文作文",
  "reading-report": "读书报告",
  "experiment-report": "实验报告",
  "study-abroad": "留学文书",
  "resume-optimize": "简历优化",
  "speech-defense": "演讲答辩",
  "school-wechat": "公众号写作",
  "teacher-agent": "教师自定义智能体",
  "gpt-5": "深度对话",
  "claude-opus": "长文分析",
  "gemini-pro": "图文理解",
  "grok-4.2": "灵感探索",
  "open-claw": "高级创作",
  "banana-2-pro": "创意图像 4K",
  "gemini-image": "图像创作",
  "gpt-image-2": "高质量图像",
  "suno-v5": "音乐创作",
}

const INTERNAL_PUBLIC_LABEL_PATTERNS = [
  /\b(?:openai|anthropic|claude|chatgpt|gpt|gemini|grok|xai|suno|deepseek|qwen)\b/i,
  /banana\s*2?\s*pro|banana2\s*pro/i,
  /\b(?:dify|litellm|moonapix|tokenflux|vivaapi|newapi|codex|openclaw)\b/i,
  /\bimage\s*2\b/i,
  /\b(?:provider|gateway|workflow|plugin|node|model)[-_a-z0-9:. ]*/i,
  /(?:供应商|网关|工作流|插件|节点|底层模型|模型路由|模型组|后台工具|内部工具|后台模型)/,
] as const

export function getPublicAiLabel(key: string | null | undefined, fallback = "当前功能") {
  if (!key) return fallback
  return PUBLIC_AI_LABELS[key] || fallback
}

export function sanitizePublicAiLabel(value: unknown, fallback = "当前功能") {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback

  const directLabel = PUBLIC_AI_LABELS[trimmed]
  if (directLabel) return directLabel

  if (INTERNAL_PUBLIC_LABEL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return fallback
  }

  return trimmed
}

export function publicAiLabelEntries() {
  return { ...PUBLIC_AI_LABELS }
}
