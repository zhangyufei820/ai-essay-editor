// 邮箱验证码内存存储
interface OTPData {
  code: string
  expiresAt: number
  attempts: number
  createdAt: number
}

declare global {
  var otpStoreInstance: Map<string, OTPData> | undefined
}

const otpStore = globalThis.otpStoreInstance ?? new Map<string, OTPData>()

if (process.env.NODE_ENV !== "production") {
  globalThis.otpStoreInstance = otpStore
}

// 清理过期的验证码
function cleanExpiredOTPs() {
  const now = Date.now()
  for (const [email, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(email)
      console.log(`[v0] 清理过期验证码: ${email}`)
    }
  }
}

// 每分钟清理一次过期验证码
setInterval(cleanExpiredOTPs, 60 * 1000)

export const emailOTPStore = {
  // 存储验证码
  set(email: string, code: string, expiresInMs: number = 5 * 60 * 1000) {
    const normalizedEmail = email.toLowerCase()
    const data = {
      code,
      expiresAt: Date.now() + expiresInMs,
      attempts: 0,
      createdAt: Date.now(),
    }
    otpStore.set(normalizedEmail, data)
    console.log(
      `[v0] 存储验证码: ${normalizedEmail}, code: ${code}, expires: ${new Date(data.expiresAt).toISOString()}`,
    )
    console.log(`[v0] 当前存储的邮箱数量: ${otpStore.size}`)
  },

  // 获取验证码
  get(email: string): OTPData | undefined {
    const normalizedEmail = email.toLowerCase()
    console.log(`[v0] 查询验证码: ${normalizedEmail}`)
    console.log(`[v0] 当前存储: ${JSON.stringify([...otpStore.entries()])}`)

    const data = otpStore.get(normalizedEmail)

    if (!data) {
      console.log(`[v0] 未找到验证码: ${normalizedEmail}`)
      return undefined
    }

    // 检查是否过期
    if (data.expiresAt < Date.now()) {
      console.log(`[v0] 验证码已过期: ${normalizedEmail}`)
      otpStore.delete(normalizedEmail)
      return undefined
    }

    console.log(`[v0] 找到验证码: ${normalizedEmail}, code: ${data.code}`)
    return data
  },

  // 增加尝试次数
  incrementAttempts(email: string): number {
    const normalizedEmail = email.toLowerCase()
    const data = otpStore.get(normalizedEmail)

    if (data) {
      data.attempts++
      otpStore.set(normalizedEmail, data)
      return data.attempts
    }

    return 0
  },

  // 删除验证码
  delete(email: string) {
    const normalizedEmail = email.toLowerCase()
    otpStore.delete(normalizedEmail)
  },

  // 检查是否可以发送（60秒内只能发送一次）
  canSend(email: string): boolean {
    const normalizedEmail = email.toLowerCase()
    const data = otpStore.get(normalizedEmail)

    if (!data) return true

    const timeSinceCreated = Date.now() - data.createdAt
    return timeSinceCreated >= 60 * 1000
  },
}
