import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function diagnoseUser() {
  const userId = '13868308109'
  console.log(`🔍 诊断用户: ${userId}\n`)
  
  // 1. 检查用户积分
  console.log('📋 1. 检查用户积分')
  const { data: credits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (creditsError) {
    console.log('❌ 查询失败:', creditsError.message)
  } else {
    console.log('✅ 用户积分记录:')
    console.log(`   - 用户ID: ${credits.user_id}`)
    console.log(`   - 积分: ${credits.credits}`)
    console.log(`   - 是否会员(is_pro): ${credits.is_pro}`)
    console.log(`   - 创建时间: ${credits.created_at}`)
    console.log(`   - 更新时间: ${credits.updated_at}`)
  }
  
  // 2. 检查用户订单
  console.log('\n📋 2. 检查用户订单')
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (ordersError) {
    console.log('❌ 查询失败:', ordersError.message)
  } else {
    console.log(`✅ 找到 ${orders?.length || 0} 条订单`)
    orders?.forEach((order, i) => {
      console.log(`\n   订单 ${i + 1}:`)
      console.log(`   - 订单号: ${order.order_no}`)
      console.log(`   - 产品: ${order.product_name}`)
      console.log(`   - 金额: ${order.amount}`)
      console.log(`   - 状态: ${order.status}`)
      console.log(`   - 创建时间: ${order.created_at}`)
      console.log(`   - 更新时间: ${order.updated_at}`)
    })
  }
  
  // 3. 检查用户的积分交易
  console.log('\n📋 3. 检查用户的积分交易')
  const { data: transactions, error: txError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (txError) {
    console.log('❌ 查询失败:', txError.message)
  } else {
    console.log(`✅ 找到 ${transactions?.length || 0} 条交易`)
    transactions?.forEach((tx, i) => {
      console.log(`\n   交易 ${i + 1}:`)
      console.log(`   - 类型: ${tx.type}`)
      console.log(`   - 金额: ${tx.amount}`)
      console.log(`   - 描述: ${tx.description}`)
      console.log(`   - 余额前: ${tx.balance_before}`)
      console.log(`   - 余额后: ${tx.balance_after}`)
      console.log(`   - 时间: ${tx.created_at}`)
    })
  }
  
  // 4. 检查用户的推荐码
  console.log('\n📋 4. 检查用户的推荐码')
  const { data: refCode, error: refError } = await supabase
    .from('referral_codes')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (refError) {
    console.log('❌ 查询失败:', refError.message)
  } else if (refCode) {
    console.log('✅ 推荐码信息:')
    console.log(`   - 推荐码: ${refCode.code}`)
    console.log(`   - 使用次数: ${refCode.uses}`)
    console.log(`   - 创建时间: ${refCode.created_at}`)
  }
  
  // 5. 检查用户作为邀请者的邀请记录
  console.log('\n📋 5. 检查用户作为邀请者的邀请记录')
  const { data: referrals, error: refError2 } = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', userId)
  
  if (refError2) {
    console.log('❌ 查询失败:', refError2.message)
  } else {
    console.log(`✅ 找到 ${referrals?.length || 0} 条邀请记录`)
    referrals?.forEach((ref, i) => {
      console.log(`\n   邀请 ${i + 1}:`)
      console.log(`   - 被邀请者: ${ref.referee_id}`)
      console.log(`   - 推荐码: ${ref.referral_code}`)
      console.log(`   - 状态: ${ref.status}`)
      console.log(`   - 奖励积分: ${ref.reward_credits}`)
      console.log(`   - 完成时间: ${ref.completed_at}`)
    })
  }
  
  console.log('\n✅ 诊断完成')
}

diagnoseUser().catch(err => {
  console.error('❌ 诊断失败:', err)
  process.exit(1)
})
