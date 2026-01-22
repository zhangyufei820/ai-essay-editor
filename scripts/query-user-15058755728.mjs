import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const phone = '15058755728'

console.log('='.repeat(60))
console.log('🔍 查询用户:', phone)
console.log('='.repeat(60))

// 1. 查找 profiles
const { data: profiles } = await supabase
  .from('profiles')
  .select('*')
  .ilike('phone', `%${phone}%`)

console.log('\n📋 Profiles 记录:', profiles?.length || 0)
profiles?.forEach(p => {
  console.log('  - ID:', p.id)
  console.log('    手机:', p.phone)
  console.log('    is_pro:', p.is_pro)
  console.log('    创建时间:', p.created_at)
})

// 2. 查找 user_credits
if (profiles?.length) {
  for (const p of profiles) {
    const { data: credits } = await supabase
      .from('user_credits')
      .select('*')
      .eq('user_id', p.id)
      .single()
    
    console.log('\n💰 积分记录 (user_id=' + p.id + '):')
    if (credits) {
      console.log('  积分:', credits.credits)
      console.log('  is_pro:', credits.is_pro)
      console.log('  更新时间:', credits.updated_at)
    } else {
      console.log('  ❌ 无积分记录!')
    }
    
    // 3. 查找订单
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
    
    console.log('\n📦 订单记录:', orders?.length || 0)
    orders?.forEach(o => {
      console.log('  - 订单ID:', o.id)
      console.log('    产品:', o.product_id, o.product_name)
      console.log('    金额:', o.amount)
      console.log('    状态:', o.status)
      console.log('    创建时间:', o.created_at)
    })
    
    // 4. 查找分享记录
    const { data: shares } = await supabase
      .from('shared_content')
      .select('*')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(5)
    
    console.log('\n📤 分享记录:', shares?.length || 0)
    shares?.forEach(s => {
      console.log('  - 分享ID:', s.share_id)
      console.log('    标题:', s.title)
      console.log('    创建时间:', s.created_at)
    })
  }
}

console.log('\n' + '='.repeat(60))
