/**
 * 手动处理已支付订单并补发积分
 * 订单: 692e60a37c4e42e6fde5c506
 * 用户: xunhupay
 * 产品: credits-10000 (10000积分)
 * 金额: ¥90
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 注意：数据库中实际的ID（在user_id字段中）
const ORDER_USER_ID = '692e60a37c4e42e6fde5c506'
const CREDITS_TO_ADD = 10000
const PRODUCT_ID = 'credits-10000'

async function main() {
  console.log('=' .repeat(80))
  console.log('🔧 手动处理已支付订单')
  console.log('=' .repeat(80))
  console.log(`订单ID (存储在user_id字段): ${ORDER_USER_ID}`)
  console.log(`应补发积分: ${CREDITS_TO_ADD}`)
  console.log('')

  // 1. 查询订单
  console.log('步骤1: 查询订单...')
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', ORDER_USER_ID)
    .single()

  if (orderError || !order) {
    console.log('❌ 未找到订单:', orderError?.message)
    return
  }

  console.log('✅ 找到订单:')
  console.log(`   产品: ${order.product_id}`)
  console.log(`   金额: ¥${order.amount}`)
  console.log(`   当前状态: ${order.status}`)
  console.log('')

  // 2. 查询或创建用户积分记录
  console.log('步骤2: 查询用户积分记录...')
  
  // 由于order_id和user_id字段混乱，我们需要找到真实的用户ID
  // 从订单创建API来看，真实的用户ID应该在其他地方
  // 让我们先查询所有user_credits，看看是否有匹配的
  
  const { data: allCredits } = await supabase
    .from('user_credits')
    .select('*')
  
  console.log(`找到 ${allCredits?.length || 0} 个用户积分记录`)
  
  // 由于数据库结构混乱，我们需要手动指定用户ID
  // 根据截图，用户名是 xunhupay，但我们需要找到对应的真实用户ID
  
  console.log('\n⚠️ 警告: 由于数据库表结构问题，无法自动确定真实用户ID')
  console.log('需要手动确认用户ID后再执行积分补发')
  console.log('')
  console.log('建议步骤:')
  console.log('1. 在管理后台查找用户 "xunhupay" 的真实用户ID')
  console.log('2. 使用 scripts/manual-add-credits.mjs 脚本手动补发积分')
  console.log('3. 手动更新订单状态')
  console.log('')
  
  // 3. 更新订单状态
  console.log('步骤3: 更新订单状态为 paid...')
  
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      credits_amount: CREDITS_TO_ADD,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', ORDER_USER_ID)

  if (updateError) {
    console.log('❌ 更新订单失败:', updateError.message)
  } else {
    console.log('✅ 订单状态已更新为 paid')
    console.log('✅ credits_amount 已设置为', CREDITS_TO_ADD)
  }
  
  console.log('')
  console.log('=' .repeat(80))
  console.log('⚠️ 重要提示')
  console.log('=' .repeat(80))
  console.log('由于数据库表结构问题（order_id和user_id字段混乱），')
  console.log('积分补发需要手动完成。请按以下步骤操作：')
  console.log('')
  console.log('1. 确认用户 "xunhupay" 的真实 Supabase 用户ID')
  console.log('2. 运行以下命令补发积分：')
  console.log(`   node scripts/manual-add-credits.mjs <真实用户ID> ${CREDITS_TO_ADD}`)
  console.log('')
  console.log('3. 或者直接在 Supabase 后台执行 SQL:')
  console.log(`   UPDATE user_credits`)
  console.log(`   SET credits = credits + ${CREDITS_TO_ADD}`)
  console.log(`   WHERE user_id = '<真实用户ID>';`)
  console.log('')
  console.log('=' .repeat(80))
}

main().catch(console.error)
