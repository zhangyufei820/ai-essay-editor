/**
 * 查找用户订单脚本
 * 搜索所有订单，找到与用户相关的购买记录
 * 
 * 使用方法: node scripts/find-user-orders.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 要查询的用户信息
const PHONE_NUMBER = '15858565338'
const KNOWN_USER_ID = '08cda02a-7444-46a8-be9a-f11d1c61ca44'

async function main() {
  console.log('=' .repeat(80))
  console.log(`🔍 查找用户 ${PHONE_NUMBER} 的所有订单`)
  console.log('=' .repeat(80))
  
  // 1. 查询所有订单
  console.log('\n📋 步骤1: 查询所有订单...\n')
  
  const { data: allOrders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (ordersError) {
    console.error('❌ 查询订单失败:', ordersError)
    return
  }
  
  console.log(`✅ 共找到 ${allOrders.length} 个订单\n`)
  
  // 2. 筛选12月21日-24日的订单（用户购买时间）
  console.log('📅 步骤2: 筛选12月21日-24日的订单...\n')
  
  const dec21 = new Date('2025-12-21T00:00:00Z')
  const dec25 = new Date('2025-12-25T00:00:00Z')
  
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
  
  // 3. 查找128元和50元的订单（用户购买的产品）
  console.log('💰 步骤3: 查找128元和50元的订单...\n')
  
  const targetOrders = allOrders.filter(o => 
    o.amount === 128 || o.amount === 50 || o.amount === '128' || o.amount === '50'
  )
  
  console.log(`找到 ${targetOrders.length} 个128元或50元的订单:\n`)
  
  targetOrders.forEach((order, index) => {
    console.log(`📦 订单 ${index + 1}:`)
    console.log(`   订单号: ${order.order_no}`)
    console.log(`   用户ID: ${order.user_id}`)
    console.log(`   产品: ${order.product_name} (${order.product_id})`)
    console.log(`   金额: ¥${order.amount}`)
    console.log(`   状态: ${order.status}`)
    console.log(`   创建时间: ${order.created_at}`)
    console.log('')
  })
  
  // 4. 查询所有用户积分记录
  console.log('💳 步骤4: 查询所有用户积分记录...\n')
  
  const { data: allCredits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .order('credits', { ascending: false })
  
  if (creditsError) {
    console.error('❌ 查询积分失败:', creditsError)
  } else {
    console.log(`找到 ${allCredits.length} 条积分记录:\n`)
    
    allCredits.forEach((credit, index) => {
      console.log(`💰 用户 ${index + 1}:`)
      console.log(`   用户ID: ${credit.user_id}`)
      console.log(`   积分: ${credit.credits}`)
      console.log(`   是否Pro: ${credit.is_pro}`)
      console.log(`   更新时间: ${credit.updated_at}`)
      console.log('')
    })
  }
  
  // 5. 查询所有用户
  console.log('👥 步骤5: 查询所有用户...\n')
  
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000
  })
  
  if (listError) {
    console.error('❌ 查询用户列表失败:', listError)
    return
  }
  
  console.log(`共有 ${users.length} 个用户\n`)
  
  // 列出所有用户
  users.forEach((user, index) => {
    const phone = user.phone || user.user_metadata?.phone || user.user_metadata?.mobile || ''
    console.log(`👤 用户 ${index + 1}:`)
    console.log(`   ID: ${user.id}`)
    console.log(`   手机: ${phone || '无'}`)
    console.log(`   邮箱: ${user.email || '无'}`)
    console.log(`   创建时间: ${user.created_at}`)
    console.log('')
  })
  
  console.log('=' .repeat(80))
}

main().catch(console.error)
