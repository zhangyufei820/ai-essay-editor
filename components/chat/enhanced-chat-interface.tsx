"use client"

import type React from "react"
import { useState, useRef, useEffect, Suspense, useCallback } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Send, Paperclip, X, FileText, Copy, Loader2, User, AlertCircle,
  ChevronDown, ChevronLeft, ArrowDown, Sparkles,
  Download, Share2, Printer, Mic, MicOff, Volume2, History
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { MessageBubble } from "./MessageBubble"
import { ChatInput } from "./ChatInput"
import { EmptyState } from "./EmptyState"
import { AIStatusIndicator } from "@/components/ai/AIStatusIndicator"
import { ModelSelector } from "./ModelSelector"
import { WorkflowVisualizer } from "./WorkflowVisualizer"
import { MathInline, MathBlock } from "./UltimateRenderer"
import { useWorkflowVisualizer } from "@/hooks/useWorkflowVisualizer"
// 🎵 Suno 音乐生成相关导入
import { MusicCard } from "./MusicCard"
import { useSunoMusic, extractTaskId, removeTaskIdFromText, type SunoProFormData } from "@/hooks/useSunoMusic"
import { TASK_ID_REGEX } from "@/lib/suno-config"
import { SunoProForm, type SunoFormData } from "./SunoProForm"
import type { ChatSession } from "./chat-sidebar"
import { LoadingStateCard } from "@/components/ui/LoadingStateCard"
import { ChatSkeleton } from "@/components/ui/chat-skeleton"
import { motion, AnimatePresence } from "framer-motion"
import { EnhancedMarkdown } from "./EnhancedMarkdown"
import { UserMessageBubble } from "./UserMessageBubble"
import katex from "katex"
import { brandColors, slateColors } from "@/lib/design-tokens"
import { LATEX_MACROS, renderLatex } from "@/lib/latex-constants"
import { cleanLLMText } from "@/lib/text-sanitizer"
import { createClient } from "@supabase/supabase-js"
import { collapseSidebar, refreshCredits, refreshSessionList, SESSION_LIST_REFRESH_EVENT } from "@/components/app-sidebar"
import { useSelectedModelStore } from "@/hooks/useSelectedModelStore"
import { validateFileForUpload, MAX_FILE_SIZE } from "@/lib/upload-service"
import { VoiceRecorder, getDifyTTS, uploadAudioToDify } from "@/lib/voice-service"
import { getApiUrl } from "@/lib/api-config"
import { logger } from "@/lib/logger"
import { ModelLogo } from "@/components/ModelLogo"
import { 
  calculatePreviewCost, 
  ModelType, 
  GenMode,
  MODEL_COSTS,
  DAILY_FREE_LIMIT,
  LUXURY_THRESHOLD,
  getModelDisplayName
} from "@/lib/pricing"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu"

// 🔥 品牌深绿色（参考主页标题）
const BRAND_GREEN = "#14532d"

// 模型 key 到显示名称的映射
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "standard": "标准",
  "teaching-pro": "教学 Pro",
  "gpt-5": "GPT-5",
  "claude-opus": "Claude",
  "gemini-pro": "Gemini",
  "banana-2-pro": "Banana",
  "grok-4.2": "Grok",
  "open-claw": "OpenClaw",
  "quanquan-math": "全科数学",
  "quanquan-english": "全科英语",
  "beike-pro": "备课助手",
  "banzhuren": "班主任助手",
  "suno-v5": "音乐",
  "ai-writing-paper": "论文写作",
  "zhongying-essay": "中英文作文",
  "reading-report": "读书报告",
  "experiment-report": "实验报告",
  "study-abroad": "留学文书",
  "resume-optimize": "简历优化",
  "speech-defense": "演讲答辩",
  "school-wechat": "公众号",
}

// 获取模型徽章颜色 — 强制归一：所有模型统一为翡翠绿 #10A37F
function getModelBadgeColor(_modelKey: string): string {
  return "#10A37F"
}

// 🔥 移动端用户信息显示组件
const MobileUserInfo = ({ 
  userName, 
  credits, 
  onMenuClick 
}: { 
  userName: string
  credits: number
  onMenuClick: () => void 
}) => (
  <button 
    onClick={onMenuClick}
    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
  >
    <div 
      className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-xs font-bold"
      style={{ backgroundColor: BRAND_GREEN }}
    >
      {userName?.[0]?.toUpperCase() || "U"}
    </div>
    <div className="flex flex-col items-start">
      <span className="text-xs font-medium text-slate-700 max-w-[80px] truncate">
        {userName || "用户"}
      </span>
      <span className="text-[10px] text-emerald-600 font-medium">
        {credits.toLocaleString()} 积分
      </span>
    </div>
  </button>
)

// --- Supabase 初始化 ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// --- 类型定义 ---
type UploadedFile = { name: string; type: string; size: number; data: string; preview?: string; difyFileId?: string }
// 🔥 消息类型 - 支持 metadata 存储音乐等附加数据，支持 files 显示上传的文件
type Message = { 
  id: string
  role: "user" | "assistant"
  content: string
  files?: UploadedFile[]  // 🔥 新增：用户消息携带的文件
  metadata?: {
    type?: "music"
    taskId?: string
    songs?: Array<{
      id: number
      status: "loading" | "ready" | "error"
      audioUrl?: string
      coverUrl?: string
      title?: string
      duration?: number
      errorMessage?: string
    }>
  } | null
}
type FileProcessingState = { status: "idle" | "uploading" | "processing" | "recognizing" | "complete" | "error"; progress: number; message: string }

// 🔥 上传状态动态消息数组
const UPLOAD_STATUS_MESSAGES = {
  uploading: [
    "正在上传文件...",
    "文件传输中...",
    "上传进度: {progress}%",
    "正在发送请求..."
  ],
  processing: [
    "正在深度解析题目...",
    "AI 正在思考中...",
    "正在识别内容...",
    "正在分析文件..."
  ],
  recognizing: [
    "正在理解题意...",
    "深度分析中...",
    "正在构建解题思路...",
    "正在提取关键信息..."
  ]
}

// 获取状态对应的随机消息
function getRandomStatusMessage(status: FileProcessingState['status'], progress?: number): string {
  const messages = UPLOAD_STATUS_MESSAGES[status as keyof typeof UPLOAD_STATUS_MESSAGES]
  if (!messages) return ""
  const message = messages[Math.floor(Math.random() * messages.length)]
  return message.replace('{progress}', String(progress || 0))
}

