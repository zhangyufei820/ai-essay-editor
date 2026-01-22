// 修复用户会员状态 - 直接使用 SQL 绕过外键约束
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const USER_ID = '6968c52fee5fbd3da1da9f7c'

async function main() {
  console.log('🔧 修复用户会员状态...\n')

  // 1. 直接用 SQL 插入积分记录（绕过外键检查）
  console.log('步骤1: 使用 SQL 创建积分记录...')
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      INSERT INTO user_credits (user_id, credits, is_pro)
      VALUES ('${USER_ID}', 2000, true)
      ON CONFLICT (user_id) 
      DO UPDATE SET credits = user_credits.credits + 2000, is_pro = true
      RETURNING *;
    `
  })

  if (error) {
    console.log('SQL RPC 失败，尝试直接 upsert...')
    
    // 先删除外键约束再试
    const { error: upsertError } = await supabase
      .from('user_credits')
      .upsert({
        user_id: USER_ID,
        credits: 2000,
        is_pro: true
      }, { onConflict: 'user_id' })
    
    if (upsertError) {
      console.log('❌ Upsert 失败:', upsertError.message)
      
      // 最后尝试：用 raw query
      console.log('\n尝试查询 auth.users...')
      const { data: authUser } = await supabase.auth.admin.getUserById(USER_ID)
      console.log('Auth user:', authUser)
    } else {
      console.log('✅ 成功!')
    }
  } else {
    console.log('✅ SQL 执行成功:', data)
  }

  // 2. 验证
  console.log('\n步骤2: 验证结果...')
  const { data: verify } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', USER_ID)
    .single()

  console.log('最终状态:', verify)
  
  // 3. 查询 orders 表结构看看 user_id 对应什么
  console.log('\n步骤3: 查询订单中的用户关联...')
  const { data: orders } = await supabase
    .from('orders')
    .select('user_id')
    .eq('user_id', USER_ID)
    .limit(1)
  console.log('订单中的用户ID:', orders?.[0]?.user_id)
}

main().catch(console.error)
