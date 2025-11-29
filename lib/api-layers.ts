// API功能分解 - 四层架构实现

// 1. 数据与信息输入层 (Data & Information Input Layer)
export type SearchProvider = "google" | "bing" | "brave" | "baidu" | "sogou"
export type OCRProvider = "google-vision" | "amazon-textract" | "baidu-ocr" | "tencent-ocr" | "aliyun-ocr"

export interface WebSearchConfig {
  provider: SearchProvider
  query: string
  maxResults?: number
}

export interface DocumentProcessingConfig {
  file: File | string
  type: "pdf" | "word" | "image" | "text"
  ocrProvider?: OCRProvider
}

// 2. 核心处理与决策层 (The "Agent Brain")
export type LLMProvider =
  | "openai"
  | "anthropic"
  | "xai"
  | "google"
  | "fireworks"
  | "baidu-wenxin"
  | "aliyun-tongyi"
  | "xunfei-spark"

export interface LLMConfig {
  provider: LLMProvider
  model: string
  temperature?: number
  maxTokens?: number
}

export interface KnowledgeGraphConfig {
  provider: "google-kg"
  query: string
}

// 3. 内容生成与输出层 (Content Generation & Output Layer)
export type OutputFormat = "html" | "markdown" | "json" | "presentation"

export interface ContentGenerationConfig {
  format: OutputFormat
  style?: "sparkpage" | "report" | "essay" | "slides"
}

export interface PresentationConfig {
  provider: "google-slides" | "microsoft-powerpoint"
  template?: string
}

// 4. 交互与跟进层 (Interaction & Follow-up Layer)
export interface ConversationContext {
  history: Array<{ role: string; content: string }>
  sparkpageContext?: string
  metadata?: Record<string, unknown>
}

// 扩展的AI提供商配置
export const EXTENDED_AI_PROVIDERS = [
  // 国际提供商
  { id: "openai", name: "OpenAI", models: ["gpt-5", "gpt-5-mini", "gpt-4o"], region: "international" },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    models: ["claude-sonnet-4.5", "claude-opus-4", "claude-haiku-4"],
    region: "international",
  },
  { id: "xai", name: "xAI (Grok)", models: ["grok-4", "grok-4-fast", "grok-vision"], region: "international" },
  {
    id: "google",
    name: "Google Gemini",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-exp"],
    region: "international",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    models: ["llama-v4-70b", "mixtral-8x22b", "qwen-2.5-72b"],
    region: "international",
  },
  // 中国提供商
  {
    id: "baidu-wenxin",
    name: "百度文心一言",
    models: ["ernie-4.0", "ernie-3.5", "ernie-speed"],
    region: "china",
  },
  {
    id: "aliyun-tongyi",
    name: "阿里通义千问",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    region: "china",
  },
  { id: "xunfei-spark", name: "讯飞星火", models: ["spark-v3.5", "spark-v3.0", "spark-lite"], region: "china" },
]

// 文档处理能力配置
export const DOCUMENT_PROCESSORS = {
  pdf: {
    international: ["adobe-pdf-extract", "pymupdf"],
    china: ["baidu-ocr", "tencent-ocr"],
  },
  word: {
    international: ["python-docx", "mammoth"],
    china: ["aliyun-ocr", "tencent-ocr"],
  },
  image: {
    international: ["google-vision", "amazon-textract"],
    china: ["baidu-ocr", "tencent-ocr", "aliyun-ocr"],
  },
}

// 搜索引擎配置
export const SEARCH_ENGINES = {
  international: [
    { id: "google", name: "Google Search", api: "google-custom-search" },
    { id: "bing", name: "Bing Search", api: "bing-web-search" },
    { id: "brave", name: "Brave Search", api: "brave-search" },
  ],
  china: [
    { id: "baidu", name: "百度搜索", api: "baidu-search" },
    { id: "sogou", name: "搜狗搜索", api: "sogou-search" },
  ],
}
