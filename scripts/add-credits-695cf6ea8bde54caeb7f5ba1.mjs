// 为用户 695cf6ea8bde54caeb7f5ba1 增加 500 积分
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rnujdnmxufmzgjvmddla.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'
)

const USER_ID = '695cf6ea8bde54caeb7f5ba1'
const ADD_AMOUNT = 500

async function addCredits() {
  console.log(`开始为用户 ${USER_ID} 增加 ${ADD_AMOUNT} 积分...`)
  
  // 先查询当前积分
  const { data: currentData, error: queryError } = await supabaseAdmin
    .from('user_credits')
    .select('credits')
    .eq('user_id', USER_ID)
    .single()
  
  if (queryError && queryError.code !== 'PGRST116') {
    console.error('查询用户积分失败:', queryError)
    return
  }
  
  const currentCredits = currentData?.credits || 0
  console.log(`当前积分: ${currentCredits}`)
  
  // 更新积分
  const newCredits = currentCredits + ADD_AMOUNT
  const { data: updateData, error: updateError } = await supabaseAdmin
    .from('user_credits')
    .upsert({ user_id: USER_ID, credits: newCredits, is_pro: currentCredits > 1000 })
    .select()
    .single()
  
  if (updateError) {
    console.error('更新积分失败:', updateError)
    return
  }
  
  console.log(`✅ 积分添加成功！`)
  console.log(`用户ID: ${USER_ID}`)
  console.log(`原积分: ${currentCredits}`)
  console.log(`新增积分: ${ADD_AMOUNT}`)
  console.log(`新积分: ${newCredits}`)
  
  // 记录交易
  const { error: txError } = await supabaseAdmin.from('credit_transactions').insert({
    user_id: USER_ID,
    amount: ADD_AMOUNT,
    type: 'recharge',
    description: '手动增加积分',
    balance_before: currentCredits,
    balance_after: newCredits
  })
  
  if (txError) {
    console.warn('记录交易失败:', txError)
  } else {
    console.log('✅ 交易记录已保存')
  }
}

addCredits().catch(console.error)
