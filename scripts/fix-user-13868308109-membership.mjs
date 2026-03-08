import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function fixUserMembership() {
  console.log('🔧 修复用户 13868308109 的会员状态\n')
  
  const userId = '13868308109'
  
  // 1. 检查当前状态
  console.log('📋 1. 检查当前状态')
  const { data: currentCredits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (currentCredits) {
    console.log(`✅ 找到用户积分记录:`)
    console.log(`   - 积分: ${currentCredits.credits}`)
    console.log(`   - 是否会员: ${currentCredits.is_pro}`)
  } else {
    console.log(`❌ 未找到用户积分记录`)
  }
  
  // 2. 更新会员状态
  console.log('\n📋 2. 更新会员状态为 true')
  const { error: updateError } = await supabase
    .from('user_credits')
    .update({ 
      is_pro: true,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
  
  if (updateError) {
    console.log(`❌ 更新失败: ${updateError.message}`)
    return
  }
  
  console.log(`✅ 会员状态已更新为 true`)
  
  // 3. 验证更新
  console.log('\n📋 3. 验证更新结果')
  const { data: updatedCredits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (updatedCredits) {
    console.log(`✅ 更新后的状态:`)
    console.log(`   - 积分: ${updatedCredits.credits}`)
    console.log(`   - 是否会员: ${updatedCredits.is_pro}`)
    console.log(`   - 更新时间: ${updatedCredits.updated_at}`)
  }
  
  console.log('\n✅ 修复完成！用户现在应该能看到会员状态了')
}

fixUserMembership().catch(err => {
  console.error('❌ 修复失败:', err)
  process.exit(1)
})
