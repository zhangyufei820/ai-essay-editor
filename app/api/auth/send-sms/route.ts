import { type NextRequest, NextResponse } from "next/server"
import { verificationStore } from "@/lib/verification-store"
import { getSMSProvider, generateVerificationCode } from "@/lib/sms-provider"

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 })
    }

    // 检查发送频率
    if (!verificationStore.canSend(phone)) {
      return NextResponse.json({ error: "请60秒后再试" }, { status: 429 })
    }

    // 生成验证码
    const code = generateVerificationCode()

    // 保存验证码
    verificationStore.set(phone, code)

    // 发送短信
    const smsProvider = getSMSProvider()
    const sent = await smsProvider.sendVerificationCode(phone, code)

    if (!sent) {
      return NextResponse.json({ error: "短信发送失败，请稍后重试" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "验证码已发送",
      // 开发环境返回验证码（生产环境删除）
      ...(process.env.NODE_ENV === "development" && { code }),
    })
  } catch (error) {
    console.error("[发送短信API] 错误:", error)
    return NextResponse.json({ error: "服务器错误" }, { status: 500 })
  }
}
