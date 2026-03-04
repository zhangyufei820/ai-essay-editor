/**
 * 修复三个用户的积分问题
 * 
 * 用户ID:
 * - 693e22ebea184da3aff35e44
 * - 699c04cab6a19ab3a458ba18
 * - 69a0272a2f8e250fa32c7172
 * 
 * 问题: 订阅了28元基础版套餐，积分没有到账
 * 解决: 补回2000积分，设置is_pro=true
 * 
 * 使用方法: node scripts/fix-three-users-credits.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 需要修复的用户ID
const USER_IDS = [
  '693e22ebea184da3aff35e44',
  '699c04cab6a19ab3a458ba18',
  '69a0272a2f8e250fa32c7172'
]

// 基础版套餐配置
const BASIC_PLAN = {
  credits: 2000,
  isPro: true,
  productId: 'basic',
  amount: 28
}

async function checkUserStatus(userId) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🔍 检查用户: ${userId}`)
  console.log('='.repeat(60))
  
  // 1. 查询用户积分
  const { data: credits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  
  if (creditsError) {
    console.log('❌ 查询积分失败:', creditsError.message)
  } else if (credits) {
    console.log('💰 当前积分记录:')
    console.log(`   积分: ${credits.credits}`)
    console.log(`   是否Pro: ${credits.is_pro}`)
    console.log(`   创建时间: ${credits.created_at}`)
    console.log(`   更新时间: ${credits.updated_at}`)
  } else {
    console.log('⚠️ 用户没有积分记录')
  }
  
  // 2. 查询用户订单
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (ordersError) {
    console.log('❌ 查询订单失败:', ordersError.message)
  } else if (orders && orders.length > 0) {
    console.log(`📋 订单记录 (共 ${orders.length} 个):`)
    orders.forEach((order, index) => {
      console.log(`   ${index + 1}. ${order.product_name} - ¥${order.amount} - ${order.status}`)
      console.log(`      订单号: ${order.order_no}`)
      console.log(`      创建时间: ${order.created_at}`)
    })
  } else {
    console.log('⚠️ 用户没有订单记录')
  }
  
  return { credits, orders }
}

async function fixUserCredits(userId) {
  console.log(`\n🔧 修复用户 ${userId} 的积分...`)
  
  // 查询当前积分
  const { data: currentCredits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  
  if (currentCredits) {
    // 更新现有记录 - 添加2000积分
    const newCredits = currentCredits.credits + BASIC_PLAN.credits
    
    console.log(`   当前积分: ${currentCredits.credits} → 新积分: ${newCredits}`)
    console.log(`   当前Pro状态: ${currentCredits.is_pro} → 新Pro状态: true`)
    
    const { error: updateError } = await supabase
      .from('user_credits')
      .update({
        credits: newCredits,
        is_pro: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
    
    if (updateError) {
      console.log('   ❌ 更新失败:', updateError.message)
      return false
    }
    
    console.log('   ✅ 积分更新成功!')
    
    // 记录交易流水
    try {
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: BASIC_PLAN.credits,
        type: 'purchase',
        description: `补发基础版订阅积分(¥28) - 2000积分`,
        balance_before: currentCredits.credits,
        balance_after: newCredits
      })
      console.log('   ✅ 交易流水记录成功')
    } catch (e) {
      console.log('   ⚠️ 交易流水记录失败（不影响积分）')
    }
    
  } else {
    // 创建新记录
    console.log(`   创建新积分记录: ${BASIC_PLAN.credits}积分, is_pro=true`)
    
    const { error: insertError } = await supabase
      .from('user_credits')
      .upsert({
        user_id: userId,
        credits: BASIC_PLAN.credits,
        is_pro: true
      }, { onConflict: 'user_id' })
    
    if (insertError) {
      console.log('   ❌ 创建失败:', insertError.message)
      return false
    }
    
    console.log('   ✅ 积分记录创建成功!')
    
    // 记录交易流水
    try {
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: BASIC_PLAN.credits,
        type: 'purchase',
        description: `补发基础版订阅积分(¥28) - 2000积分`,
        balance_before: 0,
        balance_after: BASIC_PLAN.credits
      })
      console.log('   ✅ 交易流水记录成功')
    } catch (e) {
      console.log('   ⚠️ 交易流水记录失败（不影响积分）')
    }
  }
  
  return true
}

async function updateOrderStatus(userId) {
  // 查找该用户的28元基础版待支付订单，更新为已支付
  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('amount', 28)
  
  if (pendingOrders && pendingOrders.length > 0) {
    console.log(`   发现 ${pendingOrders.length} 个待支付的28元订单，更新为已支付...`)
    
    for (const order of pendingOrders) {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)
      
      if (error) {
        console.log(`   ❌ 更新订单 ${order.order_no} 失败:`, error.message)
      } else {
        console.log(`   ✅ 订单 ${order.order_no} 已更新为 paid`)
      }
    }
  }
}

async function verifyFix(userId) {
  console.log(`\n📊 验证用户 ${userId} 修复结果...`)
  
  const { data: credits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  
  if (credits) {
    console.log(`   ✅ 积分: ${credits.credits}`)
    console.log(`   ✅ Pro状态: ${credits.is_pro}`)
    return credits.credits >= BASIC_PLAN.credits && credits.is_pro === true
  }
  
  return false
}

async function main() {
  console.log('=' .repeat(80))
  console.log('🔧 修复三个用户的订阅积分问题')
  console.log('   用户订阅了28元基础版套餐，但积分未到账')
  console.log('   将为每个用户补发 2000 积分并设置 is_pro = true')
  console.log('=' .repeat(80))
  
  // 第一步：检查所有用户状态
  console.log('\n\n📋 第一步：检查所有用户当前状态')
  console.log('=' .repeat(80))
  
  for (const userId of USER_IDS) {
    await checkUserStatus(userId)
  }
  
  // 第二步：修复积分
  console.log('\n\n🔧 第二步：修复用户积分')
  console.log('=' .repeat(80))
  
  const results = []
  for (const userId of USER_IDS) {
    const success = await fixUserCredits(userId)
    await updateOrderStatus(userId)
    results.push({ userId, success })
  }
  
  // 第三步：验证修复结果
  console.log('\n\n✅ 第三步：验证修复结果')
  console.log('=' .repeat(80))
  
  for (const userId of USER_IDS) {
    const verified = await verifyFix(userId)
    console.log(`   用户 ${userId}: ${verified ? '✅ 修复成功' : '❌ 修复失败'}`)
  }
  
  // 总结
  console.log('\n\n📊 修复总结')
  console.log('=' .repeat(80))
  const successCount = results.filter(r => r.success).length
  console.log(`   成功: ${successCount}/${USER_IDS.length}`)
  console.log(`   每个用户补发: ${BASIC_PLAN.credits} 积分`)
  console.log(`   Pro状态: 已激活`)
  
  if (successCount === USER_IDS.length) {
    console.log('\n🎉 所有用户积分修复完成!')
  } else {
    console.log('\n⚠️ 部分用户修复失败，请检查日志')
  }
}

main().catch(console.error)
