import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data } = await supabase.from('user_credits').select('*').eq('is_pro', true)
console.log('Pro用户总数:', data?.length)
data?.forEach(u => console.log('-', u.user_id, '积分:', u.credits))
