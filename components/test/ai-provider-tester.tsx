"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Play, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"

type ProviderTest = {
  id: string
  name: string
  status: "idle" | "testing" | "pass" | "fail"
  response?: string
  duration?: number
}

export function AIProviderTester({ onResult }: { onResult: (result: "pass" | "fail") => void }) {
  const [providers, setProviders] = useState<ProviderTest[]>([
    { id: "openai", name: "OpenAI GPT-5", status: "idle" },
    { id: "anthropic", name: "Claude Sonnet 4.5", status: "idle" },
    { id: "xai", name: "Grok 4", status: "idle" },
    { id: "google", name: "Gemini 2.5 Flash", status: "idle" },
    { id: "fireworks", name: "Llama 4 70B", status: "idle" },
  ])

  const [testPrompt, setTestPrompt] = useState("用一句话介绍你自己")

  const testProvider = async (index: number) => {
    const provider = providers[index]
    setProviders((prev) => prev.map((p, i) => (i === index ? { ...p, status: "testing" } : p)))

    const startTime = Date.now()

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Provider": provider.id,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: testPrompt }],
        }),
      })

      const duration = Date.now() - startTime

      if (response.ok) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let text = ""

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            text += decoder.decode(value)
          }
        }

        setProviders((prev) =>
          prev.map((p, i) =>
            i === index
              ? {
                  ...p,
                  status: "pass",
                  response: text.substring(0, 100) + "...",
                  duration,
                }
              : p,
          ),
        )
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      const duration = Date.now() - startTime
      setProviders((prev) =>
        prev.map((p, i) =>
          i === index
            ? {
                ...p,
                status: "fail",
                response: error instanceof Error ? error.message : "请求失败",
                duration,
              }
            : p,
        ),
      )
    }
  }

  const testAll = async () => {
    for (let i = 0; i < providers.length; i++) {
      await testProvider(i)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    const allPassed = providers.every((p) => p.status === "pass")
    onResult(allPassed ? "pass" : "fail")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI提供商测试</CardTitle>
        <CardDescription>测试所有AI提供商的响应速度和质量</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">测试提示词</label>
          <Textarea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="输入测试提示词..."
            rows={2}
          />
        </div>

        <div className="flex gap-2">
          <Button onClick={testAll}>
            <Play className="mr-2 h-4 w-4" />
            测试所有提供商
          </Button>
        </div>

        <div className="space-y-2">
          {providers.map((provider, index) => (
            <div key={provider.id} className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {provider.status === "idle" && <div className="h-4 w-4 rounded-full bg-gray-300" />}
                  {provider.status === "testing" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                  {provider.status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {provider.status === "fail" && <XCircle className="h-4 w-4 text-red-500" />}
                  <h3 className="font-medium">{provider.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {provider.duration && <Badge variant="outline">{provider.duration}ms</Badge>}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testProvider(index)}
                    disabled={provider.status === "testing"}
                  >
                    测试
                  </Button>
                </div>
              </div>
              {provider.response && <p className="text-sm text-muted-foreground pl-7">{provider.response}</p>}
            </div>
          ))}
        </div>

        <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg space-y-2">
          <h4 className="font-medium text-sm">测试说明</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>所有AI提供商通过Vercel AI Gateway自动路由</li>
            <li>无需配置API密钥即可测试</li>
            <li>响应时间包含网络延迟和模型推理时间</li>
            <li>可以对比不同提供商的响应质量</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
