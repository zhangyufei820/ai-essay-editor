/**
 * 验证数据库修复是否成功
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function verifyFix() {
  console.log('=' .repeat(80))
  console.log('🔍 验证数据库修复结果')
  console.log('=' .repeat(80))
  console.log('')

  let allPassed = true

  // 1. 检查 orders 表字段
  console.log('1️⃣ 检查 orders 表字段...')
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .limit(1)

  if (ordersError) {
    console.log('❌ 查询 orders 表失败:', ordersError.message)
    allPassed = false
  } else if (orders && orders.length > 0) {
    const order = orders[0]
    const hasUpdatedAt = 'updated_at' in order
    const hasTradeNo = 'trade_no' in order
    const hasCreditsAmount = 'credits_amount' in order

    console.log(`   ${hasUpdatedAt ? '✅' : '❌'} updated_at 字段`)
    console.log(`   ${hasTradeNo ? '✅' : '❌'} trade_no 字段`)
    console.log(`   ${hasCreditsAmount ? '✅' : '❌'} credits_amount 字段`)

    if (!hasUpdatedAt || !hasTradeNo || !hasCreditsAmount) {
      allPassed = false
    }
  }
  console.log('')

  // 2. 检查订单的 credits_amount 是否已设置
  console.log('2️⃣ 检查订单积分设置...')
  const { data: ordersWithCredits, error: creditsError } = await supabase
    .from('orders')
    .select('id, product_id, credits_amount')
    .not('credits_amount', 'is', null)

  if (creditsError) {
    console.log('❌ 查询失败:', creditsError.message)
    allPassed = false
  } else {
    console.log(`   ✅ ${ordersWithCredits?.length || 0} 个订单已设置 credits_amount`)
    
    // 显示前5个订单的积分设置
    if (ordersWithCredits && ordersWithCredits.length > 0) {
      console.log('\n   示例订单:')
      ordersWithCredits.slice(0, 5).forEach(order => {
        console.log(`   - ${order.product_id}: ${order.credits_amount} 积分`)
      })
    }
  }
  console.log('')

  // 3. 检查 credit_transactions 表
  console.log('3️⃣ 检查 credit_transactions 表...')
  const { data: transactions, error: txError } = await supabase
    .from('credit_transactions')
    .select('*')
    .limit(1)

  if (txError) {
    console.log('❌ 查询失败:', txError.message)
    allPassed = false
  } else if (transactions && transactions.length > 0) {
    const tx = transactions[0]
    const hasOrderId = 'order_id' in tx

    console.log(`   ${hasOrderId ? '✅' : '❌'} order_id 字段`)

    if (!hasOrderId) {
      allPassed = false
    }
  }
  console.log('')

  // 4. 检查特定订单（之前补发积分的订单）
  console.log('4️⃣ 检查已修复的订单...')
  const { data: fixedOrder, error: fixedError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', '692e60a37c4e42e6fde5c506')
    .single()

  if (fixedError) {
    console.log('❌ 查询失败:', fixedError.message)
  } else if (fixedOrder) {
    console.log(`   订单号: ${fixedOrder.order_no}`)
    console.log(`   产品: ${fixedOrder.product_id}`)
    console.log(`   积分数量: ${fixedOrder.credits_amount || '未设置'}`)
    console.log(`   状态: ${fixedOrder.status}`)
    
    if (fixedOrder.credits_amount === 10000) {
      console.log('   ✅ 积分数量正确')
    } else {
      console.log('   ⚠️ 积分数量可能不正确')
    }
  }
  console.log('')

  // 5. 检查用户积分
  console.log('5️⃣ 检查用户积分...')
  const { data: userCredits, error: userError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', '692e60a37c4e42e6fde5c506')
    .single()

  if (userError) {
    console.log('❌ 查询失败:', userError.message)
  } else if (userCredits) {
    console.log(`   用户ID: ${userCredits.user_id}`)
    console.log(`   当前积分: ${userCredits.credits}`)
    
    if (userCredits.credits >= 10000) {
      console.log('   ✅ 积分已到账')
    } else {
      console.log('   ⚠️ 积分可能不足')
    }
  }
  console.log('')

  // 总结
  console.log('=' .repeat(80))
  if (allPassed) {
    console.log('✅ 所有检查通过！数据库修复成功！')
  } else {
    console.log('⚠️ 部分检查未通过，请检查上述错误信息')
  }
  console.log('=' .repeat(80))
}

verifyFix().catch(console.error)
