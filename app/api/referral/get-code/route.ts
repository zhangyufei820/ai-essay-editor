import { createUserReferralCode } from "@/lib/credits"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    console.log(`[推荐码API] 获取或创建推荐码，用户ID: ${userId}`)

    // 调用 lib/credits 中的函数创建推荐码
    const code = await createUserReferralCode(userId)

    if (code) {
      return NextResponse.json({ 
        success: true,
        code: code,
        uses: 0
      })
    } else {
      return NextResponse.json({ error: "Failed to create referral code" }, { status: 500 })
    }
  } catch (error) {
    console.error("[推荐码API] 错误:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
