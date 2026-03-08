import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function checkPaymentFlow() {
  console.log('🔍 支付流程诊断\n')
  
  // 1. 检查所有已支付订单
  console.log('📋 1. 检查所有已支付订单')
  const { data: paidOrders, error: paidError } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(20)
  
  if (paidError) {
    console.log('❌ 查询失败:', paidError.message)
  } else {
    console.log(`✅ 找到 ${paidOrders?.length || 0} 条已支付订单\n`)
    
    paidOrders?.forEach((order, i) => {
      console.log(`订单 ${i + 1}:`)
      console.log(`  - 订单号: ${order.order_no}`)
      console.log(`  - 用户ID: ${order.user_id}`)
      console.log(`  - 产品: ${order.product_name}`)
      console.log(`  - 金额: ${order.amount}`)
      console.log(`  - 状态: ${order.status}`)
      console.log(`  - 创建时间: ${order.created_at}`)
      console.log(`  - 更新时间: ${order.updated_at}`)
      console.log()
    })
  }
  
  // 2. 检查用户积分表中 is_pro 的分布
  console.log('\n📋 2. 检查用户积分表中 is_pro 的分布')
  const { data: allCredits, error: creditsError } = await supabase
    .from('user_credits')
    .select('user_id, credits, is_pro')
    .order('updated_at', { ascending: false })
    .limit(20)
  
  if (creditsError) {
    console.log('❌ 查询失败:', creditsError.message)
  } else {
    console.log(`✅ 找到 ${allCredits?.length || 0} 条用户积分记录\n`)
    
    const proCount = allCredits?.filter(c => c.is_pro === true).length || 0
    const freeCount = allCredits?.filter(c => c.is_pro === false).length || 0
    const nullCount = allCredits?.filter(c => c.is_pro === null).length || 0
    
    console.log(`会员(is_pro=true): ${proCount}`)
    console.log(`非会员(is_pro=false): ${freeCount}`)
    console.log(`未设置(is_pro=null): ${nullCount}`)
    console.log()
    
    allCredits?.forEach((credit, i) => {
      console.log(`用户 ${i + 1}:`)
      console.log(`  - 用户ID: ${credit.user_id}`)
      console.log(`  - 积分: ${credit.credits}`)
      console.log(`  - 是否会员: ${credit.is_pro}`)
      console.log()
    })
  }
  
  // 3. 检查订单和用户积分的对应关系
  console.log('\n📋 3. 检查订单和用户积分的对应关系')
  if (paidOrders && paidOrders.length > 0) {
    for (const order of paidOrders.slice(0, 5)) {
      const { data: userCredit } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', order.user_id)
        .single()
      
      console.log(`订单用户 ${order.user_id}:`)
      console.log(`  - 订单状态: ${order.status}`)
      console.log(`  - 订单产品: ${order.product_name}`)
      if (userCredit) {
        console.log(`  - 积分: ${userCredit.credits}`)
        console.log(`  - 是否会员: ${userCredit.is_pro}`)
        console.log(`  - ⚠️ 问题: 订单已支付但 is_pro=${userCredit.is_pro}`)
      } else {
        console.log(`  - ❌ 没有积分记录！`)
      }
      console.log()
    }
  }
  
  console.log('✅ 诊断完成')
}

checkPaymentFlow().catch(err => {
  console.error('❌ 诊断失败:', err)
  process.exit(1)
})
