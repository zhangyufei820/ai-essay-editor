"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
// ✅ 新增：引入图片压缩库
import imageCompression from 'browser-image-compression';

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Send, Paperclip, X, FileText, Copy, Loader2, Sparkles, User, Brain, AlertCircle, 
  ChevronDown, Crown, Image as ImageIcon, Music, Video, Zap, Bot, Film, Palette, AudioLines
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { AnalysisStages } from "./analysis-stages"
import { createClient } from "@supabase/supabase-js"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu"

// --- Supabase 初始化 ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// --- 类型定义 ---
type UploadedFile = { name: string; type: string; size: number; data: string; preview?: string; difyFileId?: string }
type Message = { id: string; role: "user" | "assistant"; content: string }
type FileProcessingState = { status: "idle" | "uploading" | "processing" | "recognizing" | "complete" | "error"; progress: number; message: string }

// ✅ 新增模型定义
type ModelType = "standard" | "gpt-5" | "claude-opus" | "gemini-pro" | "banana-2-pro" | "sono-v5" | "sora-2-pro"
type GenMode = "text" | "image" | "music" | "video"

// --- 辅助组件：思考加载器 ---
const SimpleBrainLoader = () => (
  <div className="flex items-center gap-3 py-6 px-4 bg-white/50 rounded-xl border border-dashed border-[#0F766E]/20">
    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F766E]/10">
      <Brain className="h-6 w-6 text-[#0F766E] animate-pulse" />
    </div>
    <div className="space-y-1">
      <span className="text-base text-[#0F766E] font-medium animate-pulse">AI 导师正在思考中...</span>
    </div>
  </div>
)

// --- 辅助组件：文本渲染器 ---
const InlineText = ({ text }: { text: string }) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index} className="font-bold text-[#0F766E] bg-[#0F766E]/10 px-1.5 py-0.5 rounded mx-0.5 box-decoration-clone">{part.slice(2, -2)}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

