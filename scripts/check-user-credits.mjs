/**
 * 查询用户积分和订单状态脚本
 * 用于排查用户积分问题
 * 
 * 使用方法: node scripts/check-user-credits.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 要查询的用户手机号
const PHONE_NUMBER = '15858565338'

async function main() {
  console.log('=' .repeat(80))
  console.log(`🔍 查询用户 ${PHONE_NUMBER} 的积分和订单情况`)
  console.log('=' .repeat(80))
  
  // 1. 查找用户
  console.log('\n📱 步骤1: 查找用户...\n')
  
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 1000
  })
  
  if (listError) {
    console.error('❌ 查询用户列表失败:', listError)
    return
  }
  
  // 查找手机号匹配的用户
  const targetUser = users.find(u => {
    const phone = u.phone || u.user_metadata?.phone || u.user_metadata?.mobile || ''
    return phone.includes(PHONE_NUMBER) || PHONE_NUMBER.includes(phone.replace(/\D/g, ''))
  })
  
  if (!targetUser) {
    console.log(`❌ 未找到手机号为 ${PHONE_NUMBER} 的用户`)
    
    // 尝试模糊搜索
    console.log('\n🔍 尝试模糊搜索...')
    const possibleUsers = users.filter(u => {
      const phone = u.phone || u.user_metadata?.phone || u.user_metadata?.mobile || ''
      const phoneDigits = phone.replace(/\D/g, '')
      return phoneDigits.includes('15858') || phoneDigits.includes('565338')
    })
    
    if (possibleUsers.length > 0) {
      console.log('可能匹配的用户:')
      possibleUsers.forEach(u => {
        console.log(`  - ID: ${u.id}`)
        console.log(`    手机: ${u.phone || u.user_metadata?.phone || '无'}`)
        console.log(`    邮箱: ${u.email || '无'}`)
        console.log(`    创建时间: ${u.created_at}`)
        console.log('')
      })
    }
    return
  }
  
  console.log('✅ 找到用户:')
  console.log(`   用户ID: ${targetUser.id}`)
  console.log(`   手机号: ${targetUser.phone || targetUser.user_metadata?.phone || '无'}`)
  console.log(`   邮箱: ${targetUser.email || '无'}`)
  console.log(`   创建时间: ${targetUser.created_at}`)
  
  const userId = targetUser.id
  
  // 2. 查询用户积分
  console.log('\n💰 步骤2: 查询用户积分...\n')
  
  const { data: creditsData, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (creditsError) {
    console.log('❌ 查询积分失败或无积分记录:', creditsError.message)
  } else {
    console.log('✅ 用户积分记录:')
    console.log(`   当前积分: ${creditsData.credits}`)
    console.log(`   是否Pro: ${creditsData.is_pro}`)
    console.log(`   更新时间: ${creditsData.updated_at}`)
  }
  
  // 3. 查询用户订单
  console.log('\n📋 步骤3: 查询用户订单...\n')
  
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (ordersError) {
    console.log('❌ 查询订单失败:', ordersError.message)
  } else if (!orders || orders.length === 0) {
    console.log('⚠️ 该用户没有订单记录')
    
    // 尝试通过订单号模糊匹配
    console.log('\n🔍 尝试通过订单号模糊匹配...')
    const { data: allOrders } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    
    if (allOrders) {
      const matchedOrders = allOrders.filter(o => 
        o.order_no?.includes(userId) || 
        o.user_id?.includes(PHONE_NUMBER.slice(-6))
      )
      
      if (matchedOrders.length > 0) {
        console.log('找到可能匹配的订单:')
        matchedOrders.forEach(o => {
          console.log(`  订单号: ${o.order_no}`)
          console.log(`  用户ID: ${o.user_id}`)
          console.log(`  产品: ${o.product_name}`)
          console.log(`  金额: ¥${o.amount}`)
          console.log(`  状态: ${o.status}`)
          console.log('')
        })
      }
    }
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
      console.log(`   更新时间: ${order.updated_at}`)
      console.log('')
    })
  }
  
  // 4. 查询积分交易记录
  console.log('\n📊 步骤4: 查询积分交易记录...\n')
  
  const { data: transactions, error: transError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (transError) {
    console.log('❌ 查询交易记录失败:', transError.message)
  } else if (!transactions || transactions.length === 0) {
    console.log('⚠️ 该用户没有积分交易记录')
  } else {
    console.log(`✅ 找到 ${transactions.length} 条交易记录:\n`)
    transactions.forEach((trans, index) => {
      console.log(`💳 交易 ${index + 1}:`)
      console.log(`   类型: ${trans.type}`)
      console.log(`   金额: ${trans.amount > 0 ? '+' : ''}${trans.amount}`)
      console.log(`   描述: ${trans.description}`)
      console.log(`   时间: ${trans.created_at}`)
      console.log('')
    })
  }
  
  // 5. 分析问题
  console.log('\n' + '=' .repeat(80))
  console.log('📝 问题分析:')
  console.log('=' .repeat(80))
  
  if (creditsData && creditsData.credits === 0) {
    console.log('\n⚠️ 用户当前积分为 0，可能的原因:')
    console.log('   1. 积分已全部消耗完毕')
    console.log('   2. 支付成功但积分未正确到账')
    console.log('   3. 系统出现异常导致积分被清零')
    
    if (orders && orders.length > 0) {
      const paidOrders = orders.filter(o => o.status === 'paid')
      const pendingOrders = orders.filter(o => o.status === 'pending')
      
      if (paidOrders.length > 0) {
        console.log(`\n✅ 用户有 ${paidOrders.length} 个已支付订单:`)
        let totalCreditsExpected = 0
        paidOrders.forEach(o => {
          const credits = getExpectedCredits(o.product_id, o.amount)
          totalCreditsExpected += credits
          console.log(`   - ${o.product_name}: 应得 ${credits} 积分`)
        })
        console.log(`   总计应得: ${totalCreditsExpected} 积分`)
        
        if (transactions && transactions.length > 0) {
          const purchaseCredits = transactions
            .filter(t => t.type === 'purchase')
            .reduce((sum, t) => sum + t.amount, 0)
          console.log(`   实际到账: ${purchaseCredits} 积分`)
          
          if (purchaseCredits < totalCreditsExpected) {
            console.log(`\n❌ 积分未完全到账，差额: ${totalCreditsExpected - purchaseCredits} 积分`)
          }
        }
      }
      
      if (pendingOrders.length > 0) {
        console.log(`\n⚠️ 用户有 ${pendingOrders.length} 个待支付订单:`)
        pendingOrders.forEach(o => {
          console.log(`   - ${o.product_name} (¥${o.amount}) - 订单号: ${o.order_no}`)
        })
        console.log('   这些订单可能已支付但回调未成功处理')
      }
    }
  }
  
  console.log('\n' + '=' .repeat(80))
}

// 根据产品ID获取预期积分
function getExpectedCredits(productId, amount) {
  const PRODUCT_CREDITS = {
    "basic": 2000,      // 基础版 28元 → 2000积分
    "pro": 5000,        // 专业版 68元 → 5000积分
    "premium": 12000,   // 豪华版 128元 → 12000积分
    "credits-500": 500,
    "credits-1000": 1000,
    "credits-5000": 5000,
    "credits-10000": 10000,
  }
  
  return PRODUCT_CREDITS[productId] || Math.floor(amount * 100)
}

main().catch(console.error)
