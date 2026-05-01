/**
 * 手动补发积分脚本
 * 为已支付但积分未到账的用户补发积分
 * 
 * 使用方法: node scripts/manual-add-credits.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 需要补发积分的订单列表（从迅虎支付后台确认的已支付订单）
const paidOrders = [
  {
    orderNo: 'ORDER_1767389526307_693532cadd3ea7b320cbdb39',
    userId: '693532cadd3ea7b320cbdb39',
    amount: 90,
    productName: '10000 积分充值包',
    paidAt: '2026-01-03 05:33'
  },
  {
    orderNo: 'ORDER_1767372464578_6957a6694f0a6c11d3ba0c54',
    userId: '6957a6694f0a6c11d3ba0c54',
    amount: 68,
    productName: '专业版',
    paidAt: '2026-01-03 00:48'
  },
  {
    orderNo: 'ORDER_1767364108711_69415eb0e16528581d64c36d',
    userId: '69415eb0e16528581d64c36d',
    amount: 28,
    productName: '基础版',
    paidAt: '2026-01-02 22:29'
  }
]

async function checkTableStructure() {
  console.log('🔍 检查 user_credits 表结构...\n')
  
  // 查询一条记录来看表结构
  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .limit(1)
  
  if (error) {
    console.log('查询表结构出错:', error)
    return null
  }
  
  if (data && data.length > 0) {
    console.log('表字段:', Object.keys(data[0]))
    return Object.keys(data[0])
  }
  
  // 如果表是空的，尝试插入一条测试记录来看结构
  console.log('表为空，尝试查看可用字段...')
  return null
}

async function addCreditsToUser(userId, credits, orderNo, productName) {
  try {
    // 1. 检查用户是否有积分记录
    const { data: userCredits, error: creditsError } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single()

    console.log(`  当前用户积分记录:`, userCredits)

    if (creditsError && creditsError.code === 'PGRST116') {
      // 用户没有积分记录，创建一条（只使用基本字段）
      console.log(`  📝 为用户 ${userId} 创建积分记录...`)
      const { error: insertError } = await supabase
        .from('user_credits')
        .insert({
          user_id: userId,
          credits: credits  // 直接设置为要补发的积分
        })
      
      if (insertError) {
        console.error(`  ❌ 创建积分记录失败:`, insertError)
        return false
      }
      
      console.log(`  ✅ 创建积分记录成功，积分: ${credits}`)
    } else if (userCredits) {
      // 用户有积分记录，更新积分
      const currentAmount = userCredits.credits || 0
      
      const { error: updateError } = await supabase
        .from('user_credits')
        .update({
          credits: currentAmount + credits,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      if (updateError) {
        console.error(`  ❌ 更新积分失败:`, updateError)
        return false
      }
      
      console.log(`  ✅ 更新积分成功: ${currentAmount} -> ${currentAmount + credits}`)
    }

    // 2. 记录积分交易
    const { error: transactionError } = await supabase
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount: credits,
        type: 'purchase',
        description: `购买${productName}获得积分（手动补发）`,
        reference_id: orderNo
      })

    if (transactionError) {
      console.error(`  ❌ 记录交易失败:`, transactionError)
      // 交易记录失败不影响积分补发
    } else {
      console.log(`  ✅ 交易记录已创建`)
    }

    // 3. 更新订单状态为已支付
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('order_no', orderNo)

    if (orderUpdateError) {
      console.error(`  ⚠️ 更新订单状态失败:`, orderUpdateError)
    } else {
      console.log(`  ✅ 订单状态已更新为 paid`)
    }

    return true
  } catch (error) {
    console.error(`  ❌ 处理失败:`, error)
    return false
  }
}

async function main() {
  console.log('🚀 开始手动补发积分...\n')
  
  // 先检查表结构
  await checkTableStructure()
  
  console.log('\n' + '=' .repeat(80))

  let successCount = 0
  let failCount = 0

  for (const order of paidOrders) {
    const credits = order.amount * 100 // 1元 = 100积分
    
    console.log(`\n📋 处理订单: ${order.orderNo}`)
    console.log(`   用户ID: ${order.userId}`)
    console.log(`   产品: ${order.productName}`)
    console.log(`   金额: ¥${order.amount}`)
    console.log(`   积分: ${credits}`)
    console.log(`   支付时间: ${order.paidAt}`)

    const success = await addCreditsToUser(order.userId, credits, order.orderNo, order.productName)
    
    if (success) {
      console.log(`   ✅ 补发成功！`)
      successCount++
    } else {
      console.log(`   ❌ 补发失败！`)
      failCount++
    }
  }

  console.log('\n' + '=' .repeat(80))
  console.log('📊 补发结果统计:')
  console.log(`   ✅ 成功: ${successCount} 个订单`)
  console.log(`   ❌ 失败: ${failCount} 个订单`)
  console.log('=' .repeat(80))

  // 验证结果
  console.log('\n🔍 验证补发结果...\n')
  
  for (const order of paidOrders) {
    const { data: userCredits } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', order.userId)
      .single()

    console.log(`用户 ${order.userId}:`)
    console.log(`   积分记录:`, userCredits)
  }
}

main().catch(console.error)
