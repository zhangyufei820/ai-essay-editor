/**
 * 修复缺失积分的脚本
 * 查询已支付但积分未到账的用户，并为他们补发积分
 * 
 * 使用方法: node scripts/fix-missing-credits.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
// 创建 Supabase 客户端（使用 service role key 以获得完整权限）
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('🔍 开始查询订单...\n')

  // 先查看所有订单的状态分布
  const { data: allOrders, error: allOrdersError } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  if (allOrdersError) {
    console.error('❌ 查询所有订单失败:', allOrdersError)
    return
  }

  console.log(`📋 数据库中共有 ${allOrders?.length || 0} 个订单\n`)
  
  if (allOrders && allOrders.length > 0) {
    // 统计各状态的订单数量
    const statusCount = {}
    allOrders.forEach(order => {
      statusCount[order.status] = (statusCount[order.status] || 0) + 1
    })
    console.log('📊 订单状态分布:')
    Object.entries(statusCount).forEach(([status, count]) => {
      console.log(`  - ${status}: ${count} 个`)
    })
    console.log('')
    
    // 显示所有订单详情
    console.log('📝 所有订单详情:')
    console.log('='.repeat(80))
    allOrders.forEach(order => {
      console.log(`订单号: ${order.order_no}`)
      console.log(`用户ID: ${order.user_id}`)
      console.log(`产品: ${order.product_name}`)
      console.log(`金额: ¥${order.amount}`)
      console.log(`状态: ${order.status}`)
      console.log(`创建时间: ${order.created_at}`)
      console.log('-'.repeat(80))
    })
  }

  // 1. 获取所有已支付的订单（包括可能的其他状态如 'success', 'completed' 等）
  const paidStatuses = ['paid', 'success', 'completed', 'SUCCESS', 'PAID']
  const { data: paidOrders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .in('status', paidStatuses)
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.error('❌ 查询已支付订单失败:', ordersError)
    return
  }

  console.log(`\n📋 找到 ${paidOrders?.length || 0} 个已支付订单\n`)

  if (paidOrders.length === 0) {
    console.log('✅ 没有已支付的订单')
    return
  }

  // 2. 获取所有购买类型的积分交易记录
  const { data: purchaseTransactions, error: transError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('type', 'purchase')

  if (transError) {
    console.error('❌ 查询积分交易失败:', transError)
    return
  }

  console.log(`📋 找到 ${purchaseTransactions?.length || 0} 条购买积分记录\n`)

  // 3. 找出缺失积分的订单
  const missingCreditsOrders = []
  
  for (const order of paidOrders) {
    // 检查是否有对应的积分交易记录
    const hasTransaction = purchaseTransactions?.some(
      t => t.reference_id === order.id || t.reference_id === order.order_no
    )
    
    if (!hasTransaction) {
      missingCreditsOrders.push(order)
    }
  }

  console.log(`⚠️  发现 ${missingCreditsOrders.length} 个订单缺失积分\n`)

  if (missingCreditsOrders.length === 0) {
    console.log('✅ 所有订单的积分都已正确发放')
    return
  }

  // 4. 显示缺失积分的订单详情
  console.log('📝 缺失积分的订单详情:')
  console.log('=' .repeat(80))
  
  for (const order of missingCreditsOrders) {
    const credits = Math.floor(order.amount * 100)
    console.log(`订单号: ${order.order_no}`)
    console.log(`用户ID: ${order.user_id}`)
    console.log(`产品: ${order.product_name}`)
    console.log(`金额: ¥${order.amount}`)
    console.log(`应补积分: ${credits}`)
    console.log(`支付时间: ${order.paid_at}`)
    console.log('-'.repeat(80))
  }

  // 5. 开始补发积分
  console.log('\n🚀 开始补发积分...\n')

  let successCount = 0
  let failCount = 0

  for (const order of missingCreditsOrders) {
    const credits = Math.floor(order.amount * 100)
    const userId = order.user_id

    try {
      // 检查用户是否有积分记录
      const { data: userCredits, error: creditsError } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (creditsError && creditsError.code === 'PGRST116') {
        // 用户没有积分记录，创建一条
        console.log(`  📝 为用户 ${userId} 创建积分记录...`)
        const { error: insertError } = await supabase
          .from('user_credits')
          .insert({
            user_id: userId,
            credits: 0,
            total_earned: 0,
            total_spent: 0
          })
        
        if (insertError) {
          console.error(`  ❌ 创建积分记录失败:`, insertError)
          failCount++
          continue
        }
      }

      // 更新用户积分
      const { error: updateError } = await supabase
        .from('user_credits')
        .update({
          credits: supabase.rpc ? undefined : (userCredits?.credits || 0) + credits,
          total_earned: (userCredits?.total_earned || 0) + credits,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)

      // 使用 RPC 来安全地增加积分
      const { error: rpcError } = await supabase.rpc('increment_credits', {
        p_user_id: userId,
        p_amount: credits
      }).catch(() => ({ error: null })) // 如果 RPC 不存在，忽略错误

      // 如果 RPC 不存在，使用直接更新
      if (rpcError || !supabase.rpc) {
        const { data: currentCredits } = await supabase
          .from('user_credits')
          .select('credits, total_earned')
          .eq('user_id', userId)
          .single()

        if (currentCredits) {
          await supabase
            .from('user_credits')
            .update({
              credits: currentCredits.credits + credits,
              total_earned: currentCredits.total_earned + credits,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
        }
      }

      // 记录积分交易
      const { error: transactionError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          amount: credits,
          type: 'purchase',
          description: `购买${order.product_name}获得积分（补发）`,
          reference_id: order.id
        })

      if (transactionError) {
        console.error(`  ❌ 记录交易失败:`, transactionError)
        failCount++
        continue
      }

      console.log(`  ✅ 订单 ${order.order_no}: 补发 ${credits} 积分成功`)
      successCount++

    } catch (error) {
      console.error(`  ❌ 处理订单 ${order.order_no} 失败:`, error)
      failCount++
    }
  }

  // 6. 输出结果统计
  console.log('\n' + '='.repeat(80))
  console.log('📊 补发结果统计:')
  console.log(`  ✅ 成功: ${successCount} 个订单`)
  console.log(`  ❌ 失败: ${failCount} 个订单`)
  console.log('='.repeat(80))

  // 7. 验证结果
  console.log('\n🔍 验证补发结果...\n')
  
  for (const order of missingCreditsOrders) {
    const { data: userCredits } = await supabase
      .from('user_credits')
      .select('credits, total_earned')
      .eq('user_id', order.user_id)
      .single()

    console.log(`用户 ${order.user_id}: 当前积分 ${userCredits?.credits || 0}, 总获得 ${userCredits?.total_earned || 0}`)
  }
}

main().catch(console.error)
