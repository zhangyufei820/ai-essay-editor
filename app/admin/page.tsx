"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Users, CreditCard, BarChart3, Lock, Eye, EyeOff, RefreshCw } from "lucide-react"

// 硬编码管理员密码
const ADMIN_PASSWORD = "admin2026"

interface UserStats {
  totalUsers: number
  memberUsers: number
  freeUsers: number
}

interface Transaction {
  id: string
  userId: string
  amount: number
  type: string
  createdAt: string
}

interface DailyStats {
  newUsers: number
  activeUsers: number
  creditsUsed: number
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [activeTab, setActiveTab] = useState("users")
  const [loading, setLoading] = useState(false)
  
  // 统计数据
  const [userStats, setUserStats] = useState<UserStats>({
    totalUsers: 1256,
    memberUsers: 342,
    freeUsers: 914
  })
  
  const [transactions, setTransactions] = useState<Transaction[]>([])
  
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    newUsers: 45,
    activeUsers: 312,
    creditsUsed: 8450
  })

  // 模拟获取订单数据
  const fetchOrders = async () => {
    setLoading(true)
    // 模拟API延迟
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 模拟订单数据
    const mockOrders: Transaction[] = [
      {
        id: "ORD-001",
        userId: "user-123",
        amount: 68,
        type: "专业版订阅",
        createdAt: "2026-04-17 14:30:00"
      },
      {
        id: "ORD-002",
        userId: "user-456",
        amount: 128,
        type: "豪华版订阅",
        createdAt: "2026-04-17 13:15:00"
      },
      {
        id: "ORD-003",
        userId: "user-789",
        amount: 90,
        type: "10000积分包",
        createdAt: "2026-04-17 11:45:00"
      },
      {
        id: "ORD-004",
        userId: "user-101",
        amount: 28,
        type: "基础版订阅",
        createdAt: "2026-04-17 10:20:00"
      },
      {
        id: "ORD-005",
        userId: "user-202",
        amount: 48,
        type: "5000积分包",
        createdAt: "2026-04-17 09:05:00"
      }
    ]
    
    setTransactions(mockOrders)
    setLoading(false)
  }

  // 模拟刷新统计数据
  const refreshStats = async () => {
    setLoading(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 模拟数据变化
    setUserStats(prev => ({
      totalUsers: prev.totalUsers + Math.floor(Math.random() * 5),
      memberUsers: prev.memberUsers + Math.floor(Math.random() * 3),
      freeUsers: prev.freeUsers + Math.floor(Math.random() * 2)
    }))
    
    setDailyStats(prev => ({
      newUsers: Math.floor(Math.random() * 50) + 20,
      activeUsers: Math.floor(Math.random() * 200) + 250,
      creditsUsed: Math.floor(Math.random() * 5000) + 5000
    }))
    
    setLoading(false)
  }

  // 处理登录
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      fetchOrders()
    } else {
      alert("密码错误")
    }
  }

  // 如果未认证，显示登录界面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center flex items-center justify-center gap-2">
              <Lock className="w-6 h-6" />
              管理员登录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  管理员密码
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="请输入管理员密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full">
                登录
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 管理员界面
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">管理后台</h1>
            <p className="text-gray-600 mt-1">AI作文编辑器管理系统</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={refreshStats}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新数据
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsAuthenticated(false)}
            >
              退出登录
            </Button>
          </div>
        </div>

        {/* 快速统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">总用户数</p>
                  <p className="text-3xl font-bold">{userStats.totalUsers.toLocaleString()}</p>
                </div>
                <Users className="w-10 h-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">会员用户</p>
                  <p className="text-3xl font-bold text-green-600">{userStats.memberUsers.toLocaleString()}</p>
                </div>
                <CreditCard className="w-10 h-10 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">免费用户</p>
                  <p className="text-3xl font-bold text-gray-600">{userStats.freeUsers.toLocaleString()}</p>
                </div>
                <Users className="w-10 h-10 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 主要内容区域 - Tab导航 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              用户统计
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              订单记录
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              用量概览
            </TabsTrigger>
          </TabsList>

          {/* 用户统计 Tab */}
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>用户统计详情</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-blue-50 rounded-xl">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">总注册用户</h3>
                    <p className="text-4xl font-bold text-blue-600">{userStats.totalUsers.toLocaleString()}</p>
                    <p className="text-sm text-blue-600 mt-2">累计注册用户数</p>
                  </div>
                  
                  <div className="p-6 bg-green-50 rounded-xl">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">会员用户</h3>
                    <p className="text-4xl font-bold text-green-600">{userStats.memberUsers.toLocaleString()}</p>
                    <p className="text-sm text-green-600 mt-2">付费会员用户数</p>
                  </div>
                  
                  <div className="p-6 bg-gray-50 rounded-xl">
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">免费用户</h3>
                    <p className="text-4xl font-bold text-gray-600">{userStats.freeUsers.toLocaleString()}</p>
                    <p className="text-sm text-gray-600 mt-2">未付费用户数</p>
                  </div>
                </div>
                
                <div className="mt-8 p-6 border rounded-xl">
                  <h3 className="text-lg font-semibold mb-4">用户转化率</h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-green-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${((userStats.memberUsers / userStats.totalUsers) * 100).toFixed(1)}%` }}
                      />
                    </div>
                    <span className="font-bold text-green-600">
                      {((userStats.memberUsers / userStats.totalUsers) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    会员转化率（会员用户 / 总用户）
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 订单记录 Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>最近订单记录</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-600">加载中...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4">订单号</th>
                          <th className="text-left py-3 px-4">用户ID</th>
                          <th className="text-left py-3 px-4">金额</th>
                          <th className="text-left py-3 px-4">类型</th>
                          <th className="text-left py-3 px-4">时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((order) => (
                          <tr key={order.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 font-mono text-sm">{order.id}</td>
                            <td className="py-3 px-4 font-mono text-sm">{order.userId}</td>
                            <td className="py-3 px-4 font-semibold text-green-600">¥{order.amount}</td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                                {order.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-gray-600 text-sm">{order.createdAt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                <div className="mt-6 flex justify-between items-center">
                  <p className="text-sm text-gray-600">
                    显示最近 5 条订单
                  </p>
                  <Button variant="outline" size="sm">
                    查看更多订单
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 用量概览 Tab */}
          <TabsContent value="stats">
            <Card>
              <CardHeader>
                <CardTitle>今日数据概览</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-blue-800">今日新增用户</h3>
                      <Users className="w-6 h-6 text-blue-500" />
                    </div>
                    <p className="text-4xl font-bold text-blue-600">{dailyStats.newUsers}</p>
                    <p className="text-sm text-blue-600 mt-2">较昨日增长 12%</p>
                  </div>
                  
                  <div className="p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-green-800">今日活跃用户</h3>
                      <BarChart3 className="w-6 h-6 text-green-500" />
                    </div>
                    <p className="text-4xl font-bold text-green-600">{dailyStats.activeUsers}</p>
                    <p className="text-sm text-green-600 mt-2">占总用户 24.8%</p>
                  </div>
                  
                  <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-purple-800">今日积分消耗</h3>
                      <CreditCard className="w-6 h-6 text-purple-500" />
                    </div>
                    <p className="text-4xl font-bold text-purple-600">{dailyStats.creditsUsed.toLocaleString()}</p>
                    <p className="text-sm text-purple-600 mt-2">平均每人消耗 27 积分</p>
                  </div>
                </div>
                
                <div className="mt-8 p-6 border rounded-xl">
                  <h3 className="text-lg font-semibold mb-4">本周趋势</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-gray-600">用户增长</span>
                        <span className="text-sm font-semibold text-green-600">+12%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{ width: "72%" }} />
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-gray-600">积分消耗</span>
                        <span className="text-sm font-semibold text-blue-600">+8%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: "65%" }} />
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-gray-600">付费转化</span>
                        <span className="text-sm font-semibold text-purple-600">+5%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full" style={{ width: "48%" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}