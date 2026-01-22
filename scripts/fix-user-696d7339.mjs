// 修复用户 696d73392fc761bbc1c929e0 的订阅问题
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const USER_ID = '696d73392fc761bbc1c929e0'

async function main() {
  console.log('🔧 修复用户会员状态:', USER_ID)
  console.log('================================================================================\n')

  // 1. 更新一个订单为已支付
  console.log('步骤1: 更新订单状态...')
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('status', 'pending')
    .eq('product_id', 'basic')
    .order('created_at', { ascending: false })
    .limit(1)

  if (orders && orders.length > 0) {
    const order = orders[0]
    console.log(`  找到订单: ${order.order_no}`)
    
    const { error: updateOrderError } = await supabase
      .from('orders')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', order.id)

    if (updateOrderError) {
      console.log('  ❌ 更新订单失败:', updateOrderError.message)
    } else {
      console.log('  ✅ 订单已标记为已支付')
    }
  } else {
    console.log('  ⚠️ 没有找到 pending 订单')
  }

  // 2. 更新用户积分和会员状态
  console.log('\n步骤2: 更新用户积分和会员状态...')
  
  // 先查询当前状态
  const { data: currentCredits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', USER_ID)
    .single()

  if (currentCredits) {
    console.log(`  当前积分: ${currentCredits.credits}, is_pro: ${currentCredits.is_pro}`)
    
    const { error: updateCreditsError } = await supabase
      .from('user_credits')
      .update({ 
        credits: currentCredits.credits + 2000,
        is_pro: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', USER_ID)

    if (updateCreditsError) {
      console.log('  ❌ 更新积分失败:', updateCreditsError.message)
    } else {
      console.log(`  ✅ 积分已更新: ${currentCredits.credits} → ${currentCredits.credits + 2000}`)
      console.log('  ✅ is_pro 已更新为 true')
    }
  } else {
    console.log('  ⚠️ 用户积分记录不存在，尝试创建...')
    const { error: insertError } = await supabase
      .from('user_credits')
      .insert({
        user_id: USER_ID,
        credits: 2000,
        is_pro: true
      })
    
    if (insertError) {
      console.log('  ❌ 创建积分记录失败:', insertError.message)
    } else {
      console.log('  ✅ 已创建积分记录: 2000积分, is_pro=true')
    }
  }

  // 3. 验证结果
  console.log('\n步骤3: 验证结果...')
  const { data: finalCredits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', USER_ID)
    .single()

  if (finalCredits) {
    console.log('  最终状态:')
    console.log(`    用户ID: ${finalCredits.user_id}`)
    console.log(`    积分: ${finalCredits.credits}`)
    console.log(`    is_pro: ${finalCredits.is_pro}`)
  }

  const { data: finalOrders } = await supabase
    .from('orders')
    .select('product_name, amount, status, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })

  console.log('\n  订单状态:')
  finalOrders?.forEach(order => {
    console.log(`    - ${order.product_name} ¥${order.amount} [${order.status}]`)
  })

  console.log('\n================================================================================')
  console.log('✅ 修复完成！用户现在可以使用分享功能了')
  console.log('================================================================================')
}

main().catch(console.error)
