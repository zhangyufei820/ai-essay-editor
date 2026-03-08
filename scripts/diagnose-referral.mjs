import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function diagnoseReferral() {
  console.log('🔍 邀请系统诊断开始\n')
  
  // 1. 检查 referral_codes 表
  console.log('📋 1. 检查 referral_codes 表')
  const { data: codes, error: codesError } = await supabase
    .from('referral_codes')
    .select('*')
    .limit(5)
  
  if (codesError) {
    console.log('❌ 查询失败:', codesError.message)
  } else {
    console.log(`✅ 找到 ${codes?.length || 0} 条推荐码记录`)
    codes?.forEach(c => {
      console.log(`   - 用户: ${c.user_id}, 推荐码: ${c.code}, 使用次数: ${c.uses}`)
    })
  }
  
  // 2. 检查 referrals 表
  console.log('\n📋 2. 检查 referrals 表')
  const { data: referrals, error: referralsError } = await supabase
    .from('referrals')
    .select('*')
    .limit(10)
  
  if (referralsError) {
    console.log('❌ 查询失败:', referralsError.message)
  } else {
    console.log(`✅ 找到 ${referrals?.length || 0} 条邀请记录`)
    referrals?.forEach(r => {
      console.log(`   - 邀请者: ${r.referrer_id}, 被邀请者: ${r.referee_id}, 状态: ${r.status}, 奖励: ${r.reward_credits}`)
    })
  }
  
  // 3. 检查 credit_transactions 表中的邀请相关交易
  console.log('\n📋 3. 检查邀请相关的积分交易')
  const { data: transactions, error: txError } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('type', 'referral')
    .limit(10)
  
  if (txError) {
    console.log('❌ 查询失败:', txError.message)
  } else {
    console.log(`✅ 找到 ${transactions?.length || 0} 条邀请积分交易`)
    transactions?.forEach(t => {
      console.log(`   - 用户: ${t.user_id}, 金额: ${t.amount}, 描述: ${t.description}`)
    })
  }
  
  // 4. 检查用户积分
  console.log('\n📋 4. 检查用户积分')
  const { data: credits, error: creditsError } = await supabase
    .from('user_credits')
    .select('*')
    .limit(5)
  
  if (creditsError) {
    console.log('❌ 查询失败:', creditsError.message)
  } else {
    console.log(`✅ 找到 ${credits?.length || 0} 条用户积分记录`)
    credits?.forEach(c => {
      console.log(`   - 用户: ${c.user_id}, 积分: ${c.credits}`)
    })
  }
  
  // 5. 统计邀请数据
  console.log('\n📊 5. 邀请系统统计')
  const { data: stats } = await supabase
    .from('referrals')
    .select('referrer_id, reward_credits')
    .eq('status', 'completed')
  
  if (stats && stats.length > 0) {
    const grouped = {}
    stats.forEach(s => {
      if (!grouped[s.referrer_id]) {
        grouped[s.referrer_id] = { count: 0, total: 0 }
      }
      grouped[s.referrer_id].count++
      grouped[s.referrer_id].total += s.reward_credits || 0
    })
    
    console.log(`✅ 总邀请数: ${stats.length}`)
    console.log('   邀请者排行:')
    Object.entries(grouped)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .forEach(([userId, data]) => {
        console.log(`   - ${userId}: ${data.count} 次邀请, 获得 ${data.total} 积分`)
      })
  } else {
    console.log('❌ 暂无完成的邀请记录')
  }
  
  console.log('\n✅ 诊断完成')
}

diagnoseReferral().catch(err => {
  console.error('❌ 诊断失败:', err)
  process.exit(1)
})
