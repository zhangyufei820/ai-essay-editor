/**
 * 查询特定用户详情脚本
 * 
 * 使用方法: node scripts/check-specific-user.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 可能的用户ID（12月21日创建，积分为0）
const POSSIBLE_USER_ID = '6947cc546cb26ac1e6907d6e'

async function main() {
  console.log('=' .repeat(80))
  console.log(`🔍 查询用户 ${POSSIBLE_USER_ID} 的详细信息`)
  console.log('=' .repeat(80))
  
  // 1. 查询用户积分
  console.log('\n💰 步骤1: 查询用户积分...\n')
  
  const { data: credits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', POSSIBLE_USER_ID)
    .single()
  
  if (creditsError) {
    console.log('❌ 查询积分失败:', creditsError.message)
  } else {
    console.log('✅ 用户积分记录:')
    console.log(`   用户ID: ${credits.user_id}`)
    console.log(`   当前积分: ${credits.credits}`)
    console.log(`   是否Pro: ${credits.is_pro}`)
    console.log(`   创建时间: ${credits.created_at}`)
    console.log(`   更新时间: ${credits.updated_at}`)
  }
  
  // 2. 查询用户订单
  console.log('\n📋 步骤2: 查询用户订单...\n')
  
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', POSSIBLE_USER_ID)
    .order('created_at', { ascending: false })
  
  if (ordersError) {
    console.log('❌ 查询订单失败:', ordersError.message)
  } else if (!orders || orders.length === 0) {
    console.log('⚠️ 该用户没有订单记录')
  } else {
    console.log(`✅ 找到 ${orders.length} 个订单:\n`)
    orders.forEach((order, index) => {
      console.log(`📦 订单 ${index + 1}:`)
      console.log(`   订单号: ${order.order_no}`)
      console.log(`   产品: ${order.product_name} (${order.product_id})`)
      console.log(`   金额: ¥${order.amount}`)
      console.log(`   状态: ${order.status}`)
      console.log(`   交易号: ${order.trade_no || '无'}`)
      console.log(`   创建时间: ${order.created_at}`)
      console.log('')
    })
  }
  
  // 3. 通过订单号模糊匹配查找订单
  console.log('\n📋 步骤3: 通过订单号模糊匹配查找订单...\n')
  
  const { data: allOrders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (allOrders) {
    const matchedOrders = allOrders.filter(o => 
      o.order_no?.includes(POSSIBLE_USER_ID) ||
      o.order_no?.includes('6947cc54')
    )
    
    if (matchedOrders.length > 0) {
      console.log(`找到 ${matchedOrders.length} 个匹配的订单:\n`)
      matchedOrders.forEach((order, index) => {
        console.log(`📦 订单 ${index + 1}:`)
        console.log(`   订单号: ${order.order_no}`)
        console.log(`   用户ID: ${order.user_id}`)
        console.log(`   产品: ${order.product_name} (${order.product_id})`)
        console.log(`   金额: ¥${order.amount}`)
        console.log(`   状态: ${order.status}`)
        console.log(`   创建时间: ${order.created_at}`)
        console.log('')
      })
    } else {
      console.log('未找到匹配的订单')
    }
  }
  
  // 4. 查询所有已支付订单
  console.log('\n📋 步骤4: 查询所有已支付订单...\n')
  
  const { data: paidOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
  
  if (paidOrders && paidOrders.length > 0) {
    console.log(`找到 ${paidOrders.length} 个已支付订单:\n`)
    paidOrders.forEach((order, index) => {
      console.log(`📦 订单 ${index + 1}:`)
      console.log(`   订单号: ${order.order_no}`)
      console.log(`   用户ID: ${order.user_id}`)
      console.log(`   产品: ${order.product_name} (${order.product_id})`)
      console.log(`   金额: ¥${order.amount}`)
      console.log(`   交易号: ${order.trade_no || '无'}`)
      console.log(`   创建时间: ${order.created_at}`)
      console.log('')
    })
  } else {
    console.log('⚠️ 没有找到已支付订单')
  }
  
  // 5. 查询所有待支付订单（可能是支付成功但回调失败的）
  console.log('\n📋 步骤5: 查询所有待支付订单...\n')
  
  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (pendingOrders && pendingOrders.length > 0) {
    console.log(`找到 ${pendingOrders.length} 个待支付订单（显示最近20个）:\n`)
    pendingOrders.forEach((order, index) => {
      console.log(`📦 订单 ${index + 1}:`)
      console.log(`   订单号: ${order.order_no}`)
      console.log(`   用户ID: ${order.user_id}`)
      console.log(`   产品: ${order.product_name} (${order.product_id})`)
      console.log(`   金额: ¥${order.amount}`)
      console.log(`   创建时间: ${order.created_at}`)
      console.log('')
    })
  }
  
  // 6. 查询profiles表
  console.log('\n📋 步骤6: 查询profiles表...\n')
  
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', POSSIBLE_USER_ID)
    .single()
  
  if (profileError) {
    console.log('❌ 查询profile失败:', profileError.message)
    
    // 尝试查询所有profiles
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('*')
      .limit(10)
    
    if (allProfiles && allProfiles.length > 0) {
      console.log('\n所有profiles记录:')
      allProfiles.forEach(p => {
        console.log(`   ID: ${p.id}`)
        console.log(`   手机: ${p.phone || '无'}`)
        console.log(`   邮箱: ${p.email || '无'}`)
        console.log('')
      })
    }
  } else {
    console.log('✅ 用户profile:')
    console.log(profile)
  }
  
  console.log('\n' + '=' .repeat(80))
  console.log('📝 分析结论:')
  console.log('=' .repeat(80))
  
  console.log(`
根据查询结果，用户 ${POSSIBLE_USER_ID} 的情况如下：

1. 积分记录存在，但积分为 0
2. 可能的原因：
   - 用户支付成功，但支付回调未正确处理
   - 订单状态仍为 pending，导致积分未添加
   - 需要手动补发积分

建议解决方案：
1. 确认用户的支付记录（需要在迅虎支付后台查看）
2. 如果确认已支付，手动更新订单状态并补发积分
3. 用户购买了：
   - 12月21日 128元豪华版 → 应得 12000 积分
   - 12月24日 5000积分包 → 应得 5000 积分
   - 总计应得 17000 积分
`)
  
  console.log('=' .repeat(80))
}

main().catch(console.error)