function UltimateRenderer({ content }: { content: string }) {
  if (!content) return <span className="animate-pulse text-[#0F766E] text-lg">▌</span>;
  const lines = content.split("\n");
  const renderedElements = [];
  let tableBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableLine = line.trim().startsWith("|") && line.includes("|");
    if (isTableLine) {
      tableBuffer.push(line);
      if (i === lines.length - 1 || !lines[i + 1].trim().startsWith("|")) {
        renderedElements.push(<TableBlock key={`tbl-${i}`} lines={tableBuffer} />);
        tableBuffer = [];
      }
      continue;
    }
    if (line.trim().startsWith("# ")) {
      renderedElements.push(<h1 key={i} className="mt-12 mb-8 text-3xl font-extrabold text-slate-900 tracking-tight leading-tight border-b-2 border-[#0F766E]/20 pb-4"><span className="text-[#0F766E] mr-2">#</span> {line.replace(/^#\s+/, "")}</h1>);
    } else if (line.trim().startsWith("## ")) {
      renderedElements.push(<h2 key={i} className="mt-10 mb-6 text-2xl font-bold text-slate-800 flex items-center gap-3"><span className="w-1.5 h-7 bg-[#0F766E] rounded-full inline-block shadow-sm"></span>{line.replace(/^##\s+/, "")}</h2>);
    } else if (line.trim().startsWith("### ")) {
      renderedElements.push(<h3 key={i} className="mt-8 mb-4 text-xl font-bold text-[#0F766E]">{line.replace(/^###\s+/, "")}</h3>);
    } else if (line.trim().startsWith("- ")) {
      renderedElements.push(<div key={i} className="flex gap-3 ml-2 my-3 text-[17px] text-slate-700 leading-8"><div className="mt-[11px] w-2 h-2 rounded-full bg-[#0F766E] shrink-0 opacity-60"></div><span><InlineText text={line.replace(/^- /, "")} /></span></div>);
    } else if (line.trim().startsWith("> ")) {
      renderedElements.push(<blockquote key={i} className="my-6 border-l-4 border-[#0F766E] bg-[#F0FDF9] px-6 py-5 rounded-r-xl shadow-sm"><div className="text-[#0F766E] font-semibold text-sm mb-1 opacity-80">💡 导师点评</div><div className="text-[17px] text-slate-700 leading-8 italic"><InlineText text={line.replace(/^> /, "")} /></div></blockquote>);
    } else if (line.trim() === "---") {
      renderedElements.push(<div key={i} className="py-8 flex items-center justify-center"><div className="h-px bg-gray-200 w-full"></div><div className="mx-4 text-gray-300">✦</div><div className="h-px bg-gray-200 w-full"></div></div>);
    } else if (line.trim() === "") {
      renderedElements.push(<div key={i} className="h-4"></div>);
    } else {
      renderedElements.push(<p key={i} className="text-[17px] leading-[2] text-slate-700 my-3 tracking-wide"><InlineText text={line} /></p>);
    }
  }
  return <div className="w-full pb-8">{renderedElements}</div>;
}

const TableBlock = ({ lines }: { lines: string[] }) => {
  if (lines.length < 2) return null;
  try {
    const headerLine = lines.find(l => l.includes("|") && !l.includes("---"));
    const bodyLines = lines.filter(l => l.includes("|") && !l.includes("---") && l !== headerLine);
    if (!headerLine) return null;
    const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim());
    return (
      <div className="my-8 overflow-hidden rounded-2xl border border-[#0F766E]/20 shadow-md w-full bg-white ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-[#0F766E]"><tr>{headers.map((h, i) => (<th key={i} className="px-6 py-4 text-left text-sm font-bold text-white tracking-wider whitespace-nowrap uppercase">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-50">{bodyLines.map((line, i) => { const cells = line.split("|").filter(c => c.trim()).map(c => c.trim()); return (<tr key={i} className="hover:bg-[#F0FDF9] transition-colors odd:bg-white even:bg-gray-50/50">{cells.map((cell, j) => (<td key={j} className="px-6 py-4 text-[16px] text-slate-700 leading-relaxed min-w-[120px]"><InlineText text={cell} /></td>))}</tr>); })}</tbody>
          </table>
        </div>
      </div>
    );
  } catch (e) { return null; }
};

// --- 主组件 ---
export function EnhancedChatInterface() {
  const [userId, setUserId] = useState<string>("")
  const [userAvatar, setUserAvatar] = useState<string>("")
  const [userCredits, setUserCredits] = useState<number>(0)
  const sessionIdRef = useRef<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string>("")

  // --- 新增状态：模型与模式 ---
  const [selectedModel, setSelectedModel] = useState<ModelType>("standard")
  const [genMode, setGenMode] = useState<GenMode>("text")
  
  // 模拟每日免费额度 (实际项目应从数据库获取)
  const [dailyUsage, setDailyUsage] = useState<number>(0)
  const DAILY_LIMIT = 20

  // 判断是否为豪华会员 (模拟：积分 > 1000 或 metadata 标记)
  const isLuxury = userCredits > 1000 

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('currentUser')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          setUserId(user.id || user.sub || user.userId || "")
          if (user.user_metadata?.avatar_url) setUserAvatar(user.user_metadata.avatar_url)
          // 获取积分
          fetchCredits(user.id || user.sub || user.userId)
        } catch (e) {}
      }
    }
  }, [])

  const fetchCredits = async (uid: string) => {
    const { data } = await supabase.from('user_credits').select('credits').eq('user_id', uid).single()
    if (data) setUserCredits(data.credits)
  }

  // 消息加载逻辑
  const fetchMessages = async (sessionId: string) => {
    const { data } = await supabase.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true })
    setMessages(data ? data.map((m: any) => ({ id: m.id, role: m.role, content: m.content })) : [])
  }

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [fileProcessing, setFileProcessing] = useState<FileProcessingState>({ status: "idle", progress: 0, message: "" })
  const [isComplexMode, setIsComplexMode] = useState(false)
  const [analysisStage, setAnalysisStage] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])
  useEffect(() => { if (isLoading && isComplexMode && analysisStage < 4) setTimeout(() => setAnalysisStage(p => Math.min(p + 1, 4)), 2000) }, [isLoading, analysisStage, isComplexMode])

  // --- 模型配置 (新增 Banana/Sono/Sora) ---
  const modelConfig = {
    "standard": { name: "作文批改智能体", icon: Sparkles, color: "text-[#0F766E]", badge: null },
    
    // 文本大模型
    "gpt-5": { name: "ChatGPT 5.1", icon: Zap, color: "text-emerald-600", badge: "Plus" },
    "claude-opus": { name: "Claude Opus 4.5", icon: Bot, color: "text-orange-600", badge: "Pro" },
    "gemini-pro": { name: "Gemini 3.0 Pro", icon: Sparkles, color: "text-blue-600", badge: "Adv" },
    
    // 多模态生成模型
    "banana-2-pro": { name: "Banana 2 Pro", icon: Palette, color: "text-yellow-500", badge: "Art" },
    "suno-v5": { name: "Sono V5", icon: AudioLines, color: "text-pink-500", badge: "Music" },
    "sora-2-pro": { name: "Sora 2 Pro", icon: Film, color: "text-indigo-600", badge: "Video" },
  }

  // --- 切换模型逻辑 (已修复：允许切换并重置模式) ---
  const handleModelChange = (model: ModelType) => {
    if (model !== "standard") {
      if (isLuxury) {
        toast.success(`已切换至 ${modelConfig[model].name}`, { description: "豪华会员无限畅享" })
      } else {
        if (dailyUsage < DAILY_LIMIT) {
          toast.info(`已切换至 ${modelConfig[model].name}`, { description: `今日免费额度: ${dailyUsage}/${DAILY_LIMIT} 次` })
        } else {
          toast.warning(`今日免费额度已耗尽`, { description: "继续使用将消耗 50 积分/次，升级豪华会员无限畅享" })
        }
      }
    } else {
      toast.success("已切换至标准智能体")
    }
    
    // ✅ 修复：切换左侧模型时，默认重置回文本模式
    // 如果是生成模型(Banana/Sono/Sora)，则保持对应的模式
    if (model === "banana-2-pro") setGenMode("image")
    else if (model === "sono-v5") setGenMode("music")
    else if (model === "sora-2-pro") setGenMode("video")
    else setGenMode("text")

    setSelectedModel(model)
    
    if (input === "" || input.startsWith("生成")) {
       setInput("")
    }
  }

  // --- 切换模式逻辑 (点击右侧图标) ---
  const handleModeChange = (mode: GenMode) => {
    setGenMode(mode)
    
    // ✅ 智能联动：点击右侧图标，左侧模型自动切换
    if (mode === "image") setSelectedModel("banana-2-pro")
    else if (mode === "music") setSelectedModel("sono-v5")
    else if (mode === "video") setSelectedModel("sora-2-pro")
    else setSelectedModel("standard") // 回到文本时切回标准

    const prompts = {
      "text": "",
      "image": "生成一张关于...的插画，风格是...",
      "music": "生成一首轻快的钢琴曲，时长30秒...",
      "video": "生成一段4秒的视频，内容是..."
    }
    setInput(prompts[mode])
    if (mode !== "text") textareaRef.current?.focus()
  }

  // --- 计算消耗积分 ---
  const calculateCost = () => {
    if (genMode === "video") return 300
    if (genMode === "music") return 100
    if (genMode === "image") return isLuxury ? 0 : 50
    
    if (selectedModel !== "standard") {
      if (isLuxury) return 0 
      if (dailyUsage < DAILY_LIMIT) return 0 
      return 50 
    }
    return userId ? 20 : 0 
  }

  // --- ✅ 核心修改：文件上传逻辑 (增加前端压缩) ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files; 
    if (!files || !files.length) return;
    
    setFileProcessing({ status: "uploading", progress: 0, message: "正在处理图片..." })
    
    try {
        const uploadPromises = Array.from(files).map(async (file) => {
            let fileToUpload = file;

            // === 前端压缩逻辑开始 ===
            if (file.type.startsWith("image/")) {
                try {
                    console.log(`原始文件: ${file.name} size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
                    
                    const options = {
                        maxSizeMB: 1,           // 目标最大 1MB (足够清晰且传输快)
                        maxWidthOrHeight: 1920, // 限制最大分辨率 1920px
                        useWebWorker: true,     // 开启多线程
                        fileType: "image/jpeg"  // 强制转为 JPG
                    };

                    const compressedBlob = await imageCompression(file, options);
                    
                    // 创建新的 File 对象
                    fileToUpload = new File([compressedBlob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                        type: "image/jpeg",
                        lastModified: Date.now(),
                    });

                    console.log(`压缩后: ${(fileToUpload.size / 1024 / 1024).toFixed(2)} MB`);
                } catch (error) {
                    console.error("图片压缩失败，将尝试上传原图", error);
                }
            }
            // === 前端压缩逻辑结束 ===

            const formData = new FormData(); 
            formData.append("file", fileToUpload); 
            formData.append("user", userId)
            
            const res = await fetch("/api/dify-upload", { method: "POST", body: formData })
            
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`上传失败: ${res.status} ${errText}`);
            }
            
            const data = await res.json()
            return new Promise<UploadedFile>((resolve) => {
                // 如果是图片，直接用 URL.createObjectURL 预览，不用读取整个 Base64
                if (fileToUpload.type.startsWith("image/")) {
                    resolve({ 
                        name: fileToUpload.name, 
                        type: fileToUpload.type, 
                        size: fileToUpload.size, 
                        data: "", // 图片上传后 data 可以留空或存 url，取决于你后续用途，这里保持兼容性只存预览
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
        setFileProcessing({ status: "idle", progress: 100, message: "上传完成" })
        setTimeout(() => setFileProcessing({ status: "idle", progress: 0, message: "" }), 1000)
    } catch(e: any) {
        console.error("上传错误:", e);
        toast.error("上传失败，请检查网络或重试")
        setFileProcessing({ status: "error", progress: 0, message: "上传失败" })
    }
    if(fileInputRef.current) fileInputRef.current.value=""
  }

  const removeFile = (i: number) => setUploadedFiles(p => p.filter((_, idx) => idx !== i))

  // 提交逻辑
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!userId) { toast.error("请登录"); return }
    const txt = (input || "").trim(); if (!txt && !uploadedFiles.length) return
    
    // 检查积分
    const cost = calculateCost()
    if (userCredits < cost) {
      toast.error("积分不足", { description: `本次操作需要 ${cost} 积分，当前余额 ${userCredits}` })
      return
    }

    setFileProcessing({ status: "idle", progress: 0, message: "" })
    setIsLoading(true); setAnalysisStage(0); 
    setIsComplexMode(uploadedFiles.length > 0 || txt.length > 150)
    
    let sid = currentSessionId; if (!sid) { sid = Date.now().toString(); setCurrentSessionId(sid) }
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: txt || "批改作文" }
    setMessages(p => [...p, userMsg]); setInput(""); setUploadedFiles([])
    
    // 会话标题处理
    const preview = userMsg.content.slice(0, 30)
    const { data: existing } = await supabase.from('chat_sessions').select('id').eq('id', sid).single()
    if (!existing) {
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: userMsg.content.slice(0, 10)|| "作文", preview })
    } else {
        await supabase.from('chat_sessions').update({ preview }).eq('id', sid)
    }
    await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userMsg.content })

    const botId = (Date.now()+1).toString(); setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])
    
    let fullText = ""; let hasRec = false
    try {
        const fileIds = uploadedFiles.map(f => f.difyFileId).filter(Boolean)
        const res = await fetch("/api/dify-chat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              query: userMsg.content, 
              fileIds, 
              userId, 
              conversation_id: sessionIdRef.current,
              // 传递额外参数给后端
              model: selectedModel,
              mode: genMode
            })
        })
        if (res.status === 402) throw new Error("积分不足")
        if (!res.ok) throw new Error("请求失败")
        
        const reader = res.body?.getReader(); 
        const decoder = new TextDecoder();
        let buffer = ""; // ✅ 核心修复：数据缓冲区，防止中文乱码

        while (true) {
            const { done, value } = await reader!.read(); 
            if (done) break;
            
            // ✅ 累积数据到缓冲区，而不是每次都重新处理
            buffer += decoder.decode(value, { stream: true });
            
            // ✅ 按行分割
            const lines = buffer.split("\n");
            
            // ✅ 保留最后一行（因为它可能是不完整的），下次循环再处理
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                const data = line.slice(6).trim(); if (data === "[DONE]") continue
                try {
                    const json = JSON.parse(data)
                    if (json.conversation_id && sessionIdRef.current !== json.conversation_id) sessionIdRef.current = json.conversation_id
                    if (json.answer) {
                        if (!hasRec) setAnalysisStage(4); hasRec = true; fullText += json.answer
                        setMessages(p => p.map(m => m.id === botId ? { ...m, content: fullText } : m))
                    }
                } catch {}
            }
        }
        if (hasRec) await supabase.from('chat_messages').insert({ session_id: sid, role: "assistant", content: fullText })
        
        // 成功后更新本地积分和使用次数
        setUserCredits(prev => prev - cost)
        if (selectedModel !== "standard" && !isLuxury && dailyUsage < DAILY_LIMIT) {
          setDailyUsage(prev => prev + 1)
        }

    } catch (e: any) {
        toast.error(e.message || "出错了"); setMessages(p => p.filter(m => m.id !== botId))
    } finally { 
      setIsLoading(false)
      // 任务完成后重置为文本模式
      if (genMode !== "text") {
        setGenMode("text")
        setSelectedModel("standard")
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e as unknown as React.FormEvent) }
  }

  return (
    <div className="flex h-screen w-full bg-[#FAFAF9] overflow-hidden relative">
      <div className="flex flex-1 flex-col h-full relative min-w-0 bg-white">
        <div className="flex-1 h-0">
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-4xl px-4 md:px-6 py-10">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in duration-500">
                  <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#0F766E]/10 shadow-lg shadow-[#0F766E]/5"><FileText className="h-10 w-10 text-[#0F766E]" /></div>
                  <h1 className="mb-4 text-3xl font-extrabold text-slate-800 tracking-tight">你好！欢迎使用沈翔智学！</h1>
                  <p className="mb-6 max-w-lg text-lg text-slate-500 font-medium">专业的作文批改专家，为学生习作提供深度点评。</p>
                  
                  {/* 引导标签 */}
                  <div className="flex gap-2 justify-center flex-wrap">
                    <span className="px-3 py-1 bg-orange-50 text-orange-600 text-xs font-bold rounded-full border border-orange-100 flex items-center gap-1">
                      <Crown className="h-3 w-3" /> 豪华会员畅享 ChatGPT 5.1 / Claude 4.5 / Gemini 3.0
                    </span>
                    <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full border border-blue-100 flex items-center gap-1">
                      <Video className="h-3 w-3" /> 支持视频生成
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-10 pt-12">
                  {messages.map((message) => (
                    <div key={message.id} className={cn("flex gap-5", message.role === "user" ? "justify-end" : "justify-start")}>
                      {message.role === "assistant" && (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0F766E] shadow-lg shadow-[#0F766E]/20 text-white mt-1">
                          <Sparkles className="h-6 w-6" />
                        </div>
                      )}
                      <div className={cn(
                        "relative rounded-3xl px-8 py-6 shadow-sm border",
                        message.role === "user" 
                          ? "bg-[#0F766E] text-white border-transparent max-w-[80%]" 
                          : "bg-white border-gray-100 shadow-xl shadow-gray-200/40 w-full max-w-full"
                      )}>
                        {message.role === "user" ? (
                          <div className="whitespace-pre-wrap text-[17px] leading-relaxed font-medium">{message.content}</div>
                        ) : (
                           isLoading && !message.content ? (
                              isComplexMode ? <AnalysisStages /> : <SimpleBrainLoader />
                           ) : <UltimateRenderer content={message.content} />
                        )}
                        {message.role === "assistant" && message.content && (
                          <div className="mt-6 flex items-center justify-end border-t border-gray-100 pt-4">
                            <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs text-slate-400 hover:text-[#0F766E] hover:bg-[#0F766E]/5 transition-colors" onClick={() => navigator.clipboard.writeText(message.content).then(() => toast.success("已复制"))}>
                               <Copy className="h-3.5 w-3.5" /> 复制全文
                            </Button>
                          </div>
                        )}
                      </div>
                      {message.role === "user" && (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-200 shadow-inner mt-1 overflow-hidden">
                          {userAvatar ? (
                            <img src={userAvatar} alt="Me" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-6 w-6 text-slate-500" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* --- 底部输入框区域 (全新重构) --- */}
        <div className="border-t border-gray-100 bg-white/90 backdrop-blur-md p-3 md:p-6 shrink-0 z-20">
          <div className="mx-auto max-w-4xl">
            {fileProcessing.status !== "idle" && (
              <div className="mb-4 rounded-xl border border-[#0F766E]/20 bg-[#F0FDF9] p-4 shadow-sm animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3">
                  {fileProcessing.status === "error" ? <AlertCircle className="h-5 w-5 text-red-500" /> : <Loader2 className="h-5 w-5 animate-spin text-[#0F766E]" />}
                  <p className="text-sm font-medium text-slate-700">{fileProcessing.message}</p>
                </div>
              </div>
            )}
            {uploadedFiles.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-3">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm group">
                    <FileText className="h-5 w-5 text-[#0F766E]" />
                    <span className="max-w-[120px] truncate text-sm font-medium text-slate-700">{f.name}</span>
                    <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}

            {/* 新版输入框容器 */}
            <form onSubmit={onSubmit} className="relative shadow-lg shadow-gray-200/50 rounded-2xl border border-gray-200 bg-white transition-all focus-within:border-[#0F766E] focus-within:ring-2 focus-within:ring-[#0F766E]/10">
              
              {/* Top Toolbar: 模型切换 & 多模态工具 */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl">
                {/* 左侧：模型选择 */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-2 text-slate-600 hover:bg-white hover:shadow-sm transition-all rounded-lg px-2 data-[state=open]:bg-white data-[state=open]:text-[#0F766E]">
                      {(() => {
                        const CurrentIcon = modelConfig[selectedModel].icon
                        return <CurrentIcon className={cn("h-4 w-4", modelConfig[selectedModel].color)} />
                      })()}
                      {/* 手机端隐藏文字，只显示图标，防止拥挤 */}
                      <span className="font-semibold text-xs hidden sm:inline">{modelConfig[selectedModel].name}</span>
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60 p-1 z-50">
                    <DropdownMenuLabel className="text-xs text-slate-400 font-normal px-2 py-1.5">
                      选择 AI 模型 (今日免费: {DAILY_LIMIT - dailyUsage}/{DAILY_LIMIT})
                    </DropdownMenuLabel>
                    {(Object.entries(modelConfig) as [ModelType, any][]).map(([key, config]) => (
                      <DropdownMenuItem 
                        key={key} 
                        onClick={() => handleModelChange(key)}
                        className={cn(
                          "flex items-center gap-3 px-2 py-2.5 rounded-md cursor-pointer focus:bg-[#0F766E]/5",
                          selectedModel === key && "bg-[#0F766E]/10"
                        )}
                      >
                        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border border-gray-100 bg-white shadow-sm", config.color)}>
                          <config.icon className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col flex-1">
                          <span className={cn("text-sm font-semibold", selectedModel === key ? "text-[#0F766E]" : "text-slate-700")}>
                            {config.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            {config.badge && (
                              <span className="text-[10px] text-amber-500 flex items-center gap-0.5 font-medium bg-amber-50 px-1.5 rounded-full border border-amber-100">
                                <Crown className="h-2.5 w-2.5" /> {config.badge}
                              </span>
                            )}
                          </div>
                        </div>
                        {selectedModel === key && <div className="h-2 w-2 rounded-full bg-[#0F766E]" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 右侧：多模态工具 */}
                <div className="flex items-center gap-1">
                  <div className="h-4 w-px bg-gray-200 mx-1" />
                  <Button 
                    type="button" variant="ghost" size="sm" 
                    onClick={() => handleModeChange("image")}
                    className={cn("h-8 w-8 rounded-lg p-0 hover:bg-white hover:text-purple-600 transition-colors", genMode === "image" && "bg-purple-50 text-purple-600")}
                    title="AI 绘图 (Banana 2 Pro)"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <Button 
                    type="button" variant="ghost" size="sm" 
                    onClick={() => handleModeChange("music")}
                    className={cn("h-8 w-8 rounded-lg p-0 hover:bg-white hover:text-pink-600 transition-colors", genMode === "music" && "bg-pink-50 text-pink-600")}
                    title="AI 音乐 (Sono V5)"
                  >
                    <Music className="h-4 w-4" />
                  </Button>
                  <Button 
                    type="button" variant="ghost" size="sm" 
                    onClick={() => handleModeChange("video")}
                    className={cn("h-8 w-8 rounded-lg p-0 hover:bg-white hover:text-blue-600 transition-colors", genMode === "video" && "bg-blue-50 text-blue-600")}
                    title="AI 视频 (Sora 2 Pro)"
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Input Area */}
              <div className="flex items-end gap-3 p-2 pl-3">
                <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-xl text-slate-400 hover:text-[#0F766E] hover:bg-[#0F766E]/5" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                  <Paperclip className="h-5 w-5" />
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.txt,.doc,.docx,.pdf" multiple onChange={handleFileUpload} />
                
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    genMode === "text" 
                      ? (userId ? "输入内容开始批改或对话..." : "请先登录...") 
                      : (genMode === "image" ? "描述你想生成的画面..." : genMode === "music" ? "描述音乐风格..." : "描述视频内容...")
                  }
                  className="min-h-[48px] max-h-[200px] flex-1 resize-none border-0 bg-transparent p-2.5 text-base text-slate-800 placeholder:text-slate-400 focus-visible:ring-0 leading-relaxed"
                  disabled={isLoading}
                  rows={1}
                />
                
                {/* 发送按钮 - 修正为深青色 #0F766E */}
                <Button 
                  type="submit" 
                  size="icon" 
                  className={cn(
                    "h-11 w-11 shrink-0 rounded-xl bg-[#0F766E] text-white shadow-md hover:bg-[#0d655d] transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                    genMode !== "text" && "bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
                  )}
                  disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
                </Button>
              </div>
            </form>

            {/* 底部计费提示 (动态) */}
            <p className="mt-4 text-center text-xs font-medium text-slate-400 flex items-center justify-center gap-2">
              {userId ? (
                <>
                  <span>
                    当前模式: 
                    <span className={cn(
                      "ml-1 font-bold",
                      genMode === "text" ? "text-[#0F766E]" : "text-purple-600"
                    )}>
                      {genMode === "text" ? (selectedModel === "standard" ? "普通对话" : modelConfig[selectedModel].name) : 
                       (genMode === "image" ? "AI 绘图" : genMode === "music" ? "AI 音乐" : "AI 视频")}
                    </span>
                  </span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span>
                    预计消耗: <span className="font-bold text-amber-500">{calculateCost()} 积分</span>
                  </span>
                </>
              ) : "未登录"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}