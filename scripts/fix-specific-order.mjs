/**
 * 修复特定订单并补发积分
 * 订单号: 692e60a37c4e42e6de5c506 (这个实际上被错误存储在user_id字段中)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 数据库中错误存储的订单ID（在user_id字段中）
const WRONG_USER_ID = '692e60a37c4e42e6fde5c506'
const CREDITS_TO_ADD = 10000

async function main() {
  console.log('=' .repeat(80))
  console.log('🔧 修复订单并补发积分')
  console.log('=' .repeat(80))
  console.log('')

  // 1. 查询订单（通过错误的user_id字段）
  console.log('步骤1: 查询订单...')
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', WRONG_USER_ID)
    .single()

  if (orderError || !order) {
    console.log('❌ 未找到订单:', orderError?.message)
    return
  }

  console.log('✅ 找到订单:')
  console.log(`   ID: ${order.id}`)
  console.log(`   order_no: ${order.order_no}`)
  console.log(`   user_id (错误的): ${order.user_id}`)
  console.log(`   product_id: ${order.product_id}`)
  console.log(`   amount: ¥${order.amount}`)
  console.log(`   status: ${order.status}`)
  console.log('')

  // 2. 从 order_no 中提取真实的用户ID
  // order_no 格式: ORDER_时间戳_用户ID
  let realUserId = null
  if (order.order_no) {
    const parts = order.order_no.split('_')
    if (parts.length >= 3) {
      realUserId = parts.slice(2).join('_') // 处理用户ID中可能包含下划线的情况
    }
  }

  if (!realUserId) {
    console.log('❌ 无法从 order_no 中提取用户ID')
    console.log('   order_no:', order.order_no)
    console.log('')
    console.log('⚠️ 由于数据库结构问题，需要手动确定用户ID')
    console.log('请提供正确的用户ID，然后运行:')
    console.log(`   node scripts/manual-add-credits.mjs <用户ID> ${CREDITS_TO_ADD}`)
    return
  }

  console.log(`✅ 从 order_no 提取到真实用户ID: ${realUserId}`)
  console.log('')

  // 3. 查询用户积分记录
  console.log('步骤2: 查询用户积分...')
  const { data: userCredits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', realUserId)
    .single()

  if (creditsError) {
    console.log('❌ 查询用户积分失败:', creditsError.message)
    console.log('   可能用户积分记录不存在，需要先创建')
    
    // 创建用户积分记录
    console.log('\n步骤2.1: 创建用户积分记录...')
    const { error: createError } = await supabase
      .from('user_credits')
      .insert({
        user_id: realUserId,
        credits: 0,
        is_pro: false
      })
    
    if (createError) {
      console.log('❌ 创建用户积分记录失败:', createError.message)
      return
    }
    console.log('✅ 用户积分记录已创建')
  } else {
    console.log('✅ 找到用户积分记录:')
    console.log(`   当前积分: ${userCredits.credits}`)
  }
  console.log('')

  // 4. 更新订单状态
  console.log('步骤3: 更新订单状态...')
  const { error: updateOrderError } = await supabase
    .from('orders')
    .update({
      status: 'paid',
      updated_at: new Date().toISOString()
    })
    .eq('id', order.id)

  if (updateOrderError) {
    console.log('❌ 更新订单失败:', updateOrderError.message)
  } else {
    console.log('✅ 订单状态已更新为 paid')
  }
  console.log('')

  // 5. 获取当前积分
  const { data: currentCredits } = await supabase
    .from('user_credits')
    .select('credits')
    .eq('user_id', realUserId)
    .single()

  const currentAmount = currentCredits?.credits || 0
  const newAmount = currentAmount + CREDITS_TO_ADD

  // 6. 补发积分
  console.log('步骤4: 补发积分...')
  const { data: updatedCredits, error: addCreditsError } = await supabase
    .from('user_credits')
    .update({
      credits: newAmount
    })
    .eq('user_id', realUserId)
    .select()
    .single()

  if (addCreditsError) {
    console.log('❌ 补发积分失败:', addCreditsError.message)
    return
  }

  console.log(`✅ 积分补发成功！`)
  console.log(`   原有积分: ${currentAmount}`)
  console.log(`   补发积分: ${CREDITS_TO_ADD}`)
  console.log(`   更新后积分: ${updatedCredits.credits}`)
  console.log('')

  // 7. 创建积分交易记录
  console.log('步骤5: 创建积分交易记录...')
  const { error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: realUserId,
      amount: CREDITS_TO_ADD,
      type: 'purchase',
      description: `购买${order.product_id}获得${CREDITS_TO_ADD}积分（手动补发）`,
      order_id: order.id,
      balance_after: updatedCredits.credits
    })

  if (txError) {
    console.log('⚠️ 创建交易记录失败:', txError.message)
  } else {
    console.log('✅ 积分交易记录已创建')
  }

  console.log('')
  console.log('=' .repeat(80))
  console.log('✅ 订单处理完成！')
  console.log('=' .repeat(80))
  console.log(`用户ID: ${realUserId}`)
  console.log(`订单号: ${order.order_no}`)
  console.log(`产品: ${order.product_id}`)
  console.log(`补发积分: ${CREDITS_TO_ADD}`)
  console.log(`当前积分: ${updatedCredits.credits}`)
  console.log('=' .repeat(80))
}

main().catch(console.error)
