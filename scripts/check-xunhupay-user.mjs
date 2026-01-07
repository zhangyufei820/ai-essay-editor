/**
 * 查询用户 xunhupay 的积分情况
 * 订单号: 692e60a37c4e42e6de5c506
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const ORDER_ID = '692e60a37c4e42e6de5c506'
const USERNAME = 'xunhupay'

async function main() {
  console.log('=' .repeat(80))
  console.log(`🔍 查询用户 ${USERNAME} 的积分情况`)
  console.log(`📦 订单号: ${ORDER_ID}`)
  console.log('=' .repeat(80))
  
  // 1. 通过用户名查询用户信息
  console.log('\n👤 步骤1: 查询用户基本信息...\n')
  
  // 先尝试通过订单查找用户ID
  const { data: orderData } = await supabase
    .from('orders')
    .select('user_id')
    .eq('order_id', ORDER_ID)
    .single()
  
  let userId = orderData?.user_id
  
  // 如果没有找到订单，尝试通过用户名查找
  if (!userId) {
    const { data: authUsers } = await supabase.auth.admin.listUsers()
    const matchedUser = authUsers?.users?.find(u => 
      u.user_metadata?.username === USERNAME ||
      u.user_metadata?.name === USERNAME ||
      u.phone === USERNAME
    )
    userId = matchedUser?.id
  }
  
  if (!userId) {
    console.log('❌ 无法找到用户')
    
    // 尝试查询订单表中的所有用户
    const { data: allOrders } = await supabase
      .from('orders')
      .select('user_id, order_id')
      .limit(10)
    
    console.log('\n最近的订单:')
    allOrders?.forEach(o => {
      console.log(`   订单: ${o.order_id}, 用户: ${o.user_id}`)
    })
    return
  }
  
  console.log('✅ 找到用户ID:', userId)
  
  // 2. 查询特定订单
  console.log('\n📦 步骤2: 查询特定订单...\n')
  
  const { data: specificOrder, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('order_id', ORDER_ID)
    .single()
  
  if (orderError) {
    console.log('❌ 查询订单失败:', orderError.message)
  } else {
    console.log('✅ 订单详情:')
    console.log(`   订单ID: ${specificOrder.order_id}`)
    console.log(`   用户ID: ${specificOrder.user_id}`)
    console.log(`   产品ID: ${specificOrder.product_id}`)
    console.log(`   金额: ¥${specificOrder.amount}`)
    console.log(`   状态: ${specificOrder.status}`)
    console.log(`   积分数量: ${specificOrder.credits_amount || '未设置'}`)
    console.log(`   交易号: ${specificOrder.trade_no || '无'}`)
    console.log(`   创建时间: ${specificOrder.created_at}`)
    console.log(`   更新时间: ${specificOrder.updated_at}`)
  }
  
  // 3. 查询该用户的所有订单
  console.log('\n📋 步骤3: 查询用户所有订单...\n')
  
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (ordersError) {
    console.log('❌ 查询订单失败:', ordersError.message)
  } else if (!orders || orders.length === 0) {
    console.log('⚠️ 该用户没有订单记录')
  } else {
    console.log(`✅ 找到 ${orders.length} 个订单:\n`)
    orders.forEach((order, index) => {
      console.log(`📦 订单 ${index + 1}:`)
      console.log(`   订单ID: ${order.order_id}`)
      console.log(`   产品ID: ${order.product_id}`)
      console.log(`   金额: ¥${order.amount}`)
      console.log(`   状态: ${order.status}`)
      console.log(`   积分数量: ${order.credits_amount || '未设置'}`)
      console.log(`   创建时间: ${order.created_at}`)
      console.log('')
    })
  }
  
  // 4. 查询积分交易记录
  console.log('\n💰 步骤4: 查询积分交易记录...\n')
  
  const { data: transactions, error: txError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (txError) {
    console.log('❌ 查询交易记录失败:', txError.message)
  } else if (!transactions || transactions.length === 0) {
    console.log('⚠️ 该用户没有积分交易记录')
  } else {
    console.log(`✅ 找到 ${transactions.length} 条交易记录:\n`)
    transactions.forEach((tx, index) => {
      console.log(`💳 交易 ${index + 1}:`)
      console.log(`   类型: ${tx.type}`)
      console.log(`   金额: ${tx.amount}`)
      console.log(`   余额: ${tx.balance_after}`)
      console.log(`   描述: ${tx.description}`)
      console.log(`   关联订单: ${tx.order_id || '无'}`)
      console.log(`   创建时间: ${tx.created_at}`)
      console.log('')
    })
  }
  
  // 5. 查询 user_credits 表
  console.log('\n💎 步骤5: 查询 user_credits 表...\n')
  
  const { data: userCredits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (creditsError) {
    console.log('❌ 查询 user_credits 失败:', creditsError.message)
  } else {
    console.log('✅ user_credits 记录:')
    console.log(`   用户ID: ${userCredits.user_id}`)
    console.log(`   积分: ${userCredits.credits}`)
    console.log(`   是否Pro: ${userCredits.is_pro}`)
    console.log(`   创建时间: ${userCredits.created_at}`)
    console.log(`   更新时间: ${userCredits.updated_at}`)
  }
  
  console.log('\n' + '=' .repeat(80))
  console.log('📊 分析结论:')
  console.log('=' .repeat(80))
  
  if (specificOrder) {
    console.log(`\n订单 ${ORDER_ID} 的情况:`)
    console.log(`- 产品: ${specificOrder.product_id}`)
    console.log(`- 金额: ¥${specificOrder.amount}`)
    console.log(`- 状态: ${specificOrder.status}`)
    console.log(`- 应得积分: ${specificOrder.credits_amount || '未设置'}`)
    
    if (specificOrder.status === 'pending') {
      console.log('\n⚠️ 问题分析:')
      console.log('订单状态为 pending（待支付），可能的原因：')
      console.log('1. 用户尚未完成支付')
      console.log('2. 支付成功但回调未正确处理')
      console.log('3. 支付回调失败导致订单状态未更新')
      
      console.log('\n💡 解决方案:')
      console.log('1. 确认用户是否已在迅虎支付后台完成支付')
      console.log('2. 如果已支付，需要手动更新订单状态并补发积分')
      console.log('3. 可以使用 scripts/update-order-status.mjs 脚本手动处理')
    } else if (specificOrder.status === 'paid') {
      console.log('\n✅ 订单已支付')
      
      // 检查是否有对应的积分交易记录
      const relatedTx = transactions?.find(tx => tx.order_id === ORDER_ID)
      if (!relatedTx) {
        console.log('⚠️ 但未找到对应的积分交易记录，积分可能未正确发放')
        console.log('需要手动补发积分')
      } else {
        console.log('✅ 找到对应的积分交易记录，积分已正确发放')
      }
    }
  }
  
  if (userCredits) {
    console.log('\n当前用户积分: ' + userCredits.credits)
  }
  console.log('=' .repeat(80))
}

main().catch(console.error)
