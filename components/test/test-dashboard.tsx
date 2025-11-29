"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle2, XCircle, Clock } from "lucide-react"
import { APITester } from "./api-tester"
import { AuthTester } from "./auth-tester"
import { PaymentTester } from "./payment-tester"
import { AIProviderTester } from "./ai-provider-tester"

export function TestDashboard() {
  const [testResults, setTestResults] = useState<Record<string, "pass" | "fail" | "pending">>({})

  const testCategories = [
    {
      id: "api",
      name: "API测试",
      description: "测试所有API端点的可用性",
      status: testResults.api || "pending",
    },
    {
      id: "auth",
      name: "认证测试",
      description: "测试登录、注册、微信登录等功能",
      status: testResults.auth || "pending",
    },
    {
      id: "payment",
      name: "支付测试",
      description: "测试支付宝、微信支付、Stripe集成",
      status: testResults.payment || "pending",
    },
    {
      id: "ai",
      name: "AI提供商测试",
      description: "测试8个AI提供商的响应",
      status: testResults.ai || "pending",
    },
  ]

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">功能测试中心</h1>
        <p className="text-muted-foreground">测试网站的所有核心功能，确保系统正常运行</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {testCategories.map((category) => (
          <Card key={category.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{category.name}</CardTitle>
                {category.status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {category.status === "fail" && <XCircle className="h-4 w-4 text-red-500" />}
                {category.status === "pending" && <Clock className="h-4 w-4 text-yellow-500" />}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{category.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="api" className="space-y-4">
        <TabsList>
          <TabsTrigger value="api">API测试</TabsTrigger>
          <TabsTrigger value="auth">认证测试</TabsTrigger>
          <TabsTrigger value="payment">支付测试</TabsTrigger>
          <TabsTrigger value="ai">AI测试</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="space-y-4">
          <APITester onResult={(result) => setTestResults((prev) => ({ ...prev, api: result }))} />
        </TabsContent>

        <TabsContent value="auth" className="space-y-4">
          <AuthTester onResult={(result) => setTestResults((prev) => ({ ...prev, auth: result }))} />
        </TabsContent>

        <TabsContent value="payment" className="space-y-4">
          <PaymentTester onResult={(result) => setTestResults((prev) => ({ ...prev, payment: result }))} />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AIProviderTester onResult={(result) => setTestResults((prev) => ({ ...prev, ai: result }))} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
