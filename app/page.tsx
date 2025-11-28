"use client"

import type React from "react"
import { useState, useRef } from "react"
// 只引入图标库，不引入 button/card 等组件库
import { Upload, FileText, Loader2, Clock, CheckCircle2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
// 引入数据库连接
import { supabase } from "@/lib/supabase"

type Status = "idle" | "uploading" | "processing" | "completed"

export default function Home() {
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])
  const [fileName, setFileName] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString("zh-CN")
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`])
  }

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

              if (data.event === "text_chunk" && data.data?.text) {
                const newText = data.data.text
                fullText += newText
                setResult((prev) => prev + newText)
              } 
              
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

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 flex justify-center items-center gap-2">
            <CheckCircle2 className="text-green-600"/> 作文智能批改引擎
          </h1>
          <p className="text-slate-500">企业级 MoA 架构 • 视觉识别 • 深度批改</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* 左侧区域：上传与展示 (使用原生 div 替代 Card) */}
          <div className="lg:col-span-2 p-8 border border-slate-200 shadow-sm bg-white rounded-xl">
            <div className="space-y-6">
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileUpload} className="hidden" />

              {/* 上传按钮区域 */}
              <div
                onClick={() => status !== 'processing' && fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-10 text-center
                  transition-all cursor-pointer select-none
                  ${status === "idle" || status === "completed" 
                    ? "border-blue-300 bg-blue-50/50 hover:border-blue-500 hover:bg-blue-50" 
                    : "border-slate-200 bg-slate-50 cursor-not-allowed opacity-80"}
                `}
              >
                <div className="flex flex-col items-center gap-4">
                  {status === "processing" || status === "uploading" ? (
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                  ) : (
                    <Upload className="w-12 h-12 text-blue-600" />
                  )}

                  <div>
                    <p className="text-lg font-semibold text-slate-700">
                      {status === "idle" && "点击上传作文图片 / PDF"}
                      {status === "uploading" && "正在上传文件..."}
                      {status === "processing" && "AI 正在深度思考..."}
                      {status === "completed" && "批改完成，可再次上传"}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">{fileName || "支持 JPG, PNG, PDF 格式"}</p>
                  </div>
                </div>
              </div>

              {/* 结果展示区域 (使用原生 div 替代 ScrollArea) */}
              <div className="border rounded-xl p-6 bg-white min-h-[500px] shadow-inner overflow-hidden">
                <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-slate-800">批改结果</h2>
                </div>

                <div className="h-[450px] overflow-y-auto pr-4">
                  {result ? (
                    <article className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:text-slate-800">
                      <ReactMarkdown>{result}</ReactMarkdown>
                    </article>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 mt-20">
                      <FileText className="w-16 h-16 opacity-20" />
                      <p>等待 AI 生成结果...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 右侧日志区域 */}
          <div className="p-0 border border-slate-200 shadow-sm bg-slate-900 text-slate-300 rounded-xl overflow-hidden flex flex-col h-[600px] lg:h-auto">
            <div className="p-4 border-b border-slate-700 bg-slate-950 flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-400" />
              <h2 className="font-mono text-sm font-bold text-slate-100">System Logs</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-3">
                {logs.length === 0 && <p className="opacity-30 italic">Waiting for connection...</p>}
                
                {logs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                    <span className="text-green-500 mt-0.5">➜</span>
                    <span className="break-all">{log}</span>
                  </div>
                ))}
                
                {status === "processing" && (
                  <div className="text-blue-400 animate-pulse pl-4">
                    _ cursor processing...
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
// final fix