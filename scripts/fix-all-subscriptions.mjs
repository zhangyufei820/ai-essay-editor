// 查询用户并修复所有订阅问题
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 要修复的用户列表
const USERS_TO_FIX = [
  '696d73392fc761bbc1c929e0',  // 新用户
  '6968c52fee5fbd3da1da9f7c',  // 之前的用户
]

async function main() {
  console.log('================================================================================')
  console.log('🔧 修复所有订阅和分享问题')
  console.log('================================================================================\n')

  // 1. 查询所有已支付订单但没有积分的用户
  console.log('📋 步骤1: 查询所有已支付订单...')
  const { data: paidOrders, error: ordersError } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.log('❌ 查询订单失败:', ordersError.message)
  } else {
    console.log(`✅ 找到 ${paidOrders?.length || 0} 个已支付订单`)
    paidOrders?.forEach(order => {
      console.log(`   - ${order.user_id}: ${order.product_name} ¥${order.amount}`)
    })
  }

  // 2. 查询要修复的用户
  console.log('\n📋 步骤2: 查询要修复的用户...')
  for (const userId of USERS_TO_FIX) {
    console.log(`\n--- 用户: ${userId} ---`)
    
    // 查询订单
    const { data: userOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    
    console.log(`订单数: ${userOrders?.length || 0}`)
    userOrders?.forEach(order => {
      console.log(`  - ${order.product_name} ¥${order.amount} [${order.status}] ${order.created_at}`)
    })

    // 查询积分
    const { data: credits, error: creditsError } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (creditsError) {
      console.log(`积分: ❌ 无记录 (${creditsError.message})`)
    } else {
      console.log(`积分: ${credits.credits}, Pro: ${credits.is_pro}`)
    }
  }

  // 3. 查询 pending 订单（可能是支付成功但回调失败）
  console.log('\n📋 步骤3: 查询 pending 订单...')
  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20)

  console.log(`找到 ${pendingOrders?.length || 0} 个 pending 订单:`)
  pendingOrders?.forEach(order => {
    console.log(`  - ${order.user_id.substring(0, 8)}... ${order.product_name} ¥${order.amount} ${order.created_at}`)
  })

  console.log('\n================================================================================')
  console.log('请在 Supabase 控制台执行以下 SQL 来修复问题:')
  console.log('================================================================================\n')
  
  console.log(`
-- 1. 移除外键约束（永久修复）
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;

-- 2. 为指定用户添加积分
${USERS_TO_FIX.map(userId => `
INSERT INTO user_credits (user_id, credits, is_pro)
VALUES ('${userId}', 2000, true)
ON CONFLICT (user_id) 
DO UPDATE SET credits = user_credits.credits + 2000, is_pro = true;
`).join('')}

-- 3. 验证
SELECT * FROM user_credits WHERE user_id IN (${USERS_TO_FIX.map(id => `'${id}'`).join(', ')});
  `)
}

main().catch(console.error)
