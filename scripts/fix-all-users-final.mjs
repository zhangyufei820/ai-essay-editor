// 全面修复所有用户会员状态
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('======================================')
  console.log('🔧 全面修复所有用户会员状态')
  console.log('======================================\n')

  // 1. 查询所有积分记录
  const { data: allCredits } = await supabase.from('user_credits').select('*')
  const nonProUsers = allCredits?.filter(c => c.is_pro === false) || []
  
  console.log('总积分记录:', allCredits?.length)
  console.log('非会员用户:', nonProUsers.length)

  // 2. 检查每个非会员用户
  let fixedCount = 0
  
  for (const user of nonProUsers) {
    // 查询该用户的所有订单
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.user_id)
      .order('created_at', { ascending: false })
    
    const paidOrders = orders?.filter(o => o.status === 'paid') || []
    const pendingMemberOrders = orders?.filter(o => 
      o.status === 'pending' && 
      ['basic', 'pro', 'premium'].includes(o.product_id)
    ) || []
    
    const hasPaidMembership = paidOrders.some(o => ['basic', 'pro', 'premium'].includes(o.product_id))
    const hasPendingMembership = pendingMemberOrders.length > 0
    
    // 如果有会员订单（paid 或 pending），修复
    if (hasPaidMembership || hasPendingMembership) {
      console.log('\n修复用户:', user.user_id)
      console.log('  当前积分:', user.credits, 'is_pro:', user.is_pro)
      console.log('  paid订单:', paidOrders.length, 'pending会员订单:', pendingMemberOrders.length)
      
      // 如果只有 pending 没有 paid，标记一个为 paid
      if (!hasPaidMembership && hasPendingMembership) {
        const latestPending = pendingMemberOrders[0]
        await supabase.from('orders')
          .update({ status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', latestPending.id)
        console.log('  ✅ 订单已标记为 paid')
      }
      
      // 更新 is_pro = true
      const newCredits = Math.max(user.credits, 2000)
      await supabase.from('user_credits')
        .update({ is_pro: true, credits: newCredits, updated_at: new Date().toISOString() })
        .eq('user_id', user.user_id)
      
      console.log('  ✅ 已更新: is_pro=true, credits=', newCredits)
      fixedCount++
    }
  }

  console.log('\n======================================')
  console.log('✅ 自动修复完成！共修复', fixedCount, '个用户')
  console.log('======================================\n')

  // 3. 最终统计
  const { data: finalCredits } = await supabase.from('user_credits').select('*')
  const finalPro = finalCredits?.filter(c => c.is_pro === true) || []
  console.log('最终状态:')
  console.log('  总用户:', finalCredits?.length)
  console.log('  Pro用户:', finalPro.length)
  
  // 4. 列出所有 Pro 用户
  console.log('\nPro 用户列表:')
  finalPro.forEach(u => {
    console.log('  -', u.user_id, '积分:', u.credits)
  })
}

main().catch(console.error)
