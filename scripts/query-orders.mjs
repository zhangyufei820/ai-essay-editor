/**
 * 查询所有订单
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('查询所有订单...\n')
  
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error) {
    console.log('❌ 查询失败:', error.message)
    return
  }
  
  console.log(`找到 ${orders.length} 个订单:\n`)
  
  orders.forEach((order, index) => {
    console.log(`订单 ${index + 1}:`)
    console.log(`  order_id: ${order.order_id}`)
    console.log(`  user_id: ${order.user_id}`)
    console.log(`  product_id: ${order.product_id}`)
    console.log(`  amount: ${order.amount}`)
    console.log(`  status: ${order.status}`)
    console.log(`  credits_amount: ${order.credits_amount}`)
    console.log(`  created_at: ${order.created_at}`)
    console.log('')
  })
  
  // 查找特定订单
  const targetOrder = orders.find(o => o.order_id?.includes('692e60a37c4e42e6de5c506'))
  if (targetOrder) {
    console.log('✅ 找到目标订单:')
    console.log(JSON.stringify(targetOrder, null, 2))
  } else {
    console.log('⚠️ 未找到订单 692e60a37c4e42e6de5c506')
    console.log('\n尝试模糊匹配...')
    const partial = orders.filter(o => 
      o.order_id?.includes('692e60') || 
      o.order_id?.includes('e6de5c506')
    )
    if (partial.length > 0) {
      console.log('找到部分匹配:')
      partial.forEach(o => console.log(`  ${o.order_id}`))
    }
  }
}

main().catch(console.error)
