"use client"

import {
  BadgeV2 as Badge,
  ButtonV2 as Button,
  CardV2 as Card,
  CardV2Content as CardContent,
  CardV2Header as CardHeader,
  CardV2Title as CardTitle,
  InputV2 as Input,
  SheetV2 as Sheet,
  SheetV2Content as SheetContent,
  SheetV2Description as SheetDescription,
  SheetV2Header as SheetHeader,
  SheetV2Title as SheetTitle,
  TabsV2 as Tabs,
  TabsV2Content as TabsContent,
  TabsV2List as TabsList,
  TabsV2Trigger as TabsTrigger
} from "@/components/ui/v2"
import { getVerifiedAuthHeaders } from "@/lib/client-auth"
import { useState, useEffect, useCallback } from "react"
import { Users, CreditCard, BarChart3, Lock, Eye, EyeOff, RefreshCw, Search, DollarSign, TrendingUp, UserCheck, Activity, AlertCircle, MessageSquareText, Download, ShieldAlert } from "lucide-react"

interface StatsData {
  totalUsers: number
  memberUsers: number
  todayNewUsers: number
  todayActiveUsers: number
  totalRevenue: number
  todayRevenue: number
  totalOrders: number
  paidOrders: number
}

interface UserData {
  user_id: string
  credits: number
  is_pro: boolean
  updated_at: string
  lastActiveAt: string
  transactionCount: number
}

interface OrderData {
  id: string
  order_no: string
  user_id: string
  product_name: string
  amount: number
  credits_amount: number
  payment_method?: string
  status: string
  created_at: string
  updated_at: string
}

