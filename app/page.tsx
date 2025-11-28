"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Upload, FileText, Loader2, Clock, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import ReactMarkdown from "react-markdown"
import { createClient } from "@/lib/supabase/client"

type Status = "idle" | "uploading" | "processing" | "completed"

export default function EssayAnalyzer() {
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<string>("")
  const [logs, setLogs] = useState<string[]>([])
  const [fileName, setFileName] = useState<string>("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saveToSupabase = async (essayResult: string) => {
    try {
      const supabase = createClient()
      if (!supabase) {
        console.warn("[v0] Supabase not configured, skipping save")
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        console.warn("[v0] User not logged in, skipping save")
        return
      }

      const { error } = await supabase.from("essay_reviews").insert({
        user_id: user.id,
        content: essayResult,
        created_at: new Date().toISOString(),
      })

      if (error) {
        console.error("[v0] Error saving to Supabase:", error)
        addLog("保存失败: " + error.message)
      } else {
        addLog("✓ 已保存到数据库")
      }
    } catch (error) {
      console.error("[v0] Error in saveToSupabase:", error)
    }
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString("zh-CN")
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`])
  }

  const handleFileUpload = async (file: File) => {
    console.log("[v0] Starting file upload:", file.name)
    setFileName(file.name)
    setStatus("uploading")
    setResult("")
    setLogs([])
    addLog("开始上传文件: " + file.name)

    try {
      const formData = new FormData()
      formData.append("file", file)

      setStatus("processing")
      addLog("正在处理文件...")

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

      addLog("开始接收批改结果...")

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n").filter((line) => line.trim())

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.event === "text_chunk" && data.text) {
                setResult((prev) => prev + data.text)
              } else if (data.event === "log" && data.message) {
                addLog(data.message)
              } else if (data.event === "workflow_finished") {
                addLog("✓ 批改完成")
                setStatus("completed")
                // Save the final result
                await saveToSupabase(result)
              } else if (data.event === "error") {
                addLog("✗ 错误: " + data.message)
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
        addLog("✓ 处理完成")
      }
    } catch (error) {
      console.error("[v0] Error in handleFileUpload:", error)
      addLog("✗ 错误: " + (error instanceof Error ? error.message : "未知错误"))
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50/30 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-green-800 mb-2">作文智能批改</h1>
          <p className="text-green-600">上传作文图片，获取专业的AI批改建议</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Area */}
          <Card className="lg:col-span-2 p-8 border-2 border-green-100 shadow-lg">
            <div className="space-y-6">
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={onFileChange} className="hidden" />

              {/* Upload Button */}
              <div
                onClick={triggerFileInput}
                className={`
                  border-2 border-dashed rounded-lg p-12 text-center
                  transition-all cursor-pointer
                  ${status === "idle" ? "border-green-300 bg-green-50/50 hover:border-green-400 hover:bg-green-50" : "border-gray-300 bg-gray-50"}
                `}
              >
                <div className="flex flex-col items-center gap-4">
                  {status === "processing" ? (
                    <Loader2 className="w-16 h-16 text-green-600 animate-spin" />
                  ) : (
                    <Upload className="w-16 h-16 text-green-600" />
                  )}

                  <div>
                    <p className="text-lg font-semibold text-green-800 mb-1">
                      {status === "idle" && "点击上传作文图片"}
                      {status === "uploading" && "正在上传..."}
                      {status === "processing" && "正在批改中..."}
                      {status === "completed" && "批改完成！"}
                    </p>
                    <p className="text-sm text-green-600">{fileName || "支持 JPG、PNG、PDF 格式"}</p>
                  </div>

                  {status === "idle" && <Button className="bg-green-600 hover:bg-green-700">选择文件</Button>}
                </div>
              </div>

              {/* Result Area */}
              <div className="border rounded-lg p-6 bg-white min-h-[400px]">
                <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                  <FileText className="w-5 h-5 text-green-600" />
                  <h2 className="text-lg font-semibold text-green-800">批改结果</h2>
                </div>

                <ScrollArea className="h-[500px] pr-4">
                  {result ? (
                    <ReactMarkdown className="prose prose-green max-w-none">{result}</ReactMarkdown>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <div className="text-center">
                        <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>
                          {status === "processing" ? (
                            <span className="flex items-center gap-2">
                              等待结果中
                              <span className="animate-pulse">...</span>
                            </span>
                          ) : (
                            "上传文件后，批改结果将显示在此处"
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </Card>

          {/* Log Sidebar */}
          <Card className="p-6 border-2 border-green-100 shadow-lg">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b">
              <Clock className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-green-800">处理日志</h2>
            </div>

            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {logs.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">暂无日志</p>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="text-xs font-mono bg-green-50 p-2 rounded border border-green-100">
                      {log}
                    </div>
                  ))
                )}

                {status === "completed" && (
                  <div className="flex items-center gap-2 mt-4 p-3 bg-green-100 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-800">所有任务已完成</span>
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  )
}
