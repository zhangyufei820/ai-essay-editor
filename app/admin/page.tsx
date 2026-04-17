"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Users, CreditCard, BarChart3, Lock, Eye, EyeOff, RefreshCw, Search, DollarSign, TrendingUp, UserCheck, Activity } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"

interface StatsData {
  totalUsers: number
  memberUsers: number
  todayNewUsers: number
  todayActiveUsers: number
  totalRevenue: number
  todayRevenue: number
}

interface UserData {
  user_id: string
  credits: number
  is_pro: boolean
  membership_status: string
  created_at: string
  lastActiveAt: string
  transactionCount: number
}

interface OrderData {
  id: string
  order_no: string
  user_id: string
  product_name: string
  amount: number
  credits: number
  status: string
  created_at: string
  paid_at: string
}

interface UserDetails {
  user: {
    user_id: string
    credits: number
    is_pro: boolean
    membership_status: string
    created_at: string
    updated_at: string
  }
  transactions: Array<{
    id: string
    amount: number
    type: string
    description: string
    created_at: string
  }>
  orders: OrderData[]
  stats: {
    totalTransactions: number
    totalOrders: number
    totalSpent: number
  }
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  
  // 数据状态
  const [stats, setStats] = useState<StatsData>({
    totalUsers: 0,
    memberUsers: 0,
    todayNewUsers: 0,
    todayActiveUsers: 0,
    totalRevenue: 0,
    todayRevenue: 0
  })
  
