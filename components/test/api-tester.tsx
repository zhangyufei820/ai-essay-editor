"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

type TestResult = {
  endpoint: string
  status: "idle" | "testing" | "pass" | "fail"
  message?: string
  duration?: number
}

export function APITester({ onResult }: { onResult: (result: "pass" | "fail") => void }) {
  const [results, setResults] = useState<TestResult[]>([
    { endpoint: "/api/chat", status: "idle" },
    { endpoint: "/api/essay-review", status: "idle" },
    { endpoint: "/api/providers", status: "idle" },
    { endpoint: "/api/web-search", status: "idle" },
    { endpoint: "/api/document-process", status: "idle" },
  ])

  const [testInput, setTestInput] = useState("你好，请介绍一下自己")

  const testEndpoint = async (index: number) => {
    const endpoint = results[index].endpoint
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, status: "testing" } : r)))

    const startTime = Date.now()

    try {
      let response
      if (endpoint === "/api/providers") {
        response = await fetch(endpoint)
      } else if (endpoint === "/api/chat") {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: testInput }],
          }),
        })
      } else if (endpoint === "/api/essay-review") {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            essay: "这是一篇测试作文。",
            grade: "高中",
          }),
        })
      } else {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: testInput }),
        })
      }

      const duration = Date.now() - startTime

      if (response.ok) {
        setResults((prev) =>
          prev.map((r, i) =>
            i === index
              ? {
                  ...r,
                  status: "pass",
                  message: `响应成功 (${response.status})`,
                  duration,
                }
              : r,
          ),
        )
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      const duration = Date.now() - startTime
      setResults((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                status: "fail",
                message: error instanceof Error ? error.message : "请求失败",
                duration,
              }
            : r,
        ),
      )
    }
  }

  const testAll = async () => {
    for (let i = 0; i < results.length; i++) {
      await testEndpoint(i)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const allPassed = results.every((r) => r.status === "pass")
    onResult(allPassed ? "pass" : "fail")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API端点测试</CardTitle>
        <CardDescription>测试所有API端点的可用性和响应时间</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">测试输入</label>
          <Textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="输入测试内容..."
            rows={3}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={testAll}>
            <Play className="mr-2 h-4 w-4" />
            测试所有端点
          </Button>
        </div>

        <div className="space-y-2">
          {results.map((result, index) => (
            <div key={result.endpoint} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                {result.status === "idle" && <div className="h-4 w-4 rounded-full bg-gray-300" />}
                {result.status === "testing" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {result.status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {result.status === "fail" && <XCircle className="h-4 w-4 text-red-500" />}
                <div>
                  <p className="font-mono text-sm">{result.endpoint}</p>
                  {result.message && <p className="text-xs text-muted-foreground">{result.message}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {result.duration && <Badge variant="outline">{result.duration}ms</Badge>}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testEndpoint(index)}
                  disabled={result.status === "testing"}
                >
                  测试
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
