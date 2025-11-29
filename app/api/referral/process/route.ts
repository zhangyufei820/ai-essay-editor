import { handleReferralSignup } from "@/lib/credits"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { userId, referralCode } = await request.json()

    if (!userId || !referralCode) {
      return NextResponse.json({ error: "Missing userId or referralCode" }, { status: 400 })
    }

    const success = await handleReferralSignup(userId, referralCode)

    if (success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: "Invalid referral code" }, { status: 400 })
    }
  } catch (error) {
    console.error("Error processing referral:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
