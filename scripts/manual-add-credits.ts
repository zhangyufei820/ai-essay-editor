import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function searchAndAddCredits(phone: string, amount: number) {
  console.log(`\n📋 查找手机号 ${phone} 对应的用户...`)

  // 1. 通过手机号查找用户
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, email, nickname, phone")
    .eq("phone", phone)
    .single()

  if (profileError || !profile) {
    console.error(`❌ 未找到手机号为 ${phone} 的用户`)
    console.error("Error:", profileError)
    return
  }

  console.log(`✅ 找到用户: ${profile.nickname || profile.email || "未知"} (user_id: ${profile.user_id})`)

  // 2. 查看当前积分
  const { data: creditsBefore } = await supabase
    .from("user_credits")
    .select("credits")
    .eq("user_id", profile.user_id)
    .single()

  const before = creditsBefore?.credits ?? 0
  console.log(`💰 当前积分: ${before}`)

  // 3. 增加积分
  const { error: updateError } = await supabase
    .from("user_credits")
    .update({
      credits: before + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", profile.user_id)

  if (updateError) {
    console.error(`❌ 更新积分失败:`, updateError)
    return
  }

  // 4. 记录交易
  await supabase.from("credit_transactions").insert({
    user_id: profile.user_id,
    amount: amount,
    type: "manual_adjustment",
    description: `管理员手动加积分: +${amount}`,
  })

  console.log(`✅ 成功增加 ${amount} 积分！`)
  console.log(`💰 新积分: ${before + amount}`)
  console.log(`\n📝 已记录交易: 管理员手动加积分 +${amount}`)
}

const phone = process.argv[2]
const amount = parseInt(process.argv[3] || "5000", 10)

if (!phone) {
  console.error("用法: npx tsx scripts/manual-add-credits.ts <手机号> [积分数量]")
  process.exit(1)
}

searchAndAddCredits(phone, amount).catch(console.error)