// 全面修复所有支付了但没有积分的用户
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('================================================================================')
  console.log('🔧 全面诊断和修复所有订阅问题')
  console.log('================================================================================\n')

  // 1. 查询所有订单
  console.log('📋 步骤1: 查询所有订单状态...')
  const { data: allOrders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })

  const paidOrders = allOrders?.filter(o => o.status === 'paid') || []
  const pendingOrders = allOrders?.filter(o => o.status === 'pending') || []
  
  console.log(`  总订单: ${allOrders?.length || 0}`)
  console.log(`  已支付: ${paidOrders.length}`)
  console.log(`  待处理: ${pendingOrders.length}`)

  // 2. 查询所有用户积分
  console.log('\n📋 步骤2: 查询所有用户积分状态...')
  const { data: allCredits } = await supabase
    .from('user_credits')
    .select('*')

  console.log(`  积分记录数: ${allCredits?.length || 0}`)
  
  const proUsers = allCredits?.filter(c => c.is_pro) || []
  console.log(`  Pro 用户数: ${proUsers.length}`)

  // 3. 找出问题用户：有付费订单但不是Pro或没有积分记录
  console.log('\n📋 步骤3: 诊断问题用户...')
  
  const paidUserIds = [...new Set(paidOrders.map(o => o.user_id))]
  const problemUsers = []

  for (const userId of paidUserIds) {
    const userCredits = allCredits?.find(c => c.user_id === userId)
    const userPaidOrders = paidOrders.filter(o => o.user_id === userId)
    const totalPaidAmount = userPaidOrders.reduce((sum, o) => sum + o.amount, 0)
    
    if (!userCredits || !userCredits.is_pro) {
      problemUsers.push({
        userId,
        credits: userCredits?.credits || 0,
        isPro: userCredits?.is_pro || false,
        hasCreditsRecord: !!userCredits,
        paidOrdersCount: userPaidOrders.length,
        totalPaidAmount
      })
    }
  }

  console.log(`  问题用户数: ${problemUsers.length}`)
  problemUsers.forEach(u => {
    console.log(`  - ${u.userId}: 积分=${u.credits}, isPro=${u.isPro}, 付费${u.paidOrdersCount}笔共¥${u.totalPaidAmount}`)
  })

  // 4. 特别检查用户 697197da457ace5f5ad96fdb
  const targetUserId = '697197da457ace5f5ad96fdb'
  console.log(`\n📋 步骤4: 详细检查用户 ${targetUserId}...`)
  
  const targetOrders = allOrders?.filter(o => o.user_id === targetUserId) || []
  const targetCredits = allCredits?.find(c => c.user_id === targetUserId)
  
  console.log(`  订单:`)
  targetOrders.forEach(o => {
    console.log(`    - ${o.product_name} ¥${o.amount} [${o.status}] ${o.created_at}`)
  })
  console.log(`  积分记录: ${targetCredits ? `积分=${targetCredits.credits}, isPro=${targetCredits.is_pro}` : '❌ 无记录'}`)

  // 5. 自动修复所有问题
  console.log('\n🔧 步骤5: 开始自动修复...')
  
  // 先修复目标用户
  const usersToFix = [targetUserId, ...problemUsers.map(u => u.userId)].filter((v, i, a) => a.indexOf(v) === i)
  
  for (const userId of usersToFix) {
    console.log(`\n  修复用户: ${userId}`)
    
    // 检查是否有已支付订单
    const userPaidOrders = paidOrders.filter(o => o.user_id === userId)
    const userPendingOrders = pendingOrders.filter(o => o.user_id === userId && o.product_id === 'basic')
    
    // 如果没有 paid 订单但有 pending 订单，将最新的标记为 paid
    if (userPaidOrders.length === 0 && userPendingOrders.length > 0) {
      const latestPending = userPendingOrders[0]
      console.log(`    将订单 ${latestPending.order_no} 标记为已支付...`)
      
      await supabase
        .from('orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', latestPending.id)
    }
    
    // 更新或创建积分记录
    const existingCredits = allCredits?.find(c => c.user_id === userId)
    
    if (existingCredits) {
      // 更新现有记录
      const newCredits = existingCredits.credits + (existingCredits.is_pro ? 0 : 2000)
      console.log(`    更新积分: ${existingCredits.credits} → ${newCredits}, is_pro: true`)
      
      await supabase
        .from('user_credits')
        .update({ 
          credits: newCredits,
          is_pro: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
    } else {
      // 创建新记录
      console.log(`    创建积分记录: 2000积分, is_pro: true`)
      
      const { error } = await supabase
        .from('user_credits')
        .insert({
          user_id: userId,
          credits: 2000,
          is_pro: true
        })
      
      if (error) {
        console.log(`    ❌ 创建失败: ${error.message}`)
        console.log(`    尝试通过 upsert...`)
        
        await supabase
          .from('user_credits')
          .upsert({
            user_id: userId,
            credits: 2000,
            is_pro: true
          })
      }
    }
  }

  // 6. 验证修复结果
  console.log('\n✅ 步骤6: 验证修复结果...')
  
  const { data: finalCredits } = await supabase
    .from('user_credits')
    .select('*')
    .in('user_id', usersToFix)

  console.log('\n最终状态:')
  finalCredits?.forEach(c => {
    console.log(`  ${c.user_id}: 积分=${c.credits}, is_pro=${c.is_pro}`)
  })

  console.log('\n================================================================================')
  console.log('✅ 修复完成！')
  console.log('================================================================================')
}

main().catch(console.error)