  const [users, setUsers] = useState<UserData[]>([])
  const [orders, setOrders] = useState<OrderData[]>([])
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null)
  const [userDetailsOpen, setUserDetailsOpen] = useState(false)
  
  // 检查本地存储的 token 是否有效
  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      // 验证 token
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setIsAuthenticated(true)
          fetchAllData()
        } else {
          // Token 无效，清除本地存储
          localStorage.removeItem('admin_token')
        }
      })
      .catch(() => {
        localStorage.removeItem('admin_token')
      })
    }
  }, [])
  
  // 获取所有数据
  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchStats(),
        fetchUsers(),
        fetchOrders()
      ])
    } catch (error) {
      console.error('获取数据失败:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // 获取统计数据
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setStats(data.data)
      }
    } catch (error) {
      console.error('获取统计数据失败:', error)
    }
  }
  
  // 获取用户列表
  const fetchUsers = async (search?: string) => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      
      const url = new URL('/api/admin/users', window.location.origin)
      if (search) {
        url.searchParams.set('search', search)
      }
      
      const response = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setUsers(data.data)
      }
    } catch (error) {
      console.error('获取用户列表失败:', error)
    }
  }
  
  // 获取订单列表
  const fetchOrders = async () => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      
      const response = await fetch('/api/admin/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setOrders(data.data)
      }
    } catch (error) {
      console.error('获取订单列表失败:', error)
    }
  }
  
  // 获取用户详情
  const fetchUserDetails = async (userId: string) => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      
      const response = await fetch(`/api/admin/user-details?userId=${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setUserDetails(data.data)
        setUserDetailsOpen(true)
      }
    } catch (error) {
      console.error('获取用户详情失败:', error)
    }
  }
  
  // 搜索用户
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchUsers(searchQuery)
  }
  
  // 处理登录
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const data = await response.json()
      
      if (data.success && data.token) {
        localStorage.setItem('admin_token', data.token)
        setIsAuthenticated(true)
        fetchAllData()
      } else {
        alert(data.error || '密码错误')
      }
    } catch (error) {
      console.error('登录失败:', error)
      alert('网络错误，请重试')
    }
  }
  
  // 格式化日期
  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('zh-CN')
  }
  
  // 格式化金额
  const formatAmount = (amount: number) => {
    return `¥${amount.toLocaleString()}`
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
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">管理后台</h1>
            <p className="text-gray-600 mt-1">AI作文编辑器管理系统</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={fetchAllData}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新数据
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.removeItem('admin_token')
                setIsAuthenticated(false)
              }}
            >
              退出登录
            </Button>
          </div>
        </div>

        {/* 主要内容区域 - Tab导航 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              概览
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              用户管理
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              订单记录
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              数据分析
            </TabsTrigger>
          </TabsList>

          {/* 概览 Tab */}
          <TabsContent value="overview">
            <div className="space-y-6">
              {/* 顶部统计卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">总用户数</p>
                        <p className="text-3xl font-bold">{stats.totalUsers.toLocaleString()}</p>
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
                        <p className="text-3xl font-bold text-green-600">{stats.memberUsers.toLocaleString()}</p>
                      </div>
                      <UserCheck className="w-10 h-10 text-green-500" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">总营收</p>
                        <p className="text-3xl font-bold text-purple-600">{formatAmount(stats.totalRevenue)}</p>
                      </div>
                      <DollarSign className="w-10 h-10 text-purple-500" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">今日新增</p>
                        <p className="text-3xl font-bold text-orange-600">{stats.todayNewUsers}</p>
                      </div>
                      <Activity className="w-10 h-10 text-orange-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* 每日数据卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">今日数据</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">新增用户</span>
                      <span className="font-bold text-lg">{stats.todayNewUsers}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">活跃用户</span>
                      <span className="font-bold text-lg">{stats.todayActiveUsers}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">今日营收</span>
                      <span className="font-bold text-lg text-green-600">{formatAmount(stats.todayRevenue)}</span>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">用户转化</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-gray-600">会员转化率</span>
                        <span className="text-sm font-semibold text-green-600">
                          {stats.totalUsers > 0 
                            ? ((stats.memberUsers / stats.totalUsers) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-green-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${stats.totalUsers > 0 ? (stats.memberUsers / stats.totalUsers) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-gray-600">用户活跃度</span>
                        <span className="text-sm font-semibold text-blue-600">
                          {stats.totalUsers > 0 
                            ? ((stats.todayActiveUsers / stats.totalUsers) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${stats.totalUsers > 0 ? (stats.todayActiveUsers / stats.totalUsers) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">快速链接</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => setActiveTab("users")}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      管理用户
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => setActiveTab("orders")}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      查看订单
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => setActiveTab("stats")}
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      数据分析
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* 用户管理 Tab */}
          <TabsContent value="users">
            <div className="space-y-6">
              {/* 搜索框 */}
              <Card>
                <CardContent className="pt-6">
                  <form onSubmit={handleSearch} className="flex gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="搜索用户ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Button type="submit">搜索</Button>
                    {searchQuery && (
                      <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => {
                          setSearchQuery("")
                          fetchUsers()
                        }}
                      >
                        清除
                      </Button>
                    )}
                  </form>
                </CardContent>
              </Card>
              
              {/* 用户列表 */}
              <Card>
                <CardHeader>
                  <CardTitle>用户列表</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4">用户ID</th>
                          <th className="text-left py-3 px-4">积分</th>
                          <th className="text-left py-3 px-4">会员状态</th>
                          <th className="text-left py-3 px-4">注册时间</th>
                          <th className="text-left py-3 px-4">最后活跃</th>
                          <th className="text-left py-3 px-4">交易次数</th>
                          <th className="text-left py-3 px-4">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.user_id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 font-mono text-sm">{user.user_id.slice(0, 8)}...</td>
                            <td className="py-3 px-4 font-semibold">{user.credits}</td>
                            <td className="py-3 px-4">
                              <Badge variant={user.is_pro ? "default" : "secondary"}>
                                {user.is_pro ? "会员" : "免费"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-gray-600 text-sm">{formatDate(user.created_at)}</td>
                            <td className="py-3 px-4 text-gray-600 text-sm">{formatDate(user.lastActiveAt)}</td>
                            <td className="py-3 px-4">{user.transactionCount}</td>
                            <td className="py-3 px-4">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => fetchUserDetails(user.user_id)}
                              >
                                查看详情
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {users.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      暂无用户数据
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 订单记录 Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>订单记录</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">订单号</th>
                        <th className="text-left py-3 px-4">用户ID</th>
                        <th className="text-left py-3 px-4">产品</th>
                        <th className="text-left py-3 px-4">金额</th>
                        <th className="text-left py-3 px-4">积分</th>
                        <th className="text-left py-3 px-4">状态</th>
                        <th className="text-left py-3 px-4">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 font-mono text-sm">{order.order_no}</td>
                          <td className="py-3 px-4 font-mono text-sm">{order.user_id.slice(0, 8)}...</td>
                          <td className="py-3 px-4">{order.product_name}</td>
                          <td className="py-3 px-4 font-semibold text-green-600">{formatAmount(order.amount)}</td>
                          <td className="py-3 px-4">{order.credits}</td>
                          <td className="py-3 px-4">
                            <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                              {order.status === 'paid' ? '已支付' : order.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-sm">{formatDate(order.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {orders.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    暂无订单数据
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 数据分析 Tab */}
          <TabsContent value="stats">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>营收分析</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
                      <div>
                        <p className="text-sm text-green-800">总营收</p>
                        <p className="text-2xl font-bold text-green-600">{formatAmount(stats.totalRevenue)}</p>
                      </div>
                      <DollarSign className="w-8 h-8 text-green-500" />
                    </div>
                    <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                      <div>
                        <p className="text-sm text-blue-800">今日营收</p>
                        <p className="text-2xl font-bold text-blue-600">{formatAmount(stats.todayRevenue)}</p>
                      </div>
                      <Activity className="w-8 h-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>用户增长</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center p-4 bg-purple-50 rounded-lg">
                      <div>
                        <p className="text-sm text-purple-800">总用户</p>
                        <p className="text-2xl font-bold text-purple-600">{stats.totalUsers}</p>
                      </div>
                      <Users className="w-8 h-8 text-purple-500" />
                    </div>
                    <div className="flex justify-between items-center p-4 bg-orange-50 rounded-lg">
                      <div>
                        <p className="text-sm text-orange-800">今日新增</p>
                        <p className="text-2xl font-bold text-orange-600">{stats.todayNewUsers}</p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-orange-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>关键指标</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-6 border rounded-lg">
                      <div className="text-4xl font-bold text-blue-600 mb-2">
                        {stats.totalUsers > 0 
                          ? ((stats.memberUsers / stats.totalUsers) * 100).toFixed(1)
                          : 0}%
                      </div>
                      <p className="text-gray-600">会员转化率</p>
                    </div>
                    <div className="text-center p-6 border rounded-lg">
                      <div className="text-4xl font-bold text-green-600 mb-2">
                        {stats.totalUsers > 0 
                          ? ((stats.todayActiveUsers / stats.totalUsers) * 100).toFixed(1)
                          : 0}%
                      </div>
                      <p className="text-gray-600">用户活跃度</p>
                    </div>
                    <div className="text-center p-6 border rounded-lg">
                      <div className="text-4xl font-bold text-purple-600 mb-2">
                        {stats.totalRevenue > 0 && stats.totalUsers > 0
                          ? formatAmount(Math.round(stats.totalRevenue / stats.totalUsers))
                          : formatAmount(0)}
                      </div>
                      <p className="text-gray-600">用户平均价值</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* 用户详情侧边栏 */}
      <Sheet open={userDetailsOpen} onOpenChange={setUserDetailsOpen}>
        <SheetContent className="w-[800px] sm:w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>用户详情</SheetTitle>
            <SheetDescription>
              查看用户的详细信息、交易记录和订单历史
            </SheetDescription>
          </SheetHeader>
          
          {userDetails && (
            <div className="space-y-6">
              {/* 用户基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">积分</p>
                      <p className="text-3xl font-bold">{userDetails.user.credits}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">会员状态</p>
                      <Badge variant={userDetails.user.is_pro ? "default" : "secondary"} className="mt-2">
                        {userDetails.user.is_pro ? "会员" : "免费"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">总消费</p>
                      <p className="text-3xl font-bold text-green-600">
                        {formatAmount(userDetails.stats.totalSpent)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* 用户ID和注册时间 */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">用户ID</p>
                <p className="font-mono text-sm">{userDetails.user.user_id}</p>
                <p className="text-sm text-gray-600 mt-4 mb-1">注册时间</p>
                <p className="text-sm">{formatDate(userDetails.user.created_at)}</p>
              </div>
              
              {/* 最近交易记录 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">最近交易记录</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-2 px-4">类型</th>
                        <th className="text-left py-2 px-4">数量</th>
                        <th className="text-left py-2 px-4">描述</th>
                        <th className="text-left py-2 px-4">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userDetails.transactions.slice(0, 10).map((transaction) => (
                        <tr key={transaction.id} className="border-t">
                          <td className="py-2 px-4">
                            <Badge variant="outline">{transaction.type}</Badge>
                          </td>
                          <td className="py-2 px-4 font-semibold">
                            <span className={transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                              {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-sm">{transaction.description || '-'}</td>
                          <td className="py-2 px-4 text-sm text-gray-600">{formatDate(transaction.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* 最近订单 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">最近订单</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-2 px-4">订单号</th>
                        <th className="text-left py-2 px-4">产品</th>
                        <th className="text-left py-2 px-4">金额</th>
                        <th className="text-left py-2 px-4">状态</th>
                        <th className="text-left py-2 px-4">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userDetails.orders.slice(0, 5).map((order) => (
                        <tr key={order.id} className="border-t">
                          <td className="py-2 px-4 font-mono text-sm">{order.order_no}</td>
                          <td className="py-2 px-4">{order.product_name}</td>
                          <td className="py-2 px-4 font-semibold">{formatAmount(order.amount)}</td>
                          <td className="py-2 px-4">
                            <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                              {order.status === 'paid' ? '已支付' : order.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-4 text-sm text-gray-600">{formatDate(order.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}