interface UserDetails {
  user: {
    user_id: string
    credits: number
    is_pro: boolean
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

interface TrialDashboardData {
  metrics: {
    cumulativeClaimed: number
    activeTrialUsersToday: number
    surveySubmittersToday: number
    surveyCompletionRate: number
    trialCreditsUsedToday: number
    avgQualityScoreToday: number | null
    announcementShownToday: number
    claimClicksToday: number
    claimSuccessToday: number
    dailySurveyAutoPromptShownToday: number
    dailySurveySubmitSuccessToday: number
    dailySurveyLaterClickedToday: number
    surveyRequiredBlocksToday: number
    trialBillingSuccessToday: number
  }
  featureFlags?: {
    campaignEnabled: boolean
    batchGrantEnabled: boolean
    consumptionEnabled: boolean
  }
  trends?: {
    surveySubmitters7d: Array<{
      date: string
      submitters: number
    }>
  }
  recentFeedback: Array<{
    id: string
    user_id: string
    survey_date: string
    answers_json: Record<string, unknown>
    quality_score: number
    streak_day: number
    created_at: string
    survey_templates?: {
      template_key: string
      title: string
      cadence: string
    } | null
  }>
}

interface FreeTrialMonitorData {
  runtimeFlags: {
    campaignEnabled: boolean
    consumptionEnabled: boolean
    autoPromptEnabled: boolean
    monitorEnabled: boolean
  }
  recentRuns: Array<{
    id: string
    started_at: string
    finished_at: string | null
    status: string
    checks_json: Record<string, unknown>
    actions_json: Record<string, unknown>
    error_message: string | null
  }>
  recentIncidents: Array<{
    id: string
    incident_type: string
    severity: "info" | "warning" | "p1" | "p0"
    status: string
    title: string
    details: Record<string, unknown>
    auto_action_taken: string | null
    created_at: string
  }>
  openIncidents: Array<{
    id: string
    incident_type: string
    severity: "p1" | "p0"
    status: string
    title: string
    created_at: string
  }>
  hasOpenP0P1: boolean
  lastRunAt: string | null
  lastRunStatus: string | null
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [userDetailsLoading, setUserDetailsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  
  // 数据状态
  const [stats, setStats] = useState<StatsData>({
    totalUsers: 0,
    memberUsers: 0,
    todayNewUsers: 0,
    todayActiveUsers: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    totalOrders: 0,
    paidOrders: 0
  })
  
  const [users, setUsers] = useState<UserData[]>([])
  const [orders, setOrders] = useState<OrderData[]>([])
  const [trialDashboard, setTrialDashboard] = useState<TrialDashboardData | null>(null)
  const [trialMonitor, setTrialMonitor] = useState<FreeTrialMonitorData | null>(null)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null)
  const [userDetailsOpen, setUserDetailsOpen] = useState(false)

  const getAdminRequestHeaders = useCallback(async () => {
    const token = localStorage.getItem('admin_token')
    if (token) return { Authorization: `Bearer ${token}` }
    return getVerifiedAuthHeaders()
  }, [])
  
  // 获取统计数据
  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error("stats request failed")
      }
      
      const data = await response.json()
      setStats({
        totalUsers: data.data?.totalUsers ?? 0,
        memberUsers: data.data?.memberUsers ?? 0,
        todayNewUsers: data.data?.todayNewUsers ?? 0,
        todayActiveUsers: data.data?.todayActiveUsers ?? 0,
        totalRevenue: data.data?.totalRevenue ?? 0,
        todayRevenue: data.data?.todayRevenue ?? 0,
        totalOrders: data.data?.totalOrders ?? 0,
        paidOrders: data.data?.paidOrders ?? 0,
      })
    } catch (error) {
      console.error('获取统计数据失败:', error)
      setErrorMessage("统计数据加载失败，请刷新重试；仍失败时请检查后台接口和数据库连接。")
      throw error
    }
  }, [])

  // 获取用户列表
  const fetchUsers = useCallback(async (search?: string) => {
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

      if (!response.ok) {
        throw new Error("users request failed")
      }
      
      const data = await response.json()
      setUsers(Array.isArray(data.data) ? data.data : [])
    } catch (error) {
      console.error('获取用户列表失败:', error)
      setErrorMessage("用户列表加载失败，请刷新重试；搜索无结果时可清空关键词后再试。")
      throw error
    }
  }, [])

  // 获取订单列表
  const fetchOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      
      const response = await fetch('/api/admin/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error("orders request failed")
      }
      
      const data = await response.json()
      setOrders(Array.isArray(data.data) ? data.data : [])
    } catch (error) {
      console.error('获取订单列表失败:', error)
      setErrorMessage("订单记录加载失败，请检查支付回调、订单表和后台接口日志。")
      throw error
    }
  }, [])

  // 获取共创体验看板
  const fetchTrialDashboard = useCallback(async (): Promise<boolean> => {
    try {
      const headers = await getAdminRequestHeaders()
      if (!headers.Authorization) return false

      const response = await fetch('/api/admin/trial-dashboard', {
        headers,
      })

      if (!response.ok) {
        throw new Error("trial dashboard request failed")
      }

      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.error || "trial dashboard unavailable")
      }

      setTrialDashboard({
        metrics: {
          cumulativeClaimed: data.metrics?.cumulativeClaimed ?? 0,
          activeTrialUsersToday: data.metrics?.activeTrialUsersToday ?? 0,
          surveySubmittersToday: data.metrics?.surveySubmittersToday ?? 0,
          surveyCompletionRate: data.metrics?.surveyCompletionRate ?? 0,
          trialCreditsUsedToday: data.metrics?.trialCreditsUsedToday ?? 0,
          avgQualityScoreToday: data.metrics?.avgQualityScoreToday ?? null,
          announcementShownToday: data.metrics?.announcementShownToday ?? 0,
          claimClicksToday: data.metrics?.claimClicksToday ?? 0,
          claimSuccessToday: data.metrics?.claimSuccessToday ?? 0,
          dailySurveyAutoPromptShownToday: data.metrics?.dailySurveyAutoPromptShownToday ?? 0,
          dailySurveySubmitSuccessToday: data.metrics?.dailySurveySubmitSuccessToday ?? 0,
          dailySurveyLaterClickedToday: data.metrics?.dailySurveyLaterClickedToday ?? 0,
          surveyRequiredBlocksToday: data.metrics?.surveyRequiredBlocksToday ?? 0,
          trialBillingSuccessToday: data.metrics?.trialBillingSuccessToday ?? 0,
        },
        featureFlags: data.featureFlags || {
          campaignEnabled: true,
          batchGrantEnabled: true,
          consumptionEnabled: true,
        },
        trends: {
          surveySubmitters7d: Array.isArray(data.trends?.surveySubmitters7d) ? data.trends.surveySubmitters7d : [],
        },
        recentFeedback: Array.isArray(data.recentFeedback) ? data.recentFeedback : [],
      })
      return true
    } catch (error) {
      console.error('获取共创体验看板失败:', error)
      setErrorMessage("共创体验看板加载失败，请检查 trial-dashboard 接口和体验计划数据表。")
      return false
    }
  }, [getAdminRequestHeaders])

  const fetchTrialMonitor = useCallback(async (): Promise<boolean> => {
    try {
      const headers = await getAdminRequestHeaders()
      if (!headers.Authorization) return false

      const response = await fetch('/api/admin/free-trial-monitor', { headers })
      if (!response.ok) {
        throw new Error("trial monitor request failed")
      }

      const data = await response.json()
      if (!data.ok) {
        throw new Error(data.error || "trial monitor unavailable")
      }

      setTrialMonitor({
        runtimeFlags: {
          campaignEnabled: data.runtimeFlags?.campaignEnabled !== false,
          consumptionEnabled: data.runtimeFlags?.consumptionEnabled !== false,
          autoPromptEnabled: data.runtimeFlags?.autoPromptEnabled !== false,
          monitorEnabled: data.runtimeFlags?.monitorEnabled !== false,
        },
        recentRuns: Array.isArray(data.recentRuns) ? data.recentRuns : [],
        recentIncidents: Array.isArray(data.recentIncidents) ? data.recentIncidents : [],
        openIncidents: Array.isArray(data.openIncidents) ? data.openIncidents : [],
        hasOpenP0P1: Boolean(data.hasOpenP0P1),
        lastRunAt: data.lastRunAt || null,
        lastRunStatus: data.lastRunStatus || null,
      })
      return true
    } catch (error) {
      console.error('获取共创体验监控失败:', error)
      setErrorMessage("共创体验监控状态加载失败，请检查 free-trial-monitor 接口和监控数据表。")
      return false
    }
  }, [getAdminRequestHeaders])

  // 获取所有数据
  const fetchAllData = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")
    const results = await Promise.allSettled([
      fetchStats(),
      fetchUsers(),
      fetchOrders(),
      fetchTrialDashboard(),
      fetchTrialMonitor(),
    ])

    const failedCount = results.filter((result) => result.status === "rejected").length
    if (failedCount === results.length) {
      setErrorMessage("后台数据加载失败，请稍后重试；如果持续失败，请检查服务日志、环境变量和 Supabase 连接状态。")
    }
    setLoading(false)
  }, [fetchStats, fetchUsers, fetchOrders, fetchTrialDashboard, fetchTrialMonitor])

  // 检查本地存储的 token 是否有效
  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    const tryVerifiedUserAdmin = async () => {
      const ok = await fetchTrialDashboard()
      if (ok) {
        await fetchTrialMonitor()
        setIsAuthenticated(true)
        setActiveTab("trial")
      }
    }

    if (token) {
      // 验证 token
      fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setIsAuthenticated(true)
          fetchAllData()
        } else {
          // Token 无效，清除本地存储
          localStorage.removeItem('admin_token')
          tryVerifiedUserAdmin()
        }
      })
      .catch(() => {
        localStorage.removeItem('admin_token')
        tryVerifiedUserAdmin()
      })
    } else {
      tryVerifiedUserAdmin()
    }
  }, [fetchAllData, fetchTrialDashboard, fetchTrialMonitor])
  
  // 获取用户详情
  const fetchUserDetails = async (userId: string) => {
    setUserDetailsLoading(true)
    setErrorMessage("")
    setUserDetails(null)
    setUserDetailsOpen(true)
    try {
      const token = localStorage.getItem('admin_token')
      if (!token) return
      
      const response = await fetch(`/api/admin/user-details?userId=${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error("user details request failed")
      }
      
      const data = await response.json()
      setUserDetails(data.data)
    } catch (error) {
      console.error('获取用户详情失败:', error)
      setErrorMessage("用户详情加载失败，请确认用户 ID 是否存在，并检查积分、订单和交易流水接口。")
    } finally {
      setUserDetailsLoading(false)
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
        setErrorMessage("")
        fetchAllData()
      } else {
        alert(data.error || '密码错误')
      }
    } catch (error) {
      console.error('登录失败:', error)
      alert('网络错误，请重试')
    }
  }
  
  const getOrderStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      paid: '已支付',
      pending: '待支付',
      failed: '支付失败',
      cancelled: '已取消',
      refunded: '已退款',
    }
    return labels[status] || status || '未知状态'
  }

  // 格式化日期
  const formatDate = (dateString?: string) => {
    if (!dateString) return '暂无数据'
    return new Date(dateString).toLocaleString('zh-CN')
  }
  
  // 格式化金额
  const formatAmount = (amount: number) => {
    return `¥${amount.toLocaleString()}`
  }

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`
  }

  const maskUserId = (userId?: string) => {
    if (!userId) return "匿名用户"
    if (userId.length <= 10) return `${userId.slice(0, 3)}***`
    return `${userId.slice(0, 6)}...${userId.slice(-4)}`
  }

  const extractFeedbackText = (answers: Record<string, unknown>) => {
    const preferredKeys = ["best_part", "friction", "current_pain", "price_feedback", "top_request"]
    const values = preferredKeys
      .map((key) => answers[key])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())

    if (values.length > 0) return values.join(" / ")

    const fallback = Object.values(answers)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
      .slice(0, 2)
      .join(" / ")

    return fallback || "未填写开放反馈"
  }

  const downloadTrialExport = async (type: string, range = "7d") => {
    const headers = await getAdminRequestHeaders()
    if (!headers.Authorization) return

    const url = new URL('/api/admin/trial-dashboard/export', window.location.origin)
    url.searchParams.set('type', type)
    url.searchParams.set('range', range)

    fetch(url.toString(), {
      headers,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text())
        }
        return response.blob()
      })
      .then((blob) => {
        const href = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = href
        anchor.download = `${type}_${range}.csv`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(href)
      })
      .catch((error) => {
        console.error('导出 CSV 失败:', error)
        setErrorMessage("CSV 导出失败，请检查管理员权限和导出接口。")
      })
  }

  const updateRuntimeFlag = async (action: string, label: string) => {
    const confirmed = window.confirm(`确认要${label}吗？这个操作会立即影响线上共创体验计划。`)
    if (!confirmed) return

    try {
      const headers = await getAdminRequestHeaders()
      if (!headers.Authorization) {
        setErrorMessage("缺少管理员登录态，无法更新运行时开关。")
        return
      }

      const response = await fetch('/api/admin/free-trial-monitor', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          reason: `admin_manual_${action}`,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "runtime flag update failed")
      }
      setTrialMonitor({
        runtimeFlags: {
          campaignEnabled: data.runtimeFlags?.campaignEnabled !== false,
          consumptionEnabled: data.runtimeFlags?.consumptionEnabled !== false,
          autoPromptEnabled: data.runtimeFlags?.autoPromptEnabled !== false,
          monitorEnabled: data.runtimeFlags?.monitorEnabled !== false,
        },
        recentRuns: Array.isArray(data.recentRuns) ? data.recentRuns : [],
        recentIncidents: Array.isArray(data.recentIncidents) ? data.recentIncidents : [],
        openIncidents: Array.isArray(data.openIncidents) ? data.openIncidents : [],
        hasOpenP0P1: Boolean(data.hasOpenP0P1),
        lastRunAt: data.lastRunAt || null,
        lastRunStatus: data.lastRunStatus || null,
      })
      setErrorMessage("")
      await fetchTrialDashboard()
    } catch (error) {
      console.error('更新运行时开关失败:', error)
      setErrorMessage("运行时开关更新失败，请检查管理员权限和监控接口。")
    }
  }
  
  // 如果未认证，显示登录界面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--paper-50)] flex items-center justify-center p-4">
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-500)] hover:text-[var(--ink-700)]"
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
    <div className="min-h-screen bg-[var(--paper-50)] p-6">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--ink-900)] font-[var(--font-display)]">管理后台</h1>
            <p className="text-[var(--ink-600)] mt-1">AI作文编辑器管理系统</p>
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
          {errorMessage && (
            <div className="flex items-start gap-3 rounded-[var(--radius-soft)] border border-[var(--seal-500)]/30 bg-[var(--seal-50)] px-4 py-3 text-sm text-[var(--seal-500)]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">后台数据暂时不可用</p>
                <p className="mt-1">{errorMessage}</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 rounded-[var(--radius-soft)] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <RefreshCw className="h-4 w-4 animate-spin" />
              正在加载后台数据，请稍候...
            </div>
          )}

          <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-5 lg:w-[760px]">
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
            <TabsTrigger value="trial" className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4" />
              共创体验
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
                        <p className="text-sm text-[var(--ink-600)]">总用户数</p>
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
                        <p className="text-sm text-[var(--ink-600)]">会员用户</p>
                        <p className="text-3xl font-bold text-[var(--ink-600)]">{stats.memberUsers.toLocaleString()}</p>
                      </div>
                      <UserCheck className="w-10 h-10 text-[var(--ink-500)]" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-[var(--ink-600)]">总营收</p>
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
                        <p className="text-sm text-[var(--ink-600)]">订单数量</p>
                        <p className="text-3xl font-bold text-orange-600">{stats.totalOrders.toLocaleString()}</p>
                        <p className="mt-1 text-xs text-[var(--ink-500)]">已支付 {stats.paidOrders.toLocaleString()} 单</p>
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
                      <span className="text-[var(--ink-600)]">新增用户</span>
                      <span className="font-bold text-lg">{stats.todayNewUsers}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--ink-600)]">活跃用户</span>
                      <span className="font-bold text-lg">{stats.todayActiveUsers}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--ink-600)]">今日营收</span>
                      <span className="font-bold text-lg text-[var(--ink-600)]">{formatAmount(stats.todayRevenue)}</span>
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
                        <span className="text-sm text-[var(--ink-600)]">会员转化率</span>
                        <span className="text-sm font-semibold text-[var(--ink-600)]">
                          {stats.totalUsers > 0 
                            ? ((stats.memberUsers / stats.totalUsers) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-[var(--paper-200)] rounded-full h-3">
                        <div 
                          className="bg-[var(--ink-500)] h-3 rounded-full transition-all duration-500"
                          style={{ width: `${stats.totalUsers > 0 ? (stats.memberUsers / stats.totalUsers) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-[var(--ink-600)]">用户活跃度</span>
                        <span className="text-sm font-semibold text-blue-600">
                          {stats.totalUsers > 0 
                            ? ((stats.todayActiveUsers / stats.totalUsers) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-[var(--paper-200)] rounded-full h-3">
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
                      查看用户
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
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setActiveTab("trial")}
                    >
                      <MessageSquareText className="w-4 h-4 mr-2" />
                      共创体验
                    </Button>
                    <div className="rounded-[var(--radius-soft)] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      运营排查建议：先复制订单号、用户 ID 和支付时间，再联系客服或检查支付回调日志。
                    </div>
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
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-400)] w-4 h-4" />
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
                          <th className="text-left py-3 px-4">用户 ID</th>
                          <th className="text-left py-3 px-4">积分</th>
                          <th className="text-left py-3 px-4">会员状态</th>
                          <th className="text-left py-3 px-4">最近更新</th>
                          <th className="text-left py-3 px-4">最后活跃</th>
                          <th className="text-left py-3 px-4">交易次数</th>
                          <th className="text-left py-3 px-4">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user) => (
                          <tr key={user.user_id} className="border-b hover:bg-[var(--paper-50)]">
                            <td className="py-3 px-4 font-mono text-sm">{user.user_id.slice(0, 8)}...</td>
                            <td className="py-3 px-4 font-semibold">{user.credits}</td>
                            <td className="py-3 px-4">
                              <Badge variant={user.is_pro ? "ink" : "paper"}>
                                {user.is_pro ? "会员" : "免费"}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-[var(--ink-600)] text-sm">{formatDate(user.updated_at)}</td>
                            <td className="py-3 px-4 text-[var(--ink-600)] text-sm">{formatDate(user.lastActiveAt)}</td>
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
                    <div className="text-center py-8 text-[var(--ink-500)]">
                      {loading ? "正在加载用户数据..." : "暂无用户数据。可清空搜索关键词后刷新，或检查用户表是否有记录。"}
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
                        <th className="text-left py-3 px-4">用户 ID</th>
                        <th className="text-left py-3 px-4">产品</th>
                        <th className="text-left py-3 px-4">金额</th>
                        <th className="text-left py-3 px-4">积分</th>
                        <th className="text-left py-3 px-4">支付方式</th>
                        <th className="text-left py-3 px-4">状态</th>
                        <th className="text-left py-3 px-4">创建时间</th>
                        <th className="text-left py-3 px-4">支付/更新时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-[var(--paper-50)]">
                          <td className="py-3 px-4 font-mono text-sm">{order.order_no}</td>
                          <td className="py-3 px-4 font-mono text-sm">{order.user_id.slice(0, 8)}...</td>
                          <td className="py-3 px-4">{order.product_name}</td>
                          <td className="py-3 px-4 font-semibold text-[var(--ink-600)]">{formatAmount(order.amount)}</td>
                          <td className="py-3 px-4">{order.credits_amount}</td>
                          <td className="py-3 px-4">{order.payment_method || '暂无数据'}</td>
                          <td className="py-3 px-4">
                            <Badge variant={order.status === 'paid' ? 'ink' : 'paper'}>
                              {getOrderStatusLabel(order.status)}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-[var(--ink-600)] text-sm">{formatDate(order.created_at)}</td>
                          <td className="py-3 px-4 text-[var(--ink-600)] text-sm">{formatDate(order.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {orders.length === 0 && (
                  <div className="text-center py-8 text-[var(--ink-500)]">
                    {loading ? "正在加载订单数据..." : "暂无订单。若支付成功但未显示，请保留订单号、支付时间和用户 ID，并检查支付回调和订单状态同步。"}
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
                    <div className="flex justify-between items-center p-4 bg-[var(--ink-50)] rounded-[var(--radius-soft)]">
                      <div>
                        <p className="text-sm text-[var(--ink-800)]">总营收</p>
                        <p className="text-2xl font-bold text-[var(--ink-600)]">{formatAmount(stats.totalRevenue)}</p>
                      </div>
                      <DollarSign className="w-8 h-8 text-[var(--ink-500)]" />
                    </div>
                    <div className="flex justify-between items-center p-4 bg-blue-50 rounded-[var(--radius-soft)]">
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
                    <div className="flex justify-between items-center p-4 bg-purple-50 rounded-[var(--radius-soft)]">
                      <div>
                        <p className="text-sm text-purple-800">总用户</p>
                        <p className="text-2xl font-bold text-purple-600">{stats.totalUsers}</p>
                      </div>
                      <Users className="w-8 h-8 text-purple-500" />
                    </div>
                    <div className="flex justify-between items-center p-4 bg-orange-50 rounded-[var(--radius-soft)]">
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
                    <div className="text-center p-6 border rounded-[var(--radius-soft)]">
                      <div className="text-4xl font-bold text-blue-600 mb-2">
                        {stats.totalUsers > 0 
                          ? ((stats.memberUsers / stats.totalUsers) * 100).toFixed(1)
                          : 0}%
                      </div>
                      <p className="text-[var(--ink-600)]">会员转化率</p>
                    </div>
                    <div className="text-center p-6 border rounded-[var(--radius-soft)]">
                      <div className="text-4xl font-bold text-[var(--ink-600)] mb-2">
                        {stats.totalUsers > 0 
                          ? ((stats.todayActiveUsers / stats.totalUsers) * 100).toFixed(1)
                          : 0}%
                      </div>
                      <p className="text-[var(--ink-600)]">用户活跃度</p>
                    </div>
                    <div className="text-center p-6 border rounded-[var(--radius-soft)]">
                      <div className="text-4xl font-bold text-purple-600 mb-2">
                        {stats.totalRevenue > 0 && stats.totalUsers > 0
                          ? formatAmount(Math.round(stats.totalRevenue / stats.totalUsers))
                          : formatAmount(0)}
                      </div>
                      <p className="text-[var(--ink-600)]">用户平均价值</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 共创体验 Tab */}
          <TabsContent value="trial">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>上线开关状态</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  {[
                    ["活动弹窗", "runtime + NEXT_PUBLIC_FREE_TRIAL_CAMPAIGN_ENABLED", trialMonitor?.runtimeFlags.campaignEnabled ?? trialDashboard?.featureFlags?.campaignEnabled],
                    ["批量发放", "FREE_TRIAL_BATCH_GRANT_ENABLED", trialDashboard?.featureFlags?.batchGrantEnabled],
                    ["Trial 消耗", "runtime + FREE_TRIAL_CONSUMPTION_ENABLED", trialMonitor?.runtimeFlags.consumptionEnabled ?? trialDashboard?.featureFlags?.consumptionEnabled],
                    ["自动问卷", "free_trial_auto_prompt_enabled", trialMonitor?.runtimeFlags.autoPromptEnabled],
                  ].map(([label, envName, enabled]) => (
                    <div
                      key={String(envName)}
                      className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-white p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--ink-900)]">{label}</p>
                          <p className="mt-1 font-mono text-xs text-[var(--ink-500)]">{envName}</p>
                        </div>
                        <Badge variant={enabled === false ? "seal" : "paper"}>
                          {enabled === false ? "关闭" : "开启"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5" />
                      监控
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await fetchTrialMonitor()
                      }}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      刷新监控
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    {[
                      ["Campaign", trialMonitor?.runtimeFlags.campaignEnabled],
                      ["Consumption", trialMonitor?.runtimeFlags.consumptionEnabled],
                      ["Auto Prompt", trialMonitor?.runtimeFlags.autoPromptEnabled],
                      ["Monitor", trialMonitor?.runtimeFlags.monitorEnabled],
                    ].map(([label, enabled]) => (
                      <div key={String(label)} className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-white p-4">
                        <p className="text-sm text-[var(--ink-600)]">{label}</p>
                        <Badge className="mt-2" variant={enabled === false ? "seal" : "paper"}>
                          {enabled === false ? "关闭" : "开启"}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4">
                      <p className="text-sm text-[var(--ink-600)]">最近一次监控</p>
                      <p className="mt-2 font-semibold text-[var(--ink-900)]">{formatDate(trialMonitor?.lastRunAt || undefined)}</p>
                    </div>
                    <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4">
                      <p className="text-sm text-[var(--ink-600)]">最近状态</p>
                      <Badge className="mt-2" variant={trialMonitor?.lastRunStatus === "failed" ? "seal" : "paper"}>
                        {trialMonitor?.lastRunStatus || "暂无"}
                      </Badge>
                    </div>
                    <div className="rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] p-4">
                      <p className="text-sm text-[var(--ink-600)]">Open P0/P1</p>
                      <p className="mt-2 text-2xl font-bold text-[var(--ink-900)]">
                        {(trialMonitor?.openIncidents.length || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <Button variant="outline" onClick={() => updateRuntimeFlag("disable_consumption", "关闭 trial 免费消耗")}>
                      关闭 trial 免费消耗
                    </Button>
                    <Button variant="outline" onClick={() => updateRuntimeFlag("disable_campaign", "关闭活动弹窗")}>
                      关闭活动弹窗
                    </Button>
                    <Button variant="outline" onClick={() => updateRuntimeFlag("disable_auto_prompt", "关闭自动问卷弹出")}>
                      关闭自动问卷
                    </Button>
                    <Button variant="outline" onClick={() => updateRuntimeFlag("disable_monitor", "关闭监控自动止损")}>
                      关闭自动止损
                    </Button>
                    <Button variant="primary" onClick={() => updateRuntimeFlag("enable_consumption", "重新开启 trial 免费消耗")}>
                      开启 trial 免费消耗
                    </Button>
                    <Button variant="primary" onClick={() => updateRuntimeFlag("enable_campaign", "重新开启活动弹窗")}>
                      开启活动弹窗
                    </Button>
                    <Button variant="primary" onClick={() => updateRuntimeFlag("enable_auto_prompt", "重新开启自动问卷弹出")}>
                      开启自动问卷
                    </Button>
                    <Button variant="primary" onClick={() => updateRuntimeFlag("enable_monitor", "重新开启监控自动止损")}>
                      开启自动止损
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left">级别</th>
                          <th className="px-4 py-3 text-left">状态</th>
                          <th className="px-4 py-3 text-left">标题</th>
                          <th className="px-4 py-3 text-left">自动动作</th>
                          <th className="px-4 py-3 text-left">时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(trialMonitor?.recentIncidents || []).slice(0, 20).map((incident) => (
                          <tr key={incident.id} className="border-b align-top hover:bg-[var(--paper-50)]">
                            <td className="px-4 py-3">
                              <Badge variant={incident.severity === "p0" ? "seal" : "paper"}>{incident.severity.toUpperCase()}</Badge>
                            </td>
                            <td className="px-4 py-3 text-sm">{incident.status}</td>
                            <td className="px-4 py-3 text-sm font-medium text-[var(--ink-900)]">{incident.title}</td>
                            <td className="px-4 py-3 text-sm text-[var(--ink-600)]">{incident.auto_action_taken || "无"}</td>
                            <td className="px-4 py-3 text-sm text-[var(--ink-600)]">{formatDate(incident.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(trialMonitor?.recentIncidents || []).length === 0 && (
                      <div className="py-6 text-center text-sm text-[var(--ink-500)]">暂无监控事件。</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-[var(--ink-600)]">累计领取人数</p>
                    <p className="mt-2 text-3xl font-bold text-[var(--ink-900)]">
                      {(trialDashboard?.metrics.cumulativeClaimed || 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-[var(--ink-600)]">今日活跃体验用户</p>
                    <p className="mt-2 text-3xl font-bold text-[var(--ink-900)]">
                      {(trialDashboard?.metrics.activeTrialUsersToday || 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-[var(--ink-600)]">今日问卷提交人数</p>
                    <p className="mt-2 text-3xl font-bold text-[var(--ink-900)]">
                      {(trialDashboard?.metrics.surveySubmittersToday || 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-[var(--ink-600)]">今日问卷完成率</p>
                    <p className="mt-2 text-3xl font-bold text-[var(--ink-900)]">
                      {formatPercent(trialDashboard?.metrics.surveyCompletionRate || 0)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-[var(--ink-600)]">今日 trial 消耗积分</p>
                    <p className="mt-2 text-3xl font-bold text-[var(--ink-900)]">
                      {(trialDashboard?.metrics.trialCreditsUsedToday || 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-[var(--ink-600)]">今日平均问卷质量分</p>
                    <p className="mt-2 text-3xl font-bold text-[var(--ink-900)]">
                      {trialDashboard?.metrics.avgQualityScoreToday == null
                        ? "暂无"
                        : trialDashboard.metrics.avgQualityScoreToday.toFixed(1)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["今日弹窗曝光", trialDashboard?.metrics.announcementShownToday || 0],
                  ["今日领取点击", trialDashboard?.metrics.claimClicksToday || 0],
                  ["今日领取成功", trialDashboard?.metrics.claimSuccessToday || 0],
                  ["今日自动问卷弹出", trialDashboard?.metrics.dailySurveyAutoPromptShownToday || 0],
                  ["今日问卷提交成功", trialDashboard?.metrics.dailySurveySubmitSuccessToday || 0],
                  ["今日稍后再说", trialDashboard?.metrics.dailySurveyLaterClickedToday || 0],
                  ["今日问卷阻断", trialDashboard?.metrics.surveyRequiredBlocksToday || 0],
                  ["今日 trial billing 成功", trialDashboard?.metrics.trialBillingSuccessToday || 0],
                ].map(([label, value]) => (
                  <Card key={label}>
                    <CardContent className="pt-5">
                      <p className="text-sm text-[var(--ink-600)]">{label}</p>
                      <p className="mt-2 text-2xl font-bold text-[var(--ink-900)]">
                        {Number(value).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>近 7 天问卷提交趋势</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(trialDashboard?.trends?.surveySubmitters7d || []).map((item) => {
                        const maxValue = Math.max(
                          1,
                          ...(trialDashboard?.trends?.surveySubmitters7d || []).map((trend) => trend.submitters),
                        )
                        return (
                          <div key={item.date} className="grid grid-cols-[96px_1fr_48px] items-center gap-3 text-sm">
                            <span className="font-mono text-[var(--ink-500)]">{item.date.slice(5)}</span>
                            <div className="h-2 rounded-full bg-[var(--paper-200)]">
                              <div
                                className="h-2 rounded-full bg-[var(--ink-700)]"
                                style={{ width: `${Math.max(4, (item.submitters / maxValue) * 100)}%` }}
                              />
                            </div>
                            <span className="text-right font-semibold">{item.submitters}</span>
                          </div>
                        )
                      })}
                      {(trialDashboard?.trends?.surveySubmitters7d || []).length === 0 && (
                        <p className="text-sm text-[var(--ink-500)]">暂无趋势数据。</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>CSV 导出</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      ["survey_responses", "问卷回复"],
                      ["trial_credit_usages", "Trial 消耗"],
                      ["free_trial_grants", "体验授权"],
                      ["campaign_events", "活动埋点"],
                    ].map(([type, label]) => (
                      <Button
                        key={type}
                        variant="outline"
                        type="button"
                        onClick={() => downloadTrialExport(type)}
                        className="justify-start gap-2"
                      >
                        <Download className="h-4 w-4" />
                        {label}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>最近开放反馈</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchTrialDashboard}
                      disabled={loading}
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      刷新
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left">用户</th>
                          <th className="px-4 py-3 text-left">问卷</th>
                          <th className="px-4 py-3 text-left">质量分</th>
                          <th className="px-4 py-3 text-left">连击</th>
                          <th className="px-4 py-3 text-left">开放反馈</th>
                          <th className="px-4 py-3 text-left">时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(trialDashboard?.recentFeedback || []).slice(0, 20).map((feedback) => (
                          <tr key={feedback.id} className="border-b align-top hover:bg-[var(--paper-50)]">
                            <td className="px-4 py-3 font-mono text-sm">{maskUserId(feedback.user_id)}</td>
                            <td className="px-4 py-3">
                              <Badge variant="paper">
                                {feedback.survey_templates?.title || feedback.survey_templates?.template_key || "问卷反馈"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-semibold">{feedback.quality_score}</td>
                            <td className="px-4 py-3">{feedback.streak_day} 天</td>
                            <td className="max-w-xl px-4 py-3 text-sm leading-6 text-[var(--ink-700)]">
                              {extractFeedbackText(feedback.answers_json || {})}
                            </td>
                            <td className="px-4 py-3 text-sm text-[var(--ink-600)]">{formatDate(feedback.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {(trialDashboard?.recentFeedback || []).length === 0 && (
                    <div className="py-8 text-center text-sm text-[var(--ink-500)]">
                      暂无开放反馈。用户提交问卷后，这里会展示脱敏后的最近反馈。
                    </div>
                  )}
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
          
          {userDetailsLoading && (
            <div className="mt-6 flex items-center gap-2 rounded-[var(--radius-soft)] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <RefreshCw className="h-4 w-4 animate-spin" />
              正在加载用户详情...
            </div>
          )}

          {!userDetailsLoading && !userDetails && (
            <div className="mt-6 rounded-[var(--radius-soft)] border border-[var(--paper-200)] bg-[var(--paper-50)] px-4 py-6 text-center text-sm text-[var(--ink-500)]">
              暂无用户详情。请重新打开用户详情，或检查用户 ID、积分流水和订单记录是否存在。
            </div>
          )}

          {!userDetailsLoading && userDetails && (
            <div className="space-y-6">
              {/* 用户基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-[var(--ink-600)]">积分</p>
                      <p className="text-3xl font-bold">{userDetails.user.credits}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-[var(--ink-600)]">会员状态</p>
                      <Badge variant={userDetails.user.is_pro ? "ink" : "paper"} className="mt-2">
                        {userDetails.user.is_pro ? "会员" : "免费"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <p className="text-sm text-[var(--ink-600)]">总消费</p>
                      <p className="text-3xl font-bold text-[var(--ink-600)]">
                        {formatAmount(userDetails.stats.totalSpent)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {/* 用户ID和注册时间 */}
              <div className="bg-[var(--paper-50)] p-4 rounded-[var(--radius-soft)]">
                <p className="text-sm text-[var(--ink-600)] mb-1">用户ID</p>
                <p className="font-mono text-sm">{userDetails.user.user_id}</p>
                <p className="text-sm text-[var(--ink-600)] mt-4 mb-1">最近更新时间</p>
                <p className="text-sm">{formatDate(userDetails.user.updated_at)}</p>
              </div>
              
              {/* 最近交易记录 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">最近交易记录</h3>
                <div className="border rounded-[var(--radius-soft)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--paper-50)]">
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
                            <Badge variant="ghost">{transaction.type}</Badge>
                          </td>
                          <td className="py-2 px-4 font-semibold">
                            <span className={transaction.amount > 0 ? 'text-[var(--ink-600)]' : 'text-[var(--seal-500)]'}>
                              {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-sm">{transaction.description || '-'}</td>
                          <td className="py-2 px-4 text-sm text-[var(--ink-600)]">{formatDate(transaction.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {userDetails.transactions.length === 0 && (
                    <div className="py-6 text-center text-sm text-[var(--ink-500)]">暂无交易记录</div>
                  )}
                </div>
              </div>
              
              {/* 最近订单 */}
              <div>
                <h3 className="text-lg font-semibold mb-4">最近订单</h3>
                <div className="border rounded-[var(--radius-soft)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[var(--paper-50)]">
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
                            <Badge variant={order.status === 'paid' ? 'ink' : 'paper'}>
                              {getOrderStatusLabel(order.status)}
                            </Badge>
                          </td>
                          <td className="py-2 px-4 text-sm text-[var(--ink-600)]">{formatDate(order.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {userDetails.orders.length === 0 && (
                    <div className="py-6 text-center text-sm text-[var(--ink-500)]">暂无订单</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
