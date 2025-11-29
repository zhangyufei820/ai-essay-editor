import { createServerClient } from "@/lib/supabase/server"

export interface UserCredits {
  credits: number
  total_earned: number
  total_spent: number
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
    .select("credits, total_earned, total_spent")
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
      total_spent: credits.total_spent + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (updateError) {
    console.error("Error updating credits:", updateError)
    return false
  }

  // 记录交易
  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount: -amount,
    type,
    description,
  })

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

  const credits = await getUserCredits(userId)
  if (!credits) return false

  // 增加积分
  const { error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: credits.credits + amount,
      total_earned: credits.total_earned + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  if (updateError) {
    console.error("Error updating credits:", updateError)
    return false
  }

  // 记录交易
  await supabase.from("credit_transactions").insert({
    user_id: userId,
    amount,
    type,
    description,
    reference_id: referenceId,
  })

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

  // 创建推荐记录
  const { error: referralError } = await supabase.from("referrals").insert({
    referrer_id: referrerId,
    referee_id: newUserId,
    referral_code: referralCode,
    reward_credits: 500,
    status: "completed",
    completed_at: new Date().toISOString(),
  })

  if (referralError) {
    console.error("Error creating referral:", referralError)
    return false
  }

  // 给推荐人增加积分
  await addCredits(referrerId, 500, "referral", `推荐新用户获得奖励`, newUserId)

  // 给新用户额外增加积分
  await addCredits(newUserId, 200, "referral", `通过推荐码注册获得奖励`)

  // 更新推荐码使用次数
  await supabase
    .from("referral_codes")
    .update({ uses: supabase.rpc("increment", { x: 1 }) })
    .eq("user_id", referrerId)

  return true
}
