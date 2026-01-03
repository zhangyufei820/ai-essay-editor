import { createServerClient } from "@/lib/supabase/server"

export interface UserCredits {
  credits: number
  is_pro?: boolean
}

export interface CreditTransaction {
  id: string
  amount: number
  type: string
  description: string
  created_at: string
}

// 获取用户积分
export async function getUserCredits(userId: string): Promise<UserCredits | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from("user_credits")
    .select("credits, is_pro")
    .eq("user_id", userId)
    .single()

  if (error) {
    console.error("Error fetching user credits:", error)
    return null
  }

  return data
}

// 消费积分
export async function spendCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
): Promise<boolean> {
  const supabase = await createServerClient()

  // 检查积分是否足够
  const credits = await getUserCredits(userId)
  if (!credits || credits.credits < amount) {
    return false
  }

  // 扣除积分
  const { error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: credits.credits - amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (updateError) {
    console.error("Error updating credits:", updateError)
    return false
  }

  return true
}

// 增加积分
export async function addCredits(
  userId: string,
  amount: number,
  type: string,
  description: string,
  referenceId?: string,
): Promise<boolean> {
  const supabase = await createServerClient()

  let credits = await getUserCredits(userId)
  
  // 如果用户积分记录不存在，先创建一条记录
  if (!credits) {
    console.log(`[积分系统] 用户 ${userId} 积分记录不存在，正在创建...`)
    
    const { error: insertError } = await supabase
      .from("user_credits")
      .insert({
        user_id: userId,
        credits: 0,
      })
    
    if (insertError) {
      console.error("[积分系统] 创建积分记录失败:", insertError)
      return false
    }
    
    // 重新获取积分记录
    credits = await getUserCredits(userId)
    if (!credits) {
      console.error("[积分系统] 创建后仍无法获取积分记录")
      return false
    }
  }

  // 增加积分
  const { error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: credits.credits + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (updateError) {
    console.error("Error updating credits:", updateError)
    return false
  }

  console.log(`[积分系统] 用户 ${userId} 成功增加 ${amount} 积分，当前积分: ${credits.credits + amount}`)
  return true
}

// 获取用户推荐码
export async function getUserReferralCode(userId: string): Promise<string | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase.from("referral_codes").select("code").eq("user_id", userId).single()

  if (error) {
    console.error("Error fetching referral code:", error)
    return null
  }

  return data?.code || null
}

// 🎯 邀请奖励配置
export const REFERRAL_CONFIG = {
  REWARD_PER_INVITE: 1000,      // 每次成功邀请，双方各得积分
  MAX_REFERRER_REWARD: 50000,   // 邀请者最多可获得的总积分
}

// 获取用户已获得的邀请奖励总额
export async function getReferralRewardTotal(userId: string): Promise<number> {
  const supabase = await createServerClient()
  
  const { data, error } = await supabase
    .from("referrals")
    .select("reward_credits")
    .eq("referrer_id", userId)
    .eq("status", "completed")
  
  if (error || !data) return 0
  
  return data.reduce((sum, r) => sum + (r.reward_credits || 0), 0)
}

// 处理推荐注册
export async function handleReferralSignup(newUserId: string, referralCode: string): Promise<boolean> {
  const supabase = await createServerClient()

  // 查找推荐码对应的用户
  const { data: codeData, error: codeError } = await supabase
    .from("referral_codes")
    .select("user_id")
    .eq("code", referralCode)
    .single()

  if (codeError || !codeData) {
    return false
  }

  const referrerId = codeData.user_id
  
  // 🔥 检查邀请者是否已达到奖励上限
  const currentRewardTotal = await getReferralRewardTotal(referrerId)
  const canReceiveReward = currentRewardTotal < REFERRAL_CONFIG.MAX_REFERRER_REWARD
  
  // 计算实际奖励（如果接近上限，只给剩余额度）
  const remainingQuota = REFERRAL_CONFIG.MAX_REFERRER_REWARD - currentRewardTotal
  const actualReferrerReward = canReceiveReward 
    ? Math.min(REFERRAL_CONFIG.REWARD_PER_INVITE, remainingQuota)
    : 0

  // 创建推荐记录
  const { error: referralError } = await supabase.from("referrals").insert({
    referrer_id: referrerId,
    referee_id: newUserId,
    referral_code: referralCode,
    reward_credits: actualReferrerReward,
    status: "completed",
    completed_at: new Date().toISOString(),
  })

  if (referralError) {
    console.error("Error creating referral:", referralError)
    return false
  }

  // 🎁 给推荐人增加积分（如果未达上限）
  if (actualReferrerReward > 0) {
    await addCredits(referrerId, actualReferrerReward, "referral", `🎉 成功邀请好友，获得 ${actualReferrerReward} 积分奖励`, newUserId)
  }

  // 🎁 给新用户增加积分（被邀请者始终获得奖励）
  await addCredits(newUserId, REFERRAL_CONFIG.REWARD_PER_INVITE, "referral", `🎊 通过好友邀请注册，获得 ${REFERRAL_CONFIG.REWARD_PER_INVITE} 积分奖励`)

  // 更新推荐码使用次数
  await supabase
    .from("referral_codes")
    .update({ uses: supabase.rpc("increment", { x: 1 }) })
    .eq("user_id", referrerId)

  return true
}
