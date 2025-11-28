"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
// 引入图标
import { Upload, Loader2, CheckCircle2, Terminal, Sparkles } from "lucide-react"
// 引入 Supabase
import { supabase } from "@/lib/supabase"
// 引入我们做好的“装修组件” (确保路径正确)
import ReportRenderer from "@/components/ReportRenderer"

type Status = "idle" | "uploading" | "processing" | "completed"

export default function Home() {
  // --- 1. 状态管理 ---
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])
  const [fileName, setFileName] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 用于自动滚动终端日志
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs, result])

  // --- 2. 核心逻辑功能 (保持不变) ---

  // 保存到 Supabase
  const saveToSupabase = async (file_name: string, essayResult: string) => {
    addLog("💾 正在归档至 Supabase...")
    try {
      const { error } = await supabase.from("submissions").insert({
        original_text: `File: ${file_name}`,
        ai_result: essayResult,
        status: "completed",
      })

      if (error) {
        console.error("Supabase Error:", error)
        addLog("⚠ 保存失败: " + error.message)
      } else {
        addLog("✅ 数据已永久保存")
      }
    } catch (error: any) {
      console.error("Save Error:", error)
      addLog("⚠ 保存出错: " + error.message)
    }
  }

  // 添加日志
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString("zh-CN")
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`])
  }

  // 处理上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setStatus("uploading")
    setResult("")
    setLogs([])
    addLog("🚀 开始上传文件: " + file.name)

    try {
      const formData = new FormData()
      formData.append("file", file)

      setStatus("processing")
      addLog("🧠 AI 正在视觉识别与分析...")

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      if (!response.body) throw new Error("No response body")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      addLog("⚡ 开始接收流式批改结果...")

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonStr = line.slice(6)
              if (!jsonStr || jsonStr === "[DONE]") continue 
              
              const data = JSON.parse(jsonStr)

              // 拼接文本
              if (data.event === "text_chunk" && data.data?.text) {
                const newText = data.data.text
                fullText += newText
                setResult((prev) => prev + newText)
              } 
              
              // 监听完成
              if (data.event === "workflow_finished") {
                setStatus("completed")
                addLog("🏁 工作流执行完毕")
                await saveToSupabase(file.name, fullText)
              }
            } catch (e) {}
          }
        }
      }

    } catch (error: any) {
      console.error("Upload Error:", error)
      addLog("❌ 错误: " + error.message)
      setStatus("idle")
    }
  }

  // --- 3. 极致 UI 渲染 ---
  return (
    <div className="min-h-screen bg-[#f8f9fa] p-4 md:p-8 font-sans text-slate-800">
      <div className="mx-auto max-w-5xl space-y-12">
        
        {/* === 头部标题 === */}
        <div className="text-center pt-8">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-3 flex justify-center items-center gap-3">
            <Sparkles className="text-yellow-500 w-8 h-8" />
            <span>作文智能批改引擎</span>
          </h1>
          <p className="text-slate-500 text-lg">MoA 混合智能体架构 · 企业级深度诊断</p>
        </div>

        {/* === 上传区域 === */}
        <div className="max-w-xl mx-auto">
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="hidden" />
          
          <div
            onClick={() => status !== 'processing' && fileInputRef.current?.click()}
            className={`
              group relative overflow-hidden rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300
              ${status === "idle" || status === "completed" 
                ? "border-slate-300 bg-white hover:border-blue-500 hover:shadow-lg cursor-pointer" 
                : "border-slate-200 bg-slate-50 cursor-not-allowed opacity-80"}
            `}
          >
            <div className="relative z-10 flex flex-col items-center gap-4">
              {status === "processing" || status === "uploading" ? (
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
              ) : (
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
              )}

              <div>
                <p className="text-xl font-bold text-slate-700">
                  {status === "idle" && "点击上传作文图片"}
                  {status === "uploading" && "正在上传文件..."}
                  {status === "processing" && "AI 正在深度思考..."}
                  {status === "completed" && "批改完成，点击上传新图片"}
                </p>
                <p className="text-sm text-slate-400 mt-2">{fileName || "支持 JPG, PNG, PDF 格式"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* === 双视窗结果展示区 (核心升级) === */}
        {(status === "processing" || status === "completed" || result) && (
          <div className="animate-in fade-in slide-in-from-bottom-10 duration-1000 space-y-12 pb-20">
            
            {/* 🖥️ 视窗 A: 极客终端 (显示日志 + 原始数据流) */}
            <div className="rounded-xl overflow-hidden bg-[#1e1e1e] border border-gray-800 shadow-2xl mx-auto max-w-4xl">
              {/* 终端头部 */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-black/40">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div> {/* Mac 红 */}
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div> {/* Mac 黄 */}
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div> {/* Mac 绿 */}
                </div>
                <div className="text-xs font-mono text-gray-500 flex items-center gap-2">
                  <Terminal className="w-3 h-3" />
                  <span>AI_KERNEL_DEBUG_CONSOLE</span>
                </div>
                <div className="w-10"></div> {/* 占位平衡 */}
              </div>

              {/* 终端内容 */}
              <div className="p-6 font-mono text-xs md:text-sm text-green-400/90 leading-relaxed h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent bg-[#1e1e1e]">
                {/* 1. 系统日志区域 */}
                <div className="mb-4 text-gray-500 border-b border-gray-800 pb-2">
                   {logs.map((log, i) => (
                     <div key={i} className="mb-1">{log}</div>
                   ))}
                </div>
                
                {/* 2. 实时流文字区域 */}
                <div className="whitespace-pre-wrap">
                  <span className="text-blue-400 mr-2">root@ai-engine:~$</span>
                  {result}
                  <span className="inline-block w-2 h-4 bg-green-500 ml-1 animate-pulse align-middle"></span>
                </div>
                {/* 锚点用于自动滚动 */}
                <div ref={terminalEndRef}></div>
              </div>
            </div>

            {/* 📜 视窗 B: 极致纸质报告 (通过连接线挂在终端下面) */}
            <div className="relative">
              {/* 装饰：连接线 */}
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-px h-12 bg-gradient-to-b from-gray-800 to-transparent border-l border-dashed border-gray-400/50"></div>
              
              {/* 如果有结果，渲染高级报告组件 */}
              {result && <ReportRenderer content={result} />}
            </div>

          </div>
        )}
        
      </div>
    </div>
  )
}