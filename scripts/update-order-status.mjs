/**
 * 更新订单状态脚本
 * 将已补发积分的订单状态更新为 paid
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 需要更新状态的订单
const orderNos = [
  'ORDER_1767389526307_693532cadd3ea7b320cbdb39',
  'ORDER_1767364108711_69415eb0e16528581d64c36d'
]

async function main() {
  console.log('🔄 更新订单状态...\n')

  for (const orderNo of orderNos) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'paid' })
      .eq('order_no', orderNo)

    if (error) {
      console.log(`❌ 订单 ${orderNo} 更新失败:`, error)
    } else {
      console.log(`✅ 订单 ${orderNo} 状态已更新为 paid`)
    }
  }

  // 验证
  console.log('\n🔍 验证订单状态...\n')
  const { data } = await supabase
    .from('orders')
    .select('order_no, status, user_id, amount, product_name')
    .in('order_no', orderNos)

  console.log('订单状态:', data)
}

main().catch(console.error)
