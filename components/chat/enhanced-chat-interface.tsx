"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Paperclip, X, FileText, Copy, Check, Loader2, CheckCircle2, AlertCircle, Sparkles, User, Brain, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Progress } from "@/components/ui/progress"
import { AnalysisStages } from "./analysis-stages"
import { ChatSidebar, type ChatSession } from "./chat-sidebar"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

type UploadedFile = { name: string; type: string; size: number; data: string; preview?: string; difyFileId?: string }
type Message = { id: string; role: "user" | "assistant"; content: string }
type FileProcessingState = { status: "idle" | "uploading" | "processing" | "recognizing" | "complete" | "error"; progress: number; message: string }

export function EnhancedChatInterface() {
  const [userId, setUserId] = useState<string>("")
  
  // ✨ 新增：用户头像 URL 状态
  const [userAvatar, setUserAvatar] = useState<string>("")

  const sessionIdRef = useRef<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string>("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('currentUser')
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          setUserId(user.id || user.sub || user.userId || "")
          // ✅ 获取头像
          if (user.user_metadata?.avatar_url) {
            setUserAvatar(user.user_metadata.avatar_url)
          }
          if (user.id || user.sub || user.userId) fetchSessions(user.id || user.sub || user.userId)
        } catch (e) {}
      }
    }
  }, [])

  const fetchSessions = async (uid: string) => {
    const { data } = await supabase.from('chat_sessions').select('*').eq('user_id', uid).order('created_at', { ascending: false })
    if (data) setSessions(data.map((s: any) => ({ id: s.id, title: s.title || "新对话", date: new Date(s.created_at).getTime(), preview: s.preview || "" })))
  }

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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [analysisStage, setAnalysisStage] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])
  useEffect(() => { if (isLoading && isComplexMode && analysisStage < 4) setTimeout(() => setAnalysisStage(p => Math.min(p + 1, 4)), 2000) }, [isLoading, analysisStage, isComplexMode])

  const handleSelectSession = (sessionId: string) => { setCurrentSessionId(sessionId); sessionIdRef.current = sessionId; fetchMessages(sessionId) }
  const handleNewChat = () => { setCurrentSessionId(""); sessionIdRef.current = null; setMessages([]); setUploadedFiles([]); setIsComplexMode(false) }
  const handleDeleteSession = async (sessionId: string) => { 
    setSessions(s => s.filter(i => i.id !== sessionId)); 
    if (sessionId === currentSessionId) handleNewChat(); 
    await supabase.from('chat_sessions').delete().eq('id', sessionId) 
  }
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files; if (!files || !files.length) return;
    setFileProcessing({ status: "uploading", progress: 0, message: "正在上传..." })
    const newFiles: UploadedFile[] = []
    
    try {
        const uploadPromises = Array.from(files).map(async (file) => {
            const formData = new FormData(); 
            formData.append("file", file); 
            formData.append("user", userId)
            
            const res = await fetch("/api/dify-upload", { method: "POST", body: formData })
            if (!res.ok) throw new Error("上传失败");
            
            const data = await res.json()
            return new Promise<UploadedFile>((resolve) => {
                const reader = new FileReader(); 
                reader.onload = e => resolve({ 
                    name: file.name, 
                    type: file.type, 
                    size: file.size, 
                    data: e.target?.result as string, 
                    difyFileId: data.id, 
                    preview: file.type.startsWith("image/") ? e.target?.result as string : undefined 
                });
                reader.readAsDataURL(file)
            })
        });

        const results = await Promise.all(uploadPromises);
        setUploadedFiles(p => [...p, ...results]);
        setFileProcessing({ status: "idle", progress: 100, message: "上传完成" })
        setTimeout(() => setFileProcessing({ status: "idle", progress: 0, message: "" }), 1000)

    } catch(e) {
        toast.error("部分文件上传失败")
        setFileProcessing({ status: "error", progress: 0, message: "上传失败" })
    }
    
    if(fileInputRef.current) fileInputRef.current.value=""
  }

  const removeFile = (i: number) => setUploadedFiles(p => p.filter((_, idx) => idx !== i))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!userId) { toast.error("请登录"); return }
    const txt = (input || "").trim(); if (!txt && !uploadedFiles.length) return
    setFileProcessing({ status: "idle", progress: 0, message: "" })
    setIsLoading(true); setAnalysisStage(0); 
    setIsComplexMode(uploadedFiles.length > 0 || txt.length > 150)
    
    let sid = currentSessionId; if (!sid) { sid = Date.now().toString(); setCurrentSessionId(sid) }
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: txt || "批改作文" }
    setMessages(p => [...p, userMsg]); setInput(""); setUploadedFiles([])
    
    const existing = sessions.find(s => s.id === sid)
    const preview = userMsg.content.slice(0, 30)
    if (!existing) {
        await supabase.from('chat_sessions').insert({ id: sid, user_id: userId, title: userMsg.content.slice(0, 10)|| "作文", preview })
        setSessions(p => [{ id: sid, title: userMsg.content.slice(0, 10)|| "作文", date: Date.now(), preview }, ...p])
    } else {
        await supabase.from('chat_sessions').update({ preview }).eq('id', sid)
        setSessions(p => p.map(s => s.id === sid ? { ...s, preview } : s))
    }
    await supabase.from('chat_messages').insert({ session_id: sid, role: "user", content: userMsg.content })

    const botId = (Date.now()+1).toString(); setMessages(p => [...p, { id: botId, role: "assistant", content: "" }])
    
    let fullText = ""; let hasRec = false
    try {
        const fileIds = uploadedFiles.map(f => f.difyFileId).filter(Boolean)
        const res = await fetch("/api/dify-chat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: userMsg.content, fileIds, userId, conversation_id: sessionIdRef.current })
        })
        if (res.status === 402) throw new Error("积分不足")
        if (!res.ok) throw new Error("请求失败")
        
        const reader = res.body?.getReader(); const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader!.read(); if (done) break
            const chunk = decoder.decode(value, { stream: true }); const lines = chunk.split("\n")
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
    } catch (e: any) {
        toast.error(e.message || "出错了"); setMessages(p => p.filter(m => m.id !== botId))
    } finally { setIsLoading(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e as unknown as React.FormEvent) }
  }

  return (
    <div className="flex h-screen w-full bg-[#FAFAF9] overflow-hidden relative">
      
      <div className={cn("h-full shrink-0 border-r border-[#E5E0D6] bg-white transition-all duration-300 ease-in-out z-10", isSidebarOpen ? "w-80" : "w-0 overflow-hidden opacity-0")}>
        <ChatSidebar currentSessionId={currentSessionId} sessions={sessions} onSelectSession={handleSelectSession} onNewChat={handleNewChat} onDeleteSession={handleDeleteSession} />
      </div>

      <div className="flex flex-1 flex-col h-full relative min-w-0 bg-white">
        
        <div className="absolute left-6 top-6 z-20">
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="h-9 w-9 rounded-xl bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-slate-500">
            {isSidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          </Button>
        </div>

        <div className="flex-1 h-0">
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-4xl px-6 py-10">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#0F766E]/10 shadow-lg shadow-[#0F766E]/5"><FileText className="h-10 w-10 text-[#0F766E]" /></div>
                  <h1 className="mb-4 text-3xl font-extrabold text-slate-800 tracking-tight">你好！欢迎使用沈翔智学！</h1>
                  <p className="mb-2 max-w-lg text-lg text-slate-500 font-medium">专业的作文批改专家，为学生习作提供深度点评。</p>
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
                          {/* ✅ 核心修改：显示用户头像 */}
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

        {/* 底部输入框 (保持不变) */}
        <div className="border-t border-gray-100 bg-white/90 backdrop-blur-md p-6 shrink-0 z-20">
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

            <form onSubmit={onSubmit} className="relative shadow-lg shadow-gray-200/50 rounded-2xl">
              <div className="flex items-end gap-3 rounded-2xl border border-gray-200 bg-white p-2 pl-3 focus-within:border-[#0F766E] focus-within:ring-2 focus-within:ring-[#0F766E]/20 transition-all">
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl text-slate-400 hover:text-[#0F766E] hover:bg-[#0F766E]/5" onClick={() => fileInputRef.current?.click()} disabled={isLoading}>
                  <Paperclip className="h-6 w-6" />
                </Button>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.txt,.doc,.docx,.pdf" multiple onChange={handleFileUpload} />
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={userId ? "输入作文内容或上传图片，按 Enter 发送..." : "请先登录..."}
                  className="min-h-[52px] max-h-[200px] flex-1 resize-none border-0 bg-transparent p-3 text-[16px] text-slate-800 placeholder:text-slate-400 focus-visible:ring-0 leading-relaxed"
                  disabled={isLoading}
                  rows={1}
                />
                <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-xl bg-[#0F766E] text-white shadow-md hover:bg-[#0d655d] transition-all disabled:opacity-50 disabled:cursor-not-allowed" disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}>
                  {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-5 w-5 ml-0.5" />}
                </Button>
              </div>
            </form>
            <p className="mt-4 text-center text-xs font-medium text-slate-400">{userId ? "深度批改 250 积分 / 普通对话 20 积分" : "未登录"}</p>
          </div>
        </div>
      </div>
    </div>
  )
}