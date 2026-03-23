import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function diagnoseTokenMismatch() {
  console.log('🔍 诊断积分显示不同步问题\n')
  
  // 查询所有用户的积分
  console.log('📋 检查所有用户的积分')
  const { data: allCredits, error } = await supabase
    .from('user_credits')
    .select('user_id, credits, is_pro, updated_at')
    .order('updated_at', { ascending: false })
  
  if (error) {
    console.log('❌ 查询失败:', error.message)
    return
  }
  
  console.log(`✅ 找到 ${allCredits?.length || 0} 条用户积分记录\n`)
  
  // 分析积分分布
  const stats = {
    zero: 0,
    low: 0,
    medium: 0,
    high: 0,
    veryHigh: 0
  }
  
  allCredits?.forEach(c => {
    if (c.credits === 0) stats.zero++
    else if (c.credits < 1000) stats.low++
    else if (c.credits < 3000) stats.medium++
    else if (c.credits < 10000) stats.high++
    else stats.veryHigh++
  })
  
  console.log('📊 积分分布:')
  console.log(`  - 0 积分: ${stats.zero} 人`)
  console.log(`  - 1-999 积分: ${stats.low} 人`)
  console.log(`  - 1000-2999 积分: ${stats.medium} 人`)
  console.log(`  - 3000-9999 积分: ${stats.high} 人`)
  console.log(`  - 10000+ 积分: ${stats.veryHigh} 人\n`)
  
  // 显示最近更新的用户
  console.log('📋 最近更新的用户 (前10条):')
  allCredits?.slice(0, 10).forEach((c, i) => {
    console.log(`\n${i + 1}. 用户 ID: ${c.user_id}`)
    console.log(`   积分: ${c.credits}`)
    console.log(`   是否会员: ${c.is_pro}`)
    console.log(`   更新时间: ${c.updated_at}`)
  })
  
  // 检查是否有积分为 0 的会员
  console.log('\n\n📋 检查异常情况 - 会员但积分为 0:')
  const memberWithZeroCredits = allCredits?.filter(c => c.is_pro === true && c.credits === 0)
  if (memberWithZeroCredits && memberWithZeroCredits.length > 0) {
    console.log(`⚠️ 找到 ${memberWithZeroCredits.length} 个会员但积分为 0`)
    memberWithZeroCredits.forEach(c => {
      console.log(`   - ${c.user_id}`)
    })
  } else {
    console.log('✅ 没有会员积分为 0 的情况')
  }
  
  // 检查是否有积分很高但不是会员的用户
  console.log('\n📋 检查异常情况 - 非会员但积分很高:')
  const nonMemberWithHighCredits = allCredits?.filter(c => c.is_pro === false && c.credits > 5000)
  if (nonMemberWithHighCredits && nonMemberWithHighCredits.length > 0) {
    console.log(`⚠️ 找到 ${nonMemberWithHighCredits.length} 个非会员但积分很高`)
    nonMemberWithHighCredits.forEach(c => {
      console.log(`   - ${c.user_id}: ${c.credits} 积分`)
    })
  } else {
    console.log('✅ 没有非会员积分很高的情况')
  }
  
  console.log('\n✅ 诊断完成')
}

diagnoseTokenMismatch().catch(err => {
  console.error('❌ 诊断失败:', err)
  process.exit(1)
})
