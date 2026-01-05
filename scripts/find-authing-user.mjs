/**
 * 查找 Authing 用户脚本
 * 根据用户购买时间和金额查找对应的用户
 * 
 * 使用方法: node scripts/find-authing-user.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 用户信息
// 12月21日买了128元一个月的会员 → premium 套餐 → 12000积分
// 12月24日买了5000积分 → credits-5000 → 5000积分
// 总计应有 17000 积分

async function main() {
  console.log('=' .repeat(80))
  console.log('🔍 查找用户 15858565338 的 Authing 账号')
  console.log('=' .repeat(80))
  
  // 1. 查询12月21日的128元订单
  console.log('\n📋 步骤1: 查询12月21日的128元订单...\n')
  
  const { data: allOrders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (ordersError) {
    console.error('❌ 查询订单失败:', ordersError)
    return
  }
  
  // 筛选128元订单
  const premiumOrders = allOrders.filter(o => 
    Number(o.amount) === 128 || o.product_id === 'premium'
  )
  
  console.log(`找到 ${premiumOrders.length} 个128元/豪华版订单:\n`)
  
  premiumOrders.forEach((order, index) => {
    console.log(`📦 订单 ${index + 1}:`)
    console.log(`   订单号: ${order.order_no}`)
    console.log(`   用户ID: ${order.user_id}`)
    console.log(`   产品: ${order.product_name} (${order.product_id})`)
    console.log(`   金额: ¥${order.amount}`)
    console.log(`   状态: ${order.status}`)
    console.log(`   创建时间: ${order.created_at}`)
    console.log('')
  })
  
  // 2. 查询12月24日的50元订单（5000积分）
  console.log('\n📋 步骤2: 查询50元/5000积分订单...\n')
  
  const creditsOrders = allOrders.filter(o => 
    Number(o.amount) === 50 || o.product_id === 'credits-5000'
  )
  
  console.log(`找到 ${creditsOrders.length} 个50元/5000积分订单:\n`)
  
  creditsOrders.forEach((order, index) => {
    console.log(`📦 订单 ${index + 1}:`)
    console.log(`   订单号: ${order.order_no}`)
    console.log(`   用户ID: ${order.user_id}`)
    console.log(`   产品: ${order.product_name} (${order.product_id})`)
    console.log(`   金额: ¥${order.amount}`)
    console.log(`   状态: ${order.status}`)
    console.log(`   创建时间: ${order.created_at}`)
    console.log('')
  })
  
  // 3. 查找12月21-24日期间的所有订单
  console.log('\n📋 步骤3: 查询12月21-24日的所有订单...\n')
  
  const dec21 = new Date('2025-12-21T00:00:00+08:00')
  const dec25 = new Date('2025-12-25T00:00:00+08:00')
  
  const decOrders = allOrders.filter(o => {
    const orderDate = new Date(o.created_at)
    return orderDate >= dec21 && orderDate < dec25
  })
  
  console.log(`找到 ${decOrders.length} 个12月21-24日的订单:\n`)
  
  decOrders.forEach((order, index) => {
    console.log(`📦 订单 ${index + 1}:`)
    console.log(`   订单号: ${order.order_no}`)
    console.log(`   用户ID: ${order.user_id}`)
    console.log(`   产品: ${order.product_name} (${order.product_id})`)
    console.log(`   金额: ¥${order.amount}`)
    console.log(`   状态: ${order.status}`)
    console.log(`   创建时间: ${order.created_at}`)
    console.log('')
  })
  
  // 4. 查找同一用户购买了128元和50元的情况
  console.log('\n📋 步骤4: 查找同时购买了128元和50元的用户...\n')
  
  // 获取所有购买过128元的用户ID
  const premiumUserIds = new Set(premiumOrders.map(o => o.user_id))
  
  // 获取所有购买过50元的用户ID
  const creditsUserIds = new Set(creditsOrders.map(o => o.user_id))
  
  // 找到同时购买了两种产品的用户
  const bothUserIds = [...premiumUserIds].filter(id => creditsUserIds.has(id))
  
  console.log(`找到 ${bothUserIds.length} 个同时购买了128元和50元的用户:\n`)
  
  for (const userId of bothUserIds) {
    console.log(`👤 用户ID: ${userId}`)
    
    // 查询该用户的所有订单
    const userOrders = allOrders.filter(o => o.user_id === userId)
    console.log(`   订单数量: ${userOrders.length}`)
    
    userOrders.forEach(o => {
      console.log(`   - ${o.product_name} ¥${o.amount} (${o.status}) - ${o.created_at}`)
    })
    
    // 查询该用户的积分
    const { data: credits } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single()
    
    if (credits) {
      console.log(`   当前积分: ${credits.credits}`)
      console.log(`   更新时间: ${credits.updated_at}`)
    } else {
      console.log(`   ⚠️ 无积分记录`)
    }
    console.log('')
  }
  
  // 5. 查找积分为0的用户（可能是问题用户）
  console.log('\n📋 步骤5: 查找积分为0且有已支付订单的用户...\n')
  
  const { data: zeroCredits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('credits', 0)
  
  if (zeroCredits) {
    for (const credit of zeroCredits) {
      const userOrders = allOrders.filter(o => o.user_id === credit.user_id && o.status === 'paid')
      
      if (userOrders.length > 0) {
        console.log(`⚠️ 用户 ${credit.user_id} 积分为0但有已支付订单:`)
        userOrders.forEach(o => {
          console.log(`   - ${o.product_name} ¥${o.amount} - ${o.created_at}`)
        })
        console.log('')
      }
    }
  }
  
  // 6. 特别查找 6947cc54 开头的用户（12月21日创建的）
  console.log('\n📋 步骤6: 查找12月21日创建的用户积分记录...\n')
  
  const { data: allCredits } = await supabase
    .from('user_credits')
    .select('*')
    .order('updated_at', { ascending: false })
  
  if (allCredits) {
    // 查找12月21日左右更新的积分记录
    const dec21Credits = allCredits.filter(c => {
      const updateDate = new Date(c.updated_at)
      return updateDate >= dec21 && updateDate < dec25
    })
    
    console.log(`找到 ${dec21Credits.length} 个12月21-24日更新的积分记录:\n`)
    
    dec21Credits.forEach(c => {
      console.log(`💰 用户ID: ${c.user_id}`)
      console.log(`   积分: ${c.credits}`)
      console.log(`   更新时间: ${c.updated_at}`)
      
      // 查询该用户的订单
      const userOrders = allOrders.filter(o => o.user_id === c.user_id)
      if (userOrders.length > 0) {
        console.log(`   订单:`)
        userOrders.forEach(o => {
          console.log(`     - ${o.product_name} ¥${o.amount} (${o.status})`)
        })
      }
      console.log('')
    })
  }
  
  console.log('=' .repeat(80))
}

main().catch(console.error)