// 🎵 格式化 Suno 响应：只保留歌词和 prompt，移除思考过程和冗余内容
function formatSunoResponse(fullText: string): string {
  // 1. 移除思考过程 <think>...</think>
  let content = fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  
  // 2. 尝试提取 JSON 中的歌词
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/i)
  if (jsonMatch) {
    try {
      const jsonData = JSON.parse(jsonMatch[1])
      const title = jsonData.title || ''
      const lyrics = jsonData.lyrics_plain_text || jsonData.lyrics || ''
      const stylePrompt = jsonData.style_prompt || ''
      
      // 3. 格式化输出（Claude 风格：简洁、清晰）
      let formatted = ''
      
      if (title) {
        formatted += `## 🎵 ${title}\n\n`
      }
      
      if (stylePrompt) {
        formatted += `**风格提示词：**\n\`\`\`\n${stylePrompt}\n\`\`\`\n\n`
      }
      
      if (lyrics) {
        formatted += `**完整歌词：**\n\n${lyrics}\n`
      }
      
      // 添加任务 ID 提示（如果有）
      const taskIdMatch = fullText.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)
      if (taskIdMatch) {
        formatted += `\n---\n📝 任务ID: \`${taskIdMatch[1]}\`\n请回复 **"确认生成"** 开始生成音乐！`
      }
      
      return formatted || content
    } catch (e) {
      // JSON 解析失败，返回原始内容
    }
  }
  
  // 4. 如果没有 JSON，尝试提取歌词部分
  // 移除 Phase 分析等冗余内容
  const lyricsMatch = content.match(/\*\*(?:完整歌词|歌词)[：:]\*\*[\s\S]*?(?=\n\n(?:##|\*\*生成|$))/i)
  if (lyricsMatch) {
    return lyricsMatch[0]
  }
  
  return content
}

// --- 辅助组件：极简思考动画 - 仅文字呼吸效果，无 SVG/图标 ---
const SimpleBrainLoader = ({ showHint = false }: { showHint?: boolean }) => (
  <div className="flex items-center gap-1.5">
    <motion.span
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      className="text-xs text-slate-400 font-normal tracking-wide"
    >
      {showHint ? "正在深度思考中..." : "Thinking..."}
    </motion.span>
  </div>
)

// --- 辅助组件：文本渲染器 ---
// LaTeX 渲染辅助函数 (已移至 lib/latex-constants.ts)

const InlineText = ({ text }: { text: string }) => {
  if (!text) return null;

  // 首先按 ** 分块
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const inner = part.slice(2, -2);
          // 检查是否包含 LaTeX 公式 $...$
          const latexParts = inner.split(/(\$[^$]+\$)/g);
          if (latexParts.length > 1) {
            return (
              <strong key={index} className={`font-semibold text-[${BRAND_GREEN}]`}>
                {latexParts.map((lp, lpIdx) => {
                  if (lp.startsWith("$") && lp.endsWith("$")) {
                    return <MathInline key={lpIdx} formula={lp.slice(1, -1)} />;
                  }
                  return <span key={lpIdx}>{lp}</span>;
                })}
              </strong>
            );
          }
          return <strong key={index} className={`font-semibold text-[${BRAND_GREEN}]`}>{inner}</strong>;
        }
        // 检查是否包含 LaTeX 公式
        const latexParts = part.split(/(\$[^$]+\$)/g);
        if (latexParts.length > 1) {
          return (
            <span key={index}>
              {latexParts.map((lp, lpIdx) => {
                if (lp.startsWith("$") && lp.endsWith("$")) {
                  return <MathInline key={lpIdx} formula={lp.slice(1, -1)} />;
                }
                return <span key={lpIdx}>{lp}</span>;
              })}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

// MediaBlock 必须在 UltimateRenderer 之前定义
// 🔥 支持图片、文件、PPT 渲染
// 🔥 OpenClaw 媒体基础 URL（用于转换本地路径为 HTTP URL）
const OPENCLAW_MEDIA_BASE = process.env.NEXT_PUBLIC_OPENCLAW_MEDIA_URL || 'http://43.154.111.156:18789/__openclaw__/media/'

interface MediaItem {
  type: "image" | "file" | "ppt"
  url: string
  name?: string
  localPath?: string // OpenClaw 本地路径
}

// 🔥 转换 OpenClaw 本地路径为 HTTP URL
function convertOpenClawUrl(url: string): string {
  // 如果已经是完整 URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  // 如果是 OpenClaw 本地路径（如 /home/node/.openclaw/media/xxx）
  if (url.includes('.openclaw/media/') || url.includes('tool-image-generation/')) {
    // 提取文件名
    const fileName = url.split('/').pop() || url
    return `${OPENCLAW_MEDIA_BASE}${fileName}`
  }
  return url
}

const MediaBlock = ({ items }: { items: MediaItem[] }) => {
  if (!items || items.length === 0) return null

  return (
    <div className="space-y-4 my-4">
      {items.map((item, index) => {
        if (item.type === "image") {
          // 🔥 使用 GPT Image 样式渲染图片
          const imageUrl = convertOpenClawUrl(item.url)
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="relative rounded-2xl overflow-hidden shadow-xl border border-green-100"
            >
              <img
                src={imageUrl}
                alt={item.name || "Generated Image"}
                className="w-full h-auto max-h-[500px] object-contain bg-slate-50"
                loading="lazy"
              />
              {/* 下载按钮 */}
              <a
                href={imageUrl}
                download={item.name}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg hover:bg-white transition-all"
              >
                <Download className="w-4 h-4 text-slate-600" />
              </a>
            </motion.div>
          )
        } else if (item.type === "file") {
          // 文件下载链接
          const isPDF = item.url.toLowerCase().includes('.pdf')
          const fileUrl = convertOpenClawUrl(item.url)
          return (
            <div
              key={index}
              className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <span className="text-blue-600 text-lg">{isPDF ? "📄" : "📎"}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{item.name || "文件"}</p>
                <p className="text-xs text-slate-400">{isPDF ? "PDF 文档" : "文件"}</p>
              </div>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={item.name}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors shrink-0"
              >
                下载
              </a>
            </div>
          )
        } else if (item.type === "ppt") {
          // PPT 预览（使用 Google Docs Viewer 或内联 iframe）
          const pptUrl = convertOpenClawUrl(item.url)
          const googleViewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(pptUrl)}&embedded=true`
          return (
            <div key={index} className="rounded-2xl overflow-hidden border border-green-100 shadow-xl">
              <div className="bg-green-50 px-4 py-2 border-b border-green-100">
                <span className="text-sm font-medium text-green-700">📊 {item.name || "PPT 文档"}</span>
              </div>
              <iframe
                src={googleViewerUrl}
                className="w-full h-[400px] bg-white"
                frameBorder="0"
                title="PPT Preview"
              />
            </div>
          )
        }
        return null
      })}
    </div>
  )
}

// TableBlock 必须在 UltimateRenderer 之前定义
// 🔥 增大表格字体：表头 text-base，表格内容 text-lg
const TableBlock = ({ lines }: { lines: string[] }) => {
  if (lines.length < 2) return null;
  try {
    const headerLine = lines.find(l => l.includes("|") && !l.includes("---"));
    const bodyLines = lines.filter(l => l.includes("|") && !l.includes("---") && l !== headerLine);
    if (!headerLine) return null;
    const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim());
    return (
      <div className="my-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50"><tr>{headers.map((h, i) => (<th key={i} className="px-5 py-4 text-left text-base font-semibold text-slate-700 tracking-wide">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-slate-100">{bodyLines.map((line, i) => { const cells = line.split("|").filter(c => c.trim()).map(c => c.trim()); return (<tr key={i} className="hover:bg-slate-50/50 transition-colors">{cells.map((cell, j) => (<td key={j} className="px-3 sm:px-5 py-3 sm:py-4 text-sm sm:text-base text-slate-700 leading-relaxed"><InlineText text={cell} /></td>))}</tr>); })}</tbody>
          </table>
        </div>
      </div>
    );
  } catch (e) { return null; }
};

// 🎯 GenSpark 风格终端光标
const StreamingCursor = () => (
  <span className="streaming-cursor inline-block ml-1 text-emerald-500 animate-cursor-blink">▍</span>
)

// 🧠 可折叠的思考块组件 - 简化版，只有加载中时显示简单转圈
const ThinkingBlock = ({ content, isStreaming }: { content: string; isStreaming?: boolean }) => {
  // 加载中时只显示简单转圈，不显示文字和方块
  if (isStreaming) {
    return (
      <div className="my-2 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-[#10A37F]" strokeWidth={2} />
      </div>
    )
  }

  // 非加载状态时不显示思考块
  return null
}

function UltimateRenderer({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  if (!content) return <span className="text-emerald-500 animate-cursor-blink">▍</span>;
  
  // 🧠 处理 <think> 标签：提取思考内容并折叠显示
  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i)
  const thinkContent = thinkMatch ? thinkMatch[1].trim() : null

  // 如果只有 <think> 标签还没闭合（流式输出中）
  const hasOpenThink = content.includes('<think>') && !content.includes('</think>')
  const openThinkContent = hasOpenThink ? content.split('<think>')[1] : null

  // 🔥 提取媒体内容（图片、文件、PPT）
  const mediaItems: MediaItem[] = []

  // 匹配 ![alt](url) 图片格式
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  let match
  while ((match = imageRegex.exec(content)) !== null) {
    mediaItems.push({
      type: "image",
      url: match[2],
      name: match[1] || "图片"
    })
  }

  // 匹配 [file](url) 文件格式
  const fileRegex = /\[file\]\(([^)]+)\)/g
  while ((match = fileRegex.exec(content)) !== null) {
    const url = match[1]
    const name = url.split('/').pop() || "文件"
    mediaItems.push({
      type: "file",
      url,
      name
    })
  }

  // 匹配 [ppt](url) PPT格式
  const pptRegex = /\[ppt\]\(([^)]+)\)/g
  while ((match = pptRegex.exec(content)) !== null) {
    const url = match[1]
    const name = url.split('/').pop() || "PPT文档"
    mediaItems.push({
      type: "ppt",
      url,
      name
    })
  }

  // 匹配 MEDIA: 前缀格式 (MEDIA:image:url, MEDIA:file:url, MEDIA:ppt:url)
  const mediaPrefixRegex = /^MEDIA:(image|file|ppt):(.+)$/gm
  while ((match = mediaPrefixRegex.exec(content)) !== null) {
    const type = match[1] as "image" | "file" | "ppt"
    const url = match[2]
    const name = url.split('/').pop() || type
    mediaItems.push({ type, url, name })
  }

  // 从主内容中移除媒体标记
  let cleanContent = content
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[file\]\([^)]+\)/g, '')
    .replace(/\[ppt\]\([^)]+\)/g, '')
    .replace(/^MEDIA:(image|file|ppt):.+$/gm, '')
    .trim()

  // 如果内容为空或只有思考内容
  if (!cleanContent && !thinkContent && !openThinkContent && mediaItems.length === 0) {
    return <span className="text-emerald-500 animate-cursor-blink">▍</span>;
  }

  // 🔥 从 cleanContent 中移除思考标签
  const mainContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  const lines = mainContent.split("\n");
  const renderedElements = [];
  let tableBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.trim().startsWith("|") && line.includes("|");
    const isLastLine = i === lines.length - 1;
    
    if (isTableLine) {
      tableBuffer.push(line);
      if (isLastLine || !lines[i + 1].trim().startsWith("|")) {
        renderedElements.push(<TableBlock key={`tbl-${i}`} lines={tableBuffer} />);
        tableBuffer = [];
      }
      continue;
    }
    
    
    // 🔥 再次增大字体：h1=3xl, h2=2xl, h3=xl, 正文=lg(18px)
    if (line.trim().startsWith("# ")) {
      renderedElements.push(
        <h1 key={i} className="mt-6 sm:mt-10 mb-3 sm:mb-5 text-xl sm:text-2xl font-bold text-slate-800">
          {line.replace(/^#\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h1>
      );
    } else if (line.trim().startsWith("## ")) {
      renderedElements.push(
        <h2 key={i} className={`mt-6 sm:mt-8 mb-2 sm:mb-4 text-lg sm:text-xl font-semibold text-slate-700 flex items-center gap-2`}>
          <span className={`w-1.5 h-7 bg-[${BRAND_GREEN}] rounded-full`}></span>
          {line.replace(/^##\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h2>
      );
    } else if (line.trim().startsWith("### ")) {
      renderedElements.push(
        <h3 key={i} className={`mt-4 sm:mt-6 mb-2 sm:mb-3 text-base sm:text-lg font-semibold text-[${BRAND_GREEN}]`}>
          {line.replace(/^###\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h3>
      );
    } else if (line.trim().startsWith("#### ")) {
      // 🔥 支持 #### 四级标题
      renderedElements.push(
        <h4 key={i} className="mt-4 sm:mt-5 mb-1 sm:mb-2 text-base sm:text-lg font-semibold text-slate-700">
          {line.replace(/^####\s+/, "")}
          {isLastLine && isStreaming && <StreamingCursor />}
        </h4>
      );
    } else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      // 🔥 支持 - 和 * 两种无序列表格式
      const listContent = line.trim().replace(/^[-*]\s+/, "")
      renderedElements.push(
        <div key={i} className="flex gap-2 sm:gap-3 ml-1 my-2 sm:my-3 text-sm sm:text-base text-slate-700 leading-relaxed">
          <div className={`mt-3 w-2 h-2 rounded-full bg-[${BRAND_GREEN}]/60 shrink-0`}></div>
          <span>
            <InlineText text={listContent} />
            {isLastLine && isStreaming && <StreamingCursor />}
          </span>
        </div>
      );
    } else if (line.trim().match(/^\d+\.\s+/)) {
      // 🔥 支持数字编号列表（1. 2. 3. 等）
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/)
      if (numMatch) {
        const num = numMatch[1]
        const listContent = numMatch[2]
        renderedElements.push(
          <div key={i} className="flex gap-2 sm:gap-3 ml-1 my-2 sm:my-3 text-sm sm:text-base text-slate-700 leading-relaxed">
            <span className={`text-[${BRAND_GREEN}] font-semibold shrink-0`}>{num}.</span>
            <span>
              <InlineText text={listContent} />
              {isLastLine && isStreaming && <StreamingCursor />}
            </span>
          </div>
        );
      }
    } else if (line.trim().startsWith("> ")) {
      renderedElements.push(
        <blockquote key={i} className={`my-3 sm:my-5 border-l-3 border-[${BRAND_GREEN}] bg-[${BRAND_GREEN}]/5 px-3 sm:px-5 py-2 sm:py-4 rounded-r-xl`}>
          <div className="text-sm sm:text-base text-slate-700 leading-relaxed">
            <InlineText text={line.replace(/^> /, "")} />
            {isLastLine && isStreaming && <StreamingCursor />}
          </div>
        </blockquote>
      );
    } else if (line.trim() === "---") {
      renderedElements.push(<div key={i} className="py-5"><div className="h-px bg-slate-200"></div></div>);
    } else if (line.trim() === "") {
      renderedElements.push(<div key={i} className="h-5"></div>);
    } else if (line.trim().startsWith("$$") && line.trim().endsWith("$$")) {
      // 🔥 支持块级 LaTeX 公式 $$...$$
      const formula = line.trim().slice(2, -2).trim()
      if (formula) {
        renderedElements.push(
          <div key={i} className="my-4 flex justify-center">
            <MathBlock formula={formula} />
          </div>
        )
      }
    } else {
      renderedElements.push(
        <p key={i} className="text-sm sm:text-base leading-relaxed sm:leading-[1.9] text-slate-700 my-2 sm:my-3">
          <InlineText text={line} />
          {isLastLine && isStreaming && <StreamingCursor />}
        </p>
      );
    }
  }
  return (
    <div className="w-full overflow-hidden break-words">
      {/* 🧠 显示折叠的思考块（已完成的思考） */}
      {thinkContent && <ThinkingBlock content={thinkContent} isStreaming={false} />}

      {/* 🧠 显示正在进行的思考（流式输出中） */}
      {openThinkContent && <ThinkingBlock content={openThinkContent} isStreaming={true} />}

      {/* 🔥 媒体内容（图片、文件、PPT） */}
      {mediaItems.length > 0 && <MediaBlock items={mediaItems} />}

      {/* 主要内容 */}
      {renderedElements}
    </div>
  );
}

// --- 内部聊天核心组件 ---
interface ChatInterfaceInnerProps {
  initialModel?: ModelType
}

function ChatInterfaceInner({ initialModel }: ChatInterfaceInnerProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlSessionId = searchParams.get("sessionId")
  const urlAgent = searchParams.get("agent")
  // 🔥 优先使用 initialModel prop（来自动态路由），其次使用 URL 参数
  const effectiveAgent = initialModel || urlAgent

  // 🔥 检测手机端
  const isMobile = useIsMobile()

  const [userId, setUserId] = useState<string>("")
  const [userAvatar, setUserAvatar] = useState<string>("")
  const [userCredits, setUserCredits] = useState<number>(0)
  // 🔥 新增：用户显示名称（手机号/邮箱）
  const [userDisplayName, setUserDisplayName] = useState<string>("")
  const sessionIdRef = useRef<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string>("")

  // 🔥 修复：跟踪主动会话切换（侧边栏点击 vs URL 导航）
  // 🔥 now in Zustand store: useSelectedModelStore
  // 🔥 修复：记录用户上次使用的模型（用于新建对话时恢复）
  const lastUsedModelRef = useRef<ModelType>("standard")

  // ✅ 全局状态：所有组件共享单一 selectedModel 真源
  const selectedModel = useSelectedModelStore((s) => s.selectedModel)
  const setSelectedModel = useSelectedModelStore((s) => s.setSelectedModel)
  const isManualSessionSwitchRef = useRef(false) // 仅用于 useEffect 闭包比较
  const [genMode, setGenMode] = useState<GenMode>("text")
  
  // 🎵 Suno V5 音乐生成模式（必选项）
  type SunoMode = "inspiration" | "custom" | "extend"
  const [sunoMode, setSunoMode] = useState<SunoMode>("inspiration")
  
  const [dailyUsage, setDailyUsage] = useState<number>(0)
  const DAILY_LIMIT = 20

  const isLuxury = userCredits > 1000 
  
  // 🎯 升级引导横幅状态（非豪华会员显示，发送消息后消失）
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true)

  // 🔥 历史会话侧边栏状态
  const [showHistorySidebar, setShowHistorySidebar] = useState(false)
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])

  // 🔥 获取历史会话列表（必须在 useEffect 之前定义，否则闭包调用时函数未定义）
  // 🔥 修复: 使用 API 路由代替直接 Supabase 查询，支持 Authing 用户
  const fetchChatSessions = async (uid: string) => {
    console.log("📋 [历史会话] 开始查询, uid:", uid)
    try {
      // 使用 API 路由，通过 X-User-Id 头传递用户 ID
      const res = await fetch(`/api/chat-session`, {
        headers: { 'X-User-Id': uid }
      })

      console.log("📋 [历史会话] API 响应状态:", res.status)

      if (!res.ok) {
        if (res.status === 401) {
          console.warn("⚠️ [历史会话] 用户未登录")
          setChatSessions([])
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }

      const { sessions } = await res.json()
      console.log("📋 [历史会话] API 返回数据:", sessions?.length || 0, "条")

      // 防御性检查
      const safeSessionData = Array.isArray(sessions) ? sessions : []

      if (safeSessionData.length > 0) {
        console.log("📋 [历史会话] 找到会话:", safeSessionData.length)
        const mapped = safeSessionData.map((s: any) => ({
          id: s.id,
          title: s.title || "新对话",
          date: new Date(s.created_at).getTime(), // 使用 created_at，因为表只有这个时间列
          preview: s.preview || "",
          ai_model: s.ai_model || "standard"
        }))
        console.log("📋 [历史会话] 映射后数据:", mapped.length, "条")
        setChatSessions(mapped)
        console.log("📋 [历史会话] setChatSessions 已调用")
      } else {
        console.log("📋 [历史会话] 无数据")
        setChatSessions([])
      }
    } catch (err) {
      console.error("❌ [历史会话] 查询异常:", err)
      setChatSessions([])
    }
  }

  // 🔥 当打开历史会话侧边栏时，重新获取会话列表
  useEffect(() => {
    console.log("📋 [侧边栏] useEffect触发: showHistorySidebar=", showHistorySidebar, "userId=", userId || "空")
    if (showHistorySidebar && userId) {
      console.log("📋 [侧边栏] 打开历史会话，刷新列表")
      fetchChatSessions(userId)
    } else if (showHistorySidebar && !userId) {
      console.warn("⚠️ [侧边栏] userId为空，无法获取会话列表")
    }
  }, [showHistorySidebar, userId])

  // 🔥 监听全局会话刷新事件（由 refreshSessionList 触发）
  // 与 AppSidebar 保持同步，确保新建会话后侧边栏列表能实时更新
  useEffect(() => {
    const handleRefresh = () => {
      console.log("📋 [侧边栏] 收到 SESSION_LIST_REFRESH_EVENT，重新获取会话列表")
      if (userId) {
        fetchChatSessions(userId)
      }
    }
    window.addEventListener(SESSION_LIST_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(SESSION_LIST_REFRESH_EVENT, handleRefresh)
  }, [userId])

  // 🎯 工作流可视化 Hook (GenSpark 1:1 复刻版)
  const {
    workflowState,
    isProcessing: isWorkflowProcessing,
    isThinking,
    isGenerating,
    isFastTrack,
    showCursor,
    handleSSEEvent,
    resetWorkflow,
    toggleExpanded,
    getSummaryText,
    markWorkflowComplete,
    currentRunningText,
    triggerHandover
  } = useWorkflowVisualizer()

  // 🎵 Suno 音乐生成 Hook（完全隔离，仅在 suno-v5 模型时使用）
  const {
    musicTasks,
    getTaskByMessageId,
    conversationId: sunoConversationId,  // 🔥 获取 Suno 会话 ID
    startMusicGeneration,
    startMusicGenerationPro,  // 🔥 专业模式函数
    retryTask,
    hasActiveTasks: hasSunoActiveTasks
  } = useSunoMusic()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('currentUser')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          const uid = user.id || user.sub || user.userId || user.user_id || ""
          console.log("🔑 [用户初始化] 解析用户:", { 
            id: user.id, 
            sub: user.sub, 
            userId: user.userId,
            finalUid: uid,
            phone: user.phone,
            email: user.email
          })
          setUserId(uid)
          if (user.user_metadata?.avatar_url) setUserAvatar(user.user_metadata.avatar_url)
          
          // 🔥 设置用户显示名称：优先手机号 > 邮箱 > 用户名
          const displayName = user.phone || user.phone_number || user.email || user.nickname || user.username || user.user_metadata?.name || "用户"
          setUserDisplayName(displayName)
          console.log("👤 [用户初始化] 显示名称:", displayName)
          
          if (uid) {
            fetchCredits(uid)
            fetchChatSessions(uid)
          }
        } catch (e) {
          console.error("❌ [用户初始化] 解析失败:", e)
        }
      } else {
        console.warn("⚠️ [用户初始化] localStorage 中无 currentUser")
      }
    }
  }, [])

  const fetchCredits = async (uid: string) => {
    console.log("💰 [积分查询] 通过 API 查询用户:", uid)
    try {
      // 🔥 使用 API 查询积分（绕过 RLS 限制）
      const res = await fetch(`/api/user/credits?user_id=${encodeURIComponent(uid)}`)
      if (res.ok) {
        const data = await res.json()
        console.log("✅ [积分查询] API 成功:", data.credits)
        setUserCredits(data.credits || 0)
      } else {
        console.error("❌ [积分查询] API 失败:", res.status)
        // 备用：直接查询数据库
        const { data, error } = await supabase.from('user_credits').select('credits').eq('user_id', uid).single()
        if (!error && data) {
          console.log("✅ [积分查询] 备用查询成功:", data.credits)
          setUserCredits(data.credits)
        }
      }
    } catch (err) {
      console.error("❌ [积分查询] 异常:", err)
      // 备用：直接查询数据库
      const { data } = await supabase.from('user_credits').select('credits').eq('user_id', uid).single()
      if (data) setUserCredits(data.credits)
    }
  }

  useEffect(() => {
    if (urlSessionId && urlSessionId !== currentSessionId) {
      // URL 导航（非手动点击），由 loadHistorySession 中的 initialModel 决定模型
      isManualSessionSwitchRef.current = false
      loadHistorySession(urlSessionId)
    }
  }, [urlSessionId])

  const prevUrlAgentRef = useRef<string | null>(null)
  
  useEffect(() => {
    const agentToModel: Record<string, ModelType> = {
      "standard": "standard",
      "teaching-pro": "teaching-pro",
      "gpt-5": "gpt-5",
      "claude-opus": "claude-opus",
      "gemini-pro": "gemini-pro",
      "banana-2-pro": "banana-2-pro",
      "suno-v5": "suno-v5",
      "grok-4.2": "grok-4.2",
      "open-claw": "open-claw",
    }

    const targetModel = urlAgent ? (agentToModel[urlAgent] || urlAgent as ModelType) : (initialModel || "standard")

    console.log(`🔗 [URL Sync] urlAgent=${urlAgent}, prevUrlAgent=${prevUrlAgentRef.current}, targetModel=${targetModel}`)

    if (urlAgent !== prevUrlAgentRef.current) {
      prevUrlAgentRef.current = urlAgent

      console.log(`🔄 [强制模型同步] → ${targetModel}`)
      setSelectedModel(targetModel)
      setGenMode("text")

      if (!urlSessionId) {
        setMessages([])
        sessionIdRef.current = null
        setCurrentSessionId("")
      }
    }
  }, [urlAgent, urlSessionId])

  // 🔥 当路由参数 initialModel 变化时，同步更新 selectedModel
  // 但如果是加载历史会话（urlSessionId 存在），则跳过，由 loadHistorySession 处理模型同步
  useEffect(() => {
    if (initialModel && initialModel !== selectedModel && !urlSessionId) {
      console.log(`🔄 [模型同步] initialModel=${initialModel} → selectedModel=${initialModel}`)
      setSelectedModel(initialModel)
    }
  }, [initialModel, urlSessionId])

  // 🔥 当 urlSessionId 为空时（新建对话），恢复用户上次使用的模型或默认模型
  useEffect(() => {
    if (!urlSessionId && selectedModel !== lastUsedModelRef.current) {
      logger.debug(`🔄 [新建对话模型恢复] ${selectedModel} → ${lastUsedModelRef.current}`)
      setSelectedModel(lastUsedModelRef.current)
    }
  }, [urlSessionId])

  const loadHistorySession = async (sid: string) => {
    logger.debug(`📂 [loadHistorySession] 开始加载会话: ${sid}`)
    setIsLoading(true)
    setMessages([])
    try {
      // 🔥 先获取会话信息（包括 ai_model）以同步模型状态
      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('ai_model')
        .eq('id', sid)
        .single()

      logger.debug(`📂 [loadHistorySession] ai_model=${sessionData?.ai_model}`)

      if (sessionError) {
        console.warn("获取会话模型失败:", sessionError)
        // 🔥 即使查询失败，也尝试使用 initialModel 或默认值
        const fallbackModel = initialModel || "standard"
        console.log(`🔄 [历史会话模型同步] 使用 fallback 模型: ${fallbackModel}`)
        setSelectedModel(fallbackModel as ModelType)
      } else {
        // 🔥 同步模型状态 - 当用户主动切换会话时，优先使用会话真实模型
        // store.isManualSessionSwitch 为 true 时表示侧边栏点击，此时用 sessionData.ai_model
        // store.isManualSessionSwitch 为 false 时表示 URL 导航，此时用 initialModel（保持分享链接兼容性）
        const isManual = useSelectedModelStore.getState().isManualSessionSwitch
        const targetModel = isManual
          ? (sessionData?.ai_model || "standard")
          : (initialModel || sessionData?.ai_model || "standard")
        console.log(`🔄 [历史会话模型同步] isManual=${isManual}, initialModel=${initialModel}, ai_model=${sessionData?.ai_model} → selectedModel=${targetModel}`)
        setSelectedModel(targetModel as ModelType)
        console.log(`✅ [历史会话模型同步] setSelectedModel 已调用: ${targetModel}`)
      }

      // 🔥 加载消息
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sid)
        .order('created_at', { ascending: true })

      if (error) throw error

      if (data && data.length > 0) {
        // 🔥 加载消息时包含 metadata（用于恢复音乐数据）
        const historyMessages = data.map((m: any) => ({
           id: m.id,
           role: m.role,
           content: m.content,
           metadata: m.metadata || null  // 🔥 包含音乐等附加数据
        }))
        setMessages(historyMessages)
        setCurrentSessionId(sid)
        sessionIdRef.current = sid
      }
    } catch (e) {
      console.error("加载历史会话失败:", e)
      toast.error("加载历史会话失败")
    } finally {
      setIsLoading(false)
      // 🔥 重置主动切换标记（store + ref）
      isManualSessionSwitchRef.current = false
      useSelectedModelStore.getState().markUrlNavigation()
    }
  }

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  // 🔥 深度思考提示状态（15秒后显示）
  const [showDeepThinkingHint, setShowDeepThinkingHint] = useState(false)
  const deepThinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [fileProcessing, setFileProcessing] = useState<FileProcessingState>({ status: "idle", progress: 0, message: "" })
  // 🔥 动态状态消息（用于轮播显示）
  const [dynamicStatusMessage, setDynamicStatusMessage] = useState("")
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isComplexMode, setIsComplexMode] = useState(false)
  const [analysisStage, setAnalysisStage] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // 🎤 语音输入状态
  const [isListening, setIsListening] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  // 🔥 记录当前正在处理的 AI 消息 ID
  const currentBotIdRef = useRef<string | null>(null)
  
  // 🔥 智能滚动状态
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  // 检测是否在底部附近
  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current
      const isNear = scrollHeight - scrollTop - clientHeight < 100
      setIsNearBottom(isNear)
      if (isNear) setHasNewMessage(false)
    }
  }

  // 滚动到底部的函数
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    setHasNewMessage(false)
  }

  // 新消息时的智能滚动处理
  useEffect(() => {
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    } else if (messages.length > 0) {
      setHasNewMessage(true)
    }
  }, [messages, isNearBottom])
  useEffect(() => { if (isLoading && isComplexMode && analysisStage < 4) setTimeout(() => setAnalysisStage(p => Math.min(p + 1, 4)), 2000) }, [isLoading, analysisStage, isComplexMode])

  // 🔥 深度思考提示：isLoading 启动后 15 秒显示提示，收到首字节后清除
  useEffect(() => {
    if (isLoading) {
      // 15 秒后显示提示
      deepThinkingTimerRef.current = setTimeout(() => {
        setShowDeepThinkingHint(true)
      }, 15_000)
    } else {
      // 加载结束，清理所有状态
      setShowDeepThinkingHint(false)
      if (deepThinkingTimerRef.current) {
        clearTimeout(deepThinkingTimerRef.current)
        deepThinkingTimerRef.current = null
      }
    }

    return () => {
      if (deepThinkingTimerRef.current) {
        clearTimeout(deepThinkingTimerRef.current)
        deepThinkingTimerRef.current = null
      }
    }
  }, [isLoading])

  // 🔥 Smart Textarea: auto-expand 2-10 rows
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      const lineHeight = 22
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, lineHeight * 2),
        lineHeight * 10
      )
      textarea.style.height = `${newHeight}px`
    }
  }, [input])

  // 🔥 首字节探测：一旦当前 AI 消息开始收到内容，立即清除深度思考提示
  useEffect(() => {
    if (isLoading && currentBotIdRef.current) {
      const currentBotMessage = messages.find(m => m.id === currentBotIdRef.current)
      if (currentBotMessage && currentBotMessage.content && currentBotMessage.content.length > 0) {
        setShowDeepThinkingHint(false)
        if (deepThinkingTimerRef.current) {
          clearTimeout(deepThinkingTimerRef.current)
          deepThinkingTimerRef.current = null
        }
      }
    }
  }, [messages, isLoading, currentBotIdRef.current])

  // --- 模型配置（增强版：添加描述和标签） ---
  const modelConfig = {
    "standard": {
      name: "作文批改",
      modelKey: "standard",
      color: BRAND_GREEN,
      description: "专业作文分析与点评",
      badge: "推荐",
      group: "教育专用"
    },
    "teaching-pro": {
      name: "教学评助手",
      modelKey: "teaching-pro",
      color: BRAND_GREEN,
      description: "教学评估与反馈",
      group: "教育专用"
    },
    "quanquan-math": {
      name: "全学段数学",
      modelKey: "quanquan-math",
      color: BRAND_GREEN,
      description: "问题解答，步骤清晰",
      group: "教育专用"
    },
    "quanquan-english": {
      name: "全学段英语",
      modelKey: "quanquan-english",
      color: BRAND_GREEN,
      description: "听说读写，全面覆盖",
      group: "教育专用"
    },
    "beike-pro": {
      name: "备课助手Pro",
      modelKey: "beike-pro",
      color: BRAND_GREEN,
      description: "智能备课，高效便捷",
      group: "教育专用"
    },
    "banzhuren": {
      name: "班主任助手",
      modelKey: "banzhuren",
      color: BRAND_GREEN,
      description: "班级管理，家校沟通",
      group: "教育专用"
    },
    "gpt-5": {
      name: "ChatGPT 5.4",
      modelKey: "gpt-5",
      color: BRAND_GREEN,
      description: "通用智能对话",
      badge: "新",
      group: "AI模型"
    },
    "claude-opus": {
      name: "Claude opus4.6thinking",
      modelKey: "claude-opus",
      color: BRAND_GREEN,
      description: "深度推理与分析",
      group: "AI模型"
    },
    "gemini-pro": {
      name: "Gemini 3.1 pro",
      modelKey: "gemini-pro",
      color: BRAND_GREEN,
      description: "多模态理解",
      group: "AI模型"
    },
    "banana-2-pro": {
      name: "Banana2 Pro 4K",
      modelKey: "banana-2-pro",
      color: BRAND_GREEN,
      description: "AI 图像生成",
      badge: "热门",
      group: "创意生成"
    },
    "suno-v5": {
      name: "Suno V5",
      modelKey: "suno-v5",
      color: BRAND_GREEN,
      description: "AI 音乐创作",
      group: "创意生成"
    },
    "grok-4.2": {
      name: "Grok-4.2",
      modelKey: "grok-4.2",
      color: BRAND_GREEN,
      description: "xAI 智能助手",
      group: "AI模型"
    },
    "open-claw": {
      name: "Open Claw",
      modelKey: "open-claw",
      color: BRAND_GREEN,
      description: "OpenClaw 智能助手",
      badge: "推荐",
      group: "AI模型"
    },
    "ai-writing-paper": {
      name: "论文写作",
      modelKey: "ai-writing-paper",
      color: BRAND_GREEN,
      description: "学术论文写作辅助",
      badge: "新",
      group: "AI写作"
    },
    "zhongying-essay": {
      name: "中英文作文",
      modelKey: "zhongying-essay",
      color: BRAND_GREEN,
      description: "K12与四六级作文思路启发与语法润色",
      group: "AI写作"
    },
    "reading-report": {
      name: "读书报告 / 观后感",
      modelKey: "reading-report",
      color: BRAND_GREEN,
      description: "提炼书籍核心观点，深化阅读思考",
      group: "AI写作"
    },
    "experiment-report": {
      name: "实验报告助理",
      modelKey: "experiment-report",
      color: BRAND_GREEN,
      description: "规范理工科实验报告格式与结论分析",
      group: "AI写作"
    },
    "study-abroad": {
      name: "留学与升学文书",
      modelKey: "study-abroad",
      color: BRAND_GREEN,
      description: "挖掘个人闪光点，打磨专属申请故事",
      group: "AI写作"
    },
    "resume-optimize": {
      name: "实习简历优化",
      modelKey: "resume-optimize",
      color: BRAND_GREEN,
      description: "提炼校园经历，生成专业职场简历",
      group: "AI写作"
    },
    "speech-defense": {
      name: "演讲与答辩稿",
      modelKey: "speech-defense",
      color: BRAND_GREEN,
      description: "竞选、比赛与论文答辩的逐字稿定制",
      group: "AI写作"
    },
    "school-wechat": {
      name: "学校公众号写作",
      modelKey: "school-wechat",
      color: BRAND_GREEN,
      description: "校园宣传与活动稿件撰写",
      group: "AI写作"
    },
  }

  // 🔥 转换为 ModelSelector 需要的格式
  const modelList = Object.entries(modelConfig).map(([key, config]) => ({
    key,
    name: config.name,
    modelKey: (config as any).modelKey,
    color: config.color,
    description: config.description,
    badge: (config as any).badge,
    group: config.group
  }))

  const handleModelChange = (model: ModelType) => {
    if (model !== selectedModel) {
      sessionIdRef.current = null
      setCurrentSessionId("")
      setMessages([])
      console.log(`🔄 [模型切换] ${selectedModel} → ${model}，已清除会话`)
    }
    
    if (model !== "standard") {
      if (isLuxury) {
        toast.success(`已切换至 ${modelConfig[model].name}`)
      } else {
        if (dailyUsage < DAILY_LIMIT) {
          toast.info(`已切换至 ${modelConfig[model].name}`, { description: `今日免费: ${dailyUsage}/${DAILY_LIMIT}` })
        } else {
          toast.warning(`今日免费额度已用完`)
        }
      }
    }
    
    // 🚀 Banana 2 Pro 使用专用页面，自动跳转
    if (model === "banana-2-pro") {
      console.log('✅ [模型切换] 检测到 banana-2-pro，跳转到专用页面')
      router.push('/chat/banana-2-pro')
      return
    }

    if (model === "suno-v5") setGenMode("music")
    else setGenMode("text")

    // 🔥 记录用户上次使用的模型
    lastUsedModelRef.current = model
    setSelectedModel(model)

    console.log(`🔄 [模型切换] 已切换至 ${model}`)
    
    if (input === "" || input.startsWith("生成")) {
       setInput("")
    }
  }

  const calculateCost = () => {
    if (!userId) return 0
    return calculatePreviewCost(selectedModel, {
      isLuxury,
      estimatedInputTokens: input.length > 0 ? Math.ceil(input.length / 4) * 2 : undefined
    })
  }

  // ============================================
  // 🔥 大文件上传：使用通用上传服务
  // ============================================

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("📎 [handleFileUpload] 触发文件上传事件")
    const files = event.target.files; 
    console.log("📎 [handleFileUpload] 选择的文件:", files?.length, files)
    
    if (!files || !files.length) {
      console.log("📎 [handleFileUpload] 没有选择文件，退出")
      return;
    }
    
    // 🔥 检查用户是否已登录
    if (!userId) {
      console.log("📎 [handleFileUpload] 用户未登录")
      toast.error("请先登录后再上传文件")
      return
    }
    
    console.log("📎 [handleFileUpload] 开始上传，用户ID:", userId)
    setIsUploading(true)
    setUploadProgress(0)
    setFileProcessing({ status: "uploading", progress: 0, message: "正在处理..." })
    setDynamicStatusMessage(getRandomStatusMessage("uploading", 0))
    
    try {
        const totalFiles = files.length
        const uploadPromises = Array.from(files).map(async (file, index) => {
            const fileToUpload = file;
            
            // ============================================
            // 🔥 前端安全校验
            // ============================================
            const validation = validateFileForUpload(fileToUpload)
            if (!validation.valid) {
              throw new Error(validation.error)
            }

            // ============================================
            // ✅ 上传：统一走 /api/dify-upload → Dify → 腾讯云 COS
            // ============================================
            console.log("📤 [Upload] 上传文件:", fileToUpload.name, (fileToUpload.size / 1024 / 1024).toFixed(2) + "MB")

            const formData = new FormData();
            formData.append("file", fileToUpload);
            formData.append("user", userId)

            const res = await fetch("/api/dify-upload", {
              method: "POST",
              headers: {
                "X-User-Id": userId,
                "X-Model": selectedModel || ""
              },
              body: formData
            })

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}))
              if (res.status === 413) {
                throw new Error(`文件超过 ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB 限制`)
              }
              throw new Error(errData.error || `上传失败: ${res.status}`)
            }

            const data = await res.json()
            
            // 🔥 更新进度
            setUploadProgress(Math.round(((index + 1) / totalFiles) * 100))
            
            return new Promise<UploadedFile>((resolve) => {
                if (fileToUpload.type.startsWith("image/")) {
                    resolve({ 
                        name: fileToUpload.name, 
                        type: fileToUpload.type, 
                        size: fileToUpload.size, 
                        data: "", 
                        difyFileId: data.id, 
                        preview: URL.createObjectURL(fileToUpload) 
                    });
                } else {
                    const reader = new FileReader(); 
                    reader.onload = e => resolve({ 
                        name: fileToUpload.name, 
                        type: fileToUpload.type, 
                        size: fileToUpload.size, 
                        data: e.target?.result as string, 
                        difyFileId: data.id, 
                        preview: undefined 
                    });
                    reader.readAsDataURL(fileToUpload)
                }
            })
        });
        
        const results = await Promise.all(uploadPromises);
        setUploadedFiles(p => [...p, ...results]);
        toast.success("文件上传成功")
        setFileProcessing({ status: "idle", progress: 100, message: "完成" })
        setDynamicStatusMessage("")
        setTimeout(() => setFileProcessing({ status: "idle", progress: 0, message: "" }), 1000)
    } catch(e: any) {
        console.error("上传错误:", e);
        toast.error(e.message || "上传失败")
        setFileProcessing({ status: "error", progress: 0, message: e.message || "上传失败" })
    } finally {
        setIsUploading(false)
        setUploadProgress(0)
    }
    if(fileInputRef.current) fileInputRef.current.value=""
  }

  const removeFile = (i: number) => setUploadedFiles(p => p.filter((_, idx) => idx !== i))

  // ============================================
  // 🎤 语音输入功能
  // ============================================
  const toggleVoiceInput = async () => {
    if (isListening) {
      // 停止录音
      try {
        const audioBlob = await voiceRecorderRef.current?.stop()
        setIsListening(false)

        if (audioBlob && audioBlob.size > 0) {
          toast.info("正在识别语音...")
          const fileId = await uploadAudioToDify(audioBlob, selectedModel)

          // 将音频文件添加到上传列表
          const audioUrl = URL.createObjectURL(audioBlob)
          setUploadedFiles(p => [...p, {
            name: "录音.mp3",
            type: "audio/mp3",
            size: audioBlob.size,
            data: audioUrl,
            difyFileId: fileId
          }])
          toast.success("语音已识别并添加")
        }
      } catch (error) {
        console.error("🎤 停止录音失败:", error)
        toast.error("录音处理失败")
        setIsListening(false)
      }
    } else {
      // 开始录音
      if (!userId) {
        toast.error("请先登录")
        return
      }

      if (!VoiceRecorder.isSupported()) {
        toast.error("当前浏览器不支持语音输入")
        return
      }

      try {
        voiceRecorderRef.current = new VoiceRecorder()
        await voiceRecorderRef.current.start()
        setIsListening(true)
        toast.info("录音中，再次点击停止", { duration: 2000 })
      } catch (error) {
        console.error("🎤 开始录音失败:", error)
        toast.error("无法访问麦克风，请检查权限设置")
      }
    }
  }

  // ============================================
  // 🔊 TTS 语音播放功能
  // ============================================
  const playAssistantMessage = async (content: string) => {
    if (isPlaying) {
      // 停止播放
      audioRef.current?.pause()
      audioRef.current = null
      setIsPlaying(false)
      return
    }

    try {
      toast.info("正在生成语音...")
      const audioUrl = await getDifyTTS(content, selectedModel)

      audioRef.current = new Audio(audioUrl)
      audioRef.current.onended = () => setIsPlaying(false)
      audioRef.current.onerror = () => {
        setIsPlaying(false)
        toast.error("音频播放失败")
      }
      await audioRef.current.play()
      setIsPlaying(true)
      toast.success("播放中...")
    } catch (error) {
      console.error("🔊 TTS 播放失败:", error)
      toast.error("语音合成失败")
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!userId) { toast.error("请登录"); return }
    const txt = (input || "").trim(); if (!txt && !uploadedFiles.length) return
    
    console.log("📤 [onSubmit] 发送消息:", {
      model: selectedModel,
      mode: genMode,
      query: txt.slice(0, 50) + "...",
      urlAgent,
      sessionId: sessionIdRef.current
    })
    
    const cost = calculateCost()
    if (userCredits < cost) {
      toast.error("积分不足", { 
        description: `需要 ${cost} 积分，当前 ${userCredits}`,
        duration: 2000
      })
      setTimeout(() => {
        router.push("/pricing")
      }, 1500)
      return
    }

    setFileProcessing({ status: "idle", progress: 0, message: "" })
    setDynamicStatusMessage("")
    setIsLoading(true); setAnalysisStage(0); 
    setIsComplexMode(uploadedFiles.length > 0 || txt.length > 150)
    
    // 🎯 重置工作流可视化状态
    resetWorkflow()
    
    // 🔥 自动折叠侧边栏，进入专注模式
    collapseSidebar()
    
    let sid = currentSessionId;
    // 🔥 修复：当模型切换时（sessionIdRef.current === null），即使 urlSessionId 存在也忽略
    // 否则会导致用旧模型的 session 去请求新模型
    const isModelSwitch = sessionIdRef.current === null && currentSessionId;
    if (!sid && !urlSessionId) {
        sid = Date.now().toString();
        setCurrentSessionId(sid);
        sessionIdRef.current = sid;
    } else if (urlSessionId && !isModelSwitch) {
        sid = urlSessionId;
        sessionIdRef.current = urlSessionId;
    } else {
        // 模型切换或无 session 的情况，生成新的
        sid = Date.now().toString();
        setCurrentSessionId(sid);
        sessionIdRef.current = sid;
    }

    // 🔥 根据模型类型设置不同的默认提示词
    const defaultPrompts: Record<string, string> = {
      "standard": "批改作文",
      "teaching-pro": "分析教学材料",
      "suno-v5": "创作一首歌曲",
    }
    const defaultPrompt = defaultPrompts[selectedModel] || "请分析"
    // 🔥 将上传的文件附加到用户消息中
    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: "user", 
      content: txt || defaultPrompt,
      files: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined  // 🔥 携带文件信息
    }
    setMessages(p => [...p, userMsg]); setInput(""); setUploadedFiles([])
    // 🔥 发送后自动滚动到消息底部，确保 AI 回复时能自动跟进
    setTimeout(() => scrollToBottom(), 50)

    // ============================================
    // 🎵 Suno V5 特殊处理逻辑（完全隔离）
    // ============================================
    if (selectedModel === "suno-v5") {
      console.log("🎵 [Suno V5] 进入音乐生成模式")

      // 🔥 创建会话和保存用户消息（与普通对话一致）
      const preview = userMsg.content.slice(0, 30)
      const { data: existing } = await supabase.from('chat_sessions').select('id').eq('id', sid).single()
      if (!existing) {
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: "音乐创作", preview, ai_model: selectedModel })
      } else {
        await supabase.from('chat_sessions').update({ preview, ai_model: selectedModel }).eq('id', sid)
      }
      await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userMsg.content })

      // 🔥 刷新侧边栏会话列表
      refreshSessionList()

      const botId = (Date.now() + 1).toString()
      currentBotIdRef.current = botId
      setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])

      try {
        // 使用 Suno 服务生成音乐
        await startMusicGeneration(
          userMsg.content,
          userId,
          botId,
          sunoMode,  // 🔥 传递用户选择的模式
          // onTextChunk: 实时更新文字（chunk 已经是累积的完整文本）
          (chunk) => {
            // 🔥 chunk 是累积的完整文本，直接替换而不是拼接
            setMessages(p => p.map(m =>
              m.id === botId ? { ...m, content: chunk } : m
            ))
          },
          // onComplete: 生成完成
          async (fullText) => {
            // 🔥 提取并格式化歌词和 prompt
            const formattedContent = formatSunoResponse(fullText)
            setMessages(p => p.map(m =>
              m.id === botId ? { ...m, content: formattedContent } : m
            ))

            // 保存到数据库
            await supabase.from('chat_messages').insert({
              session_id: sid,
              role: "assistant",
              content: fullText
            })

            // 🔥 扣除积分（调用 API）
            try {
              await fetch('/api/user/credits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount: -cost, reason: 'suno-v5' })
              })
            } catch (e) {
              console.error("❌ [积分扣除] 失败:", e)
            }
            setUserCredits(prev => prev - cost)

            console.log("✅ [Suno V5] 音乐生成任务已提交")
          }
        )
      } catch (err: any) {
        console.error("❌ [Suno V5] 生成失败:", err)
        toast.error(err.message || "音乐生成失败")
        setMessages(p => p.filter(m => m.id !== botId))
      } finally {
        setIsLoading(false)
        refreshCredits()
      }
      
      return // 🔥 关键：Suno V5 处理完毕后直接返回，不执行后续逻辑
    }
    // ============================================
    // 🎵 Suno V5 特殊处理结束
    // ============================================
    
    const preview = userMsg.content.slice(0, 30)
    const { data: existing } = await supabase.from('chat_sessions').select('id').eq('id', sid).single()
    if (!existing) {
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: userMsg.content.slice(0, 10)|| "作文", preview, ai_model: selectedModel })
    } else {
        await supabase.from('chat_sessions').update({ preview, ai_model: selectedModel }).eq('id', sid)
    }
    await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userMsg.content })

    // 🔥 刷新侧边栏会话列表
    refreshSessionList()

    const botId = (Date.now()+1).toString(); 
    // 🔥 记录当前正在处理的消息 ID
    currentBotIdRef.current = botId
    setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])
    
    let fullText = ""; let hasRec = false
    try {
        const fileIds = uploadedFiles.map(f => f.difyFileId).filter(Boolean)
        
        console.log("🚀 [API 请求] 发送到 /api/dify-chat:", {
          query: userMsg.content.slice(0, 50),
          userId,
          model: selectedModel,
          mode: genMode,
          sessionId: sessionIdRef.current,
          fileCount: fileIds.length
        })
        
        const res = await fetch(getApiUrl("/api/dify-chat"), {
            method: "POST", 
            headers: { 
              "Content-Type": "application/json",
              "X-User-Id": userId
            },
            body: JSON.stringify({ 
              query: userMsg.content, 
              fileIds, 
              userId, 
              // 🔥 Suno V5 使用 useSunoMusic 的 conversationId 保持会话连续性
              conversation_id: selectedModel === "suno-v5" && sunoConversationId ? sunoConversationId : sessionIdRef.current, 
              model: selectedModel,
              mode: genMode,
              // 🔥 传递前端计算的成本，用于后端记录交易
              estimatedCost: cost
            })
        })
        
        console.log("📥 [API 响应] 状态码:", res.status)
        console.log("📥 [API 响应] Headers:", Object.fromEntries(res.headers.entries()))
        
        if (res.status === 401) {
          toast.error("请先登录")
          throw new Error("未授权")
        }
        if (res.status === 402) throw new Error("积分不足")
        if (!res.ok) {
          const errorText = await res.text()
          console.error("❌ [API 错误] 状态码:", res.status)
          console.error("❌ [API 错误] 响应内容:", errorText)
          
          // 🔥 尝试解析 JSON 错误信息
          try {
            const errorJson = JSON.parse(errorText)
            console.error("❌ [API 错误] 解析后:", errorJson)
            throw new Error(errorJson.error || errorJson.details || `请求失败: ${res.status}`)
          } catch (parseError) {
            throw new Error(`请求失败 (${res.status}): ${errorText.slice(0, 100)}`)
          }
        }
        
        const reader = res.body?.getReader(); 
        const decoder = new TextDecoder();
        let buffer = ""; 

        while (true) {
            const { done, value } = await reader!.read(); 
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                const data = line.slice(6).trim(); if (data === "[DONE]") continue
                try {
                    const json = JSON.parse(data)
                    
                    // 🎯 工作流事件处理 - 传递给可视化 Hook
                    // 🔥 Dify SSE 格式：node_started 事件的数据在 json.data 中
                    if (json.event) {
                      const nodeData = json.data || {}
                      const nodeTitle = nodeData.title || json.title
                      
                      // 🔍 调试日志
                      if (json.event === 'node_started' || json.event === 'node_finished') {
                        console.log(`🔔 [SSE Event] ${json.event}: "${nodeTitle}"`, nodeData)
                      }
                      
                      handleSSEEvent({
                        event: json.event,
                        data: {
                          node_id: nodeData.node_id || json.node_id,
                          title: nodeTitle,
                          status: nodeData.status || json.status,
                          workflow_run_id: nodeData.workflow_run_id || json.workflow_run_id
                        }
                      })
                    }
                    
                    if (json.conversation_id && sessionIdRef.current !== json.conversation_id) {
                        sessionIdRef.current = json.conversation_id
                    }

                    // 🔥 处理 Chat API 的 answer 字段
                    if (json.answer) {
                        // 🔥 【关键】收到第一个 answer 时，强制触发 handover
                        // 确保光标在文字开始输出时立即显示
                        if (!hasRec) {
                          setAnalysisStage(4)
                          triggerHandover() // 强制结束思考，激活光标
                          console.log("✍️ [Answer] 收到第一个 answer，触发 handover")
                        }
                        hasRec = true
                        fullText += json.answer
                        setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                    }

                    // 🔥 处理 Workflow API 的 text_chunk/agent_message 事件
                    // 某些 Dify 工作流使用这些事件类型而不是 message+answer
                    if ((json.event === 'text_chunk' || json.event === 'agent_message') && !json.answer) {
                        const text = json.data?.text || json.text || ''
                        if (text) {
                            if (!hasRec) {
                              setAnalysisStage(4)
                              triggerHandover()
                              console.log("✍️ [TextChunk] 收到第一个文本块，触发 handover")
                            }
                            hasRec = true
                            fullText += text
                            setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                        }
                    }

                    // 🔥 处理 workflow_finished 事件的输出文本（备用方案）
                    if (json.event === 'workflow_finished' && json.data?.outputs) {
                        const outputs = json.data.outputs
                        if (outputs.text && !hasRec) {
                            fullText = outputs.text
                            setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                        } else if (outputs.result && !hasRec) {
                            fullText = outputs.result
                            setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                        }
                    }
                } catch (e) {
                    console.error("❌ [流式解析] 解析事件失败:", e, "原始数据:", data)
                }
            }
        }
        if (hasRec) await supabase.from('chat_messages').insert({ session_id: sid, role: "assistant", content: fullText })
        
        setUserCredits(prev => prev - cost)
        if (selectedModel !== "standard" && !isLuxury && dailyUsage < DAILY_LIMIT) {
          setDailyUsage(prev => prev + 1)
        }

    } catch (e: any) {
        console.error("❌ [对话异常] 详细错误:", e)
        console.error("❌ [对话异常] 错误堆栈:", e.stack)
        console.error("❌ [对话异常] 模型:", selectedModel, "模式:", genMode)
        
        const errorMsg = e.message || "对话出错，请重试"
        toast.error(errorMsg, {
          description: selectedModel === "banana-2-pro" ? "图片生成失败，请检查提示词" : undefined,
          duration: 5000
        })
        
        // 🔥 保留已生成的内容（如果 fullText 有内容，说明 AI 已经输出了部分内容）
        if (fullText.trim()) {
          // 保留消息并在末尾添加中断提示
          setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText + "\n\n---\n*内容生成已中断* ✨" } : m))
          toast.error("内容生成中断，已保留已生成的部分", { duration: 4000 })
        } else {
          // 没有任何内容，正常移除空气泡
          setMessages(p => p.filter(m => m.id !== botId))
        }
    } finally {
      setIsLoading(false)
      // 🔥 重置工作流状态（而非 markWorkflowComplete，否则会显示误导性的"已完成"节点）
      resetWorkflow()
      
      // 🔥 积分刷新：对话结束后触发全局积分刷新
      console.log("🔄 [积分刷新] 对话结束，触发积分重新查询...")
      if (userId) {
        fetchCredits(userId)
      }
      // 🔥 触发侧边栏积分刷新
      refreshCredits()
      console.log("✅ [积分刷新] 已触发全局积分刷新事件")
      
      router.refresh()
      
      // 🔥 移除自动切换回 standard 的逻辑，保持当前模型
      // if (genMode !== "text") {
      //   setGenMode("text")
      //   setSelectedModel("standard")
      // }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e as unknown as React.FormEvent) }
  }

  // 🔥 返回按钮
  const handleBack = () => {
    router.push("/")
  }

  // 📄 导出 PDF 功能（使用浏览器打印，支持 Markdown 渲染）
  const handleExportPDF = (content: string) => {
    try {
      // 创建打印窗口
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        toast.error("请允许弹出窗口以导出 PDF")
        return
      }
      
      // 🔥 移除思考过程标签（<think>...</think>）
      const cleanContent = cleanLLMText(content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim())

      // 🔥 渲染 LaTeX 数学公式（必须在 markdown 转换之前）
      const renderMathInMarkdown = (md: string): string => {
        let html = md

        // 渲染块级公式 $$...$$
        html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
          try {
            return katex.renderToString(math.trim(), {
              displayMode: true,
              throwOnError: false,
              macros: LATEX_MACROS,
            })
          } catch (e) {
            console.error("KaTeX block render error:", e)
            return `<span class="katex-error">${math}</span>`
          }
        })

        // 渲染行内公式 $...$
        // 注意：块级公式已处理，现在处理行内公式（避免匹配 $$）
        html = html.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
          try {
            return katex.renderToString(math.trim(), {
              displayMode: false,
              throwOnError: false,
              macros: LATEX_MACROS,
            })
          } catch (e) {
            console.error("KaTeX inline render error:", e)
            return `<span class="katex-error">${math}</span>`
          }
        })

        return html
      }

      // 🔥 将 Markdown 转换为 HTML
      const convertMarkdownToHTML = (md: string): string => {
        let html = md
        
        // 转换标题 (从 h4 到 h1，避免顺序问题)
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')
        
        // 转换粗体
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        
        // 转换斜体
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
        
        // 转换列表项
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
        
        // 转换分隔线
        html = html.replace(/^---$/gm, '<hr>')
        
        // 转换引用
        html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
        
        // 转换表格
        const tableRegex = /(\|.+\|[\r\n]+)+/g
        html = html.replace(tableRegex, (match) => {
          const rows = match.trim().split('\n').filter(row => row.trim() && !row.includes('---'))
          if (rows.length === 0) return match
          
          let tableHTML = '<table>'
          rows.forEach((row, index) => {
            const cells = row.split('|').filter(cell => cell.trim())
            const tag = index === 0 ? 'th' : 'td'
            const rowTag = index === 0 ? 'thead' : 'tbody'
            if (index === 0) tableHTML += '<thead>'
            if (index === 1) tableHTML += '<tbody>'
            tableHTML += '<tr>'
            cells.forEach(cell => {
              tableHTML += `<${tag}>${cell.trim()}</${tag}>`
            })
            tableHTML += '</tr>'
            if (index === 0) tableHTML += '</thead>'
          })
          tableHTML += '</tbody></table>'
          return tableHTML
        })
        
        // 将连续的 <li> 包装在 <ul> 中
        html = html.replace(/(<li>.+<\/li>\n?)+/g, '<ul>$&</ul>')
        
        // 转换普通段落（非空行且不是已转换的 HTML 标签）
        const lines = html.split('\n')
        html = lines.map(line => {
          const trimmed = line.trim()
          if (!trimmed) return ''
          if (trimmed.startsWith('<')) return line
          return `<p>${line}</p>`
        }).join('\n')
        
        return html
      }
      
      const htmlContent = convertMarkdownToHTML(renderMathInMarkdown(cleanContent))
      
      // 写入打印内容
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>沈翔智学 - AI 分析报告</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif; 
              padding: 40px; 
              max-width: 800px; 
              margin: 0 auto;
              color: #333;
              line-height: 1.8;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              padding-bottom: 20px; 
              border-bottom: 2px solid #14532d; 
            }
            .header h1 { color: #14532d; font-size: 24px; margin-bottom: 8px; }
            .header p { color: #666; font-size: 12px; }
            .content { font-size: 14px; }
            .content h1 { font-size: 20px; color: #14532d; margin: 24px 0 12px; }
            .content h2 { font-size: 18px; color: #14532d; margin: 20px 0 10px; border-left: 3px solid #14532d; padding-left: 10px; }
            .content h3 { font-size: 16px; color: #14532d; margin: 16px 0 8px; }
            .content h4 { font-size: 14px; color: #666; margin: 12px 0 6px; }
            .content p { margin: 8px 0; text-indent: 0; }
            .content strong { color: #14532d; font-weight: 600; }
            .content ul { margin: 12px 0; padding-left: 24px; }
            .content li { margin: 6px 0; }
            .content blockquote { 
              margin: 12px 0; 
              padding: 12px 16px; 
              background: #f5f5f5; 
              border-left: 3px solid #14532d; 
              color: #555;
            }
            .content hr { margin: 20px 0; border: none; border-top: 1px solid #eee; }
            .content table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 16px 0; 
              font-size: 13px;
            }
            .content th, .content td { 
              border: 1px solid #ddd; 
              padding: 8px 12px; 
              text-align: left; 
            }
            .content th { 
              background: #f5f5f5; 
              font-weight: 600; 
              color: #333;
            }
            .content tr:nth-child(even) { background: #fafafa; }
            .footer { 
              margin-top: 40px; 
              padding-top: 20px; 
              border-top: 1px solid #eee; 
              text-align: center; 
              color: #999; 
              font-size: 11px; 
            }
            @media print {
              body { padding: 20px; }
            }
            .katex-error { color: #B71C1C; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>沈翔智学 - AI 分析报告</h1>
            <p>${new Date().toLocaleString('zh-CN')}</p>
          </div>
          <div class="content">${htmlContent}</div>
          <div class="footer">由沈翔智学 AI 生成 · www.shenxiang.school</div>
        </body>
        </html>
      `)
      printWindow.document.close()
      
      // 等待内容加载后打印
      printWindow.onload = () => {
        printWindow.print()
      }
      
      toast.success("已打开打印预览，请选择「保存为 PDF」")
    } catch (err) {
      console.error("PDF 导出失败:", err)
      toast.error("PDF 导出失败，请重试")
    }
  }

  // 🔗 分享功能 - 生成分享链接
  const [isSharing, setIsSharing] = useState(false)
  
  // 🔥 分享整个对话
  const handleShare = async () => {
    console.log("🔗 [分享] 点击分享按钮, isSharing:", isSharing, "messages:", messages.length)
    
    if (isSharing) {
      console.log("🔗 [分享] 正在分享中，跳过")
      return
    }
    if (messages.length === 0) {
      console.log("🔗 [分享] 没有消息，显示错误")
      toast.error("没有可分享的内容")
      return
    }
    
    setIsSharing(true)
    toast.info("正在生成分享链接...")
    
    try {
      console.log("🔗 [分享] 发送 API 请求...")
      // 🔥 发送整个对话到 API
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          userId,
          modelName: modelConfig[selectedModel].name
        })
      })
      
      console.log("🔗 [分享] API 响应状态:", res.status)
      
      if (!res.ok) {
        const errText = await res.text()
        console.error("🔗 [分享] API 错误:", errText)
        throw new Error('创建分享失败')
      }
      
      const data = await res.json()
      console.log("🔗 [分享] API 返回数据:", data)
      const shareUrl = data.shareUrl
      
      // 复制链接到剪贴板
      await navigator.clipboard.writeText(shareUrl)
      
      toast.success("分享链接已复制", {
        description: shareUrl,
        duration: 5000
      })
      
      // 移动端尝试使用原生分享
      if (navigator.share) {
        try {
          await navigator.share({
            title: '沈翔智学 - AI 分析报告',
            text: '查看我的 AI 对话',
            url: shareUrl
          })
        } catch (err) {
          // 用户取消分享，忽略
        }
      }
      
    } catch (err) {
      console.error("🔗 [分享] 失败:", err)
      toast.error("分享失败，请稍后重试")
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden relative">
      {/* 🔥 历史会话侧边栏 - 左侧滑出 */}
      <AnimatePresence>
        {showHistorySidebar && (
          <>
            {/* 遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={() => setShowHistorySidebar(false)}
            />
            {/* 侧边栏 - 顶部对齐，无间隙 */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed left-0 top-0 h-screen w-72 z-50 flex flex-col"
              style={{
                background: "#FDFBF7",
                boxShadow: "4px 0 24px rgba(0,0,0,0.12)",
              }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700">历史会话</span>
                <button
                  onClick={() => setShowHistorySidebar(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              {/* 会话列表 */}
              <ScrollArea className="flex-1 min-h-0 px-1 scrollbar-thin">
                <div className="p-2 space-y-1 h-full">
                  {chatSessions.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      暂无历史会话
                    </div>
                  ) : (
                    chatSessions.map(session => {
                      const safeModel = session.ai_model || "standard"
                      return (
                        <button
                          key={session.id}
                          onClick={() => {
                            // 1. 标记为手动切换（store）
                            useSelectedModelStore.getState().markManualSessionSwitch()
                            // 2. 乐观更新：立即切换模型 Badge（store → 全局广播）
                            setSelectedModel(safeModel as ModelType)
                            // 3. 同步更新 URL（单向数据流起点）
                            router.push(`/chat?sessionId=${session.id}&agent=${safeModel}`)
                            // 4. 关闭侧边栏
                            setShowHistorySidebar(false)
                            // loadHistorySession 由 URL 变化触发的 useEffect 统一调用
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2.5 rounded-lg transition-all",
                            currentSessionId === session.id
                              ? "bg-[#10A37F]/10 text-[#10A37F]"
                              : "hover:bg-slate-100 text-slate-600"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{session.title}</div>
                              {/* 模型徽章 */}
                              {safeModel !== "standard" && (
                                <span
                                  className="text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                                  style={{
                                    backgroundColor: `${getModelBadgeColor(safeModel)}18`,
                                    color: getModelBadgeColor(safeModel)
                                  }}
                                >
                                  {MODEL_DISPLAY_NAMES[safeModel] || safeModel}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 shrink-0">
                              {new Date(session.date).toLocaleString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">{session.preview}</div>
                        </button>
                      )
                    })
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col h-full relative min-w-0">
        
        {/* 🎯 升级引导横幅 - 非豪华会员常驻显示，用户手动关闭 */}
        <AnimatePresence>
          {showUpgradeBanner && !isLuxury && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-100 px-4 py-3 shrink-0"
            >
              <div className="mx-auto max-w-3xl flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-emerald-800">
                    每天仅需4元，解锁无限顶级AI模型
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5 truncate">
                    Gemini 3.1、ChatGPT 5.4、Claude Opus 4.6 等
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="h-8 px-4 text-white text-xs font-medium rounded-full shadow-sm hover:opacity-90 transition-all"
                    style={{ backgroundColor: BRAND_GREEN }}
                    onClick={() => router.push("/pricing")}
                  >
                    升级豪华会员
                  </Button>
                  <button
                    onClick={() => setShowUpgradeBanner(false)}
                    className="p-1 text-emerald-400 hover:text-emerald-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🔥 顶部导航栏 - 移动端优化：增加高度和触摸区域 */}
        <div className="flex items-center h-16 md:h-14 px-3 md:px-4 border-b border-slate-100 bg-white shrink-0 pt-safe">
          <button
            onClick={() => {
              console.log("📋 [历史按钮] 点击! showHistorySidebar当前值:", showHistorySidebar)
              setShowHistorySidebar(!showHistorySidebar)
            }}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-800 transition-colors min-w-[44px] min-h-[44px] justify-center"
          >
            <History className="h-5 w-5" />
          </button>
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-800 transition-colors min-w-[44px] min-h-[44px] justify-center"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm font-medium hidden sm:inline">返回</span>
          </button>
          <div className="flex-1 text-center md:text-left md:ml-4">
            <motion.span
              key={selectedModel}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="text-sm md:text-base font-medium text-slate-700 inline-block"
            >
              {modelConfig[selectedModel].name}
            </motion.span>
          </div>
          {/* 🔥 移动端用户信息显示 - 仅在移动端显示 */}
          <div className="md:hidden">
            {userId ? (
              <MobileUserInfo 
                userName={userDisplayName}
                credits={userCredits}
                onMenuClick={() => router.push("/settings")}
              />
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="px-3 py-2 text-xs font-medium text-white rounded-lg min-h-[36px]"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                登录
              </button>
            )}
          </div>
          {/* 桌面端占位 */}
          <div className="hidden md:block w-16" />
        </div>

        {/* 🔥 滚动区域优化 */}
        <div className="flex-1 h-0 relative overflow-hidden">
          {/* 🔥 移动端浮动历史按钮 - 位于右上角 */}
          <button
            onClick={() => setShowHistorySidebar(!showHistorySidebar)}
            className="absolute top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-lg rounded-full shadow-lg border border-slate-100 md:hidden"
          >
            <History className="h-4 w-4 text-slate-600" />
            <span className="text-xs font-medium text-slate-600">历史</span>
          </button>
          <div
            ref={scrollAreaRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto custom-scrollbar pb-0 md:pb-24"
          >
            <div className="mx-auto max-w-6xl px-3 sm:px-4 md:px-6 lg:px-10 py-4 sm:py-6 md:py-8">
              {messages.length === 0 ? (
                // 🔥 骨架屏：会话切换时显示对话块轮廓
                isLoading && !currentBotIdRef.current ? (
                  <ChatSkeleton />
                ) : selectedModel === "suno-v5" ? (
                  // 🎵 Suno V5 专业模式表单 - 放在主滚动区域
                  <div className="py-4 sm:py-6 animate-in fade-in duration-500">
                    <SunoProForm
                      onSubmit={async (formData) => {
                        if (!userId) { 
                          toast.error("请登录")
                          return
                        }
                        
                        const cost = calculateCost()
                        if (userCredits < cost) {
                          toast.error("积分不足", { 
                            description: `需要 ${cost} 积分，当前 ${userCredits}`,
                            duration: 2000
                          })
                          setTimeout(() => router.push("/pricing"), 1500)
                          return
                        }

                        setIsLoading(true)
                        collapseSidebar()
                        
                        let sid = currentSessionId
                        // 🔥 修复：当模型切换时，即使 urlSessionId 存在也忽略
                        const isModelSwitch = sessionIdRef.current === null && currentSessionId;
                        if (!sid && !urlSessionId) {
                          sid = Date.now().toString()
                          setCurrentSessionId(sid)
                          sessionIdRef.current = sid
                        } else if (urlSessionId && !isModelSwitch) {
                          sid = urlSessionId
                          sessionIdRef.current = urlSessionId
                        } else {
                          sid = Date.now().toString()
                          setCurrentSessionId(sid)
                          sessionIdRef.current = sid
                        }

                        // 🔥 用户消息：显示歌词和音乐提示词（如果有）
                        let userContent = `🎵 专业模式创作\n\n**标题**: ${formData.title || '未命名'}\n**模式**: ${formData.task_mode}`
                        if (formData.lyrics) {
                          userContent += `\n\n**歌词**:\n${formData.lyrics}`
                        }
                        if (formData.prompt) {
                          userContent += `\n\n**音乐提示词**: ${formData.prompt}`
                        }
                        if (formData.style_tags) {
                          userContent += `\n**风格标签**: ${formData.style_tags}`
                        }
                        const userMsg: Message = { 
                          id: Date.now().toString(), 
                          role: "user", 
                          content: userContent
                        }
                        setMessages(p => [...p, userMsg])

                        const preview = formData.title || formData.prompt.slice(0, 30)
                        const { data: existing } = await supabase.from('chat_sessions').select('id').eq('id', sid).single()
                        if (!existing) {
                          await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: "音乐创作", preview, ai_model: selectedModel })
                        }
                        await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userContent })

                        // 🔥 刷新侧边栏会话列表
                        refreshSessionList()

                        const botId = (Date.now() + 1).toString()
                        currentBotIdRef.current = botId
                        setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])

                        try {
                          // 🔥 使用专业模式函数，传递完整 formData 对象
                          await startMusicGenerationPro(
                            formData,
                            userId,
                            botId,
                            (chunk) => {
                              setMessages(p => p.map(m =>
                                m.id === botId ? { ...m, content: chunk } : m
                              ))
                            },
                            async (fullText) => {
                              const formattedContent = formatSunoResponse(fullText)
                              setMessages(p => p.map(m =>
                                m.id === botId ? { ...m, content: formattedContent } : m
                              ))

                              await supabase.from('chat_messages').insert({
                                session_id: sid,
                                role: "assistant",
                                content: fullText
                              })

                              // 🔥 后端 handleGenerateStreamingPro 已包含完整计费逻辑（基础费+Token费）
                              // 前端不再单独扣费，避免三重计费
                              // 余额会在 finally 的 refreshCredits() 时同步
                            }
                          )
                        } catch (err: any) {
                          console.error("❌ [Suno Pro] 生成失败:", err)
                          toast.error(err.message || "音乐生成失败")
                          setMessages(p => p.filter(m => m.id !== botId))
                        } finally {
                          setIsLoading(false)
                          refreshCredits()
                        }
                      }}
                      isLoading={isLoading}
                      disabled={!userId || hasSunoActiveTasks}
                    />
                  </div>
                ) : (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 md:py-16 text-center animate-in fade-in duration-500">
                  <div className="mb-4 sm:mb-6">
                    <ModelLogo modelKey={selectedModel as any} size="xl" />
                  </div>
                  <h1 className="text-lg sm:text-xl font-semibold text-slate-800 px-4">欢迎使用沈翔智学</h1>
                </div>
                )
                ) : (
                <div className="space-y-5 sm:space-y-6 pt-2 sm:pt-4 pb-24">
                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex gap-2 sm:gap-3 group", message.role === "user" ? "justify-end" : "justify-start")}>
                      {message.role === "assistant" && (
                        // Smaller AI avatar - 使用 ModelLogo
                        <div className="flex w-8 h-8 sm:w-10 sm:h-10 shrink-0 items-center justify-center mt-0.5">
                          <ModelLogo modelKey={selectedModel as any} size="md" />
                        </div>
                      )}
                      {/* Flat content container - No heavy backgrounds or borders */}
                      <div className={cn(
                        "flex flex-col max-w-[85%] sm:max-w-[80%]",
                        message.role === "user" ? "items-end" : "items-start"
                      )}>
                        {/* User message - 复制和编辑功能 */}
                        {message.role === "user" ? (
                          <UserMessageBubble
                            content={message.content}
                            files={message.files}
                            onEdit={(content) => setInput(content)}
                            onSend={(content) => {
                              setInput(content)
                              // 自动提交
                              const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent
                              onSubmit(fakeEvent)
                            }}
                          />
                        ) : (
                          // AI message - Flat, minimal container
                          <div className="w-full">
                            {/* Workflow visualization - Only show when processing */}
                            {message.id === currentBotIdRef.current && (isWorkflowProcessing || workflowState.nodes.length > 0) && !isMobile && (
                              <WorkflowVisualizer
                                workflowState={workflowState}
                                isThinking={isThinking}
                                isGenerating={isGenerating}
                                onToggle={toggleExpanded}
                                currentRunningText={currentRunningText}
                                className="mb-3"
                              />
                            )}
                            {/* Thinking state */}
                            {message.id === currentBotIdRef.current && isLoading && !message.content && !isFastTrack ? (
                              <SimpleBrainLoader showHint={showDeepThinkingHint} />
                            ) : (
                              <>
                                {/* Content renderer */}
                                {(() => {
                                  const musicTask = getTaskByMessageId(message.id)
                                  const hasTaskId = TASK_ID_REGEX.test(message.content)
                                  const savedMusic = message.metadata?.type === "music" ? message.metadata : null

                                  if (musicTask || hasTaskId || savedMusic) {
                                    const taskId = musicTask?.taskId || savedMusic?.taskId || extractTaskId(message.content) || ""
                                    const cleanContent = removeTaskIdFromText(message.content)
                                    const songs = (musicTask?.songs || savedMusic?.songs || []) as [any, any]
                                    const globalStatus = musicTask?.globalStatus || (savedMusic ? "SUCCESS" : "PENDING")

                                    return (
                                      <>
                                        {cleanContent && (
                                          <UltimateRenderer
                                            content={cleanLLMText(cleanContent)}
                                            isStreaming={message.id === currentBotIdRef.current && showCursor && isLoading}
                                          />
                                        )}
                                        {(taskId && songs.length > 0) && (
                                          <MusicCard
                                            taskId={taskId}
                                            songs={songs}
                                            globalStatus={globalStatus}
                                            errorMessage={musicTask?.errorMessage}
                                            onRetry={() => retryTask(taskId, userId)}
                                            className="mt-4"
                                          />
                                        )}
                                      </>
                                    )
                                  }

                                  return (
                                    <EnhancedMarkdown
                                      content={cleanLLMText(message.content)}
                                    />
                                  )
                                })()}
                              </>
                            )}

                            {/* Action toolbar - Subtle, shows on hover */}
                            {message.content && (
                              <div
                                className={cn(
                                  "flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                )}
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 sm:h-8 gap-1 text-[10px] sm:text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2"
                                  onClick={() => navigator.clipboard.writeText(message.content).then(() => toast.success("已复制"))}
                                >
                                  <Copy className="h-3 w-3" />
                                  <span className="hidden sm:inline">复制</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 sm:h-8 gap-1 text-[10px] sm:text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2"
                                  onClick={() => window.print()}
                                >
                                  <Printer className="h-3 w-3" />
                                  <span className="hidden sm:inline">打印</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 sm:h-8 gap-1 text-[10px] sm:text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2"
                                  onClick={() => handleExportPDF(message.content)}
                                >
                                  <Download className="h-3 w-3" />
                                  <span className="hidden sm:inline">导出</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 sm:h-8 gap-1 text-[10px] sm:text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2"
                                  onClick={() => handleShare()}
                                >
                                  <Share2 className="h-3 w-3" />
                                  <span className="hidden sm:inline">分享</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-7 sm:h-8 gap-1 text-[10px] sm:text-xs px-2",
                                    isPlaying ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                                  )}
                                  onClick={() => playAssistantMessage(message.content)}
                                >
                                  <Volume2 className="h-3 w-3" />
                                  <span className="hidden sm:inline">{isPlaying ? "停止" : "朗读"}</span>
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {message.role === "user" && (
                        <div className="flex w-6 h-6 sm:w-7 sm:h-7 shrink-0 items-center justify-center rounded-full bg-slate-200 mt-0.5 overflow-hidden">
                          {userAvatar ? (
                            <img src={userAvatar} alt="Me" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-3.5 w-3.5 text-slate-500" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>
          
          {/* 🔥 新消息提示按钮 */}
          <AnimatePresence>
            {hasNewMessage && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                onClick={scrollToBottom}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 text-white text-sm rounded-full shadow-lg flex items-center gap-2 hover:opacity-90 transition-all"
                style={{ backgroundColor: BRAND_GREEN }}
              >
                <ArrowDown className="w-4 h-4" />
                新消息
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* 🔥 输入框区域 - 移动端优化 */}
        <div className="border-t border-slate-100 bg-white p-2 sm:p-3 md:p-6 shrink-0 z-20 safe-area-bottom">
          <div className="mx-auto max-w-5xl">
            {/* 🔥 上传进度条 - 移动端优化 */}
            {isUploading && (
              <div className="mb-2 sm:mb-3 rounded-lg sm:rounded-xl bg-slate-50 p-2 sm:p-3 border border-slate-200 animate-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <span className="text-[10px] sm:text-xs font-medium text-slate-600">上传中...</span>
                  <span className="text-[10px] sm:text-xs font-medium" style={{ color: BRAND_GREEN }}>{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 sm:h-2 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: BRAND_GREEN }}
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}
            {fileProcessing.status !== "idle" && !isUploading && (
              <div className="mb-2 sm:mb-3 rounded-lg sm:rounded-xl bg-slate-50 p-2 sm:p-3 animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {fileProcessing.status === "error" ? <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" /> : <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" style={{ color: BRAND_GREEN }} />}
                  {dynamicStatusMessage ? (
                    <p className="text-xs sm:text-sm bg-gradient-to-r from-emerald-600 to-green-500 bg-clip-text text-transparent animate-pulse font-medium">
                      {dynamicStatusMessage}
                    </p>
                  ) : (
                    <p className="text-xs sm:text-sm text-slate-600">{fileProcessing.message}</p>
                  )}
                </div>
              </div>
            )}
            {uploadedFiles.length > 0 && (
              <div className="mb-2 sm:mb-3 flex flex-wrap gap-1.5 sm:gap-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 sm:gap-2 rounded-md sm:rounded-lg bg-slate-50 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm">
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: BRAND_GREEN }} />
                    <span className="max-w-[80px] sm:max-w-[100px] truncate text-slate-600">{f.name}</span>
                    <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 min-w-[20px] min-h-[20px] flex items-center justify-center"><X className="h-3 w-3 sm:h-3.5 sm:w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}

            {/* 🔥 输入框 - 使用 ChatInput 组件 - 移动端固定在底部 */}
            {(selectedModel !== "suno-v5" || messages.length > 0) && (
            <div className="fixed bottom-0 left-0 right-0 z-50 md:relative mx-auto max-w-3xl w-full px-2 sm:px-0 pb-safe md:pb-0">
              <ChatInput
                showModelSelector={true}
                selectedModel={selectedModel}
                models={modelList}
                onModelChange={handleModelChange}
                modelColor={modelConfig[selectedModel].color}
                modelName={modelConfig[selectedModel].name}
                value={input}
                onChange={setInput}
                onSubmit={onSubmit}
                uploadedFiles={uploadedFiles}
                onRemoveFile={(i) => setUploadedFiles((p) => p.filter((_, idx) => idx !== i))}
                isLoading={isLoading}
                disabled={isLoading}
                placeholder={userId ? "输入内容开始对话..." : "请先登录..."}
                onFileUpload={(files) => {
                  const target = { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>
                  handleFileUpload(target)
                }}
              />
            </div>
            )}

            {!userId && selectedModel !== "suno-v5" && (
              <div className="mt-2 sm:mt-3 flex items-center justify-center gap-1 text-[10px] sm:text-xs">
                <span className="text-slate-400">未登录，</span>
                <Link
                  href="/auth/sign-up"
                  className="text-green-700 hover:text-green-600 font-medium underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 rounded px-1"
                >
                  立即注册
                </Link>
                <span className="text-slate-400">开始对话</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 🔥 导出 Props 类型供外部使用
export interface EnhancedChatInterfaceProps {
  initialModel?: ModelType
}

export function EnhancedChatInterface(props: EnhancedChatInterfaceProps) {
  const { initialModel } = props
  return (
    <Suspense fallback={<div className="flex h-[100dvh] w-full items-center justify-center bg-white"><LoadingStateCard modelKey="standard" /></div>}>
      <ChatInterfaceInner initialModel={initialModel} />
    </Suspense>
  )
}
