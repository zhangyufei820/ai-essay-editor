/**
 * 数据库分析脚本
 * 分析所有表的数据，生成直观的用户报表
 * 
 * 使用方法: node scripts/analyze-database.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=' .repeat(100))
  console.log('📊 Supabase 数据库分析报告')
  console.log('=' .repeat(100))
  console.log(`生成时间: ${new Date().toLocaleString('zh-CN')}`)
  console.log('')

  // ============================================
  // 1. 分析表结构
  // ============================================
  console.log('\n' + '─'.repeat(100))
  console.log('📋 1. 数据库表结构分析')
  console.log('─'.repeat(100))

  const tables = [
    'user_credits',
    'user_profiles', 
    'orders',
    'chat_sessions',
    'chat_messages',
    'shared_content',
    'submissions'
  ]

  for (const table of tables) {
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      console.log(`❌ ${table}: 表不存在或无法访问 - ${error.message}`)
    } else {
      console.log(`✅ ${table}: ${count || 0} 条记录`)
    }
  }

  // ============================================
  // 2. 用户积分表分析
  // ============================================
  console.log('\n' + '─'.repeat(100))
  console.log('💰 2. 用户积分表 (user_credits) 详情')
  console.log('─'.repeat(100))

  const { data: allCredits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .order('credits', { ascending: false })

  if (creditsError) {
    console.log('❌ 查询失败:', creditsError.message)
  } else {
    console.log(`\n共 ${allCredits.length} 个用户积分记录\n`)
    
    // 统计信息
    const totalCredits = allCredits.reduce((sum, u) => sum + (u.credits || 0), 0)
    const proUsers = allCredits.filter(u => u.is_pro).length
    const zeroCredits = allCredits.filter(u => u.credits === 0).length
    const highCredits = allCredits.filter(u => u.credits >= 1000).length
    
    console.log('📊 统计信息:')
    console.log(`   总积分: ${totalCredits.toLocaleString()}`)
    console.log(`   Pro用户: ${proUsers}`)
    console.log(`   积分为0的用户: ${zeroCredits}`)
    console.log(`   积分>=1000的用户: ${highCredits}`)
    
    console.log('\n📋 用户积分列表 (前50名):')
    console.log('─'.repeat(100))
    console.log('| 序号 | 用户ID                           | 积分      | Pro  | 更新时间                    |')
    console.log('─'.repeat(100))
    
    allCredits.slice(0, 50).forEach((user, index) => {
      const userId = user.user_id?.padEnd(32) || ''.padEnd(32)
      const credits = String(user.credits || 0).padStart(8)
      const isPro = user.is_pro ? '是' : '否'
      const updatedAt = user.updated_at ? new Date(user.updated_at).toLocaleString('zh-CN') : '未知'
      console.log(`| ${String(index + 1).padStart(4)} | ${userId} | ${credits} | ${isPro.padStart(4)} | ${updatedAt.padEnd(27)} |`)
    })
    console.log('─'.repeat(100))
  }

  // ============================================
  // 3. 订单表分析
  // ============================================
  console.log('\n' + '─'.repeat(100))
  console.log('📦 3. 订单表 (orders) 详情')
  console.log('─'.repeat(100))

  const { data: allOrders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.log('❌ 查询失败:', ordersError.message)
  } else {
    console.log(`\n共 ${allOrders.length} 个订单\n`)
    
    // 统计信息
    const paidOrders = allOrders.filter(o => o.status === 'paid')
    const pendingOrders = allOrders.filter(o => o.status === 'pending')
    const totalPaidAmount = paidOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0)
    const totalPendingAmount = pendingOrders.reduce((sum, o) => sum + Number(o.amount || 0), 0)
    
    console.log('📊 订单统计:')
    console.log(`   已支付订单: ${paidOrders.length} 个，金额: ¥${totalPaidAmount}`)
    console.log(`   待支付订单: ${pendingOrders.length} 个，金额: ¥${totalPendingAmount}`)
    
    // 按产品统计
    const productStats = {}
    allOrders.forEach(o => {
      const key = o.product_name || o.product_id || '未知'
      if (!productStats[key]) {
        productStats[key] = { total: 0, paid: 0, pending: 0, amount: 0 }
      }
      productStats[key].total++
      if (o.status === 'paid') {
        productStats[key].paid++
        productStats[key].amount += Number(o.amount || 0)
      } else {
        productStats[key].pending++
      }
    })
    
    console.log('\n📊 按产品统计:')
    Object.entries(productStats).forEach(([product, stats]) => {
      console.log(`   ${product}: 总${stats.total}单 (已付${stats.paid}单 ¥${stats.amount}, 待付${stats.pending}单)`)
    })
    
    console.log('\n📋 订单列表 (最近30个):')
    console.log('─'.repeat(140))
    console.log('| 序号 | 订单号                                    | 用户ID                           | 产品     | 金额  | 状态    | 创建时间                    |')
    console.log('─'.repeat(140))
    
    allOrders.slice(0, 30).forEach((order, index) => {
      const orderNo = (order.order_no || '').slice(0, 40).padEnd(40)
      const userId = (order.user_id || '').padEnd(32)
      const product = (order.product_name || order.product_id || '').slice(0, 8).padEnd(8)
      const amount = String(order.amount || 0).padStart(5)
      const status = (order.status || '').padEnd(7)
      const createdAt = order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '未知'
      console.log(`| ${String(index + 1).padStart(4)} | ${orderNo} | ${userId} | ${product} | ${amount} | ${status} | ${createdAt.padEnd(27)} |`)
    })
    console.log('─'.repeat(140))
  }

  // ============================================
  // 4. 用户资料表分析
  // ============================================
  console.log('\n' + '─'.repeat(100))
  console.log('👤 4. 用户资料表 (user_profiles) 详情')
  console.log('─'.repeat(100))

  const { data: allProfiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (profilesError) {
    console.log('❌ 查询失败:', profilesError.message)
  } else {
    console.log(`\n共 ${allProfiles.length} 个用户资料\n`)
    
    console.log('📋 用户资料列表:')
    console.log('─'.repeat(120))
    console.log('| 序号 | 用户ID                           | 昵称           | 手机号        | 邮箱                      |')
    console.log('─'.repeat(120))
    
    allProfiles.forEach((profile, index) => {
      const userId = (profile.id || profile.user_id || '').padEnd(32)
      const nickname = (profile.nickname || profile.name || '未设置').slice(0, 12).padEnd(14)
      const phone = (profile.phone || '未设置').padEnd(13)
      const email = (profile.email || '未设置').slice(0, 25).padEnd(25)
      console.log(`| ${String(index + 1).padStart(4)} | ${userId} | ${nickname} | ${phone} | ${email} |`)
    })
    console.log('─'.repeat(120))
  }

  // ============================================
  // 5. Supabase Auth 用户分析
  // ============================================
  console.log('\n' + '─'.repeat(100))
  console.log('🔐 5. Supabase Auth 用户')
  console.log('─'.repeat(100))

  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers({
    perPage: 1000
  })

  if (authError) {
    console.log('❌ 查询失败:', authError.message)
  } else {
    console.log(`\n共 ${users.length} 个 Supabase Auth 用户\n`)
    
    console.log('📋 Auth用户列表:')
    console.log('─'.repeat(120))
    console.log('| 序号 | 用户ID                                 | 手机号        | 邮箱                      | 创建时间                    |')
    console.log('─'.repeat(120))
    
    users.forEach((user, index) => {
      const userId = (user.id || '').padEnd(36)
      const phone = (user.phone || user.user_metadata?.phone || '未设置').padEnd(13)
      const email = (user.email || '未设置').slice(0, 25).padEnd(25)
      const createdAt = user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '未知'
      console.log(`| ${String(index + 1).padStart(4)} | ${userId} | ${phone} | ${email} | ${createdAt.padEnd(27)} |`)
    })
    console.log('─'.repeat(120))
  }

  // ============================================
  // 6. 问题分析
  // ============================================
  console.log('\n' + '─'.repeat(100))
  console.log('⚠️ 6. 问题分析与建议')
  console.log('─'.repeat(100))

  const issues = []

  // 问题1: 检查积分为0但有已支付订单的用户
  if (allCredits && allOrders) {
    const paidUserIds = new Set(allOrders.filter(o => o.status === 'paid').map(o => o.user_id))
    const zeroCreditsWithPaidOrders = allCredits.filter(c => 
      c.credits === 0 && paidUserIds.has(c.user_id)
    )
    
    if (zeroCreditsWithPaidOrders.length > 0) {
      issues.push({
        severity: '严重',
        title: '积分为0但有已支付订单的用户',
        description: `发现 ${zeroCreditsWithPaidOrders.length} 个用户积分为0但有已支付订单，可能是积分未正确到账`,
        users: zeroCreditsWithPaidOrders.map(c => c.user_id)
      })
    }
  }

  // 问题2: 检查大量待支付订单
  if (allOrders) {
    const pendingOrders = allOrders.filter(o => o.status === 'pending')
    if (pendingOrders.length > 10) {
      issues.push({
        severity: '警告',
        title: '大量待支付订单',
        description: `有 ${pendingOrders.length} 个待支付订单，可能存在支付回调问题或用户放弃支付`,
        suggestion: '建议检查支付回调配置，或定期清理过期订单'
      })
    }
  }

  // 问题3: 检查用户ID格式不一致
  if (allCredits) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const authingPattern = /^[0-9a-f]{24}$/i
    
    const uuidUsers = allCredits.filter(c => uuidPattern.test(c.user_id))
    const authingUsers = allCredits.filter(c => authingPattern.test(c.user_id))
    const otherUsers = allCredits.filter(c => !uuidPattern.test(c.user_id) && !authingPattern.test(c.user_id))
    
    if (uuidUsers.length > 0 && authingUsers.length > 0) {
      issues.push({
        severity: '警告',
        title: '用户ID格式不一致',
        description: `存在两种用户ID格式: Supabase UUID (${uuidUsers.length}个) 和 Authing ID (${authingUsers.length}个)`,
        suggestion: '建议统一用户认证系统，避免数据混乱'
      })
    }
    
    if (otherUsers.length > 0) {
      issues.push({
        severity: '警告',
        title: '存在非标准用户ID',
        description: `发现 ${otherUsers.length} 个非标准格式的用户ID`,
        users: otherUsers.map(c => c.user_id)
      })
    }
  }

  // 问题4: 检查订单和积分表的用户ID是否匹配
  if (allCredits && allOrders) {
    const creditsUserIds = new Set(allCredits.map(c => c.user_id))
    const ordersWithNoCredits = allOrders.filter(o => 
      o.status === 'paid' && !creditsUserIds.has(o.user_id)
    )
    
    if (ordersWithNoCredits.length > 0) {
      issues.push({
        severity: '严重',
        title: '已支付订单但无积分记录',
        description: `发现 ${ordersWithNoCredits.length} 个已支付订单的用户没有积分记录`,
        users: [...new Set(ordersWithNoCredits.map(o => o.user_id))]
      })
    }
  }

  // 问题5: 检查user_profiles表是否有数据
  if (!allProfiles || allProfiles.length === 0) {
    issues.push({
      severity: '信息',
      title: 'user_profiles表为空',
      description: '用户资料表没有数据，可能需要在用户注册时自动创建资料',
      suggestion: '建议添加触发器或在注册流程中创建用户资料'
    })
  }

  // 输出问题
  if (issues.length === 0) {
    console.log('\n✅ 未发现明显问题')
  } else {
    console.log(`\n发现 ${issues.length} 个问题:\n`)
    
    issues.forEach((issue, index) => {
      const severityIcon = issue.severity === '严重' ? '🔴' : issue.severity === '警告' ? '🟡' : '🔵'
      console.log(`${severityIcon} 问题 ${index + 1}: [${issue.severity}] ${issue.title}`)
      console.log(`   描述: ${issue.description}`)
      if (issue.suggestion) {
        console.log(`   建议: ${issue.suggestion}`)
      }
      if (issue.users && issue.users.length > 0) {
        console.log(`   相关用户: ${issue.users.slice(0, 5).join(', ')}${issue.users.length > 5 ? '...' : ''}`)
      }
      console.log('')
    })
  }

  // ============================================
  // 7. 数据库配置建议
  // ============================================
  console.log('\n' + '─'.repeat(100))
  console.log('💡 7. 数据库配置建议')
  console.log('─'.repeat(100))

  console.log(`
📌 当前数据库结构问题:

1. 【用户系统分裂】
   - 存在两套用户系统: Supabase Auth (UUID格式) 和 Authing (24位十六进制)
   - 建议: 统一使用一套认证系统，或建立用户ID映射表

2. 【缺少用户资料关联】
   - user_credits 表只有 user_id，没有用户名、邮箱、手机号等信息
   - 建议: 创建或完善 user_profiles 表，并与 user_credits 关联

3. 【订单状态管理】
   - 大量订单处于 pending 状态，可能是支付回调问题
   - 建议: 
     a. 检查支付回调URL配置
     b. 添加订单超时自动取消机制
     c. 添加手动确认支付功能

4. 【缺少积分变动记录】
   - 没有 credit_transactions 表记录积分变动历史
   - 建议: 创建积分交易记录表，便于追踪和审计

5. 【RLS策略】
   - 部分表标记为 UNRESTRICTED，可能存在安全风险
   - 建议: 为所有表配置适当的 Row Level Security 策略

📌 建议的表结构改进:

-- 用户资料表 (完善)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  user_id TEXT UNIQUE,  -- 兼容 Authing ID
  nickname TEXT,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 积分交易记录表
CREATE TABLE credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,  -- purchase, consume, refund, bonus
  description TEXT,
  reference_id TEXT,  -- 关联订单号等
  balance_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 为 user_credits 添加索引
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
`)

  console.log('\n' + '=' .repeat(100))
  console.log('📊 报告生成完成')
  console.log('=' .repeat(100))
}

main().catch(console.error)
