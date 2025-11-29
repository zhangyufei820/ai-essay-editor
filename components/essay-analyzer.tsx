"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Upload, FileText, Loader2, Clock, CheckCircle2, ArrowRight } from "lucide-react"
import ReactMarkdown from "react-markdown"

type Status = "idle" | "uploading" | "processing" | "completed"

export default function EssayAnalyzer() {
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])
  const [fileName, setFileName] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const scrollLogsToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const saveToSupabase = async (essayResult: string) => {
    try {
      const { supabase } = await import("@/lib/supabase")
      if (!supabase) {
        console.warn("[v0] Supabase not configured, skipping save")
        return
      }

      const { error } = await supabase.from("submissions").insert({
        original_text: `File: ${fileName}`,
        ai_result: essayResult,
        status: "completed",
      })

      if (error) {
        console.error("[v0] Error saving to Supabase:", error)
        addLog("保存失败: " + error.message, "error")
      } else {
        addLog("已保存到数据库", "success")
      }
    } catch (error) {
      console.error("[v0] Error in saveToSupabase:", error)
    }
  }

  const addLog = (message: string, type: "info" | "success" | "error" = "info") => {
    const timestamp = new Date().toLocaleTimeString("zh-CN")
    const prefix = type === "success" ? "✓" : type === "error" ? "✗" : "➜"
    setLogs((prev) => [...prev, `${prefix} [${timestamp}] ${message}`])
    setTimeout(scrollLogsToBottom, 100)
  }

  const handleFileUpload = async (file: File) => {
    console.log("[v0] Starting file upload:", file.name)
    setFileName(file.name)
    setStatus("uploading")
    setResult("")
    setLogs([])
    addLog(`开始上传文件: ${file.name}`)

    try {
      const formData = new FormData()
      formData.append("file", file)

      addLog("文件上传完成", "success")
      setStatus("processing")
      addLog("正在连接AI批改引擎...")

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error("No response body")
      }

      addLog("开始接收批改结果...", "success")

      let accumulatedResult = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n").filter((line) => line.trim())

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.event === "text_chunk") {
                const newText = data.data?.text || ""
                if (newText) {
                  accumulatedResult += newText
                  setResult(accumulatedResult)
                  addLog(`收到批改内容 (${accumulatedResult.length} 字符)`)
                }
              } else if (data.event === "workflow_finished") {
                addLog("批改完成", "success")
                setStatus("completed")
                await saveToSupabase(accumulatedResult)
              } else if (data.event === "error") {
                addLog(`错误: ${data.message}`, "error")
                throw new Error(data.message)
              }
            } catch (e) {
              console.error("[v0] Error parsing chunk:", e)
            }
          }
        }
      }

      if (status !== "completed") {
        setStatus("completed")
        addLog("所有任务已完成", "success")
      }
    } catch (error) {
      console.error("[v0] Error in handleFileUpload:", error)
      addLog(`错误: ${error instanceof Error ? error.message : "未知错误"}`, "error")
      setStatus("idle")
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-2">AI 作文智能批改</h1>
          <p className="text-slate-600">上传作文图片或文档，获取专业的AI批改建议</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel - Upload & Result (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Upload Area - Using native div with Tailwind */}
            <div className="bg-white rounded-xl border-2 border-slate-200 shadow-lg p-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={onFileChange}
                className="hidden"
              />

              <div
                onClick={status === "idle" ? triggerFileInput : undefined}
                className={`
                  border-2 border-dashed rounded-xl p-12 text-center
                  transition-all duration-200
                  ${
                    status === "idle"
                      ? "border-blue-300 bg-blue-50/50 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                      : "border-slate-300 bg-slate-50 cursor-not-allowed"
                  }
                `}
              >
                <div className="flex flex-col items-center gap-4">
                  {status === "processing" ? (
                    <div className="relative">
                      <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
                      <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
                    </div>
                  ) : status === "completed" ? (
                    <CheckCircle2 className="w-16 h-16 text-emerald-600" />
                  ) : (
                    <Upload className="w-16 h-16 text-blue-600" />
                  )}

                  <div>
                    <p className="text-lg font-semibold text-slate-800 mb-1">
                      {status === "idle" && "点击上传作文文件"}
                      {status === "uploading" && "正在上传文件..."}
                      {status === "processing" && "AI批改进行中..."}
                      {status === "completed" && "批改完成！"}
                    </p>
                    <p className="text-sm text-slate-600">{fileName || "支持 JPG、PNG、PDF、Word 格式"}</p>
                  </div>

                  {status === "idle" && (
                    <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm">
                      选择文件
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Result Area - Using native div scrollable area */}
            <div className="bg-white rounded-xl border-2 border-slate-200 shadow-lg p-6">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-200">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-800">批改结果</h2>
              </div>

              <div className="max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
                {result ? (
                  <div className="prose prose-slate max-w-none">
                    <ReactMarkdown>{result}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex items-center justify-center min-h-[400px] text-slate-400">
                    <div className="text-center">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">
                        {status === "processing" ? (
                          <span className="flex items-center justify-center gap-2">
                            等待AI批改结果
                            <span className="inline-flex gap-1">
                              <span
                                className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"
                                style={{ animationDelay: "0ms" }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"
                                style={{ animationDelay: "150ms" }}
                              />
                              <span
                                className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"
                                style={{ animationDelay: "300ms" }}
                              />
                            </span>
                          </span>
                        ) : (
                          "上传文件后，批改结果将显示在此处"
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Log Console (lg:col-span-4) */}
          <div className="lg:col-span-4">
            <div className="bg-slate-900 rounded-xl border-2 border-slate-700 shadow-lg p-6 h-full">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-700">
                <Clock className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">系统日志</h2>
              </div>

              {/* Terminal-style log console */}
              <div className="h-[calc(100vh-280px)] min-h-[400px] overflow-y-auto font-mono text-xs space-y-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800">
                {logs.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <p className="text-slate-500 text-center">等待操作...</p>
                  </div>
                ) : (
                  <>
                    {logs.map((log, index) => {
                      const isSuccess = log.startsWith("✓")
                      const isError = log.startsWith("✗")
                      const color = isSuccess ? "text-emerald-400" : isError ? "text-red-400" : "text-slate-300"

                      return (
                        <div
                          key={index}
                          className={`flex items-start gap-2 ${color} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                        >
                          <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                          <span className="break-all">{log}</span>
                        </div>
                      )
                    })}
                    <div ref={logsEndRef} />
                  </>
                )}

                {status === "completed" && (
                  <div className="mt-4 flex items-center gap-2 p-3 bg-emerald-900/30 border border-emerald-700 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span className="text-sm font-medium text-emerald-300">所有任务已完成</span>
                  </div>
                )}

                {status === "processing" && (
                  <div className="mt-4 flex items-center gap-2 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                    <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                    <span className="text-sm font-medium text-blue-300">正在处理中...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
