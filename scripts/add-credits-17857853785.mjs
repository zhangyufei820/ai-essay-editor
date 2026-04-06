import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function addCredits() {
  const phone = '17857853785'
  const creditsToAdd = 200000  // 20万积分
  
  console.log(`🔍 查找用户: ${phone}`)
  
  // 查找用户
  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, nickname, phone')
    .eq('phone', phone)
  
  if (profileError) {
    console.error('❌ 查询用户失败:', profileError)
    process.exit(1)
  }
  
  if (!profiles || profiles.length === 0) {
    console.error('❌ 未找到该用户')
    process.exit(1)
  }
  
  const userId = profiles[0].user_id
  console.log(`✅ 找到用户: ${userId} (${profiles[0].nickname || 'N/A'})`)
  
  // 查询当前积分
  const { data: currentCredits, error: creditsError } = await supabase
    .from('user_credits')
    .select('credits')
    .eq('user_id', userId)
    .single()
  
  if (creditsError && creditsError.code !== 'PGRST116') {
    console.error('❌ 查询积分失败:', creditsError)
    process.exit(1)
  }
  
  const oldCredits = currentCredits?.credits || 0
  const newCredits = oldCredits + creditsToAdd
  
  console.log(`💰 当前积分: ${oldCredits}`)
  console.log(`➕ 增加积分: ${creditsToAdd}`)
  console.log(`📊 新积分: ${newCredits}`)
  
  // 更新积分
  const { error: updateError } = await supabase
    .from('user_credits')
    .update({ credits: newCredits })
    .eq('user_id', userId)
  
  if (updateError) {
    console.error('❌ 更新积分失败:', updateError)
    process.exit(1)
  }
  
  // 记录交易
  const { error: txError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      amount: creditsToAdd,
      type: 'admin_bonus',
      description: '管理员手动增加积分',
      balance_before: oldCredits,
      balance_after: newCredits
    })
  
  if (txError) {
    console.warn('⚠️ 交易记录写入失败 (非关键):', txError)
  }
  
  console.log(`✅ 成功为用户 ${userId} 增加 ${creditsToAdd} 积分`)
  console.log(`✅ 积分已从 ${oldCredits} 更新为 ${newCredits}`)
}

addCredits().catch(err => {
  console.error('❌ 错误:', err)
  process.exit(1)
})
