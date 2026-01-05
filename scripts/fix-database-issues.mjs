/**
 * 数据库问题修复脚本
 * 
 * 修复内容：
 * 1. 创建积分交易记录表
 * 2. 清理过期的pending订单（超过24小时）
 * 3. 添加必要的索引
 * 4. 为现有积分记录创建初始交易记录
 * 
 * 使用方法: node scripts/fix-database-issues.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('=' .repeat(80))
  console.log('🔧 数据库问题修复脚本')
  console.log('=' .repeat(80))
  console.log(`执行时间: ${new Date().toLocaleString('zh-CN')}`)
  console.log('')

  // ============================================
  // 1. 创建积分交易记录表
  // ============================================
  console.log('\n' + '─'.repeat(80))
  console.log('📋 步骤1: 创建积分交易记录表')
  console.log('─'.repeat(80))

  // 尝试直接查询来验证表是否存在
  const { error: testError } = await supabase
    .from('credit_transactions')
    .select('id')
    .limit(1)

  if (testError && testError.code === '42P01') {
    console.log('⚠️ credit_transactions 表不存在，请在 Supabase 控制台执行以下 SQL:')
    console.log('')
    console.log('```sql')
    console.log(`CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'consume', 'refund', 'bonus', 'register', 'manual')),
  description TEXT,
  reference_id TEXT,
  balance_before INTEGER,
  balance_after INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);`)
    console.log('```')
    console.log('')
  } else {
    console.log('✅ credit_transactions 表已存在或创建成功')
  }

  // ============================================
  // 2. 清理过期的pending订单
  // ============================================
  console.log('\n' + '─'.repeat(80))
  console.log('🧹 步骤2: 清理过期的pending订单')
  console.log('─'.repeat(80))

  // 获取所有pending订单
  const { data: pendingOrders, error: pendingError } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (pendingError) {
    console.log('❌ 查询pending订单失败:', pendingError.message)
  } else {
    console.log(`\n找到 ${pendingOrders.length} 个pending订单`)
    
    // 计算24小时前的时间
    const expireTime = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    // 筛选过期订单
    const expiredOrders = pendingOrders.filter(o => new Date(o.created_at) < expireTime)
    
    console.log(`其中 ${expiredOrders.length} 个订单已超过24小时`)
    
    if (expiredOrders.length > 0) {
      console.log('\n过期订单列表:')
      expiredOrders.forEach((order, index) => {
        console.log(`  ${index + 1}. ${order.order_no} - ${order.product_name} ¥${order.amount} - ${order.created_at}`)
      })
      
      // 将过期订单状态改为 expired
      const expiredOrderIds = expiredOrders.map(o => o.id)
      
      const { error: updateError } = await supabase
        .from('orders')
        .update({ status: 'expired' })
        .in('id', expiredOrderIds)
      
      if (updateError) {
        console.log('\n❌ 更新订单状态失败:', updateError.message)
      } else {
        console.log(`\n✅ 已将 ${expiredOrders.length} 个过期订单状态更新为 expired`)
      }
    } else {
      console.log('✅ 没有需要清理的过期订单')
    }
  }

  // ============================================
  // 3. 检查并添加索引
  // ============================================
  console.log('\n' + '─'.repeat(80))
  console.log('📊 步骤3: 检查数据库索引')
  console.log('─'.repeat(80))

  console.log(`
请在 Supabase 控制台执行以下 SQL 添加索引（如果不存在）:

\`\`\`sql
-- user_credits 表索引
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);

-- orders 表索引
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- chat_sessions 表索引
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

-- chat_messages 表索引
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
\`\`\`
`)

  // ============================================
  // 4. 为现有积分记录创建初始交易记录
  // ============================================
  console.log('\n' + '─'.repeat(80))
  console.log('💰 步骤4: 为现有积分记录创建初始交易记录')
  console.log('─'.repeat(80))

  // 检查 credit_transactions 表是否存在
  const { data: existingTransactions, error: transError } = await supabase
    .from('credit_transactions')
    .select('id')
    .limit(1)

  if (transError && transError.code === '42P01') {
    console.log('⚠️ credit_transactions 表不存在，跳过此步骤')
    console.log('   请先在 Supabase 控制台创建表后再运行此脚本')
  } else {
    // 获取所有用户积分
    const { data: allCredits } = await supabase
      .from('user_credits')
      .select('*')
      .gt('credits', 0)

    if (allCredits && allCredits.length > 0) {
      // 检查是否已有交易记录
      const { count } = await supabase
        .from('credit_transactions')
        .select('*', { count: 'exact', head: true })

      if (count === 0) {
        console.log(`\n为 ${allCredits.length} 个有积分的用户创建初始交易记录...`)
        
        const transactions = allCredits.map(credit => ({
          user_id: credit.user_id,
          amount: credit.credits,
          type: 'manual',
          description: '历史积分迁移 - 初始化记录',
          balance_before: 0,
          balance_after: credit.credits,
          created_at: credit.updated_at || new Date().toISOString()
        }))

        // 批量插入
        const { error: insertError } = await supabase
          .from('credit_transactions')
          .insert(transactions)

        if (insertError) {
          console.log('❌ 创建交易记录失败:', insertError.message)
        } else {
          console.log(`✅ 成功创建 ${transactions.length} 条初始交易记录`)
        }
      } else {
        console.log(`✅ 已存在 ${count} 条交易记录，跳过初始化`)
      }
    }
  }

  // ============================================
  // 5. 统计修复结果
  // ============================================
  console.log('\n' + '─'.repeat(80))
  console.log('📊 步骤5: 修复结果统计')
  console.log('─'.repeat(80))

  // 重新统计订单状态
  const { data: orderStats } = await supabase
    .from('orders')
    .select('status')

  if (orderStats) {
    const stats = {}
    orderStats.forEach(o => {
      stats[o.status] = (stats[o.status] || 0) + 1
    })
    
    console.log('\n订单状态统计:')
    Object.entries(stats).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} 个`)
    })
  }

  console.log('\n' + '=' .repeat(80))
  console.log('🎉 数据库修复完成！')
  console.log('=' .repeat(80))
  
  console.log(`
📌 后续建议:

1. 在 Supabase 控制台执行 scripts/011_create_credit_transactions.sql 创建积分交易表
2. 配置 RLS 策略保护数据安全
3. 检查支付回调 URL 配置是否正确
4. 定期运行此脚本清理过期订单

📌 支付回调 URL 配置:
   - 迅虎支付回调地址应设置为: https://your-domain.com/api/payment/xunhupay/notify
   - 确保回调地址可以被外网访问
`)
}

main().catch(console.error)
