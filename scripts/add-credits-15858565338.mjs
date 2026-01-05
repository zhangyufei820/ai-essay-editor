/**
 * 为用户 15858565338 补发积分脚本
 * 
 * 用户购买记录：
 * - 12月21日 128元豪华版 = 12000积分
 * - 12月24日 5000积分包 = 5000积分
 * - 总计：17000积分
 * 
 * 使用方法: node scripts/add-credits-15858565338.mjs
 */

import { createClient } from '@supabase/supabase-js'

// Supabase 配置
const SUPABASE_URL = 'https://rnujdnmxufmzgjvmddla.supabase.co'
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudWpkbm14dWZtemdqdm1kZGxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDMxNTExMSwiZXhwIjoyMDc5ODkxMTExfQ.0UefAkv1Dg8UKn7RYuHmq-PJurRUMHLtjnnBptTkBmI'

// 创建 Supabase 客户端
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 用户信息
const USER_ID = '6947cc546cb26ac1e6907d6e'
const PHONE = '15858565338'

// 补发积分明细
const CREDITS_TO_ADD = [
  {
    amount: 12000,
    description: '12月21日购买128元豪华版 - 手动补发',
    productName: '豪华版'
  },
  {
    amount: 5000,
    description: '12月24日购买5000积分包 - 手动补发',
    productName: '5000积分包'
  }
]

const TOTAL_CREDITS = CREDITS_TO_ADD.reduce((sum, item) => sum + item.amount, 0)

async function main() {
  console.log('=' .repeat(80))
  console.log(`🎁 为用户 ${PHONE} (${USER_ID}) 补发积分`)
  console.log('=' .repeat(80))
  
  // 1. 查询当前积分
  console.log('\n💰 步骤1: 查询当前积分...\n')
  
  const { data: currentCredits, error: queryError } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', USER_ID)
    .single()
  
  if (queryError) {
    console.log('❌ 查询积分失败:', queryError.message)
    
    // 如果用户不存在，创建新记录
    if (queryError.code === 'PGRST116') {
      console.log('📝 用户积分记录不存在，将创建新记录...')
      
      const { error: insertError } = await supabase
        .from('user_credits')
        .insert({
          user_id: USER_ID,
          credits: TOTAL_CREDITS,
          is_pro: true
        })
      
      if (insertError) {
        console.error('❌ 创建积分记录失败:', insertError)
        return
      }
      
      console.log(`✅ 创建积分记录成功，积分: ${TOTAL_CREDITS}`)
      return
    }
    return
  }
  
  console.log('✅ 当前积分记录:')
  console.log(`   用户ID: ${currentCredits.user_id}`)
  console.log(`   当前积分: ${currentCredits.credits}`)
  console.log(`   是否Pro: ${currentCredits.is_pro}`)
  
  // 2. 计算新积分
  const newCredits = currentCredits.credits + TOTAL_CREDITS
  
  console.log('\n📊 步骤2: 计算补发积分...\n')
  console.log('补发明细:')
  CREDITS_TO_ADD.forEach(item => {
    console.log(`   + ${item.amount} 积分 (${item.description})`)
  })
  console.log(`   ─────────────────────────`)
  console.log(`   总计补发: ${TOTAL_CREDITS} 积分`)
  console.log(`   原有积分: ${currentCredits.credits}`)
  console.log(`   补发后积分: ${newCredits}`)
  
  // 3. 更新积分
  console.log('\n💳 步骤3: 更新积分...\n')
  
  const { error: updateError } = await supabase
    .from('user_credits')
    .update({
      credits: newCredits,
      is_pro: true,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', USER_ID)
  
  if (updateError) {
    console.error('❌ 更新积分失败:', updateError)
    return
  }
  
  console.log('✅ 积分更新成功！')
  
  // 4. 验证结果
  console.log('\n🔍 步骤4: 验证结果...\n')
  
  const { data: verifyCredits } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', USER_ID)
    .single()
  
  if (verifyCredits) {
    console.log('✅ 验证成功:')
    console.log(`   用户ID: ${verifyCredits.user_id}`)
    console.log(`   当前积分: ${verifyCredits.credits}`)
    console.log(`   是否Pro: ${verifyCredits.is_pro}`)
    console.log(`   更新时间: ${verifyCredits.updated_at}`)
  }
  
  console.log('\n' + '=' .repeat(80))
  console.log('🎉 补发完成！')
  console.log(`   用户手机: ${PHONE}`)
  console.log(`   用户ID: ${USER_ID}`)
  console.log(`   补发积分: ${TOTAL_CREDITS}`)
  console.log(`   当前积分: ${verifyCredits?.credits || newCredits}`)
  console.log('=' .repeat(80))
}

main().catch(console.error)
